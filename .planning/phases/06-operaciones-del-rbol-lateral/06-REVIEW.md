---
phase: 06-operaciones-del-rbol-lateral
reviewed: 2026-07-06T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - src/renderer/src/FileTree.tsx
  - src/renderer/src/App.tsx
  - src/renderer/src/ConfirmDeleteDialog.tsx
  - src/renderer/src/index.css
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-06
**Depth:** deep
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 6 wires three VSCode-style tree operations onto existing infrastructure: F2 inline
rename, a styled delete-confirmation dialog (replacing `window.confirm`/`window.alert`),
and a manual + on-focus auto-refresh from disk. The wiring is mostly clean and the
critical anti-clobber guards are present and correct: `refreshFromDisk` early-returns
during time-travel preview (`previewOid != null`), calls `flushAll()` **before**
`refreshTree()` so unsaved edits are persisted first, and the `focus` listener is a stable
`useCallback` with correct deps and proper `removeEventListener` cleanup (no stale-closure
capture of `previewOid`). The `refreshing` spin state cannot get stuck (try/finally,
early-return happens before `setRefreshing(true)`). Convention checks pass: Lucide-only
icons, Spanish strings/comments, no new IPC, preload untouched, no unused imports.

However, the delete dialog's keyboard handling has a destructive-action footgun: **Enter
deletes even though the non-destructive `Cancelar` button is auto-focused**, which can
irrecoverably remove an uncommitted note. Additionally, the on-focus auto-refresh reloads
every editor pane unconditionally (resetting cursor/undo on each window refocus), and the
rename-error retry path discards the user's typed text.

## Critical Issues

### CR-01: Enter deletes despite `Cancelar` being auto-focused (destructive footgun)

**File:** `src/renderer/src/ConfirmDeleteDialog.tsx:24-46`
**Issue:** The dialog diverges from the mirrored `BranchDialog` pattern in a way that makes
the destructive action the Enter default while signaling the opposite. In `BranchDialog`
the `onKeyDown` lives on the focused `<input>` and no button is auto-focused, so Enter
unambiguously confirms the (non-destructive) create. Here:

- `onKeyDown` is bound to the **modal `<div>`** (line 28): `Enter → onConfirm()` (delete).
- `autoFocus` is on the **`Cancelar`** button (line 44), signaling "safe default = cancel".

Because keydown bubbles from the focused `Cancelar` button up to the div, pressing **Enter**
fires `onConfirm()` → `confirmDelete()` → `vault.delete(...)`. On top of that, the button's
native Enter-activation also fires `onClose()`, so both handlers run — the net effect is a
delete. A user who opens the dialog and reflexively presses Enter (expecting the focused
`Cancelar` to activate, or expecting Enter to dismiss) instead deletes the node.

This violates the project's core value ("you can never lose anything"): while committed
content is recoverable from git history, a **newly created note that was never committed is
not in history and is unrecoverable**. The dialog whose entire purpose is to prevent
accidental deletion makes accidental deletion the Enter default.

**Fix:** Make the auto-focused control and the Enter action agree. Either auto-focus the
destructive button and keep Enter=confirm, or (preferred for a destructive dialog) keep
`Cancelar` focused and do **not** bind Enter to the destructive action at the container
level. For example, drop the div-level Enter handler and let focus drive activation:

```tsx
<div
  className="modal"
  onClick={(e) => e.stopPropagation()}
  onKeyDown={(e) => {
    // Escape siempre cancela; Enter NO dispara el borrado destructivo:
    // el usuario debe activar explícitamente "Eliminar" (foco/clic).
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }}
>
  ...
  <div className="modal-actions">
    <button autoFocus onClick={onClose}>Cancelar</button>
    <button className="danger" onClick={onConfirm}>Eliminar</button>
  </div>
</div>
```

If Enter-to-confirm is desired, move `autoFocus` to the `Eliminar` button so the focused
control and the Enter action are consistent (no contradiction, no double-fire).

## Warnings

### WR-01: Auto-refresh on focus reloads every editor unconditionally (cursor/undo reset)

**File:** `src/renderer/src/App.tsx:527-531, 539-549`
**Issue:** `refreshFromDisk` always calls `syncPanesToTree(t)`, which calls `bumpAll()`
unconditionally. `bumpAll` increments `reloadNonces` for every leaf, and `EditorPane`
reacts to a nonce change by re-reading the file and calling `setContent(text)` +
`setEpoch(e => e + 1)` (`EditorPane.tsx:129-130`, dep array line 142), which resets the
CodeMirror document. Because the `focus` listener fires on **every** window refocus (e.g.
every alt-tab back into Geode), all open editors reload from disk even when nothing changed
externally — resetting cursor position, selection, and undo history each time.

