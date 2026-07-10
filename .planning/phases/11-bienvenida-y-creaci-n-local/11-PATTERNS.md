# Phase 11: Bienvenida y creación local - Pattern Map

**Mapped:** 2026-07-08
**Files analyzed:** 7 (5 modified, 2 new)
**Analogs found:** 7 / 7 (all have a strong in-repo analog)

> Every file in this phase copies from an existing Geode primitive — there is **no** greenfield primitive
> to invent except the Windows name sanitizer (which has an explicit **anti-analog**: do NOT reuse
> `sanitizeTagName`). Convention reminders that apply to ALL files: Spanish strings + comments, Lucide icons
> (never emojis), preload stays CommonJS, `import type` for type-only imports, path aliases `@shared`/`@renderer`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/ipc.ts` (MOD) | config / contract | request-response | `vaultCreateWithRepo` channel + `VaultApi.createWithRepo` (ipc.ts:23, 140) | exact |
| `src/main/index.ts` (MOD) | route / handler | request-response | `IPC.vaultOpen` handler (index.ts:327-335) + `vaultCreateWithRepo` (437-454) | exact |
| `src/preload/index.ts` (MOD) | bridge (CommonJS) | request-response | `createWithRepo` surface (preload:29-30) | exact |
| `src/main/services/vault.ts` (MOD) | service | file-I/O + CRUD | `createNote` / `createFolder` collision loop (vault.ts:119-148) + `duplicate` (186-216) | exact |
| `src/main/fs/vaultName.ts` (NEW) | utility | transform (pure) | **ANTI-analog:** `sanitizeTagName` (git.ts:79-87) — DO NOT reuse; different rules | role-match (inverse) |
| `Bienvenida.md` seed constant (NEW) | model / data | file-I/O (seed) | `createNote` seed string `# ${base}\n\n` (vault.ts:130) | role-match |
| `src/renderer/src/App.tsx` (MOD) | component | request-response / UI | welcome block `if (!vault)` (App.tsx:1079-1105) + `adoptVault`/`openNote`/`openVault` | exact |

## Pattern Assignments

### `src/shared/ipc.ts` (config / contract)

**Analog:** `vaultCreateWithRepo` (channel const ipc.ts:23; interface method ipc.ts:140)

**Channel const pattern** (ipc.ts:22-23, add a sibling line inside the `IPC` object):
```typescript
vaultCloneFromGithub: 'geode:vault-clone-from-github',
vaultCreateWithRepo: 'geode:vault-create-with-repo',
// ADD:  vaultCreateLocal: 'geode:vault-create-local',
```

**Interface method pattern** (ipc.ts:136-140 — copy the JSDoc-in-Spanish + typed signature style):
```typescript
/**
 * Crea una bóveda nueva en una carpeta local (elegida por diálogo), crea un repo
 * en GitHub y lo enlaza como remoto. null si el usuario cancela.
 */
createWithRepo(name: string, isPrivate: boolean): Promise<VaultInfo | null>
```
New method differs in nullability — `createLocal` **always returns `VaultInfo`** (never null: empty/illegal
name falls back to "Cuaderno", happy path has no picker to cancel). If the "Elegir otra ubicación" escape is
folded in as an optional param, the picker-cancel case may reintroduce `| null` — resolve in planning (RESEARCH Open Q2).

---

### `src/main/index.ts` (route / handler)

**Analog:** `IPC.vaultOpen` handler (index.ts:327-335) for the `ensureRepo → rememberVault → restartSnapshotTimer`
closure; `IPC.vaultCreateWithRepo` (index.ts:437-454) for the create shape. `rememberVault` is imported at
index.ts:46; `restartSnapshotTimer` defined at index.ts:240; `snapshotIfChanged` at index.ts:178.

**Post-create closure pattern** (index.ts:327-335 — copy verbatim, this is the load-bearing tail):
```typescript
ipcMain.handle(IPC.vaultOpen, async () => {
  const info = await vault.openDialog()
  if (info) {
    await gitService.ensureRepo(info.root)
    await rememberVault(info.root)
    await restartSnapshotTimer() // rebind el timer de snapshots al nuevo vault
  }
  return info
})
```

