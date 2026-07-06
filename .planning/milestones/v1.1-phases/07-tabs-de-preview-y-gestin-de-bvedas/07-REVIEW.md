---
phase: 07-tabs-de-preview-y-gestin-de-bvedas
reviewed: 2026-07-06T00:00:00Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - src/renderer/src/paneTree.ts
  - src/renderer/src/App.tsx
  - src/renderer/src/EditorPane.tsx
  - src/renderer/src/PaneView.tsx
  - src/renderer/src/FileTree.tsx
  - src/renderer/src/ConfirmRemoveVaultDialog.tsx
  - src/renderer/src/VaultSwitcher.tsx
  - src/renderer/src/index.css
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/main/index.ts
  - src/main/services/settings.ts
  - src/main/services/vault.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-07-06
**Depth:** deep
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed FILE-04 (tabs de preview estilo VSCode) and FILE-05 (baja de bóveda con
papelera). The **vault-trash safety path is solid**: the main handler validates
`root ∈ knownVaults` before any disk operation, uses `shell.trashItem` (never
`rm`), keeps the vault in the list on trash failure, and `fromDisk=false` never
touches disk. `ConfirmRemoveVaultDialog` keyboard safety is correct (Cancelar
autoFocus, Escape cancels, no Enter→confirm). The `paneTree` ops are pure and
preserve leaf ids.

However, there is **one Critical correctness defect that breaks the entire
preview feature (FILE-04)**: because the programmatic note-load in
`CodeMirrorEditor` fires `onChange`, and Phase 7 wired `onChange → pinTab`, every
preview tab is pinned the instant it opens. The italic/temporary tab never
survives a single render. The preview state-machine logic in `paneTree` itself is
correct; the bug is in the edit-vs-load discrimination at the React seam.

## Critical Issues

### CR-01: Preview tabs are pinned on open — FILE-04 never actually works

**File:** `src/renderer/src/App.tsx:374-383`, `src/renderer/src/editor/CodeMirrorEditor.tsx:139-173`, `src/renderer/src/EditorPane.tsx:146-160`

**Issue:**
Phase 7 added `setPanes(prev => pinTab(prev, paneId, path))` to `onPaneNoteChange`
(App.tsx:377) so that "any edit pins the preview". But `onNoteChange` does not
fire only on user edits — it also fires on every **programmatic note load**.

Trace of a single click opening a note as preview:
1. `openNote(path)` → `openInLeaf(..., { preview: true })` → leaf gets
   `active=path, preview=path`.
2. `EditorPane` load effect (`EditorPane.tsx:111-144`) reads the note,
   `setContent(text)` and `setEpoch(e => e + 1)`.
3. The epoch bump changes `reloadKey` (`EditorPane.tsx:324` =
   `` `${pane.id}#${epoch}` ``), so `CodeMirrorEditor`'s reload effect
   (`CodeMirrorEditor.tsx:160-173`) dispatches a full-document replace.
4. That dispatch sets `update.docChanged`, so the `updateListener`
   (`CodeMirrorEditor.tsx:139-141`) calls `onChange` — there is **no annotation
   or guard** distinguishing a programmatic reload from a keystroke
   (`extensions.ts` confirms no filter).
5. `handleChange` (EditorPane.tsx:146-160) only guards `previewOid`, so it calls
   `onNoteChange` → `onPaneNoteChange` → `pinTab(paneId, path)` →
   `preview` is cleared.

Net effect: the tab is pinned (italic removed) on the same load that created the
preview. This happens for the very first open into an empty pane and for every
subsequent note switch. **The preview tab is never observable** — FILE-04's core
behavior does not ship. (As a side effect, this same reload→onChange path also
marks every freshly opened note dirty and queues a spurious autosave of identical
content, flipping status `clean`→`saving` on open.)

**Fix:** Suppress `onChange` for the programmatic reload by annotating that
transaction and filtering it in the update listener, so `onNoteChange` fires only
on genuine user edits:

```ts
// CodeMirrorEditor.tsx
import { Annotation } from '@codemirror/state'
const ProgrammaticReload = Annotation.define<boolean>()

// reload effect (lines 167-170):
view.dispatch({
  changes: { from: 0, to: view.state.doc.length, insert: docRef.current },
  selection: { anchor: 0 },
  annotations: ProgrammaticReload.of(true)
})

// updateListener (lines 139-141):
EditorView.updateListener.of((update) => {
  if (
    update.docChanged &&
    !update.transactions.some((tr) => tr.annotation(ProgrammaticReload))
  ) {
    onChangeRef.current?.(update.state.doc.toString())
  }
})
```

Note: a guard in `onPaneNoteChange` alone (e.g. "only pin if `preview === path`")
does **not** fix this — on load the pane's `preview` *is* the just-opened path, so
the guard still pins. The discrimination must happen at the edit/load boundary.
After this fix, verify: single-click keeps a note italic; editing it (a real
keystroke), double-clicking its tree node, or double-clicking the tab all pin it.

