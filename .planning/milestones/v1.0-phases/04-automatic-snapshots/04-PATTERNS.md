# Phase 4: Automatic Snapshots - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 6 modified (no new files)
**Analogs found:** 6 / 6 (all in-repo; brownfield extension)

> Every file this phase touches is a **modification of an existing file**, and every needed pattern already exists in the same or a sibling file. The `snapshots` config is a verbatim mirror of the `ai`/`github` sub-object pattern; the change-detection/commit engine (`git.ts`) is **reused unchanged**. The only genuinely new shape is a main-process lifecycle timer + `before-quit` hook, whose closest analogs are the existing `emitMaxState` (`webContents.send`) and `app.on('window-all-closed')` lifecycle wiring.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/main/services/settings.ts` | config / persistence service | file-I/O (CRUD on JSON) | same file — `ai`/`github` sub-object + `setAiKey`/`setPluginEnabled` | exact |
| `src/main/index.ts` — snapshot config IPC handlers | IPC handler | request-response | same file — `aiGetConfig` / `aiSetEnabled` handlers (lines 288–312) | exact |
| `src/main/index.ts` — `snapshotIfChanged()` helper | service orchestration | transform (dirty→commit) | same file — `gitCommit` handler (255–257) + `aiConfig()` helper (75–82) + `autoCommitMessage()` (91–93) | role-match |
| `src/main/index.ts` — snapshot timer (`setInterval` / `restartSnapshotTimer`) | lifecycle timer | event-driven (interval) | same file — `emitMaxState` + `mainWindow.on('maximize', …)` (121–124); `restoreLastVault()` (452–462) for vault-bound wiring | partial (no existing timer) |
| `src/main/index.ts` — `before-quit` quit-snapshot | lifecycle hook | event-driven | same file — `app.on('window-all-closed')` (483–485) | role-match |
| `src/main/index.ts` — safety snapshot in `vaultSwitch` | IPC handler | request-response | same file — existing `vaultSwitch` handler (193–202) | exact (in-place edit) |
| `src/shared/ipc.ts` — channels + `SnapshotsConfig` + `SnapshotsApi` | IPC contract | request-response | same file — `aiGetConfig`/`aiSetEnabled` channels (55–59), `AiConfig` (298–303), `AiApi` (325–342) | exact |
| `src/preload/index.ts` — `snapshots` bridge | preload bridge (CommonJS) | request-response | same file — `ai` bridge (67–79) | exact |
| `src/renderer/src/SettingsModal.tsx` — "Guardado automático" section | React component (settings section) | request-response (UI→IPC) | same file — AI `section` + nav button (19, 153–167, 243–251) | exact |
| `src/renderer/src/App.tsx` — align `bringBack` message | React callback | transform | same file — `bringBack` (502–513) | exact (self) |

**Reused-verbatim (NOT modified):** `src/main/services/git.ts` — `commit(dir, message)` (133–153) and `changes(dir)`. These are the change-detection/commit engine consumed by `snapshotIfChanged`. Do not edit.

## Pattern Assignments

### `src/main/services/settings.ts` (config service, file-I/O)

**Analog:** same file — `ai`/`github` sub-objects and their partial-update writers.

**Interface extension pattern** (lines 15–39 — the `ai`/`github`/`plugins` sub-objects):
```typescript
export interface Settings {
  lastVault?: string
  knownVaults?: string[]
  ai?: {
    enabled?: boolean
    model?: string
    key?: string
    keyEncrypted?: boolean
  }
  github?: { /* … */ }
  plugins?: {
    enabled?: Record<string, boolean>
  }
}
```
Add a `snapshots?: { cadenceMinutes?: number | null }` sub-object in the same style (optional, backward-compatible: absent = default).

**Partial-update writer pattern** (lines 88–93, `setAiKey`; 145–150, `setPluginEnabled`) — spread the existing sub-object so the rest of settings is not clobbered:
```typescript
export async function setAiKey(plain: string): Promise<void> {
  const settings = await loadSettings()
  const enc = encryptSecret(plain)
  settings.ai = { ...settings.ai, key: enc.value, keyEncrypted: enc.encrypted }
  await saveSettings(settings)
}
```
New `setSnapshotCadence(cadenceMinutes: number | null)` mirrors this exactly:
`settings.snapshots = { ...settings.snapshots, cadenceMinutes }` then `await saveSettings(settings)`.

**Load/persist primitives to reuse (do not reinvent):** `loadSettings()` (45–51, returns `{}` on missing file) and `saveSettings()` (53–55, goes through `atomicWrite`). No encryption needed — cadence is not a secret (V6: store plain like the `enabled` flag).

---

### `src/main/index.ts` — snapshot config IPC handlers (IPC handler, request-response)

**Analog:** `aiGetConfig` / `aiSetEnabled` handlers (lines 288–312) + the `aiConfig()` derive helper (75–82).

**Config-derive helper pattern** (lines 75–82 — default-fills from stored settings):
```typescript
async function aiConfig(): Promise<AiConfig> {
  const { ai } = await loadSettings()
  return {
    enabled: ai?.enabled ?? false,
    model: ai?.model ?? null,
    hasKey: !!ai?.key
  }
}
```
New helper returns `{ cadenceMinutes: snapshots?.cadenceMinutes ?? 10 }` (default 10, ON).

**Get + set handler pattern** (lines 288–293, 307–312 — set mutates settings then returns fresh config):
```typescript
ipcMain.handle(IPC.aiGetConfig, () => aiConfig())

