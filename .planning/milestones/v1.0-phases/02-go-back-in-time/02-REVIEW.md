---
phase: 02-go-back-in-time
reviewed: 2026-07-04T20:28:35Z
depth: deep
files_reviewed: 12
files_reviewed_list:
  - src/main/fs/atomic.ts
  - src/main/index.ts
  - src/main/services/git.ts
  - src/preload/index.ts
  - src/shared/ipc.ts
  - src/renderer/src/App.tsx
  - src/renderer/src/EditorPane.tsx
  - src/renderer/src/PaneView.tsx
  - src/renderer/src/editor/CodeMirrorEditor.tsx
  - src/renderer/src/Timeline.tsx
  - src/renderer/src/TimeTravelBanner.tsx
  - src/renderer/src/time/labels.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-04T20:28:35Z
**Depth:** deep (cross-file: EditorPane ↔ CodeMirrorEditor ↔ App orchestration ↔ GitService)
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 2 adds "Go Back in Time": read-only preview of past commits plus a "Volver
aquí" (bring-back) that soft-materializes a version without moving HEAD. The
git primitives (`treeAt`, `changedFiles`, `restoreTree`) are well-structured and
the delete-set in `restoreTree` is correctly derived from IGNORE-filtered
`workBlobs` (never `treeBlobs`), so the destructive delete path is sound. The
`bringBack` orchestration also correctly takes the safety snapshot BEFORE
`restoreTree` when the tree is dirty, and HEAD is never moved. Icons are Lucide,
strings/comments are Spanish, IPC contract matches the implementation.

However, there is one **BLOCKER that directly violates the core non-destructive
value**: simply *viewing* a past version and returning to the present silently
overwrites the current on-disk note(s) with the previewed past content. This is
caused by CodeMirror's programmatic doc-replacement firing `onChange`, which
populates `pendingRef` during preview; the flush-guard only blocks writes *during*
preview, so the accumulated past content is flushed to disk on exit when the guard
is lifted. Uncommitted present edits are lost permanently. Three warnings and two
info items follow.

## Critical Issues

### CR-01: Exiting preview overwrites the present note on disk with the previewed past content (data loss)

**File:** `src/renderer/src/EditorPane.tsx:76-88, 109-142, 144-151` (with `src/renderer/src/editor/CodeMirrorEditor.tsx:160-173, 138-141`)

**Issue:**
The flush guard `if (propsRef.current.previewOid != null) return` (EditorPane:78)
blocks writes *while* in preview, but does not prevent `pendingRef` from being
**populated** during preview, and that pending survives into exit where flush runs
unguarded.

Trace:
1. `enterPreview` loads past content via `readNoteAt` → `setContent(pastText)` +
   `setEpoch(e+1)` (EditorPane:129-130).
2. `epoch` feeds `reloadKey={`${pane.id}#${epoch}`}` (EditorPane:314), so
   `CodeMirrorEditor`'s reload effect dispatches a programmatic doc replacement
   (`view.dispatch({ changes: … })`, CodeMirrorEditor:167-170).
3. That dispatch sets `update.docChanged === true`, so the `updateListener` fires
   `onChange(pastText)` (CodeMirrorEditor:140) → `handleChange` →
   **`pendingRef.current = { path, content: pastText }`** and starts an autosave
   timer (EditorPane:146-149). `EditorState.readOnly` does NOT suppress
   programmatic dispatches or their update notifications.
4. The autosave timer's `flush` is guarded (returns at line 78 *before* clearing
   `pendingRef`), so `pendingRef` stays = `{ path, pastText }`.
5. On `exitPreview` (`setPreviewOid(null)`), the EditorPane reload effect re-runs
   (dep `props.previewOid`) and its first line is `await flush()` (EditorPane:113).
   Now `previewOid === null`, so the guard passes and it **writes `pastText` to
   disk** at the note's real path.

Result: "Volver al presente", stepping forward to the present, or clicking the
newest timeline entry — all of which are supposed to write nothing — silently
replace the working-dir content of every open note with its past version. If the
present had uncommitted edits, they are **irrecoverable** (never committed).
Multi-pane makes it worse: every visible pane that loaded past content flushes its
past over the present. This is exactly the failure the phase must not allow.

**Fix:** Prevent `pendingRef` from being populated by programmatic preview loads.
The minimal, robust fix mirrors the flush guard in `handleChange`:

```ts
const handleChange = (doc: string): void => {
  if (!pane.active) return
  // No registrar cambios pendientes durante la preview del pasado: el editor
  // es de sólo lectura y el doc lo movió una recarga programática, no el usuario.
  if (propsRef.current.previewOid != null) return
  setContent(doc)
  pendingRef.current = { path: pane.active, content: doc }
  ...
}
```

Additionally, clear `pendingRef.current = null` when entering preview as
defense-in-depth, and/or annotate programmatic reload transactions
(`Transaction.annotation`) in `CodeMirrorEditor` so the `updateListener` can
ignore non-user doc changes. Add a regression test: enter preview on a dirty
note, return to present, assert the on-disk note is unchanged.

## Warnings

### WR-01: `restoreTree` writes via `join(dir, filepath)` without `resolveInside` path guard

**File:** `src/main/services/git.ts:631-645`

