# Phase 2: Go Back in Time - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 12 (3 new, 9 modified) + 1 retired
**Analogs found:** 12 / 12 (all in-repo; this is a codebase-plumbing phase)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main/services/git.ts` (+`treeAt`,`restoreTree`,`changedFiles`) | service | file-I/O + transform | `treeBlobs` / `readAt` / `commitDiff` / `commit` (same file) | exact |
| `src/main/fs/atomic.ts` (widen signature) | utility | file-I/O | `atomicWrite` itself (widen `string` → `string \| Uint8Array`) | exact |
| `src/shared/ipc.ts` (+3 channels, +3 `GitApi` methods) | config/contract | request-response | existing `gitReadNoteAt`/`gitCommitDiff` channels + `GitApi` | exact |
| `src/main/index.ts` (+3 `ipcMain.handle`) | route | request-response | git handlers L248-274 (`requireRoot()`) | exact |
| `src/preload/index.ts` (+3 methods) | route | request-response | `git:` block L39-54 | exact |
| `src/renderer/src/Timeline.tsx` | component | request-response (read) | `TimelineScrubber.tsx` (retiring) + `SidebarSection` body | role+flow match |
| `src/renderer/src/TimeTravelBanner.tsx` | component | event-driven | `titlebar` header row (App.tsx L808-887) + `.toast` | role match |
| `src/renderer/src/time/labels.ts` | utility | transform (pure) | `TimelineScrubber` `fmtDate`/`noteName` (L13-19) | role match |
| `src/renderer/src/App.tsx` (previewOid orchestration) | provider/store | event-driven | `restoreVersion` L300, `syncPanesToTree` L433, `goToVersion` L464 (AVOID) | exact |
| `src/renderer/src/PaneView.tsx` (thread `previewOid`) | component | request-response | existing prop threading L29-51 | exact |
| `src/renderer/src/EditorPane.tsx` (previewOid load + ghost + flush guard) | component | file-I/O + event | load effect L102-121, `flush` L71-81, tab render L215-246 | exact |
| `src/renderer/src/editor/CodeMirrorEditor.tsx` (readOnly Compartment) | component | event-driven | view create L108-143, reloadKey effect L149-162 | role match |
| `src/renderer/src/index.css` (ghost/banner/tint/tl-entry) | config/style | — | `.chip.head-chip` L1303, `.placeholder` L956, `.tab` L888, `.toast` L2633 | exact |
| `src/renderer/src/TimelineScrubber.tsx` | RETIRE | — | remove wiring App.tsx L100, L862-871, L1077-1083 | — |

---

## Pattern Assignments

### `src/main/services/git.ts` — `treeAt` / `restoreTree` / `changedFiles` (service, file-I/O + transform)

**Analog:** the private `treeBlobs` (L645-657), `readAt` (L523-526), `commitDiff` (L666-691), racy-safe `workBlobs` (L763-781).

**Imports already present (git.ts L1-12)** — reuse verbatim; no new imports except `rm` for delete:
```typescript
import fs from 'node:fs'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'   // add: rm
import { join } from 'node:path'
import git, { TREE } from 'isomorphic-git'
import { atomicWrite } from '../fs/atomic'
const IGNORED_TOP = new Set(['.git', '.geode', 'node_modules', '.obsidian'])
```
NOTE: `rm` is NOT currently imported (the CONTEXT/RESEARCH claim it is — verify: L3 imports `mkdir, readdir, readFile, stat` only). Add `rm` to the `node:fs/promises` import.

**Core pattern — tree walk to path→blobOid map (analog `treeBlobs`, L645-657), the primitive `treeAt`/`restoreTree` wrap:**
```typescript
private async treeBlobs(dir: string, ref: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  await git.walk({
    fs, dir, trees: [TREE({ ref })],
    map: async (filepath, [entry]) => {
      if (!entry || filepath === '.') return
      if ((await entry.type()) === 'blob') map.set(filepath, await entry.oid())
    }
  })
  return map
}
```
> NOTE: `treeBlobs` does NOT filter `IGNORED_TOP` (unlike `headBlobs` L751). For `treeAt` add the `.md` + `IGNORED_TOP` filter in the wrapper. For `restoreTree`'s delete set, base it on `workBlobs` (which IS filtered) — never on `treeBlobs` alone.

**Racy-safe working-dir hashing (analog `workBlobs`, L763-781) — the delete-set + skip-unchanged source for `restoreTree`:**
```typescript
private async workBlobs(dir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const walk = async (relDir: string): Promise<void> => {
    const entries = await readdir(join(dir, relDir), { withFileTypes: true })
    for (const entry of entries) {
      if (IGNORED_TOP.has(entry.name)) continue          // .git/.geode never enter the set
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(rel)
      else if (entry.isFile()) {
        const content = await readFile(join(dir, rel))
        const { oid } = await git.hashBlob({ object: content })   // real content hash, NOT statusMatrix
        map.set(rel, oid)
      }
    }
  }
  await walk('')
  return map
}
```
`treeBlobs` and `workBlobs` are `private` — `restoreTree`/`treeAt` are methods on the SAME class, so they call `this.treeBlobs(...)` / `this.workBlobs(...)` directly (no visibility change needed).

**Read-one-blob-at-commit (analog `readAt`, L523-526)** — reused verbatim by preview + ghost detection (already exposed as `readNoteAt`):
```typescript
async readAt(dir: string, oid: string, filepath: string): Promise<string> {
  const { blob } = await git.readBlob({ fs, dir, oid, filepath })   // throws if absent → ghost signal
  return new TextDecoder().decode(blob)
}
```
For `restoreTree`'s per-file write, use `git.readBlob({ fs, dir, oid, filepath })` and write `Buffer.from(blob)` (binary-safe — do NOT decode to string).

**Two-tree diff for `changedFiles` — analog is the multi-tree `git.walk` shape already used in `treeBlobs`, extended to two trees.** `changedFiles` must be commit-vs-**first-parent** (NOT `commitDiff`, which is tree-vs-HEAD, L666-668 — see Anti-Patterns). First-parent + `.md` + `IGNORED_TOP` filter mirrors `noteHistory` (L596-597) and `headBlobs` (L751). Parent shape confirmed: `graph()` reads `c.commit.parent` at L327.

**Error/no-op convention (analog `commitDiff` L668, `commit` L135):** return `[]` / early-return on no-op; throw only on real git errors. `restoreTree` returns `void`.

---

### `src/main/fs/atomic.ts` — widen `atomicWrite` for binary blobs (utility, file-I/O)

**Analog:** `atomicWrite` itself (L13-33). **VERIFIED finding (resolves RESEARCH Open Question 1 / Assumption A1):**
```typescript
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })          // ✓ already mkdirs parent dirs recursively
  const tmp = join(dir, `.geode-tmp-...`)
  const handle = await open(tmp, 'w')
  try {
    await handle.writeFile(content, 'utf8')      // ✗ hardcoded 'utf8' — string-only TODAY
    await handle.sync()
  } finally { await handle.close() }
  ...
}
```
- `mkdir(recursive)` is present → nested restore paths are fine, no extra work.
- Signature is `content: string` with a hardcoded `'utf8'` encoding. To write git blobs (possibly binary) it must be widened to `content: string | Uint8Array`, and the `'utf8'` arg dropped/made conditional (`handle.writeFile(content)` accepts both `string` and `Uint8Array`). This is the single load-bearing edit for `restoreTree`.

---

### `src/shared/ipc.ts` — 3 channels + 3 `GitApi` methods (contract, request-response)

**Analog:** the `IPC` const git block (L31-44) and `GitApi` interface (L204-236). Add channels following the `geode:git-*` convention:
```typescript
// in IPC const, next to gitReadNoteAt (L44):
gitTreeAt: 'geode:git-tree-at',
gitRestoreTree: 'geode:git-restore-tree',
gitChangedFiles: 'geode:git-changed-files',
```
**`GitApi` additions (analog: `readNoteAt` L226, `commitDiff` L222 signatures)** — Spanish doc comments, explicit return types, reuse existing `TreeNode` (L101, no new DTO):
```typescript
/** Árbol de notas (.md) tal como estaba en un commit — para la vista previa. */
treeAt(oid: string): Promise<TreeNode[]>
/** Materializa el árbol de un commit en el working dir (escribe/borra) SIN mover HEAD. */
restoreTree(oid: string): Promise<void>
/** Basenames de las notas que cambiaron en un commit respecto de su primer padre. */
changedFiles(oid: string): Promise<string[]>
```
No new DTO type needed — `treeAt` returns the existing `TreeNode[]` (identical shape to `vault.tree()`, so `setTree()` swaps sources with zero `FileTree` changes).

---

### `src/main/index.ts` — 3 handlers (route, request-response)

**Analog:** git handlers L248-274, using `requireRoot()` (L77-82). Copy the `gitReadNoteAt`/`gitCheckout` one-liner shape verbatim:
```typescript
// analog (L255, L272-274):
ipcMain.handle(IPC.gitCheckout, (_e, oid: string) => gitService.checkout(requireRoot(), oid))
ipcMain.handle(IPC.gitReadNoteAt, (_e, oid: string, path: string) =>
  gitService.readAt(requireRoot(), oid, path))

