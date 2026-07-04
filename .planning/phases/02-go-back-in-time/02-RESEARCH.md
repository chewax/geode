# Phase 2: Go Back in Time - Research

**Researched:** 2026-07-04
**Domain:** Whole-vault read-only time-travel preview + soft linear restore over isomorphic-git, inside an Electron sandboxed renderer.
**Confidence:** HIGH (this is an internal-codebase-mechanics phase; nearly every claim is grounded in the existing source, verified by reading it this session)

## Summary

This phase is almost entirely **codebase plumbing**, not external-library research. The building blocks already exist in `GitService` (`graph`, `readAt`, the private `treeBlobs`, `commitDiff`, and the racy-git-safe `pendingChanges`/`workBlobs`/`headBlobs`) and in the renderer (the immutable `paneTree` model, `flushAll`/`bumpAll`/`bumpPane`, `syncPanesToTree`, `refreshTree`, `restoreVersion`). The work is: (1) expose two new git primitives over IPC — **list-tree-at-commit** and **restore-tree-at-commit** — plus a cheap **changed-files-at-commit** helper for the timeline; (2) add a single `previewOid` state switch in `App.tsx` that reroutes the tree source and per-tab editor content to read-at-commit; (3) render a new repo-level `Timeline` section, a full-width `TimeTravelBanner`, ghost-tab treatment, and a CodeMirror `readOnly` toggle.

The dominant recommendation on the biggest open design question (materialize in main vs. renderer): **materialize in main** via a new `git.restoreTree(dir, oid)` that writes/deletes files directly against the working dir. It is one IPC round-trip instead of 2·N (readAt + writeNote per file), it already owns `treeBlobs`/`readBlob`/`workBlobs` (so it can compute the delete set safely and skip unchanged files), and it keeps deletions inside the IGNORED-filtered `workBlobs` set so `.git`/`.geode` are never touched. The safety snapshot before materializing is just the existing racy-safe `git.commit()` with a non-AI message.

**Primary recommendation:** Add `git.treeAt(oid): Promise<TreeNode[]>`, `git.restoreTree(oid): Promise<void>`, and `git.changedFiles(oid): Promise<string[]>` to the IPC surface; add one `previewOid: string | null` switch in App that reroutes tree + per-pane content sources and toggles a CodeMirror `readOnly` compartment; snapshot the immutable `panes`/`activePaneId` into a ref on enter and restore on exit. Do NOT touch `git.checkout()` / detached-HEAD anywhere in this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| List file tree at a past commit | Main (`GitService`) | — | Needs the git object store; wrap the private `treeBlobs`. Renderer has no fs/git access. |
| Read one note at a past commit | Main (`GitService.readAt`) | — | Already exists (`readNoteAt` IPC). Reused verbatim for preview content + ghost detection. |
| Materialize (write+delete) a past tree to working dir | Main (`GitService`) | — | Atomicity, path safety, skip-unchanged, single round-trip. Owns `treeBlobs`/`readBlob`/`workBlobs`. |
| Safety snapshot before materialize | Main (`GitService.commit`) | — | Racy-git-safe change detection lives here; must not invoke AI. |
| Per-commit "what changed" | Main (`GitService`) | — | Two-tree `git.walk` diff needs the object store; return human basenames. |
| `previewOid` state + source switching | Renderer (`App.tsx`) | — | Orchestrates tree/editor sources; owns pane model + banner. |
| Read-only editor chrome | Renderer (`CodeMirrorEditor`) | Renderer (`EditorPane`) | `readOnly` is a CM6 view concern; tint is CSS on `.epane-body`. |
| Timeline section UI | Renderer (`Timeline.tsx` + `SidebarSection`) | — | Pure presentation over `git.graph()`. |
| Layout snapshot/restore | Renderer (`App.tsx` ref) | — | `paneTree` is immutable; a captured reference IS a valid snapshot. |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Preview mechanism (read-only, "you are in the past"):**
- Virtual read-only preview: the tree AND the editor read from the commit tree via a new "read-in-commit" IPC; the working dir and HEAD stay intact until "Volver aquí".
- The file tree also reflects the past (requires a new "list tree in commit" IPC wrapping the private `treeBlobs` of `git.ts`).
- During preview the editor is **read-only** (CodeMirror `readOnly`) with "past" chrome; the only way to edit is "Volver aquí" (SOFT-05).
- State model: a single `previewOid` in App switches all data sources to read-in-commit; `null` = live present.

**"Volver aquí" (bring the moment back) — SOFT-02/06:**
- Materializes by writing each file of the previewed tree to the working dir + deleting files that did not exist in that version — **HEAD is not moved, no branch, no detached-HEAD** (generalizes the `restoreVersion` → `vault.writeNote` pattern).
- Before overwriting, if the working tree is dirty, take a **safety snapshot (commit without AI)** so nothing is lost — minimal here; Phase 4 formalizes cadence.
- After materializing, the old content is left as **pending changes** over the present line; the user saves later (Phase 3). Editing is re-enabled and preview exits.
- Light, non-blocking confirmation (toast/inline) since nothing is lost — no alarming modal.

**Repo-level Timeline section — SIDE-03, TIME-01..06:**
- Reuses the Phase 1 `SidebarSection` with `id="timeline"`, **below** Notas, always available (does not require an open note).
- History source: reuse **`git.graph()`** (repo-level, newest-first, with refs/HEAD) — same source as VersionGraph; retire the per-note `TimelineScrubber`.
- Entry label (TIME-03, never a hash): fallback chain **human name/tag → commit (AI) message → relative date**; relative date always visible as secondary.
- "What changed" (TIME-04): per entry, show changed files in human wording (e.g. "3 notas cambiadas: …") from a per-commit diff.
- Transport + marking (TIME-05/06): transport at top of the section: **step back / step forward / jump to present**; the newest entry always marked "presente", the previewed entry marked with a "viendo" accent — both persistent so divergence is legible; keep the active entry in view.

**"Past" chrome, ghost tabs, exit — SOFT-03/04/05:**
- Unmistakable global chrome: a full-width **top banner** ("Estás viendo el pasado — {fecha/nombre}") with "Volver al presente" + "Volver aquí"; editor tinted/dimmed.
- Ghost tab (SOFT-03): if the open note did not exist at the previewed moment, keep its tab as a **ghost** with a clear "did not exist at this moment" placeholder instead of content.
- Exit / jump to present (SOFT-04): snapshot the pane/tab/open-note layout on entering preview; **restore it exactly** on exit.
- On entering preview: flush pending edits to disk first (reuse `flushAll`) so nothing in flight is lost.

### Claude's Discretion
- Whether to materialize in main (new `restore-tree-at-commit` IPC) OR in the renderer by iterating `readAt` + `writeNote`. **This research recommends main-side `git.restoreTree` — see Architecture Patterns.**
- Exact new channel names, method signatures, handler wiring, preload exposure.
- Whether "what changed" is a per-entry lazy call or a batch method. **Recommends lazy per-entry with an oid cache.**
- How to toggle CodeMirror `readOnly` (compartment vs remount). **Recommends a `Compartment`.**
- Small pure helper extraction for testability (label fallback, relative date, changed-files summary).