No content is lost (`flushAll()` runs first), so this is a robustness/UX degradation rather
than data loss, but it makes the app feel like it "jumps" on every refocus.

**Fix:** Only reconcile panes when the tree actually changed, and avoid `bumpAll()` when the
on-disk file set is unchanged. E.g. diff the flattened paths before calling `bumpAll`, or
have `syncPanesToTree` skip the reload-nonce bump when `keepOnly` removed nothing and no
paths were added. Alternatively, gate the on-focus path so it only bumps panes whose file
content actually differs from what the editor holds.

### WR-02: Rename-error retry discards the user's typed text

**File:** `src/renderer/src/App.tsx:475-490`
**Issue:** On rename failure, `renameNode` has already run `setEditingPath(null)` (line 476)
before the `await window.geode.vault.rename(...)` rejects; the catch then does
`setEditingPath(node.path)` (line 488). Across the await boundary these are two separate
renders, so `NameInput` unmounts and remounts. On remount its internal `value` state is
re-seeded from `initial = displayName(node)` (the **original** name, `FileTree.tsx:197`),
so the invalid text the user typed is thrown away. The user sees the inline error but must
retype from scratch, which is confusing (the field shows the old name next to an error
about a name they no longer see).

**Fix:** Preserve the attempted value on retry. Lift the in-progress rename text into App
state (or pass the rejected value back) and seed `NameInput`'s initial with it when
reopening after an error, so the user can correct rather than re-enter. The `NameInput`
`done` ref already resets on remount, so retry itself works — only the text is lost.

### WR-03: `confirmDelete` acts on a stale captured node if the tree changes while the dialog is open

**File:** `src/renderer/src/App.tsx:513-523`
**Issue:** `pendingDelete` captures the `TreeNode` at dialog-open time. The `focus`
auto-refresh (or any refresh) can run while the modal is open and rewrite the tree from
disk. `confirmDelete` still deletes `node.path` from the captured object. If the target was
renamed/moved externally in the meantime, `vault.delete` is invoked on a path that no longer
exists. `deletePath` uses `fs.rm(..., { force: true })`, so it silently no-ops rather than
erroring — the user believes they deleted the item but nothing happened, and the (now
renamed) file remains. Low blast radius but a correctness gap in a destructive path.

**Fix:** Re-validate the target still exists at confirm time, or key the pending-delete on a
path plus a freshness check, and surface a notice if the node is gone. At minimum, confirm
`vault.delete` reports whether anything was removed and toast accordingly.

## Info

### IN-01: Manual refresh button silently no-ops during time-travel preview

**File:** `src/renderer/src/App.tsx:539-540, 956-962`
**Issue:** The `RefreshCw` button calls `refreshFromDisk`, which early-returns when
`previewOid != null`. During preview the button looks active (hover tint, clickable) but
does nothing and the `.spin` never shows, giving no feedback. Correct behavior (don't
clobber the preview) but poor discoverability.
**Fix:** Disable or hide the refresh button while `previewOid != null`, or show a brief
toast ("No disponible durante el viaje en el tiempo").

### IN-02: `.danger` button lacks hover/active/cursor affordances

**File:** `src/renderer/src/index.css:77-84`
**Issue:** `button.danger` mirrors `.primary` geometry/color but defines no `:hover`/`:active`
state or `cursor: pointer`, unlike a fully-styled interactive control. The destructive CTA
has no hover feedback. Cosmetic; the hard-coded `#ff6b6b` is explicitly sanctioned by the
UI spec.
**Fix:** Add a `button.danger:hover` tint (e.g. slightly darker red) matching how `.primary`
is treated, and ensure `cursor: pointer` is inherited from the base `button` rule.

### IN-03: F2/Delete require DOM focus on the row, not just tree selection

**File:** `src/renderer/src/FileTree.tsx:80-89`
**Issue:** Both `Delete` and `F2` require `e.target === e.currentTarget`, i.e. the row `<li>`/
`<div>` must hold DOM focus. A node that is "selected" (`selectedPath`) but not DOM-focused
(e.g. focus moved to the editor after opening a file) won't respond to F2/Delete. This is
consistent with the pre-existing Delete behavior and the `e.target === e.currentTarget`
guard correctly prevents the keys firing while typing in `NameInput`, so it is intentional —
noted only as a UX nuance, not a defect.
**Fix:** None required. If keyboard-only selection is later desired, drive F2/Delete off
`selectedPath` with an explicit "is the tree focused" check rather than element focus.

---

_Reviewed: 2026-07-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