// new (place next to them):
ipcMain.handle(IPC.gitTreeAt, (_e, oid: string) => gitService.treeAt(requireRoot(), oid))
ipcMain.handle(IPC.gitRestoreTree, (_e, oid: string) => gitService.restoreTree(requireRoot(), oid))
ipcMain.handle(IPC.gitChangedFiles, (_e, oid: string) => gitService.changedFiles(requireRoot(), oid))
```
`requireRoot()` throws `'No hay vault abierto'` — this IS the input-validation/access-control gate (V4/V5); no per-arg validation needed since oids are app-generated.

---

### `src/preload/index.ts` — 3 methods (route, request-response)

**Analog:** the `git:` block L39-54. Copy the `readNoteAt`/`checkout` arrow shape:
```typescript
// analog (L42, L53):
checkout: (oid) => ipcRenderer.invoke(IPC.gitCheckout, oid),
readNoteAt: (oid, path) => ipcRenderer.invoke(IPC.gitReadNoteAt, oid, path)

// new (add inside git: {}):
treeAt: (oid) => ipcRenderer.invoke(IPC.gitTreeAt, oid),
restoreTree: (oid) => ipcRenderer.invoke(IPC.gitRestoreTree, oid),
changedFiles: (oid) => ipcRenderer.invoke(IPC.gitChangedFiles, oid)
```

---

### `src/renderer/src/Timeline.tsx` — NEW (component, request-response read)

**Analogs:** `TimelineScrubber.tsx` (list/load/cache/empty-loading-error pattern, being retired) + `SidebarSection.tsx` body (host) + `FileTree` list-in-section placement.

**Component signature convention (analog `SidebarSectionProps` L5-16, explicit `JSX.Element`):**
```typescript
export function Timeline({ graph, previewOid, onStep, onJumpToPresent, onSelect }: {
  graph: GitGraph
  previewOid: string | null
  onStep: (dir: 'back' | 'forward') => void
  onJumpToPresent: () => void
  onSelect: (oid: string) => void
}): JSX.Element { ... }
```

**Lazy per-oid cache for `changedFiles` (analog `TimelineScrubber` L35, the `useMemo(() => new Map(), [dep])` cache):**
```typescript
const cache = useMemo(() => new Map<string, string>(), [/* vault/graph identity */]) // contenido por oid
// per visible entry: if (cache.has(oid)) use it; else await window.geode.git.changedFiles(oid) → cache.set
```

**Load/empty/loading/error states (analog `TimelineScrubber` L96-102):**
```typescript
{error ? <p className="plugin-empty">...</p>
 : !versions ? <p className="plugin-empty">Cargando línea de tiempo…</p>
 : versions.length === 0 ? <div className="tree-empty">Todavía no hay versiones ...</div>
 : ( /* entry list */ )}