### Deferred Ideas (OUT OF SCOPE)
- Named-save flow + AI description (Phase 3) — here timeline labels use tag → message → date, no naming flow.
- Configurable auto-snapshot cadence + formal pre-risk safety snapshots (Phase 4) — here only the minimal safety snapshot before "Volver aquí".
- Advanced Mode (DAG graph, branches, hashes, branch switcher) (Phase 5) — the Capa-0 timeline is linear and hash-free.
- Backlog (out of this milestone unless re-prioritized): delete sidebar items with Del/Supr; undo/discard an unmerged branch; status bar wrapping to a second line when the window shrinks.
- **The preview must NOT use `git.checkout()` (force checkout + detached HEAD) — that is Capa-2.**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SOFT-01 | Go back to a previous version; whole app reflects that moment (tree, tabs, editor — read-only) | `previewOid` switch reroutes tree source to `git.treeAt(oid)` and per-pane content to `git.readNoteAt(oid, path)`; readOnly editor. See Architecture Pattern 2. |
| SOFT-02 | Soft linear restore — working tree set to old state without moving HEAD, no branch, no detached-HEAD | New `git.restoreTree(oid)` writes/deletes blobs directly; never calls `git.checkout`. Pattern 1 + 3. |
| SOFT-03 | Ghost tab when the open note did not exist at the previewed version | `git.readNoteAt` throws when the blob is absent → EditorPane renders ghost placeholder. Pattern 5. |
| SOFT-04 | Returning to present restores full current state including the previously open note | Snapshot immutable `{panes, activePaneId}` into a ref on enter; restore on exit. Pattern 5. |
| SOFT-05 | Unmistakable "you are in the past" chrome; editing the previewed content is disallowed | Full-width `TimeTravelBanner` + teal tint; CodeMirror `readOnly` compartment. Pattern 2. |
| SOFT-06 | "Volver aquí" materializes the previewed version as current working state (linear, nothing lost) and re-enables editing | `flushAll` → dirty check (racy-safe) → safety `commit` (no AI) → `restoreTree` → refresh → clear `previewOid` → toast. Pattern 3. |
| TIME-01 | Timeline represents the whole vault's history (repo-level) | `git.graph().commits` is repo-level, newest-first. |
| TIME-02 | Timeline always available regardless of open note | `Timeline` renders in `SidebarSection` independent of `openPath`. |
| TIME-03 | Entries labeled human-only (name → AI message → relative date), never a hash | Pure `entryLabel(commit, tags)` helper. Timeline Data section. |
| TIME-04 | Each entry shows what changed in human wording | New `git.changedFiles(oid)` (two-tree walk vs first parent) → `N notas cambiadas`. Timeline Data. |
| TIME-05 | Transport (step back/forward/jump to present) drives whole-app preview, keeps active entry in view | Transport maps to index in `commits[]`; `scrollIntoView` on viewing entry. |
| TIME-06 | Previewed entry and "present" (newest) each distinctly, persistently marked | `.chip.current` (accent, on `commits[0]`) + `.chip.head-chip` (teal, on previewed oid) — both already in CSS. |
| SIDE-03 | Timeline is a collapsible section below the notes section | `SidebarSection id="timeline"` placed between NOTAS and VaultSwitcher in `<aside>`. |
</phase_requirements>

## Standard Stack

No new external dependencies. Everything is already installed and load-bearing. Verified against `package.json` (read this session).

### Core (existing, reused)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| isomorphic-git | 1.38.6 `[VERIFIED: package.json]` | `walk`/`TREE`, `readBlob`, `hashBlob`, `log`, `resolveRef` — all preview + restore primitives | Already the versioning engine; racy-git workaround depends on it (do NOT revert to statusMatrix). |
| @codemirror/state | 6.7.0 `[VERIFIED: package.json]` | `Compartment` + `EditorState.readOnly` for the read-only toggle | Idiomatic CM6 dynamic reconfiguration without remounting. |
| @codemirror/view | 6.43.4 `[VERIFIED: package.json]` | `EditorView.editable.of(false)` to suppress the cursor/caret in preview | Pairs with `readOnly` to make the past editor visibly inert. |
| lucide-react | 1.23.0 `[VERIFIED: package.json]` | Icons: `History`, `Clock`, `ChevronLeft/Right`, `ChevronsRight`, `CornerUpLeft`, `Eye`, `FileQuestion` | Project mandates Lucide monochrome, never emojis (CLAUDE.md). |
| diff | 9.0.0 `[VERIFIED: package.json]` | Not needed for TIME-04 (we only need changed *names*, not patches) | Avoid `createPatch` here; a two-tree walk that compares blob oids is far cheaper. |

