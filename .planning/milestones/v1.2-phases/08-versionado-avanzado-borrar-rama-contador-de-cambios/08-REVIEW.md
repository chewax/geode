---
phase: 08-versionado-avanzado-borrar-rama-contador-de-cambios
reviewed: 2026-07-06T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/main/services/git.ts
  - src/main/index.ts
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/renderer/src/ConfirmDeleteBranchDialog.tsx
  - src/renderer/src/App.tsx
  - src/renderer/src/VersionGraph.tsx
  - src/renderer/src/index.css
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-06
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 8 adds two surfaces: the styled branch-delete dialog (VER-01) and the always-visible `+N/-N` uncommitted-line counter (CHG-01). The main-process work is solid: `pendingLineStat` correctly reuses the content-hash machinery (`pendingChanges` → `headBlobs`/`workBlobs`, `headOid`, `safeReadAt`, `looksBinary`) and **never** touches `statusMatrix`, so the racy-git invariant holds. It skips binaries, handles new/deleted/empty files and the no-HEAD empty-repo case without crashing, reads from the active vault (`requireRoot()`), and invokes **no AI** — the cost invariant is respected. The dialog's keyboard safety (Cancelar autofocus, Escape cancels, no Enter→confirm) is correctly implemented per the Phase 6 CR-01 lesson, and `main` protection is surfaced inline instead of crashing.

The defects are all on the **renderer counter-refresh cadence**, not the git math:

- **BLOCKER:** the counter is never recomputed after `doCommit`, so it stays showing pending changes after "Guardar versión" — the headline feature displays stale/wrong data in its most common flow.
- **WARNING:** the per-keystroke `refreshLineStat` on `note:change` reads pre-edit disk content (no benefit) and is unsequenced, so a late-resolving stale call can overwrite a fresh one.
- **WARNING:** the counter renders during time-travel preview, where every other present-state control is frozen/disabled.

## Critical Issues

### CR-01: Line counter goes stale after "Guardar versión" (doCommit never refreshes it)

**File:** `src/renderer/src/App.tsx:707-717` (`doCommit`)
**Issue:** `doCommit` runs `git.commit(...)` then refreshes graph, github and AI usage, but never calls `refreshTree()` or `refreshLineStat()`. A commit moves HEAD to include the pending work, so `pendingLineStat` should now return `{0,0}` and the counter should disappear. Because no refresh fires, the counter keeps showing the pre-commit `+N/-N` until some unrelated later action (an edit, save, or tree refresh) happens to recompute it.

Failure scenario: user edits a note (counter shows `+40 -3`), clicks "Guardar versión", commit succeeds, tree/files are unchanged so `refreshTree` is (correctly) not called — the status bar still reads `+40 -3` even though the vault is now clean. This is exactly the "stale value after a commit" case the counter is meant to handle, and it is the primary user flow for the feature.

**Fix:** recompute the stat after the commit completes:
```ts
const doCommit = useCallback(async (message: string) => {
  const fallback = `Versión ${new Date().toLocaleString()}`
  host.emit('note:beforeSave', { path: openPathRef.current })
  await window.geode.git.commit(message || fallback)
  setCommitChanges(null)
  await refreshGraph()
  await refreshGithub()
  void refreshAiUsage()
  void refreshLineStat() // el commit vació lo pendiente → el contador debe ir a 0/oculto
  host.emit('note:afterSave', { path: openPathRef.current })
}, [refreshGraph, refreshGithub, refreshAiUsage, refreshLineStat, host])
```
(Also verify the safety-snapshot commit path at `restoreToPast` ~679-685 clears it — it does, via `refreshTree(null)`.)

## Warnings

### WR-01: `refreshLineStat` on `note:change` reads stale disk and is unsequenced (stale-value race)

**File:** `src/renderer/src/App.tsx:400-405` (`onPaneNoteChange`), `src/renderer/src/App.tsx:211-218` (`refreshLineStat`)
**Issue:** Two compounding problems:

1. **Reads stale content.** On every keystroke `handleChange` (`EditorPane.tsx:146-159`) only stores the new text in `pendingRef` and schedules an autosave `AUTOSAVE_MS` later; the disk file is NOT written yet. `pendingLineStat` reads the file from disk (`readFile(join(dir, filepath), ...)`), so the `note:change` refresh computes the count against **pre-edit** disk content. It therefore returns the last-saved number and provides no live update — the only meaningful refresh is the one on `onPaneSaved` (after the autosave flush). The `note:change` call is pure work with no correctness benefit.

2. **No sequencing → stale overwrite.** `refreshLineStat` does `setLineStat(await window.geode.git.pendingLineStat())` with no in-flight guard. Each call triggers a full-vault read+hash in the main process; concurrent calls interleave their `await`s and may resolve out of order. A `note:change` call (stale disk) fired before the autosave can resolve **after** the `onPaneSaved` call (fresh disk), overwriting the correct value. Result: the status bar shows a wrong `+N/-N` that persists until the next event.

Failure scenario: type rapidly, pause; autosave flushes and `onPaneSaved` computes `+8`; a slow earlier `note:change` call resolves last and sets `+5`; counter is stuck at `+5` until the next save.

**Fix:** drop the `note:change` refresh entirely (the counter is a magnitude indicator that legitimately lags to save time, matching `.save-status`), and rely on `onPaneSaved` + `refreshTree`:
```ts
const onPaneNoteChange = useCallback((paneId, path, doc) => {
  if (paneId === activePaneIdRef.current) {
    setContent(doc)
    setStatus('saving')
    host.emit('note:change', { path, content: doc })
    // sin refreshLineStat aquí: el disco aún no tiene el cambio; se recuenta en onPaneSaved
  }
}, [host])
```
If a live-while-typing counter is actually desired, add a monotonic sequence guard so only the latest request may call `setLineStat` (and compute against in-memory content rather than disk).

### WR-02: Counter stays live during time-travel preview

**File:** `src/renderer/src/App.tsx:220-226` (`refreshTree` → `refreshLineStat`), `1305-1311` (render), `src/renderer/src/App.tsx:235-242` (`enterPreview`)
**Issue:** `enterPreview` flushes pending work to disk then calls `refreshTree(oid)`, which unconditionally calls `refreshLineStat()`. During preview HEAD is unchanged and the flushed working dir still differs from HEAD, so `pendingLineStat` returns the present's pending count and the `+N/-N` span renders while the user is viewing the past. Every other present-state control is deliberately frozen in this mode (the refresh button is `disabled` with title "No disponible durante el viaje en el tiempo", the editor is read-only, `main` gets `.past` styling). Showing a live pending-work counter here is inconsistent and misleading — the number refers to the present, not the version on screen.

**Fix:** gate the render (and skip the recompute) on preview:
```tsx
{previewOid == null && lineStat.added + lineStat.removed > 0 && (
  <span className="line-stat">
    <span className="added">+{lineStat.added}</span>
    <span className="removed">−{lineStat.removed}</span>
  </span>
)}
```
Optionally short-circuit `refreshLineStat` when `previewOid != null` to avoid the wasted IPC.

### WR-03: `confirmDeleteBranch` has no in-flight guard — double activation re-fires delete

**File:** `src/renderer/src/App.tsx:807-826` (`confirmDeleteBranch`)
**Issue:** The guard `if (!pendingDeleteBranch) return` only clears on success, and it does so *after* the `await flushAll()` + `await deleteBranch(...)`. A fast double-click (or click then Enter while the confirm button holds focus after a prior error) starts two concurrent `confirmDeleteBranch` runs; both pass the guard and both call `window.geode.git.deleteBranch(name)`. The second runs against an already-deleted branch and throws; the second `setDeleteBranchError` may fire after the first already set `pendingDeleteBranch(null)` and unmounted the dialog, so the error is written to a closed dialog. No data loss (the branch is gone as intended), but it's an avoidable inconsistent-state path for a destructive action.

**Fix:** add a simple in-flight ref/state and disable the confirm button while deleting:
```ts
const deletingBranchRef = useRef(false)
const confirmDeleteBranch = useCallback(async () => {
  if (!pendingDeleteBranch || deletingBranchRef.current) return
  deletingBranchRef.current = true
  try {
    /* flushAll + deleteBranch + refresh, existing body */
  } finally {
    deletingBranchRef.current = false
  }
}, [/* deps */])
```