```
Empty uses `.tree-empty` (History icon) per UI-SPEC; loading/error use `.plugin-empty` — both pre-existing classes.

**Data source:** `graph.commits` is already newest-first (git.ts L355 `sort((a,b) => b.timestamp - a.timestamp)`). Index math: idx 0 = present; back = older (idx+1); forward = newer (idx-1). Markers: `.chip.current` (accent) on `commits[0]`; `.chip.head-chip` (teal) on `previewOid` (both CSS classes exist).

**Icons (Lucide, per CLAUDE.md — never emojis):** `History`, `Clock`, `ChevronLeft`, `ChevronRight`, `ChevronsRight`. Import as named (`import { History } from 'lucide-react'`), size via `size={14}` prop (analog `TimelineScrubber` L3, L89).

---

### `src/renderer/src/TimeTravelBanner.tsx` — NEW (component, event-driven)

**Analog:** the `titlebar` header actions row (App.tsx L808-887) for the button-row layout + `.toast` (L2633) for the surface treatment. Full-width banner between `<header className="titlebar">` and `<div className="body">` (App.tsx L887-889).

**Button pattern (analog App.tsx L846-853, `.tb-btn` + Lucide):**
```typescript
<button className="tb-btn icon cta" title="Crear versión (Ctrl+S)" onClick={...}>
  <Save size={15} />