### Supporting
No new packages. All UI is hand-rolled React + CSS custom properties (project has no shadcn/Tailwind; UI-SPEC locks `Tool: none`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Main-side `git.restoreTree` | Renderer iterating `readAt`+`writeNote`+`vault.delete` | Renderer path = 2·N IPC round-trips, must re-derive the delete set from two tree lists, and loses atomicity/skip-unchanged. Rejected. |
| CodeMirror `Compartment` for readOnly | Remount editor via `key`/`reloadKey` change | Remount works but loses the "view created once" doc-swap optimization; acceptable (toggles twice per preview) but compartment is cleaner and preserves scroll. |
| Lazy per-entry `changedFiles(oid)` | Batch `timelineSummary()` computing all commits in one call | Batch is one round-trip but does N tree-diffs eagerly on every graph refresh (graph is already a known bottleneck). Lazy + oid-cache spreads the cost to visible entries. |
| `git.treeAt` returning `TreeNode[]` | Returning flat `string[]` and rebuilding the tree in the renderer | Returning `TreeNode[]` in the exact `vault.tree()` shape lets `App.setTree()` swap sources with ZERO `FileTree` changes. Strongly preferred. |

**Installation:** none.

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. All libraries are pre-existing, pinned in `package-lock.json`, and already imported across the codebase. slopcheck/registry verification is moot.

## Architecture Patterns

### System Architecture Diagram

```text
                       ┌──────────────────────── RENDERER (App.tsx) ────────────────────────┐
                       │                                                                     │
   user clicks a       │   previewOid: string | null   ◄── the single switch                │
   timeline entry ─────┼──►  set previewOid = oid                                            │
                       │        │                                                            │
                       │        ├─► flushAll()  (persist in-flight edits to disk FIRST)      │
                       │        ├─► layoutSnapshotRef = { panes, activePaneId }  (on enter)  │
                       │        │                                                            │
                       │        ▼                                                            │
                       │   TREE SOURCE          PER-PANE CONTENT SOURCE      CHROME          │
                       │   previewOid            previewOid                   banner+tint    │
                       │    ? git.treeAt(oid)     ? git.readNoteAt(oid,path)   readOnly=true  │
                       │    : vault.tree()        : vault.readNote(path)                      │
                       └───────┬───────────────────────┬─────────────────────────────────────┘
                               │ IPC geode:git-tree-at │ IPC geode:git-read-note-at (exists)
                               ▼                       ▼
   ┌──────────────────────── MAIN (GitService) ───────────────────────────────────────────┐
   │  treeAt(oid) ── walk TREE({ref:oid}) → filter .md → build TreeNode[]                   │
   │  readAt(oid,path) ── readBlob (throws if absent → ghost signal)  [EXISTS]              │
   │                                                                                        │
   │  "Volver aquí":  restoreTree(oid)                                                      │
   │    1. target = treeBlobs(oid)         (path→blobOid at the past commit)                │
   │    2. current = workBlobs(dir)         (path→hash of live working dir, IGNORE-filtered)│
   │    3. for p in target: if current[p] !== target[p] → atomicWrite(readBlob)             │
   │    4. for p in current not in target → fs.rm(p)      HEAD IS NEVER MOVED               │
   │                                                                                        │
   │  changedFiles(oid) ── walk [TREE({ref:oid}), TREE({ref:parent0})] emit paths where     │
   │                        blobOid differs → return .md basenames                          │
   └────────────────────────────────────────────────────────────────────────────────────────┘
```

The working dir and HEAD are read-only during preview; the only write path is `restoreTree` (and the optional safety `commit` that precedes it).

### Recommended Project Structure
```text
src/
├── shared/ipc.ts                    # + 3 channels, + 3 GitApi methods (treeAt, restoreTree, changedFiles)
├── main/
│   ├── index.ts                     # + 3 ipcMain.handle wirings (requireRoot pattern)
│   └── services/git.ts              # + treeAt(), + restoreTree(), + changedFiles(); make treeBlobs reusable
├── renderer/src/
│   ├── App.tsx                      # + previewOid state, source switching, banner, layout snapshot
│   ├── Timeline.tsx                 # NEW — repo-level timeline body (transport + entry list)
│   ├── TimeTravelBanner.tsx         # NEW — full-width "past" banner
│   ├── time/labels.ts               # NEW (optional) — pure helpers: entryLabel, relativeDate, changedSummary
│   ├── EditorPane.tsx               # + previewOid prop: reroute load source, guard flush, ghost state
│   ├── PaneView.tsx                 # + thread previewOid prop through
│   ├── editor/CodeMirrorEditor.tsx  # + readOnly prop via Compartment
│   ├── index.css                    # + .tab.ghost, banner, editor tint, .tl-entry styles
│   └── TimelineScrubber.tsx         # REMOVE (retired; superseded by repo-level Timeline)
```

### Pattern 1: New IPC — list-tree-at-commit and restore-tree-at-commit

**Channel names** (add to `IPC` const in `src/shared/ipc.ts:10`, following the `geode:git-*` convention):
```typescript
  gitTreeAt: 'geode:git-tree-at',
  gitRestoreTree: 'geode:git-restore-tree',
  gitChangedFiles: 'geode:git-changed-files',
```

**`GitApi` additions** (`src/shared/ipc.ts:204`):
```typescript
  /** Árbol de notas (.md) tal como estaba en un commit — para la vista previa. */
  treeAt(oid: string): Promise<TreeNode[]>
  /** Materializa el árbol de un commit en el working dir (escribe/borra) SIN mover HEAD. */
  restoreTree(oid: string): Promise<void>
  /** Basenames de las notas que cambiaron en un commit respecto de su primer padre. */
  changedFiles(oid: string): Promise<string[]>
```
`TreeNode` is already exported from `@shared/ipc` (line 101) — reused so the tree shape is identical to `vault.tree()`.

**`GitService` implementations** (`src/main/services/git.ts`). Reuse the private `treeBlobs` (line 645) — it already walks `TREE({ ref })` and returns `Map<path, blobOid>`.

```typescript
/** Árbol de notas (.md) en un commit, en la MISMA forma que VaultService.tree(). */
async treeAt(dir: string, oid: string): Promise<TreeNode[]> {
  const blobs = await this.treeBlobs(dir, oid)         // path → blobOid (all blobs)
  const paths = [...blobs.keys()]
    .filter((p) => p.toLowerCase().endsWith('.md'))    // notas, como vault.tree()
    .filter((p) => !IGNORED_TOP.has(p.split('/')[0]))  // defensa (nunca deberían estar)
  return buildTree(paths)                              // helper puro: rutas → TreeNode[]
}

/** Escribe cada blob del árbol de `oid` al working dir y borra los que no existían.
 *  NO toca HEAD ni el index; genera "cambios pendientes" sobre la línea actual. */
async restoreTree(dir: string, oid: string): Promise<void> {
  const target = await this.treeBlobs(dir, oid)  // path → blobOid en la versión
  const current = await this.workBlobs(dir)      // path → hash real (IGNORE-filtrado, racy-safe)
  // Escribir/actualizar (saltando lo idéntico para no ensuciar de más).
  for (const [filepath, blobOid] of target) {
    if (current.get(filepath) === blobOid) continue
    const { blob } = await git.readBlob({ fs, dir, oid, filepath })
    await atomicWrite(join(dir, filepath), Buffer.from(blob))
  }
  // Borrar lo que existe hoy pero no en la versión (solo dentro del set IGNORE-filtrado).
  for (const filepath of current.keys()) {
    if (!target.has(filepath)) await rm(join(dir, filepath), { force: true })
  }
}
```
Notes:
- `atomicWrite` (imported at `git.ts:9`) already does temp+fsync+rename; reuse it for crash-safe writes. It takes a string today (`writeNote`), but blobs may be binary — write `Buffer.from(blob)` (verify `atomicWrite` accepts a Buffer; if it is string-typed, widen its signature to `string | Uint8Array`, it wraps `fs.writeFile` which accepts both).
- `rm` and `mkdir`/`join` are already imported (`git.ts:2-4`). `restoreTree`'s writes may need parent dirs — `atomicWrite` should `mkdir(dirname, {recursive:true})` first; confirm `src/main/fs/atomic.ts` does this (VaultService.createNote relies on it for nested paths, so it likely does — verify).
- **Deletion safety:** `current` = `workBlobs` which filters `IGNORED_TOP` (`.git`, `.geode`, `node_modules`, `.obsidian`). We only ever delete keys from `current`, so `.git`/`.geode` can never be deleted. This is the reason to base deletion on `workBlobs`, not on a raw `readdir`.
- **Path safety:** all paths come from a git tree or from `workBlobs` walking inside `dir`; neither can contain `..`. `join(dir, filepath)` stays inside the vault. (VaultService.resolveInside is private and not reachable from GitService; this is acceptable because the inputs are trusted git/fs-walk paths, not user strings.)

**Handler wiring** (`src/main/index.ts`, next to the other git handlers ~line 248-274, using the `requireRoot()` pattern):
```typescript
ipcMain.handle(IPC.gitTreeAt, (_e, oid: string) => gitService.treeAt(requireRoot(), oid))
ipcMain.handle(IPC.gitRestoreTree, (_e, oid: string) => gitService.restoreTree(requireRoot(), oid))
ipcMain.handle(IPC.gitChangedFiles, (_e, oid: string) => gitService.changedFiles(requireRoot(), oid))
```

**Preload exposure** (`src/preload/index.ts`, in the `git:` block ~line 39-54):
```typescript
    treeAt: (oid) => ipcRenderer.invoke(IPC.gitTreeAt, oid),
    restoreTree: (oid) => ipcRenderer.invoke(IPC.gitRestoreTree, oid),
    changedFiles: (oid) => ipcRenderer.invoke(IPC.gitChangedFiles, oid)
```

**When to use:** `treeAt` on entering/stepping preview; `restoreTree` only on "Volver aquí"; `changedFiles` lazily per visible timeline entry.

### Pattern 2: Read-only preview data flow (the `previewOid` switch)

**What:** A single `const [previewOid, setPreviewOid] = useState<string | null>(null)` in `App.tsx` reroutes every data source. `null` = live present.

**Tree source.** `refreshTree` (App.tsx:176) currently always calls `vault.tree()`. Make it preview-aware:
```typescript
const refreshTree = useCallback(async () => {
  const t = previewOid
    ? await window.geode.git.treeAt(previewOid)
    : await window.geode.vault.tree()
  setTree(t)
  return t
}, [previewOid])
```
Because `treeAt` returns the identical `TreeNode[]` shape, `FileTree` needs no changes. Call `refreshTree()` whenever `previewOid` changes.

**Per-tab editor content.** This is the one place the pane model must learn about preview. Thread a `previewOid` prop `App → PaneView → EditorPane`. In `EditorPane.tsx` the load effect (lines 102-121) currently does `await window.geode.vault.readNote(pane.active)`. Branch it:
```typescript
// inside the load effect, replacing the readNote call:
const text = props.previewOid
  ? await window.geode.git.readNoteAt(props.previewOid, pane.active)  // may throw → ghost
  : await window.geode.vault.readNote(pane.active)
```
Add `props.previewOid` to that effect's dependency array (currently `[pane.active, reloadNonce]`). Entering, stepping, and leaving preview then reload every pane automatically — **no `bumpAll` needed for the preview transition itself** (bumpAll stays the tool for present-mode disk reloads after restore/checkout).

**Cleanest conmutation (recommended):** do NOT rewrite the pane model. The switch is:
1. `refreshTree` reads from `treeAt` when `previewOid` is set.
2. `EditorPane` load source reads from `readNoteAt` when `previewOid` is set, with `previewOid` in the effect deps.
3. `flush()` in `EditorPane` (line 71) early-returns when `previewOid` is set (belt-and-suspenders; a readOnly editor never populates `pendingRef` so autosave never fires, but guard anyway so no disk write can leak during preview).
4. CodeMirror becomes read-only (below).

**Read-only editor (recommended: Compartment).** The view is created once (CodeMirrorEditor.tsx:108-143) with a fixed extension set, so `readOnly` must be reconfigurable. Use a CM6 `Compartment`:
```typescript
// Source: https://codemirror.net/docs/ref/#state.Compartment  [CITED]
import { Compartment, EditorState } from '@codemirror/state'
const readOnlyComp = useRef(new Compartment())
// in EditorState.create extensions:
readOnlyComp.current.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
// reconfigure when the prop flips:
useEffect(() => {
  viewRef.current?.dispatch({
    effects: readOnlyComp.current.reconfigure([
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly)
    ])
  })
}, [readOnly])
```
Pass `readOnly={props.previewOid !== null}` from `EditorPane`. `EditorState.readOnly` blocks edits; `EditorView.editable.of(false)` removes the caret so the "past" editor looks inert. `[CITED: codemirror.net/docs/ref/#state.EditorState^readOnly]`.

**Interaction with `reloadNonces`/`bumpAll`:** unchanged. `bumpAll`/`bumpPane` bump per-pane nonces to force disk reloads; those still work in present mode. During preview, the extra `previewOid` dependency in the load effect is what drives reloads. After "Volver aquí" or exit you both clear `previewOid` (reload from disk source) and can `bumpAll()` to be safe.

### Pattern 3: Safety snapshot before "Volver aquí"

**What:** Before overwriting the working dir, if it is dirty, take an AI-free commit so nothing is lost. Then materialize, then leave the old content as pending changes.

**Exact call path** (a new `App.bringBack` callback, generalizing `restoreVersion` at App.tsx:300):
```typescript
const bringBack = useCallback(async () => {
  const oid = previewOid
  if (!oid) return
  // NOTE: flushAll wrote nothing during preview (readOnly), but the pre-preview
  // flush already ran on enter. Dirty state here = whatever was pending before entering.
  const dirty = await window.geode.git.changes()          // racy-safe (pendingChanges)
  if (dirty.length > 0) {
    await window.geode.git.commit(`Snapshot antes de volver atrás — ${new Date().toLocaleString()}`)
  }
  await window.geode.git.restoreTree(oid)                  // write+delete, HEAD unmoved
  setPreviewOid(null)                                      // exit preview → sources go live
  restoreLayoutSnapshot()                                  // SOFT-04 (see Pattern 5)
  syncPanesToTree(await refreshTree())                     // reconcile tabs w/ new working tree
  await refreshGraph()                                     // safety snapshot changed the graph
  setToast('Traído al presente como cambios sin guardar.') // SOFT-06 light confirmation
}, [previewOid, refreshTree, syncPanesToTree, refreshGraph])
```
Key points:
- `git.commit()` (git.ts:133) is racy-git-safe (uses `pendingChanges` → `workBlobs`/`headBlobs` content hashing) and **does not invoke AI** (AI lives only in `aiSuggestMessage`; passing an explicit message means no AI call). This satisfies CLAUDE.md's cost constraint and SNAP-04's spirit.
- The safety snapshot is a **normal forward commit on the current branch** — HEAD advancing there is expected and is exactly how "nothing is lost". The CONTEXT "HEAD no se mueve" rule applies to the **materialize** step (`restoreTree` never checks out / detaches), not to the safety commit.
- After `restoreTree`, `git.changes()` will report the old-vs-HEAD diff → the working tree now holds the past content as pending changes on the present line. The user saves it as a named version later (Phase 3).
- Confirmation is a toast (`setToast`, existing at App.tsx:127 + `.toast` render at 1163). No modal, no red (SOFT-06).

### Pattern 4: Timeline from `git.graph()`

Covered in detail in **Timeline Data** below. Pattern: `Timeline.tsx` receives `graph: GitGraph`, derives entries from `graph.commits` (already newest-first), computes labels with a pure fallback helper, marks `commits[0]` as `presente` and `previewOid` as `viendo`, and lazily fetches `changedFiles(oid)` per entry.

### Pattern 5: Ghost tab + immutable layout snapshot/restore

**Ghost detection.** In `EditorPane`'s load effect, when `previewOid` is set and `git.readNoteAt` throws (blob absent at that commit), set a local `const [ghost, setGhost] = useState(false)`:
```typescript
try {
  const text = props.previewOid
    ? await window.geode.git.readNoteAt(props.previewOid, pane.active)
    : await window.geode.vault.readNote(pane.active)
  if (cancelled) return
  setGhost(false)
  setContent(text); setEpoch((e) => e + 1)
  propsRef.current.onNoteOpen(pane.id, pane.active, text)
} catch {
  if (cancelled) return
  setGhost(true)   // nota inexistente en esta versión → placeholder, no editor
}
```
Render: when `ghost` is true, show the `.placeholder`-style ghost body (`FileQuestion` icon, "Esta nota no existía todavía", `«{tabName(pane.active)}» aún no había sido creada.`) instead of `<CodeMirrorEditor>`. Add `.tab.ghost` styling to the tab (the tab itself stays open — SOFT-03). `.placeholder` already exists in `index.css:956`; `.tab.ghost` must be added.

**Layout snapshot (SOFT-04) — trivial because `paneTree` is immutable.** Every `paneTree` transformation returns a new object and App never mutates the existing tree; therefore capturing the reference IS a complete, stable snapshot:
```typescript
const layoutSnapshotRef = useRef<{ panes: PaneLayout; activePaneId: string } | null>(null)

// on ENTER preview (before any preview navigation):
const enterPreview = useCallback(async (oid: string) => {
  await flushAll()                                             // persist in-flight edits
  layoutSnapshotRef.current = { panes: panesRef.current, activePaneId: activePaneIdRef.current }
  setPreviewOid(oid)
  await refreshTree()                                          // now reads treeAt(oid)
}, [flushAll, refreshTree])

// on EXIT (jump to present / step past newest):
const restoreLayoutSnapshot = useCallback(() => {
  const snap = layoutSnapshotRef.current
  if (snap) { setPanes(snap.panes); setActivePaneId(snap.activePaneId) }
  layoutSnapshotRef.current = null
}, [])

const exitPreview = useCallback(async () => {
  setPreviewOid(null)
  restoreLayoutSnapshot()      // restores panes/tabs/active exactly (incl. previously open note)
  await refreshTree()          // back to vault.tree()
}, [restoreLayoutSnapshot, refreshTree])
```
`panesRef`/`activePaneIdRef` already exist (App.tsx:140-143) and stay fresh. Because the snapshot is just a reference to an immutable value, restoration is exact and cheap — no deep clone needed.

### Anti-Patterns to Avoid
- **Using `git.checkout()` / `goToVersion()` for preview.** Forbidden by CONTEXT. Preview reads; it never moves HEAD. `restoreTree` writes files directly.
- **Writing to disk during preview.** The whole point is non-destructive preview. Guard `EditorPane.flush()` and keep the editor `readOnly`.
- **Deleting via raw `readdir` in `restoreTree`.** Base the delete set on `workBlobs` (IGNORE-filtered) so `.git`/`.geode` are structurally unreachable.
- **Reusing `commitDiff` for TIME-04.** `commitDiff` is tree-vs-**HEAD** (git.ts:666-668), not tree-vs-parent — it would show "difference from where you're standing", not "what changed in this version". Use the new `changedFiles(oid)`.
- **Rebuilding the pane model for preview.** Don't. Thread one `previewOid` prop and reroute the load source.
- **Deep-cloning the pane tree for the snapshot.** Unnecessary; the tree is immutable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| List files at a past commit | Manual object-store traversal | Reuse private `treeBlobs` (git.ts:645) via new `treeAt` | Already walks `TREE({ref})` correctly. |
| Detect "dirty working tree" | `statusMatrix` / stat-based checks | `git.changes()` → `pendingChanges` (git.ts:610-724) | Racy-git-safe; statusMatrix loses same-size same-second edits (CLAUDE.md landmine). |
| Crash-safe file writes | `fs.writeFile` directly | `atomicWrite` (fs/atomic.ts) | temp+fsync+rename; already the project standard. |
| Two-commit changed-file diff | Read both full trees into maps and compare in JS | Single `git.walk([TREE(oid), TREE(parent)])` emitting differing paths | One walk, lazy blob-oid comparison; jsdiff/patches not needed for names. |
| Read-only editor toggle | Remount editor / custom keymap blocking | CM6 `Compartment` + `EditorState.readOnly` + `EditorView.editable` | Idiomatic, preserves view + scroll, reconfigurable. |
| Layout snapshot | Deep clone / serialize pane tree | Capture the immutable `panes` reference in a ref | `paneTree` ops are pure; the reference is already a snapshot. |
| Relative-date + label fallback | Inline ad-hoc formatting scattered in JSX | Small pure helpers in `time/labels.ts` | Testable-if-harness, reused by banner + entries, single source of truth. |

**Key insight:** the risky, subtle logic (change detection, atomic writes, tree walking, lane assignment) already exists and is battle-tested against the racy-git landmine. This phase should compose those primitives, not reimplement them.

## Runtime State Inventory

> This is a preview/restore feature, not a rename/refactor. It does **not** rename any stored key, service config, OS registration, secret, or build artifact. Included for completeness per protocol.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no keys/IDs/collection names are renamed. `restoreTree` writes note *content*; it does not alter git refs, `.geode/branches.json`, or settings. | None (verified: `restoreTree` touches only working-dir `.md`/blob files; `commit` uses existing refs). |
| Live service config | None — no n8n/Datadog/Tailscale/Cloudflare equivalents in this app. | None. |
| OS-registered state | None — no Task Scheduler / pm2 / launchd / systemd entries. | None. |
| Secrets/env vars | None — GitHub token + OpenRouter key (safeStorage) are untouched; no new secret. | None. |
| Build artifacts | None renamed. New source files compile via existing electron-vite pipeline; no egg-info/binary equivalent. | None. |

**Persistent client state (localStorage) worth noting:** `SidebarSection` persists collapse under `geode.section.timeline.collapsed` (already provisioned, SidebarSection.tsx:35). No migration needed — a missing key degrades to "expanded". `previewOid` is **transient** (React state only) — it must NOT persist across reload; the app always opens in the live present.

## Common Pitfalls

### Pitfall 1: Writing to disk while "in the past"
**What goes wrong:** An autosave or a stray `flush()` writes preview content over the real working file, silently corrupting the present.
**Why it happens:** `EditorPane` has a 600ms autosave (`AUTOSAVE_MS`, line 46) and a `flush()` on unmount/tab-switch that call `vault.writeNote`.
**How to avoid:** Make the editor `readOnly` (so `docChanged` never fires and `pendingRef` stays null) AND early-return in `flush()` when `previewOid` is set. Belt and suspenders.
**Warning signs:** After exiting preview, notes contain content from a past version you only *viewed*.

### Pitfall 2: Reusing `commitDiff` for "what changed" (TIME-04)
**What goes wrong:** Every timeline entry shows the diff against wherever HEAD currently is, not what actually changed in that version. Older entries show inflated/confusing counts.
**Why it happens:** `commitDiff(oid)` is explicitly tree-vs-HEAD (git.ts:666-691), designed for the diff viewer, not per-entry history.
**How to avoid:** Implement `changedFiles(oid)` as commit-vs-first-parent (see Timeline Data). Root commit → all files "added"; merge commit → vs first parent (consistent with `noteHistory`, git.ts:597).
**Warning signs:** The newest entry says "0 notas cambiadas"; ancient entries claim everything changed.

### Pitfall 3: Deleting `.git`/`.geode` during `restoreTree`
**What goes wrong:** Materialize wipes repo metadata or branch metadata, bricking the vault.
**Why it happens:** Naively deleting "every working-dir file not in the target tree" via `readdir` includes dotfolders.
**How to avoid:** Base the delete set on `workBlobs` (git.ts:763), which already filters `IGNORED_TOP`. Only delete keys present in `workBlobs`.
**Warning signs:** `.git` disappears; app can't read the graph after "Volver aquí".

### Pitfall 4: Racy-git regression in the safety snapshot / dirty check
**What goes wrong:** A same-size same-second edit isn't detected; the safety snapshot skips it; the edit is lost when `restoreTree` overwrites the file.
**Why it happens:** Reverting to `statusMatrix`/stat-based detection (the documented landmine).
**How to avoid:** Use `git.changes()`/`git.commit()` unchanged — they hash real content vs HEAD blobs (`pendingChanges`). Never introduce `statusMatrix` here.
**Warning signs:** "Volver aquí" on a dirty vault occasionally loses the most recent keystrokes.

### Pitfall 5: App.tsx blast radius
**What goes wrong:** The 47KB monolith with 40+ state vars (CONCERNS.md) makes `previewOid` threading error-prone; a missed source-switch leaves the tree in the past but the editor in the present (or vice-versa).
**Why it happens:** Preview touches tree source, per-pane content source, banner, readOnly, and layout snapshot simultaneously.
**How to avoid:** Centralize the transitions in three callbacks (`enterPreview`, `exitPreview`, `bringBack`) and one derived boolean `const inPast = previewOid !== null`. Route ALL source decisions through `refreshTree` (tree) and the single `previewOid` prop (content). Consider a small `usePreview` hook, but keep it optional — surgical additions over refactor to limit risk in an untested file.
**Warning signs:** Tree shows past files while an open tab still shows present content.

### Pitfall 6: `changedFiles` performance on large histories
**What goes wrong:** Rendering the timeline triggers N tree-walks (one per entry), each O(files); sluggish on 1000+ commits (graph is already a known bottleneck, CONCERNS.md).
**Why it happens:** Eagerly computing "what changed" for every entry.
**How to avoid:** Fetch `changedFiles(oid)` **lazily per rendered entry** and cache by oid in the `Timeline` component (mirror TimelineScrubber's `cache = useMemo(() => new Map(), …)` pattern, line 35). For Capa-0 vaults (tens–low-hundreds of commits) this is fine; note the ceiling.
**Warning signs:** Opening the timeline section janks the UI on big repos.

## Code Examples

### `changedFiles` — commit vs first parent in one walk
```typescript
// src/main/services/git.ts  — Source: isomorphic-git walk() multi-tree diff
// [CITED: node_modules/isomorphic-git/index.d.ts:3477-3505 "compare all filepaths in two or more trees"]
async changedFiles(dir: string, oid: string): Promise<string[]> {
  const commit = await git.readCommit({ fs, dir, oid })
  const parent = commit.commit.parent[0] ?? null
  const changed: string[] = []
  await git.walk({
    fs, dir,
    trees: parent ? [TREE({ ref: oid }), TREE({ ref: parent })] : [TREE({ ref: oid })],
    map: async (filepath, entries) => {
      if (filepath === '.' || IGNORED_TOP.has(filepath.split('/')[0])) return
      if (!filepath.toLowerCase().endsWith('.md')) return
      const [a, b] = entries
      const aBlob = a && (await a.type()) === 'blob'
      if (!aBlob) return                      // no existe / no es blob en la versión
      if (!parent || !b) { changed.push(filepath); return }  // agregado
      const bBlob = (await b.type()) === 'blob'
      if (!bBlob || (await a.oid()) !== (await b.oid())) changed.push(filepath)  // modificado
      return
    }
  })
  return changed.map((p) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, ''))
}
```
(Verify `git.readCommit` returns `{ commit: { parent: string[] } }` in 1.38.6 — it does; `graph()` already reads `c.commit.parent`, git.ts:327.)

### Pure timeline helpers (extract for testability)
```typescript
// src/renderer/src/time/labels.ts
import type { GitCommitNode, GitTagRef } from '@shared/ipc'

/** TIME-03: nombre humano (tag) → mensaje del commit → fecha relativa. Nunca un hash. */
export function entryLabel(c: GitCommitNode, tags: GitTagRef[], now = Date.now()): string {
  const tag = tags.find((t) => t.oid === c.oid)
  if (tag) return tag.name
  const msg = c.message.trim()
  if (msg) return msg
  return relativeDate(c.timestamp, now)
}

/** Fecha relativa en español, singular/plural. */
export function relativeDate(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'ahora mismo'
  const m = Math.round(s / 60);  if (m < 60) return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`
  const h = Math.round(m / 60);  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`
  const d = Math.round(h / 24);  if (d < 7)  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
  const w = Math.round(d / 7)
  return `hace ${w} ${w === 1 ? 'semana' : 'semanas'}`
}

/** TIME-04: "1 nota cambiada" / "N notas cambiadas". */
export function changedSummary(names: string[]): string {
  const n = names.length
  return `${n} ${n === 1 ? 'nota cambiada' : 'notas cambiadas'}`
}
```

### Transport index math (Timeline)
```typescript
// commits are newest-first: index 0 = present. back = older (index+1), forward = newer (index-1).
const idx = previewOid ? commits.findIndex((c) => c.oid === previewOid) : 0
const stepBack   = () => { const n = commits[idx + 1]; if (n) onSelect(n.oid) }        // older
const stepFwd    = () => { const n = commits[idx - 1]; if (n) idx - 1 === 0 ? onJumpToPresent() : onSelect(n.oid) }
const jump       = () => onJumpToPresent()   // clears previewOid
// disable stepBack at idx === commits.length-1; disable stepFwd/jump when previewOid === null
```

## State of the Art

| Old Approach (current codebase) | Current Approach (this phase) | Why it changes |
|--------------------------------|-------------------------------|----------------|
| Per-note `TimelineScrubber` modal (noteHistory → readNoteAt slider) | Repo-level `Timeline` section over `git.graph()` | TIME-01/02: whole-vault history, always available. Retire the per-note modal. |
| "Go to version" = `git.checkout()` force + possible detached-HEAD (`goToVersion`, App.tsx:464) | Read-only virtual preview + `restoreTree` (no HEAD move) | SOFT-02: non-destructive linear restore; checkout is Capa-2/Advanced Mode. |
| Single-note restore (`restoreVersion`, App.tsx:300) | Multi-file `restoreTree` materialize | SOFT-06: bring back the whole moment, not one note. |
| `commitDiff` (tree-vs-HEAD) for diffs | `changedFiles` (tree-vs-parent) for timeline "what changed" | TIME-04: per-version change summary, not vs-current-position. |

**Deprecated/outdated (remove in this phase):**
- `TimelineScrubber.tsx` and its render + `timelineOpen` state (App.tsx:100, 862-871, 1077-1083): superseded by `Timeline`. Its `noteHistory`/`readNoteAt` cache pattern is generalized to repo-level. (Keep `git.noteHistory` in the service — it's harmless and may be reused later — but remove the modal wiring.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `atomicWrite` (fs/atomic.ts) accepts a `Buffer`/`Uint8Array`, not just `string`, and `mkdir`s parent dirs recursively | Pattern 1 | If string-only, `restoreTree` breaks on binary blobs or nested paths. **Mitigation:** read `src/main/fs/atomic.ts` during planning; widen signature or `mkdir` first if needed. LOW risk (VaultService.createNote writes nested paths through it). |
| A2 | `git.readCommit` in isomorphic-git 1.38.6 returns `{ commit: { parent: string[] } }` | changedFiles example | If shape differs, `changedFiles` parent lookup fails. **Mitigation:** `graph()` already reads `c.commit.parent` (git.ts:327), so the shape is confirmed for `log`; `readCommit` mirrors it. LOW risk. |
| A3 | `git.walk` `map` receives one `WalkerEntry` per tree in `trees` order (so `entries[0]`=oid, `entries[1]`=parent) | changedFiles example | Wrong indexing inverts added/deleted. **Mitigation:** matches `headBlobs`/`treeBlobs` single-tree usage and the documented multi-tree diff (index.d.ts:3479); confirm with a quick manual UAT. LOW risk. |
| A4 | The "present" marker belongs on `commits[0]` (newest), which equals the live working line for Capa-0 linear histories | Timeline Data / Pattern 4 | If the repo has branches ahead of the newest-by-timestamp commit, "present" could mismatch HEAD. **Mitigation:** Capa-0 is linear (branches/graph are Advanced-Mode/Phase 5); UI-SPEC explicitly marks newest entry as present. Acceptable for this phase. LOW risk. |
| A5 | A readOnly CodeMirror view emits no `docChanged`, so `pendingRef` stays null and no autosave fires | Pattern 2 / Pitfall 1 | If some extension mutates the doc, a write could leak. **Mitigation:** the `flush()` preview guard is the backstop. LOW risk. |

**No assumptions touch compliance, security, retention, or performance targets.** All are internal-mechanics assumptions verifiable during planning by reading one file each.

## Open Questions

1. **Does `atomicWrite` accept binary and create parent dirs?**
   - What we know: it's used for all vault writes incl. nested `createNote` paths.
   - What's unclear: its exact parameter type (string vs `string | Uint8Array`).
   - Recommendation: read `src/main/fs/atomic.ts` first thing in planning; adjust `restoreTree` accordingly (trivial if it's already `Uint8Array`-friendly).

2. **Should stepping "forward" past the newest entry auto-exit preview, or stop at newest?**
   - What we know: UI-SPEC disables "step forward" and "jump" when `previewOid === null` (already present).
   - What's unclear: whether reaching `commits[0]` via step-forward should clear `previewOid` (full exit + layout restore) or just mark the newest as viewing.
   - Recommendation: reaching the newest = exit to present (clear `previewOid`, restore layout), so the two markers collapse and the app is truly "live". Matches "Saltar al presente" semantics. Confirm in planning.

3. **Ghost tabs: what if the note exists at previewOid but is binary/unreadable?**
   - What we know: `readNoteAt` decodes as UTF-8 text.
   - What's unclear: behavior for non-.md/binary (shouldn't occur — tree is filtered to `.md`).
   - Recommendation: treat any `readNoteAt` throw as ghost; acceptable.

## Environment Availability

> Skipped — this phase has no external tools/services/runtimes beyond the already-installed project stack (isomorphic-git, CodeMirror, Electron, React), all pinned in `package-lock.json`. No new binaries, databases, or CLIs are introduced. `npm run typecheck` and `npm run dev` are the only tools needed and are already part of the project.

## Validation Architecture

> `workflow.nyquist_validation` is effectively disabled: **there is no automated test harness** — zero test files, no Jest/Vitest config, no `test` script in `package.json` (verified in CONCERNS.md and `package.json`). This phase must NOT introduce a test framework (out of scope). Validation = static typecheck + structured manual UAT.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None installed (no jest/vitest/mocha; no `test` script) |
| Config file | none |
| Quick run command | `npm run typecheck` (runs `typecheck:node` + `typecheck:web`) |
| Full suite command | `npm run typecheck && npm run build` (build also runs typecheck) |
| Runtime smoke | `npm run dev` (manual UAT in the running app) |

### Phase Requirements → Validation Map
| Req ID | Behavior | Validation Type | Command / Steps |
|--------|----------|-----------------|-----------------|
| (all) | New IPC + props typecheck across main/preload/renderer | static | `npm run typecheck` — the typed IPC contract (`GitApi`) forces preload + handlers + callers to agree. |
| SOFT-01 | Clicking a timeline entry shows past tree + read-only past content | manual UAT | Open vault w/ ≥3 saved versions → click older entry → tree + open tab reflect the past; banner appears; editor won't accept typing. |
| SOFT-02/06 | "Volver aquí" leaves old content as pending changes, HEAD unmoved | manual UAT | Note current version count → "Volver aquí" → verify Save shows pending changes, graph HEAD unchanged (no new branch/detached), old content present. |
| SOFT-03 | Ghost tab for a note absent at previewOid | manual UAT | Create note B → save version → open B → step to a version before B existed → B's tab shows ghost placeholder, not content. |
| SOFT-04 | Exit restores exact layout incl. previously open note | manual UAT | Split panes, open notes X/Y → enter preview, navigate → "Volver al presente" → same split + X/Y + active pane restored. |
| SOFT-05 | Unmistakable past chrome; no editing | manual UAT | Banner spans full width; editor tinted; typing does nothing. |
| TIME-01/02 | Repo-level timeline, available with no note open | manual UAT | Close all tabs → timeline section still lists versions. |
| TIME-03 | Labels: name → message → date, never a hash | manual UAT | Tagged commit shows tag; untagged shows message; empty-message shows relative date; no 40-char hex anywhere. |
| TIME-04 | "N notas cambiadas" per entry | manual UAT | Entry secondary line shows count; hover title lists basenames; newest entry count matches its actual change. |
| TIME-05 | Transport drives preview + keeps active entry in view | manual UAT | Step back/forward changes whole-app preview; viewing entry scrolls into view; jump returns to present. |
| TIME-06 | Dual persistent markers | manual UAT | While previewing an old entry, `presente` (accent) on newest AND `viendo` (teal) on previewed are both visible. |
| SIDE-03 | Collapsible timeline below Notas | manual UAT | Section sits below NOTAS, above VaultSwitcher; collapse persists across reload. |

### Small pure helpers worth extracting (unit-testable IF a harness existed — do NOT add one now)
These are the highest-value extraction targets; they are pure functions with no IPC/DOM, so a future Vitest suite could cover them cheaply. Extracting them now also de-risks the JSX by isolating fiddly logic:
- `entryLabel(commit, tags, now)` — the TIME-03 fallback chain.
- `relativeDate(ts, now)` — Spanish singular/plural boundaries (59s, 1 min, 60 min, 24h, 7d…).
- `changedSummary(names)` — pluralization.
- `buildTree(paths): TreeNode[]` — the `treeAt` path-list → `TreeNode[]` reconstruction (pure; mirrors `vault.tree()` sort: folders first, then `.md`, alphabetical).
- Transport index math (`stepBack`/`stepForward` bounds against `commits[]`).

Put label/date/summary in `src/renderer/src/time/labels.ts` and `buildTree` next to `treeAt` (or a shared pure module). No test files are added this phase; the note simply flags them for a future harness.

### Sampling cadence (manual)
- **Per task:** `npm run typecheck` must be green before considering a task done.
- **Per wave / phase gate:** `npm run build` green + the full manual UAT table above run in `npm run dev` before `/gsd-verify-work`.

## Security Domain

> `security_enforcement` default (enabled). This phase runs entirely in the existing Electron trust boundary; it adds IPC surface, which is the one place to be careful.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Renderer stays sandboxed (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, main/index.ts:102-104). New capability exposed only via the typed preload bridge — no raw `ipcRenderer`. |
| V4 Access Control (path traversal) | yes | `treeAt`/`restoreTree` operate only on git-tree paths and `workBlobs` paths (both structurally inside the vault, no `..`). `requireRoot()` gates all handlers to the active vault. |
| V5 Input Validation | yes | New handler args are commit oids (opaque hex from `git.graph()`, echoed back) — not user free-text. `git.readBlob`/`walk` reject unknown oids by throwing (surfaced as rejected IPC promise). |
| V6 Cryptography | no | No new crypto. Existing safeStorage secrets untouched. |
| V2/V3 Auth/Session | no | No auth surface changed. |

### Known Threat Patterns for {Electron + isomorphic-git}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious/oversized IPC arg (oid) triggers unbounded work | DoS | oids come from the app's own `graph()`; `walk`/`readBlob` are bounded by tree size. No user-supplied paths in `restoreTree`. |
| Path traversal via crafted filepath in restore | Tampering | Paths originate from git trees / `workBlobs` (inside vault); deletion set = IGNORE-filtered `workBlobs`, so `.git`/`.geode` are unreachable. `join(dir, path)` cannot escape. |
| Data loss on materialize (overwrite of dirty tree) | Tampering/Repudiation | Racy-safe safety `commit` before `restoreTree`; `atomicWrite` for crash safety; deletions recoverable from history. |
| Plugin abusing new IPC | Elevation | New methods are read/restore within the vault only; no new network/fs-outside-vault capability. Sandbox unchanged. |

No new secrets, network calls, or auth. The security-relevant delta is exactly the three new IPC methods; all are vault-scoped via `requireRoot()` and consume app-generated oids.

## Sources

### Primary (HIGH confidence — read this session)
- `src/main/services/git.ts` — `graph` (305), `readAt` (523), private `treeBlobs` (645), `commitDiff` (666), `commit` (133), `pendingChanges`/`workBlobs`/`headBlobs` (712-781), `checkout` (288, AVOID).
- `src/main/services/vault.ts` — `tree`/`readDir` shape (73-103), `writeNote`/`atomicWrite` (109), `resolveInside` (63), `deletePath` (156).
- `src/shared/ipc.ts` — `IPC` channels (10-65), `GitApi` (204-236), `TreeNode` (101), `GitGraph`/`GitCommitNode`/`GitTagRef` (146-202).
- `src/main/index.ts` — handler registration pattern + `requireRoot()` (78-82, 248-274).
- `src/preload/index.ts` — `git` bridge block (39-54).
- `src/renderer/src/App.tsx` — `previewOid` host; `flushAll` (154), `bumpAll`/`bumpPane` (159-170), `refreshTree` (176), `refreshGraph` (182), `restoreVersion` (300), `syncPanesToTree` (433), `goToVersion` (464, AVOID pattern), `TimelineScrubber` wiring (100, 862-871, 1077-1083), `.toast` (127, 1163).
- `src/renderer/src/EditorPane.tsx` — load effect + `flush` (71-121), autosave (46), tab render (215-246).
- `src/renderer/src/PaneView.tsx` — prop threading to `EditorPane` (29-51).
- `src/renderer/src/editor/CodeMirrorEditor.tsx` — view created once + `reloadKey` doc-swap (108-162); extension list.
- `src/renderer/src/editor/extensions.ts` — `baseExtensions()` (readOnly compartment goes here or in the component).
- `src/renderer/src/paneTree.ts` — immutable `PaneLayout`, `keepOnly`, `mapLeaves`, `makeLeaf` (confirms snapshot-by-reference).
- `src/renderer/src/SidebarSection.tsx` — reusable section; `geode.section.timeline.collapsed` provisioned (35).
- `src/renderer/src/TimelineScrubber.tsx` — retiring; oid-content cache pattern (35) to generalize.
- `src/renderer/src/index.css` — verified tokens/classes: `--accent` (9), `--head` (13), `.chip.current` (1278), `.chip.head-chip` (1303), `.placeholder` (956), `.tree-empty` (717), `.plugin-empty` (2182). `.tab.ghost` NOT present → must be added.
- `.planning/codebase/CONCERNS.md` — no test harness; App.tsx monolith; racy-git; force-checkout fragility; graph perf.
- `.planning/phases/02-go-back-in-time/02-CONTEXT.md` + `02-UI-SPEC.md` — locked decisions and UI contract.
- `package.json` — dependency versions + `typecheck`/`build` scripts (no `test`).

### Secondary (MEDIUM confidence)
- `node_modules/isomorphic-git/index.d.ts` — `walk`/`TREE` multi-tree diff semantics (269, 746, 3477-3583); `listFiles` note recommending `walk` over full store traversal for perf.

### Tertiary (LOW confidence — verify in planning)
- `[CITED: codemirror.net/docs/ref/#state.EditorState^readOnly and #state.Compartment]` — readOnly compartment pattern (not fetched live this session; standard CM6 API, stable since 6.0).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all versions verified in `package.json`.
- Architecture (IPC + previewOid switch + restoreTree): HIGH — grounded in existing service/renderer code read this session; the one design choice (main-side materialize) is justified against the renderer alternative.
- Timeline data (changedFiles): MEDIUM-HIGH — `walk` multi-tree diff is documented and matches existing `treeBlobs` usage; A2/A3 assumptions are low-risk and verifiable.
- Read-only editor (Compartment): MEDIUM-HIGH — standard CM6 API; not fetched live, flagged CITED.
- Pitfalls/security: HIGH — derived from CONCERNS.md + the racy-git landmine + the sandbox model.

**Research date:** 2026-07-04
**Valid until:** 2026-08-04 (stable — internal codebase mechanics; no fast-moving external dependency). Re-verify only if isomorphic-git or CodeMirror majors change.