**New handler (compose from analog + RESEARCH Pattern 1 — note the ORDER is load-bearing):**
```typescript
ipcMain.handle(IPC.vaultCreateLocal, async (_e, name: string): Promise<VaultInfo> => {
  const baseDir = join(app.getPath('documents'), 'Geode')   // app + join ya importados
  const info = await vault.createLocal(name, baseDir)        // mkdir + siembra Bienvenida.md + setRoot
  await gitService.ensureRepo(info.root)                     // git init (rama main), idempotente
  await gitService.commit(info.root, 'Primera versión')      // primer commit RACY-SAFE del seed; NUNCA null
  await rememberVault(info.root)
  await restartSnapshotTimer()
  return info
})
```
**CRITICAL ordering (RESEARCH Pitfall 1):** seed (inside `createLocal`) → `ensureRepo` → `commit`. If `commit`
runs before the note exists, `pendingChanges` is empty and it no-ops to `null` → no first version. Wrap the body
in try/catch and surface the Spanish I/O error from UI-SPEC ("No se pudo crear el cuaderno…") on `EACCES`/`EPERM`.

**Do NOT copy `vaultCreateWithRepo`'s body wholesale** (index.ts:444-452): it does `ensureRepo` + remote repo but
**never commits** — replicating it would leave the seed uncommitted and fail ONB-03 (RESEARCH Anti-Pattern).

---

### `src/preload/index.ts` (bridge, CommonJS — MUST stay `.cjs`)

**Analog:** `createWithRepo` surface (preload:29-30)

**Surface pattern** (preload:29-30 — add a sibling inside the `vault:` object):
```typescript
cloneFromGithub: (cloneUrl) => ipcRenderer.invoke(IPC.vaultCloneFromGithub, cloneUrl),
createWithRepo: (name, isPrivate) =>
  ipcRenderer.invoke(IPC.vaultCreateWithRepo, name, isPrivate),
// ADD:  createLocal: (name) => ipcRenderer.invoke(IPC.vaultCreateLocal, name),
```
Types come free from `GeodeApi` (the `const api: GeodeApi` annotation at preload:9 enforces the new method exists).
Never convert this file to ESM (CLAUDE.md hard constraint).

---

### `src/main/services/vault.ts` (service, file-I/O + CRUD)

**Analog:** `createNote` (vault.ts:119-132) + `createFolder` (135-148) for the collision loop + atomicWrite seed;
`duplicate` (186-216) for the ` (n)` suffix mechanic; `setRoot` (23-29) to fix the vault.