</button>
```
Banner CTAs: `Volver al presente` (secondary, `ChevronsRight`) + `Volver aquí` (primary teal, `CornerUpLeft`). Props: `{ label, relativeDate, onReturnToPresent, onBringBack }`. Icons `Eye`, `ChevronsRight`, `CornerUpLeft`. All Spanish strings per Copywriting Contract.

---

### `src/renderer/src/time/labels.ts` — NEW (utility, pure transform)

**Analog:** `TimelineScrubber` pure helpers `noteName` (L13-15) and `fmtDate` (L17-19) — same module-top pure-function idiom, Spanish. Extract `entryLabel(c, tags, now)`, `relativeDate(ts, now)`, `changedSummary(names)`. Import types `import type { GitCommitNode, GitTagRef } from '@shared/ipc'`. Named exports (project convention: functions use named exports). See RESEARCH "Code Examples" for the reference bodies (Spanish singular/plural boundaries).

---

### `src/renderer/src/App.tsx` — previewOid orchestration (provider/store, event-driven)

**Analog to COPY — `restoreVersion` (L300-309), the restore-without-moving-HEAD pattern to generalize to multi-file `bringBack`:**
```typescript
const restoreVersion = useCallback(async (text: string) => {
  const path = openPathRef.current
  if (!path) return
  await window.geode.vault.writeNote(path, text)   // ← bringBack calls git.restoreTree(oid) instead
  bumpPane(activePaneIdRef.current)
  setStatus('saved'); setSavedAt(new Date())
  setTimelineOpen(false)
  await refreshGraph()
}, [bumpPane, refreshGraph])
```

**Analog to COPY — `syncPanesToTree` (L433-437), reconcile tabs after the working tree changes (used by `bringBack`):**
```typescript
const syncPanesToTree = useCallback((t: TreeNode[]) => {
  const existing = new Set(flattenPaths(t))
  setPanes((prev) => keepOnly(prev, existing))   // cierra tabs de notas borradas
  bumpAll()
}, [bumpAll])
```

**Analog to COPY — `flushAll` (L154-156), persist in-flight edits BEFORE entering preview:**
```typescript
const flushAll = useCallback(async () => {
  await Promise.all([...paneHandles.current.values()].map((h) => h.flush()))
}, [])
```

**Analog to COPY — `refreshTree` (L176-180), make it preview-aware (the tree source switch):**
```typescript
const refreshTree = useCallback(async () => {
  const t = await window.geode.vault.tree()   // ← branch: previewOid ? git.treeAt(previewOid) : vault.tree()
  setTree(t)
  return t
}, [])   // ← add previewOid to deps
```

**Analog to COPY — immutable-layout-snapshot source (L140-143 refs already fresh):**
```typescript
const panesRef = useRef<PaneLayout>(panes);   panesRef.current = panes
const activePaneIdRef = useRef(activePaneId); activePaneIdRef.current = activePaneId
// snapshot = { panes: panesRef.current, activePaneId: activePaneIdRef.current } — reference IS the snapshot (paneTree is immutable)
```

**Analog to COPY — `.toast` confirmation (setToast L127, render L1163):**
```typescript
{toast && <div className="toast">{toast}</div>}
// setToast('Traído al presente como cambios sin guardar.')  — light, non-blocking (SOFT-06)
```

**Analog to AVOID — `goToVersion` (L464-479): uses `git.checkout()` (force + detached HEAD).** `bringBack` must NEVER call this path. Instead: `flushAll()` → `git.changes()` dirty check → `git.commit(safetyMsg)` (no AI) → `git.restoreTree(oid)` → clear `previewOid` → restore layout → `syncPanesToTree(await refreshTree())` → `refreshGraph()` → `setToast(...)`.

**Safety snapshot (analog `mergeBranch` L483-487 — commit dirty before a risky op, no AI):**
```typescript
if ((await window.geode.git.changes()).length > 0) {
  await window.geode.git.commit(`Cambios ${new Date().toLocaleString()}`)  // explicit message ⇒ no AI call
}
```
`git.commit()` is racy-safe (git.ts L133-153 uses `pendingChanges` content-hashing). Passing an explicit message means the AI path (`aiSuggestMessage`) is NOT invoked — satisfies the cost constraint.

**Sidebar placement (analog L892-925):** insert `<SidebarSection id="timeline" title="LÍNEA DE TIEMPO">` between the `NOTAS` section (L893-916) and `<VaultSwitcher>` (L918). NOTAS keeps `flex`; timeline does NOT (caps at `max-height:45vh; overflow:auto`).

**Retire (RESEARCH "Deprecated"):** remove `timelineOpen` state (L100), the History `tb-btn` toggle (L862-871), the `<TimelineScrubber>` render (L1077-1083), and the `import { TimelineScrubber }` (L54).

---

### `src/renderer/src/PaneView.tsx` — thread `previewOid` (component, request-response)

**Analog:** the prop pass-through L29-51. Add `previewOid: string | null` to `PaneViewProps` (L7-25) and forward it to `<EditorPane ... previewOid={props.previewOid} />` (L34-50). Recursive splits already spread `{...props}` (L91), so nested panes inherit it automatically.

---

### `src/renderer/src/EditorPane.tsx` — previewOid load + ghost + flush guard (component, file-I/O + event)

**Analog — the load effect (L102-121), branch the read source and add ghost try/catch:**
```typescript
useEffect(() => {
  let cancelled = false
  void (async () => {
    await flush()
    if (!pane.active) { if (!cancelled) setContent(''); return }
    const text = await window.geode.vault.readNote(pane.active)   // ← previewOid ? git.readNoteAt(previewOid, pane.active) : vault.readNote(...)
    if (cancelled) return
    setContent(text); setEpoch((e) => e + 1)
    propsRef.current.onNoteOpen(pane.id, pane.active, text)
  })()
  return () => { cancelled = true }
}, [pane.active, reloadNonce])   // ← add props.previewOid to deps
```
Wrap the read in try/catch: `readNoteAt` throws when the blob is absent → `setGhost(true)` (new `useState(false)`); the tab stays open (SOFT-03).

**Analog — the `flush` guard (L71-81), early-return during preview (Pitfall 1 backstop):**
```typescript
const flush = async (): Promise<void> => {
  // add at top: if (propsRef.current.previewOid) return   // nunca escribir a disco en preview
  ...
  await window.geode.vault.writeNote(pending.path, pending.content)
  ...
}
```

**Ghost render — analog `.placeholder` (L288 usage, CSS L956):**
```typescript
{pane.active ? (
  <div className="placeholder">Panel vacío. Arrastrá una nota o cerralo.</div>  // existing empty-body pattern
) : ...}
```
When `ghost`, render a `.placeholder`-style body with `FileQuestion` icon, heading `Esta nota no existía todavía`, body `En el momento que estás viendo, «{nombre}» aún no había sido creada.` instead of `<CodeMirrorEditor>`.

**Ghost tab — analog tab render (L215-246):** add `ghost` to the className template (L218: `` `tab${path === pane.active ? ' active' : ''}...` `` → append `.ghost`).

**Pass `readOnly` down:** `<CodeMirrorEditor readOnly={props.previewOid !== null} ... />` (add prop at L278-285).

---

### `src/renderer/src/editor/CodeMirrorEditor.tsx` — readOnly Compartment (component, event-driven)

**Analog — the reconfigure-without-remount idiom already used for `reloadKey` (L149-162):** the view is created once (L108-143), doc swapped by transaction. Apply the same "dispatch an effect on prop change" pattern for `readOnly` via a CM6 `Compartment`.

**Existing view-create extension list (L111-134)** is where the compartment slot goes:
```typescript
const view = new EditorView({
  state: EditorState.create({
    doc: initialDoc,
    extensions: [
      keymap.of([{ key: 'Mod-k', ... }]),
      ...baseExtensions(),
      // ← readOnlyComp.current.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
      ...(extraExtensionsRef.current ?? []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
      })
    ]
  }),
  parent: hostRef.current
})
```
Add `readOnly?: boolean` to `CodeMirrorEditorProps` (L27-40); add a `useRef(new Compartment())`; add an effect mirroring the `reloadKey` effect (L149-162) that dispatches `readOnlyComp.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])` when `readOnly` flips. `Compartment` imports from `@codemirror/state` (already importing `EditorState` at L3); `EditorView` already imported (L4).

---

### `src/renderer/src/index.css` — ghost/banner/tint/tl-entry (config/style)

**Analog tokens (all verified present):** `--head: #2dd4bf` (L13) is the new "past mode" role; `--accent: #b794f6` (L9) stays "present". Reuse:
- `.chip.head-chip` (L1303-1308: `background: var(--head); color: #16161a`) — the `viendo` chip, no new CSS.
- `.chip.current` (L1278-1281: accent border+text) — the `presente` chip, no new CSS.
- `.placeholder` (L956-959: `margin:auto; color:var(--muted)`) — ghost body base.
- `.tab` (L888-903) / `.tab.active` (L905-909) — extend with `.tab.ghost` (italic + muted + dashed border) — NEW rule.
- `.toast` (L2633-2646) — the bring-back confirmation surface, no new CSS.
- `.sidebar-section*` (L346-437) — timeline section container, no new CSS.
- `.epane-body` (L949-954) — gets the NEW teal tint (`color-mix(in srgb, var(--head) 7%, transparent)` veil + inset accent) during preview.