ipcMain.handle(IPC.aiSetEnabled, async (_e, enabled: boolean) => {
  const settings = await loadSettings()
  settings.ai = { ...settings.ai, enabled }
  await saveSettings(settings)
  return aiConfig()
})
```
New `snapshotsSet` handler additionally calls `restartSnapshotTimer()` after persisting, then returns the config. **Input validation (V5):** clamp/reject `cadenceMinutes` to `null | 5 | 10 | 15 | 30` before persisting — an out-of-range value must not reach `setInterval` (a `0` would tight-loop). No analog for validation exists in the AI handlers; add it explicitly.

---

### `src/main/index.ts` — `snapshotIfChanged(reason)` helper (service orchestration, transform)

**Analog:** `gitCommit` handler (255–257) + `autoCommitMessage()` (91–93) + the "no vault" guard style of `gitPendingPush` (424–425).

**Commit-with-explicit-message pattern** (line 255–257 — explicit message ⇒ AI is never touched):
```typescript
ipcMain.handle(IPC.gitCommit, (_e, message?: string) =>
  gitService.commit(requireRoot(), message ?? autoCommitMessage())
)
```

**Marker-message helper pattern** (91–93, `autoCommitMessage` — keep the NEW one distinct):
```typescript
function autoCommitMessage(): string {
  return `Snapshot ${new Date().toISOString()}`
}
```
> `autoCommitMessage()` is the manual-commit fallback for `gitCommit`. Do NOT reuse it. Add a separate `snapshotMessage()` returning `` `Instantánea automática — ${new Date().toLocaleString()}` `` (matches the `bringBack` safety-snapshot format, App.tsx:510).

**"No active vault" soft guard** (from `gitPendingPush`, 424–425, and `githubSetRemote`, 401 — `vault.getInfo()` truthy check instead of `requireRoot()` which throws):
```typescript
const info = vault.getInfo()
if (!info) return 0 // sin vault: no-op, no throw
```
`snapshotIfChanged` must **never throw** (it runs on the quit path). Use `vault.getInfo()` (not `requireRoot()`), wrap `gitService.commit()` in try/catch, log with `console.warn('[snapshot] …')` (matches the `[icon]`/bracket-prefix logging convention, lines 23/25), and return `null` on failure. `commit()` already no-ops (returns `null`) when nothing changed (git.ts:135) — do NOT pre-check with `changes()` on this path.

---

### `src/main/index.ts` — snapshot timer (lifecycle timer, event-driven)

**Analog (structural):** `emitMaxState` + `mainWindow.on('maximize', emitMaxState)` (121–124) for the "module-scoped handle + event wiring" shape; `restoreLastVault()` (452–462) for the vault-bound restart idiom. No existing `setInterval` — this is the one net-new primitive.

**Event-wiring precedent** (121–124):
```typescript
const emitMaxState = (): void =>
  mainWindow.webContents.send(IPC.windowMaximizeChanged, mainWindow.isMaximized())