## Warnings

### WR-01: Disk-delete hint is shown even when the safe action is selected

**File:** `src/renderer/src/ConfirmRemoveVaultDialog.tsx:60-63`

**Issue:** The paragraph "Se mueven a la papelera del sistema (recuperable). Se
borra la carpeta completa, incluido el historial de versiones." is rendered
unconditionally, below the checkbox, regardless of `fromDisk`. With the checkbox
OFF (the default, safe "Quitar de la lista" path), the dialog still tells the user
files will be moved to the trash and the whole folder deleted — which is exactly
what that path does **not** do. On a data-loss-adjacent surface this is misleading
and undercuts the reassurance copy directly above it. The UI-SPEC ties this hint
to the opt-in checkbox (line 99, "Disk-delete opt-in hint").

**Fix:** Render the hint only when the option is engaged:

```tsx
{fromDisk && (
  <p className="modal-sub">
    Se mueven a la papelera del sistema (recuperable). Se borra la carpeta
    completa, incluido el historial de versiones.
  </p>
)}
```

### WR-02: Active-vault removal does not flush pending renderer edits before the safety snapshot

**File:** `src/renderer/src/App.tsx:440-442`

**Issue:** `removeVault` calls `window.geode.vault.remove(...)` without a preceding
`await flushAll()`. The main-process safety snapshot (`snapshotIfChanged
('baja-de-boveda')`, `main/index.ts:295-297`) commits only what is on disk, so up
to `AUTOSAVE_MS` (600 ms) of un-flushed typing in the active pane is not captured.
For `fromDisk=true` this is worse: `shell.trashItem` runs during the same await,
then `adoptVault` unmounts the editors and their unmount-flush
(`EditorPane.tsx:102-104`) tries to write into an already-trashed folder — the
write throws (swallowed by `void flush()`) and those last edits are lost, defeating
the "nada se pierde" guarantee precisely on the delete-from-disk path.

Note: `switchVault` (App.tsx:425-432) shares this missing-flush pattern, so this is
a consistency gap rather than a Phase-7-only regression — but the disk-delete path
makes the loss unrecoverable, which raises the stakes here.

**Fix:** Flush the renderer before handing off to main, mirroring the other
vault-lifecycle callbacks that already `await flushAll()` first:

```ts
const removeVault = useCallback(async (target, fromDisk) => {
  try {
    await flushAll() // persistir lo tipeado antes de la instantánea/baja
    const active = await window.geode.vault.remove(target.root, { fromDisk })
    ...
```

(Add `flushAll` to the dependency array.)

## Info

### IN-01: `pinTab` runs on every keystroke, rebuilding the whole pane tree in split layouts

**File:** `src/renderer/src/App.tsx:377`

**Issue:** `onPaneNoteChange` calls `setPanes(prev => pinTab(prev, paneId, path))`
on every change event. For a single-leaf tree `pinTab` returns the same reference
when nothing changes (React bails out), but for split layouts `mapLeaves`
(`paneTree.ts:77-80`) always allocates a new root object (`{ ...node, children:
... }`), so every keystroke re-renders the pane tree even though the preview was
already cleared on the first edit. Functionally harmless (ids stay stable, editor
does not remount) and performance is out of v1 scope, but it is needless churn.

**Fix:** Skip the update when there is nothing to pin, e.g. guard against the
current panes ref: `if (findLeaf(panesRef.current, paneId)?.preview === path)
setPanes(prev => pinTab(prev, paneId, path))`.

### IN-02: Double-click on a tree node triggers two `openNote` calls

**File:** `src/renderer/src/FileTree.tsx:168-178`

**Issue:** A double-click on a file node fires `onClick` (→ `openNote(path)`,
preview) and then `onDoubleClick` (→ `openNote(path, { pinned: true })`). Both are
async and each does `await flushAll()` + `setPanes(...)`. The end state converges
to pinned, but two overlapping flush/setPanes cycles run per double-click. Low
risk; consider debouncing the single-click (e.g. a short timer cancelled by the
double-click) if the redundant work ever matters.

### IN-03: `removeVault` surfaces errors via `window.alert` instead of the toast/notify pattern

**File:** `src/renderer/src/App.tsx:465`

**Issue:** CLAUDE.md documents user-facing errors as toasts via `notify()` from the
PluginHost (`setToast`, App.tsx:895). `removeVault` uses `window.alert` — a
blocking modal. This is consistent with other error paths already in App.tsx
(lines 312, 740, 753, 774), so it is not a new inconsistency, but the Phase-7 error
strings ("No se pudo enviar la carpeta a la papelera…") would read better as a
non-blocking toast. Consider routing through `setToast`.

---

_Reviewed: 2026-07-06_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