**NEW rules to add:** `.tab.ghost`, `.time-banner` (full-width teal wash, `banner-h` 36px), `.epane-body` preview-tint variant, `.tl-entry` / `.tl-transport` (entry list + transport bar). Use `color-mix(in srgb, var(--head) N%, ...)` per UI-SPEC Color section — no new color tokens.

---

## Shared Patterns

### Racy-git-safe change detection (LANDMINE)
**Source:** `git.ts` `pendingChanges` (L712-724) → `workBlobs` (L763-781, `hashBlob` on real content) + `headBlobs` (L738-757).
**Apply to:** `restoreTree` (delete set + skip-unchanged), the `bringBack` dirty check (`git.changes()`), the safety snapshot (`git.commit()`).
**Rule:** NEVER `statusMatrix` / stat-based detection — loses same-size same-second edits (CLAUDE.md constraint). Reuse `git.changes()`/`git.commit()` unchanged.

### Atomic, crash-safe writes
**Source:** `atomic.ts` `atomicWrite` (L13-33, temp+fsync+rename, mkdir-recursive).
**Apply to:** every `restoreTree` file write. Widen its signature to `string | Uint8Array` first (see file entry above).

### Typed IPC boundary (contract → handler → preload → consume)
**Source:** `ipc.ts` `GitApi` (L204-236) + `IPC` channels (L31-44) → `index.ts` handlers (L248-274, `requireRoot()`) → `preload/index.ts` git block (L39-54) → `window.geode.git.*`.
**Apply to:** all 3 new git methods. The typed `GitApi` interface forces all four layers to agree — `npm run typecheck` is the validation (no test harness exists).