mainWindow.on('maximize', emitMaxState)
mainWindow.on('unmaximize', emitMaxState)
```

**Module-scoped mutable singleton precedent** (line 63 — `pendingDeviceCode` is a `let` at module scope):
```typescript
let pendingDeviceCode: DeviceCode | null = null
```
Add `let snapshotTimer: NodeJS.Timeout | null = null` the same way. `restartSnapshotTimer()` clears the old interval, reads cadence via `loadSettings()`, and installs a new `setInterval(() => void snapshotIfChanged('cadencia'), minutes * 60_000)`; returns early (no timer) when cadence is `null`.

**Call-site wiring** — `restartSnapshotTimer()` must be invoked wherever the active vault or cadence changes: inside `vaultOpen` (169–176), `vaultSwitch` (193–202), `restoreLastVault` (452–462), and the new `snapshotsSet` handler. This mirrors how `rememberVault()` / `gitService.ensureRepo()` are already called at each of those same three vault-entry points.

---

### `src/main/index.ts` — `before-quit` quit-snapshot (lifecycle hook, event-driven)

**Analog:** `app.on('window-all-closed')` (483–485) — the existing top-level `app` lifecycle listener.

**Existing lifecycle-listener pattern** (483–485):
```typescript
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```
Add a sibling `app.on('before-quit', …)` that: guards with a module-level `let quitting = false`, `event.preventDefault()` on the first pass, `await snapshotIfChanged('cierre')`, then `app.quit()` (the guard lets the re-fired event through). See RESEARCH.md Pattern 2 / Pitfall 3 (infinite-loop guard is mandatory) and Pitfall 2 (on-quit path may miss the renderer's last <600 ms of debounced edits — acceptable for MVP).

---

### `src/main/index.ts` — safety snapshot in `vaultSwitch` (IPC handler, in-place edit)

**Analog:** the existing `vaultSwitch` handler itself (193–202).

**Current handler** (193–202) — insert `await snapshotIfChanged('cambio-de-boveda')` as the FIRST line inside `try`, before `vault.setRoot(root)`:
```typescript
ipcMain.handle(IPC.vaultSwitch, async (_e, root: string): Promise<VaultInfo | null> => {
  try {
    const info = await vault.setRoot(root)       // ← snapshot BEFORE this line
    await gitService.ensureRepo(info.root)
    await rememberVault(info.root)
    return info
  } catch {
    return null
  }
})
```
Order is load-bearing: `snapshotIfChanged` reads `vault.getInfo()` internally, so it must run **before** `setRoot` reassigns the root (otherwise it snapshots the wrong vault). Also add `await restartSnapshotTimer()` after `rememberVault` (rebinds the timer to the new vault).

---

### `src/shared/ipc.ts` — channels + `SnapshotsConfig` + `SnapshotsApi` (IPC contract)

**Analog:** AI channels (55–59), `AiConfig` (298–303), `AiApi` (325–342), and the `ai: AiApi` line in `GeodeApi` (397).

**Channel-map entry pattern** (lines 55–59 — `geode:*` kebab-case string consts in the `IPC` object):
```typescript
aiGetConfig: 'geode:ai-get-config',
aiSetEnabled: 'geode:ai-set-enabled',
```
Add `snapshotsGet: 'geode:snapshots-get'` and `snapshotsSet: 'geode:snapshots-set'`.

**Config-type pattern** (298–303):
```typescript
export interface AiConfig {
  enabled: boolean
  model: string | null
  hasKey: boolean
}
```
Add `export interface SnapshotsConfig { cadenceMinutes: number | null }`.

**Api-interface pattern** (325–342, condensed):
```typescript
export interface AiApi {
  getConfig(): Promise<AiConfig>
  setEnabled(enabled: boolean): Promise<AiConfig>
  // …
}
```
Add `SnapshotsApi { get(): Promise<SnapshotsConfig>; set(cadenceMinutes: number | null): Promise<SnapshotsConfig> }` and a `snapshots: SnapshotsApi` line in `GeodeApi` (alongside line 397 `ai: AiApi`).

---

### `src/preload/index.ts` — `snapshots` bridge (preload, CommonJS)

**Analog:** the `ai` bridge object (67–79).

**Bridge pattern** (67–72 — each method maps 1:1 to an `ipcRenderer.invoke(IPC.channel, …args)`):
```typescript
ai: {
  getConfig: () => ipcRenderer.invoke(IPC.aiGetConfig),
  setEnabled: (enabled) => ipcRenderer.invoke(IPC.aiSetEnabled, enabled),
  // …
},
```
Add a `snapshots` block with `get` and `set`. **Constraint:** this file stays CommonJS / builds to `.cjs` — do NOT convert to ESM (CLAUDE.md preload rule). The whole surface is one `const api: GeodeApi = { … }` (line 9) closed by `contextBridge.exposeInMainWorld('geode', api)` (line 88) — add the block inside that object.

---

### `src/renderer/src/SettingsModal.tsx` — "Guardado automático" section (React component)

**Analog:** the AI section — its `Section` union (19), nav button (153–155), section wrapper (166–167), and the `<select>`-equivalent control + local-state-mirrors-IPC pattern.

**Section-type + nav-button pattern** (19; 153–162):
```typescript
type Section = 'ai' | 'github' | 'plugins'   // ← add 'snapshots'
// …
<button className={section === 'ai' ? 'active' : ''} onClick={() => setSection('ai')}>
  <Sparkles size={15} /> Mensajes por IA