**Issue:** The write loop does `atomicWrite(join(dir, filepath), …)` where
`filepath` comes from `treeBlobs` (a raw isomorphic-git tree walk), and the phase's
own safety note claims "writes stay inside vault via existing
resolveInside/atomicWrite". In reality `restoreTree` never calls `resolveInside` —
`GitService` has no such guard, and `atomicWrite` will `mkdir -p` and write
anywhere. isomorphic-git does not sanitize tree entry names, so a crafted commit
(reachable via GitHub clone/pull, which Geode supports) containing an entry named
`..` could escape the vault and write arbitrary files. The delete loop is safe
(paths come from `workBlobs`/real `readdir`), but the write path is not.

**Fix:** Validate each target path stays inside the vault before writing, e.g.
reuse the vault's `resolveInside`-style check or reject any `filepath` whose
normalized join is not under `dir`:

```ts
const abs = join(dir, filepath)
const rel = relative(dir, abs)
if (rel.startsWith('..') || isAbsolute(rel)) continue // o lanzar
await atomicWrite(abs, Buffer.from(blob))
```

### WR-02: `Timeline` transport reads `commits[idx].timestamp` without guarding `idx === -1`

**File:** `src/renderer/src/Timeline.tsx:33, 111`

**Issue:** `idx = previewOid ? commits.findIndex(...) : 0`. If `previewOid` is set
but its commit is no longer present in `graph.commits` (e.g. graph refreshed after
a branch/rebase change while a preview oid is still in state), `findIndex` returns
`-1`, `atPresent` is `false`, and the transport label renders
`relativeDate(commits[-1].timestamp)` → `commits[-1]` is `undefined` →
`.timestamp` throws and crashes the sidebar. App's banner guards this with
`?? null`, but the Timeline does not.

**Fix:** Guard the label on a valid index:

```ts
<span className={`tl-pos${atPresent ? '' : ' viewing'}`}>
  {atPresent || idx < 0 ? 'en el presente' : relativeDate(commits[idx].timestamp)}
</span>
```

### WR-03: `bringBack` / `restoreTree` have no error handling on the destructive path

**File:** `src/renderer/src/App.tsx:500-517`

**Issue:** `bringBack` (`git.commit` safety snapshot → `git.restoreTree` →
state updates) has no try/catch, and is invoked as `void bringBack()`. If
`restoreTree` throws mid-loop (write failure, IO error), the working dir is left
partially materialized, `previewOid` stays set (the user is stuck in preview), no
Spanish error toast is shown, and the rejection is unhandled. CLAUDE.md requires
try/catch for async operations that might fail and user-facing Spanish errors.
Data itself is protected by the prior safety snapshot, but the UX and partial-state
recovery are not handled.

**Fix:** Wrap the body in try/catch, surface a Spanish error via `notify`/`setToast`
on failure, and refresh the tree/graph in a `finally` so the UI cannot desync from
disk.

## Info

### IN-01: `restoreTree` leaves empty directories after deleting a folder's notes

**File:** `src/main/services/git.ts:642-644`

**Issue:** The delete loop `rm`s files but never prunes directories left empty. After
bringing back a version where a whole folder's notes did not yet exist, the empty
folder remains on disk and may appear in `vault.tree()`, which did not exist at that
point in time. Cosmetic, not data loss.

**Fix:** After the delete pass, remove now-empty directories (bottom-up), skipping
`IGNORED_TOP`.

### IN-02: `restoreTree` target set is unfiltered, so ignored-dir blobs are asymmetric

**File:** `src/main/services/git.ts:632, 766-778`

**Issue:** `target = treeBlobs(...)` is not IGNORE-filtered, while the delete-set
`current = workBlobs(...)` is. So if a commit's tree historically contains files
under an ignored top folder (e.g. `.obsidian/`), `restoreTree` will *write* them but
can never *delete* them (they are absent from `workBlobs`). This is a minor
inconsistency — the delete side is intentionally IGNORE-safe (correct), but the write
side can materialize ignored-dir content. Harmless for `.md` note fidelity; worth a
comment or symmetric filter.

**Fix:** Skip `IGNORED_TOP` paths in the write loop as well, to match the delete-set
semantics.

---

## Resolution (2026-07-04)

| Finding | Severity | Disposition | Commit / Rationale |
|---------|----------|-------------|--------------------|
| CR-01 — exit-preview overwrites present with past content | Critical | **Fixed** | `handleChange` ignora cambios mientras `previewOid != null`, para que las recargas programáticas no ensucien `pendingRef`. Aísla el valor núcleo. |
| WR-01 — `restoreTree` write/delete sin contención | Warning | **Fixed** | Añadido `resolveInside(dir, filepath)` privado; toda escritura/borrado se verifica dentro del vault antes de tocar disco. |
| WR-02 — `Timeline` crashea con `idx === -1` | Warning | **Fixed** | Guard `idx < 0` en la etiqueta de posición. |
| WR-03 — `bringBack` sin try/catch en el camino destructivo | Warning | **Fixed** | Envuelto en try/catch con toast en español; HEAD no se mueve ante fallo. |
| IN-01 — quedan directorios vacíos tras el restore | Info | **Accepted** | Cosmético; no afecta contenido ni versionado. Diferido. |
| IN-02 — blobs de dirs ignoradas se escriben pero no se borran | Info | **Accepted** | Requiere que un commit ya contenga rutas ignoradas (el commit las filtra por `IGNORED_TOP`); riesgo bajo. Diferido. |

Verificado tras los fixes: `npm run typecheck` exit 0.

---

_Reviewed: 2026-07-04T20:28:35Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