**Imports pattern** (vault.ts:1-5 — already present, reuse; add nothing new beyond what's here):
```typescript
import { dialog } from 'electron'
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type { TreeNode, VaultInfo } from '@shared/ipc'
import { atomicWrite } from '../fs/atomic'
```

**Collision-loop + seed pattern** (adapt `createNote` vault.ts:119-132 — note it uses `.md` suffix `${base} ${n}`;
CONTEXT wants the FOLDER suffix as ` (2)`, ` (3)` per A2):
```typescript
async createNote(relDir = ''): Promise<TreeNode> {
  if (!this.root) throw new Error('No hay vault abierto')
  const base = 'Nueva nota'
  let name = `${base}.md`
  let n = 1
  while (await this.exists(join(relDir, name))) {
    name = `${base} ${n++}.md`
  }
  const rel = relDir ? `${relDir}/${name}` : name
  await atomicWrite(this.resolveInside(rel), `# ${base}\n\n`)   // seed pattern for the note body
  return { name, path: rel, isDir: false }
}
```

**New `createLocal(name, baseDir)` shape (compose from RESEARCH Pattern 3 + `setRoot`):**
```typescript
// a. safe = sanitizeVaultName(name)                         // util NUEVO (below)
// b. resolver colisión con sufijo ANTES de mkdir:
//      let candidate = safe; let n = 2
//      while (existe(join(baseDir, candidate))) candidate = `${safe} (${n++})`
// c. const dir = join(baseDir, candidate); await mkdir(dir, { recursive: true })
// d. await atomicWrite(join(dir, 'Bienvenida.md'), SEED)     // seed constant
// e. return this.setRoot(dir)                                // fija el vault → VaultInfo
```
Collision check must use an ABSOLUTE-path `stat`/`existsSync` (NOT the private `exists()`, which routes through
`resolveInside` and is anchored to the *current* vault root — wrong anchor here; `baseDir` is a fresh location).
`createLocal` does the FS side only; the handler owns `ensureRepo`/`commit`/`rememberVault` (see index.ts above).

**Collision safety = core value (RESEARCH Pitfall 4 / Security):** `mkdir({recursive:true})` silently succeeds on an
existing folder — resolve the suffix BEFORE mkdir so a second "Mi primer cuaderno" never overwrites the first.

---

### `src/main/fs/vaultName.ts` (utility, pure transform — NEW file, name at discretion)

**ANTI-analog:** `sanitizeTagName` (git.ts:79-87). Same *shape* (a pure `string → string` cleaner), **opposite rules** —
`sanitizeTagName` is for git refs (collapses spaces → `-`, strips `~^:?*[`), which is WRONG for a Windows folder
name (folders allow spaces; forbid `< > : " / \ | ? *` and reserved device names). Copy the *structure*, not the regex.

**Structure to mirror** (git.ts:79-87 — a linear chain of `.replace()` then a guard):
```typescript
function sanitizeTagName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, '-')
  name = name.replace(/[~^:?*[\]\\\x00-\x20\x7f]/g, '') // eslint-disable-line no-control-regex
  // …
  return name
}
```

**Canonical implementation (from RESEARCH Code Examples — use textual, Windows rules):**
```typescript
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Limpia un nombre libre para que sea una carpeta válida en Windows. Nunca lanza. */
export function sanitizeVaultName(raw: string): string {
  let name = (raw ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ') // ilegales → espacio
  name = name.replace(/\s+/g, ' ').trim()                        // colapsa espacios
  name = name.replace(/[. ]+$/g, '').trim()                      // sin punto/espacio final
  const base = name.split('.')[0] || name
  if (name === '' || WINDOWS_RESERVED.test(base)) return 'Cuaderno'
  return name
}
```
Reserved check is on the stem (pre-first-dot) because Windows forbids `CON.md` too. Fallback "Cuaderno" covers
empty + all-illegal (ONB-04). Pure + total (never throws) → the one unit-testable function of the phase (no test
framework today; keep it isolated for a future vitest per RESEARCH Wave 0).

---

### `Bienvenida.md` seed constant (model / data — NEW, co-locate near `createLocal`)

**Analog:** `createNote`'s inline seed `# ${base}\n\n` (vault.ts:130) — but this seed is a fixed multi-line
constant, NOT interpolated with the user's name (Security: no markdown injection via name).

**Canonical content (from 11-UI-SPEC.md §Copywriting Contract — use TEXTUAL, do not paraphrase):**
```markdown
# Te damos la bienvenida

Este es tu primer cuaderno. Escribí acá lo que quieras: ideas, notas,
borradores, listas… lo que se te ocurra.

No tenés que preocuparte por guardar: tu cuaderno se guarda solo y
recuerda cada cambio, así que **nunca vas a perder nada** y podés
experimentar sin miedo.

Más adelante vas a poder hacer una **copia de seguridad** para tenerlo a
salvo en otro lugar. Pero eso es para después: por ahora, simplemente
escribí.

¿Querés empezar de cero? Borrá esta nota y hacela tuya.
```
Tone: 2ª persona, cálido, sin jerga; menciona "copia de seguridad", nunca "GitHub". Written via `atomicWrite` (never
raw `fs.writeFile` — RESEARCH Don't Hand-Roll).

---

### `src/renderer/src/App.tsx` (component, request-response / UI)

**Analogs:** welcome block `if (!vault)` (App.tsx:1079-1105 — replace); `adoptVault` (434-450 — reuse as-is);
`openNote` (347-350 — chain after adopt); `openVault` (452-455 — reuse for secondary link).

**Current welcome block to REPLACE** (App.tsx:1079-1105):
```typescript
if (!vault) {
  return (
    <div className="welcome">
      <div className="welcome-drag"><WindowControls /></div>
      <h1>Geode</h1>
      <p className="tagline">Notas versionadas sobre Git — local-first.</p>
      <div className="welcome-actions">
        <button className="primary" onClick={() => void openVault()}>Abrir carpeta como vault</button>
        <button onClick={() => setNewVaultOpen(true)}>Clonar o crear en GitHub</button>
      </div>
      {newVaultOpen && ( <NewVaultDialog … /> )}
    </div>
  )
}
```
REMOVE: the "Clonar o crear en GitHub" button + the `<NewVaultDialog>` render (both move to Fase 12). KEEP:
`.welcome`, `.welcome-drag`, `<WindowControls/>`, `<h1>Geode</h1>`. New tagline: "Escribí sin miedo a perder nada."
Add: prefilled `<input class="text-input">` (320px, autoFocus, text selected) + `.primary` CTA with `NotebookPen`
size 16 + secondary `.link-btn`s ("Elegir otra ubicación" `FolderCog` 14, "Abrir una carpeta existente" `FolderOpen`
14). Icons `NotebookPen`/`FolderCog` **confirmed present** in lucide-react 1.23.0 (resolves A1).

**adoptVault — reuse UNCHANGED** (App.tsx:434-450), but note it resets to an EMPTY pane (does NOT open a note):
```typescript
const adoptVault = useCallback(async (info: VaultInfo) => {
  setVault(info)
  const leaf = makeLeaf()
  paneContentRef.current.clear()
  setPanes(leaf)
  setActivePaneId(leaf.id)
  setReloadNonces({})
  setContent('')
  setStatus('none')
  setSelected(null)
  host.emit('vault:switch', { root: info.root, name: info.name })
  await refreshTree(); await refreshGraph(); await refreshGithub(); await refreshVaults()
}, [refreshTree, refreshGraph, refreshGithub, refreshVaults, host])
```

**New create handler (compose — CHAIN openNote after adopt, RESEARCH Pitfall 2):**
```typescript
// idle → creating → success/error state (see UI-SPEC Estados table)
const info = await window.geode.vault.createLocal(name)   // never null
await adoptVault(info)                                     // resets to empty pane
await openNote('Bienvenida.md')                            // ← REQUIRED: adopt does NOT open the seed
```
Only the CREATE flow forces `openNote`; the "Abrir una carpeta existente" flow (`openVault`, 452-455) must NOT.
`openNote` (347-350) flushes then `openInLeaf`. Wrap create in try/catch → show `.modal-error` (Spanish, `#ff6b6b`)
under the CTA, re-enable CTA on failure (UI-SPEC Error state). Use `RefreshCw` + `.spin` for the Creating state
(pattern already used in `NewVaultDialog`).

**openVault — reuse UNCHANGED for the secondary link** (App.tsx:452-455):
```typescript
const openVault = useCallback(async () => {
  const info = await window.geode.vault.open()
  if (info) await adoptVault(info)
}, [adoptVault])
```

---

## Shared Patterns

### IPC 4-point edit (typed end-to-end)
**Source:** `vaultCreateWithRepo` across ipc.ts:23+140, index.ts:437, preload:29.
**Apply to:** the new `geode:vault-create-local` channel. Edit exactly these 4 files IN ORDER:
`shared/ipc.ts` (channel const + `VaultApi` method) → `main/index.ts` (`ipcMain.handle`) → `preload/index.ts`
(CommonJS surface) → renderer (`window.geode.vault.createLocal`). Main validates/sanitizes the untrusted `name`.

### Racy-git-safe first commit
**Source:** `GitService.commit` (git.ts:133-153), `ensureRepo` (git.ts:113-121).
**Apply to:** the seed commit. `commit` hashes real content (`hashBlob`) vs HEAD blobs — never revert to
statusMatrix (CLAUDE.md landmine). Returns oid, or `null` if clean → seed must exist on disk BEFORE the call.

### Atomic seed write
**Source:** `atomicWrite` (atomic.ts:16). **Apply to:** writing `Bienvenida.md`. temp + fsync + rename; accepts
`string`; creates parent dirs recursively. Never `fs.writeFile` directly.

### Suffix collision (never overwrite)
**Source:** `createNote` (vault.ts:125), `duplicate` (vault.ts:200-203). **Apply to:** the vault folder path.
`while (exists) candidate = base + ' (' + n++ + ')'`. This is a HARD acceptance criterion, not a nice-to-have
(core value "nada se pierde").

### `app.getPath` in main
**Source:** `app.getPath('userData')` (settings.ts:52, plugins.ts:17). **Apply to:** resolving Documents base in
the handler — `join(app.getPath('documents'), 'Geode')`. NEVER attempt in the renderer (sandboxed).

## No Analog Found

None. Every file has a strong in-repo analog. The only "new" logic — `sanitizeVaultName` — has an explicit
anti-analog (`sanitizeTagName`) whose structure is copied but whose rules are deliberately inverted.

## Metadata

**Analog search scope:** `src/main/services/`, `src/main/fs/`, `src/main/index.ts`, `src/shared/ipc.ts`,
`src/preload/`, `src/renderer/src/App.tsx`, `node_modules/lucide-react/dist/lucide-react.d.ts`
**Files scanned:** 8 source files + lucide type defs
**Pattern extraction date:** 2026-07-08