</button>
```
Add a nav `<button>` for `'snapshots'` with a Lucide icon (e.g. `Clock` or `History` — monochrome, `size={15}`, no emoji) and Spanish label "Guardado automático".

**Load-config-on-open pattern** (76–86 — `useEffect` reads config via IPC into local state):
```typescript
useEffect(() => {
  void (async () => {
    const c = await window.geode.ai.getConfig()
    apply(c)
    // …
  })()
}, [apply, loadModels, refreshPlugins])
```
Add `window.geode.snapshots.get()` here, store `cadenceMinutes` in a new `useState`.

**Control-writes-through-IPC pattern** (134–136 — `toggleEnabled` sends the change and re-applies the returned config):
```typescript
const toggleEnabled = async (enabled: boolean): Promise<void> => {
  apply(await window.geode.ai.setEnabled(enabled))
}
```
The cadence `<select>` `onChange` calls `await window.geode.snapshots.set(value)` and stores the returned `cadenceMinutes`.

**Section-shell markup** (166–173 — reuse `.settings-section`, `<h2>` with icon, `.modal-sub`, `.field-label`):
```tsx
<section className="settings-section">
  <h2><Sparkles size={18} /> Mensajes por IA</h2>
  <p className="modal-sub">…</p>
  <label className="field-label">API key de OpenRouter</label>