## Info

### IN-01: Missing explicit return type on `confirmDeleteBranch`

**File:** `src/renderer/src/App.tsx:807`
**Issue:** `const confirmDeleteBranch = useCallback(async () => { ... }, [...])` omits the explicit return type, while sibling callbacks in the same file follow the project convention (`refreshLineStat(): Promise<void>`, `deleteBranch(...): Promise<boolean>`, `refreshTree(...): Promise<TreeNode[]>`). CLAUDE.md: "Explicit return types on all exported functions and methods."
**Fix:** `const confirmDeleteBranch = useCallback(async (): Promise<void> => { ... }, [...])`.

### IN-02: `deleteBranch` always returns `true`, making the `onDeleteBranch` boolean contract meaningless

**File:** `src/renderer/src/App.tsx:797-801`
**Issue:** `deleteBranch` now only opens the dialog and unconditionally returns `true`; the actual delete moved to `confirmDeleteBranch`. The `Promise<boolean>` return is retained "to not break `onDeleteBranch`", but any `VersionGraph` caller that awaits the boolean to decide whether the branch was actually removed (e.g. to close its menu on success) now always sees success even when the user cancels. Verify `VersionGraph` does not treat the resolved `true` as "deleted". If nothing consumes it, consider narrowing the prop to `(name, merged) => void` to avoid a misleading contract.
**Fix:** confirm the return value is unused downstream, or change the signature to `void`; if a real result is needed, resolve the promise from `confirmDeleteBranch`/cancel.

### IN-03: `looksBinary` on UTF-8-decoded text can misclassify NUL-free binaries (pre-existing, now on the counter path)

**File:** `src/main/services/git.ts:801-806, 866-868`
**Issue:** `pendingLineStat` mirrors `pendingDiff`: it reads each pending file as UTF-8 and calls `looksBinary`, which only detects a NUL byte. A binary attachment without an early NUL (some formats) would be fed to `diffLines` as garbled text, inflating `+N/-N`. This is consistent with the existing `pendingDiff`/`commitDiff` heuristic (not a regression), but the counter counts *all* files (attachments included), so it's more exposed than the `.md`-only `pendingDiff`. Acceptable for v1; noted for awareness.
**Fix:** optionally short-circuit by extension or a stronger binary heuristic (control-char ratio) before `diffLines`; not required for this phase.

---

## Verified (no issue found)

- **Racy-git:** `pendingLineStat` uses `pendingChanges` (content-hash `workBlobs` vs `headBlobs`), `headOid`, `safeReadAt`; no `statusMatrix`. Same-size/same-second edits are caught. ✔
- **Edge cases:** new file (oldText `''` → all added), deleted file (`deleted` → newText `''` → all removed), file absent in HEAD (`safeReadAt` → `''`), empty file, no-HEAD/empty repo (`headOid` null → `''`), binary skip (`looksBinary`), `part.count ?? 0` guard — no crash, sane counts. ✔
- **AI/cost invariant:** `pendingLineStat` calls no AI. ✔
- **Active vault only:** handler uses `requireRoot()`. ✔
- **Dialog keyboard safety:** Cancelar `autoFocus`, container `onKeyDown` handles only Escape→`onClose`, no Enter→confirm; delete requires explicit click. ✔
- **`main` protection:** `git.deleteBranch` throws; caught and shown via `.modal-error` inline, dialog stays open, no crash. ✔
- **Stale node while dialog open:** name captured in `pendingDeleteBranch`; a gone/renamed branch just yields the inline error path. ✔
- **Cancel/error state cleanup:** `onClose` and success both clear `pendingDeleteBranch` + `deleteBranchError`; error path keeps dialog open without clearing. ✔
- **Constraints:** Lucide-only (`GitBranch`, `Trash2`), no emojis/glyphs (the old `⚠` was correctly dropped); the `−` is U+2212 minus, not an emoji; Spanish strings/comments; `geode:git-pending-linestat` prefix; preload stays CommonJS bridge; CSS classes kebab-case and `.line-stat .added/.removed` are descendant-scoped (no collision with `.diff-file-head.added`). ✔

---

_Reviewed: 2026-07-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