### `IGNORED_TOP` guard (never touch `.git`/`.geode`)
**Source:** `git.ts` L12 (`new Set(['.git','.geode','node_modules','.obsidian'])`), applied in `workBlobs` L768 and `headBlobs` L751.
**Apply to:** `treeAt` filter, `changedFiles` filter, and `restoreTree`'s delete set (base deletes on `workBlobs`, which is already filtered — structurally unreachable `.git`/`.geode`).

### Lucide icons + Spanish strings (project mandate)
**Source:** `TimelineScrubber` (L3 named imports, `size` prop), all UI files.
**Apply to:** `Timeline`, `TimeTravelBanner`, ghost placeholder. Monochrome `currentColor` Lucide only — never emojis; all user-facing text Spanish (CLAUDE.md).

---

## No Analog Found

All 12 files have strong in-repo analogs — this phase composes existing primitives rather than introducing new roles/flows. Two items warrant a note (not "no analog", but partial):

| File | Role | Data Flow | Note |
|------|------|-----------|------|
| `time/labels.ts` | utility | pure transform | No dedicated pure-helper module exists yet; closest idiom is the module-top helpers in `TimelineScrubber` (L13-19). Reference bodies supplied in RESEARCH Code Examples. |
| `index.css` ghost/banner/tint | style | — | New selectors (`.tab.ghost`, `.time-banner`, `.tl-entry`, preview tint) have no exact rule to copy, but all COLOR/SPACING tokens pre-exist (`--head`, `.chip.head-chip`, `.placeholder`, `.tab`, `.toast`). No new scale/token — `color-mix` over existing vars per UI-SPEC. |

---

## Metadata

**Analog search scope:** `src/main/services/git.ts`, `src/main/fs/atomic.ts`, `src/main/index.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/{App,EditorPane,PaneView,TimelineScrubber,SidebarSection}.tsx`, `src/renderer/src/editor/CodeMirrorEditor.tsx`, `src/renderer/src/index.css`.
**Files scanned (read this session):** 12.
**Pattern extraction date:** 2026-07-04
**Verified findings beyond RESEARCH:**
- `atomicWrite` is string-only with hardcoded `'utf8'` (L22) — MUST widen for `restoreTree` (resolves Open Question 1 / A1). `mkdir(recursive)` already present (A1 nested-path half confirmed safe).
- `rm` is NOT currently imported in `git.ts` (L3 imports `mkdir, readdir, readFile, stat` only) — add it for `restoreTree` deletes (RESEARCH L232 incorrectly states it is already imported).
- `treeBlobs` (L645) does NOT filter `IGNORED_TOP` (unlike `headBlobs` L751) — `treeAt` must add the `.md`/`IGNORED_TOP` filter in the wrapper; base `restoreTree` deletes on `workBlobs`, not `treeBlobs`.