```
Cadence options (from CONTEXT/RESEARCH): `Manual (sólo al guardar)` = `null`, `Cada 5/10/15/30 minutos`. Reuse existing `.field-label` / `.settings-section` CSS — no new classes needed.

---

### `src/renderer/src/App.tsx` — align `bringBack` message (self-analog)

**Analog:** `bringBack` itself (502–513) — already the canonical safety-snapshot precedent.

**Existing safety-snapshot** (507–511):
```typescript
const dirty = await window.geode.git.changes()
if (dirty.length > 0) {
  // Mensaje explícito ⇒ no invoca la IA (coste sólo en guardados manuales).
  await window.geode.git.commit('Instantánea de seguridad — ' + new Date().toLocaleString())
}
```
This already matches the marker convention. Per CONTEXT the two markers are intentionally distinct — auto-snapshots use `"Instantánea automática — {fecha}"`, safety snapshots (time-travel here) keep `"Instantánea de seguridad — {fecha}"`. **Action is minimal/optional:** leave `bringBack` as-is (it flushes + measures the tree in the renderer and works); only align the string format if planning decides to centralize. Do NOT route `bringBack` through the new main `snapshotIfChanged` for MVP (RESEARCH Assumption A1).

## Shared Patterns

### Change detection + commit (the reused engine — NEVER reinvent)
**Source:** `src/main/services/git.ts` — `commit(dir, message)` (133–153), `changes(dir)`
**Apply to:** `snapshotIfChanged` (and, unchanged, `bringBack`)
```typescript
async commit(dir: string, message: string): Promise<string | null> {
  const changes = await this.pendingChanges(dir)
  if (changes.length === 0) return null   // ← empty commit structurally impossible (SNAP-02)
  // … content-hash vs HEAD blobs (racy-safe); explicit message ⇒ never AI (SNAP-04)
}
```
Racy-git constraint (CLAUDE.md): change detection is ALWAYS content-hash vs HEAD blobs — never `statusMatrix`, never stat/mtime. `commit()` already encapsulates this; call it directly.

### Config persistence (JSON, partial update, atomic)
**Source:** `src/main/services/settings.ts` — `loadSettings`/`saveSettings` (45–55), `setAiKey` (88–93)
**Apply to:** the new `snapshots` sub-object + `setSnapshotCadence`
```typescript
const settings = await loadSettings()
settings.ai = { ...settings.ai, /* patched fields */ }
await saveSettings(settings)   // atomicWrite under the hood
```

### IPC round-trip (channel → handler → preload → renderer)
**Source:** the AI surface across all four files — `IPC.aiGetConfig/aiSetEnabled` (ipc.ts 55–59) → handler (index.ts 288–312) → preload (preload 68–72) → `window.geode.ai.*` (SettingsModal 78/135)
**Apply to:** every new `snapshots-get`/`snapshots-set` call. Keep the four layers in lockstep; the contract in `@shared/ipc.ts` is the single source of truth.

### Spanish + Lucide UI conventions
**Source:** SettingsModal (imports line 3; `<Sparkles size={15} />` at 154)
**Apply to:** the new Settings section — Spanish user strings, Lucide monochrome icons sized via `size`, no emojis (CLAUDE.md). Existing CSS classes (`.settings-section`, `.field-label`, `.settings-nav`, `.modal-sub`) — reuse, don't add.

## No Analog Found

| Concern | Role | Data Flow | Reason / Guidance |
|---------|------|-----------|-------------------|
| `setInterval` cadence timer + `restartSnapshotTimer()` | lifecycle timer | event-driven (interval) | No existing timer in the codebase. Closest structural precedents: `emitMaxState` event wiring (index.ts:121–124) and the module-scoped `let pendingDeviceCode` singleton (index.ts:63). Follow RESEARCH Pattern 3. |
| `app.on('before-quit', …)` async snapshot + re-entrancy guard | lifecycle hook | event-driven | No `before-quit` handler exists today (only `window-all-closed`, index.ts:483). Model the listener shape on `window-all-closed`; the async-commit + `quitting` guard mechanics come from RESEARCH Pattern 2 / Pitfall 3. |

## Metadata

**Analog search scope:** `src/main/services/`, `src/main/`, `src/shared/`, `src/preload/`, `src/renderer/src/`
**Files read this session:** `src/main/services/settings.ts`, `src/main/index.ts`, `src/main/services/git.ts` (90–170), `src/shared/ipc.ts` (40–120, 290–400), `src/preload/index.ts` (55–89), `src/renderer/src/SettingsModal.tsx`, `src/renderer/src/App.tsx` (bringBack region)
**Pattern extraction date:** 2026-07-04
