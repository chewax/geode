# Architecture Research

**Domain:** Guided onboarding + first-run tour inside an existing Electron (main ↔ preload ↔ sandboxed React) app — Geode
**Researched:** 2026-07-08
**Confidence:** HIGH (grounded in the actual codebase; no external framework unknowns)

## Summary Verdict

All four new features slot into the existing three-tier boundary **without any new architectural concepts** — they are new instances of patterns already in the repo:

- **Local notebook creation** = a new `VaultService` method + one `geode:` channel, mirroring `createWithRepo` minus the GitHub/token/dialog steps. The local git repo is still created (`ensureRepo`) — "without a repo" means **without a GitHub remote**, not without local git.
- **Onboarding state** = a new top-level `onboarding` key in the existing `Settings` JSON + a `get/set` channel pair, exactly like the `advanced` and `snapshots` blocks.
- **Backup assistant** = a renderer multi-step modal (like `NewVaultDialog`) that orchestrates the *already-existing* device-flow + `createRepo` IPC, plus **one new channel** to attach a repo to the *current* local vault (existing `createWithRepo` only makes a *new* folder).
- **TourOverlay** = a renderer-only portal component driven by `data-tour` anchors + `getBoundingClientRect`. Zero main-process involvement.

The only cross-feature coupling: **the tour's cloud-backup step points at a "Enable backup" button that must exist as a `data-tour` anchor.** That button is introduced by the backup-assistant feature. Therefore backup-assistant (+ its titlebar button) must ship **before or with** the tour → this sets the phase boundary.

## Existing Architecture (confirmed by reading source)

```
┌──────────────────────────────────────────────────────────────────┐
│  RENDERER (sandboxed React) — src/renderer/src/                    │
│   App.tsx (vault/tree/panes/github/advanced state)                 │
│   NewVaultDialog · SettingsModal · VaultSwitcher · Timeline        │
│   PluginHost (event bus, notify(), command registry)               │
│         │ window.geode.*  (only surface to Node)                   │
├─────────┼──────────────────────────────────────────────────────────┤
│  PRELOAD (CommonJS .cjs) — src/preload/index.ts                     │
│   contextBridge.exposeInMainWorld('geode', {vault,git,github,...})  │
│         │ ipcRenderer.invoke(IPC.*)                                 │
├─────────┼──────────────────────────────────────────────────────────┤
│  SHARED CONTRACT — src/shared/ipc.ts (IPC channel map + interfaces) │
├─────────┼──────────────────────────────────────────────────────────┤
│  MAIN (Node) — src/main/index.ts  ipcMain.handle(IPC.*, …)          │
│   VaultService · GitService · GithubService · SettingsService      │
│   settings.ts (loadSettings/saveSettings JSON in userData)         │
└────────────────────────────────────────────────────────────────────┘
```

**Locked conventions the new work must honor** (from CLAUDE.md + observed code):
- Every main↔renderer call is a typed channel in `src/shared/ipc.ts`, name prefixed `geode:`, registered in `IPC` map, exposed in preload, added to the matching `*Api` interface.
- Preload stays CommonJS; renderer never touches fs/net directly.
- UI strings and comments in Spanish; icons Lucide (`currentColor`), never emojis.
- Secrets never cross to the renderer; `settings.json` in `app.getPath('userData')`.
- Non-destructive-editing invariant: local git repo is always ensured; onboarding features must never delete user content.

## (a) Local notebook creation — "create, no remote repo, default folder"

### Decision: new `VaultService.createLocal(name)` + new channel `geode:vault-create-local`

**Do NOT extend `createWithRepo`.** `createWithRepo` (main/index.ts:437) hard-requires a GitHub token, opens a native folder dialog (`vault.pickFolder`), calls `createRepo`, and sets a remote. The new flow must do *none* of those. Overloading it with flags would fork its body and violate the milestone's "no native folder dialog, no account required" goal. A sibling method is cleaner and matches how `cloneFromGithub`/`createWithRepo` already coexist.

**New `VaultService` methods (main/services/vault.ts):**

```ts
/** Carpeta base de cuadernos locales: ~/Documents/Geode. La crea si falta. */
async defaultNotebooksDir(): Promise<string> {
  const base = join(app.getPath('documents'), 'Geode')   // Electron app path
  await mkdir(base, { recursive: true })
  return base
}

/** Crea un cuaderno local en la carpeta base, resolviendo colisiones de nombre. */
async createLocal(rawName: string): Promise<VaultInfo> {
  const base = await this.defaultNotebooksDir()
  const clean = sanitizeFolderName(rawName) || 'Cuaderno'
  let name = clean, n = 2
  while (!(await this.isEmptyDir(join(base, name)))) name = `${clean} ${n++}`  // collision: "X 2", "X 3"
  const dir = join(base, name)
  await mkdir(dir, { recursive: true })
  return this.setRoot(dir)        // fija root; ensureRepo lo hace el handler (paridad con switch)
}
```

- **Default dir in MAIN, not renderer:** use Electron `app.getPath('documents')` → `Documents/Geode/<name>`. Renderer never sees or constructs absolute paths (path-traversal invariant preserved; `resolveInside` still guards note ops).
- **Collision handling:** reuse the existing `isEmptyDir()` helper + the " N" suffix idiom already used in `createNote`/`createFolder`/`duplicate`. An existing **non-empty** folder bumps the name; an existing **empty** folder is adopted.
- **Name sanitization:** add a small `sanitizeFolderName` (strip `\ / : * ? " < > |`, trim) — analogous to the tag sanitizer mentioned in CLAUDE.md.

**Handler (main/index.ts), mirrors createWithRepo minus token/remote:**
```ts
ipcMain.handle(IPC.vaultCreateLocal, async (_e, name: string): Promise<VaultInfo> => {
  const info = await vault.createLocal(name)
  await gitService.ensureRepo(info.root)   // repo LOCAL (main), sin remoto — versionado invisible
  await rememberVault(info.root)
  await restartSnapshotTimer()             // igual que vaultSwitch, rebind del timer
  return info
})
```

**Contract additions:**
- `IPC` map: `vaultCreateLocal: 'geode:vault-create-local'`
- `VaultApi`: `createLocal(name: string): Promise<VaultInfo>` (returns non-null — no dialog to cancel)
- preload `vault.createLocal: (name) => ipcRenderer.invoke(IPC.vaultCreateLocal, name)`

**Note on first commit:** `ensureRepo` only `git init`s (no initial commit); the first commit lands when the user saves or a snapshot fires — this is already how `createWithRepo` behaves, so the local notebook is consistent (empty repo, no HEAD until first save).

## (b) Persisting onboarding state

### Decision: new top-level `onboarding` block in `Settings` + `geode:onboarding-get/-set`

Follow the **exact shape** of the existing `advanced`/`snapshots` blocks (settings.ts) — a small optional object with `?? default` resolution in the getter, so it never pollutes existing config shapes and old settings files stay valid.

**settings.ts — extend the `Settings` interface:**
```ts
onboarding?: {
  /** El usuario ya pasó el primer arranque (creó su primer cuaderno). */
  completedFirstRun?: boolean
  /** Terminó (o saltó) el tour guiado. Ausente/false = aún no. */
  tourCompleted?: boolean
  /** Rechazó el asistente de copia en la nube (no re-ofrecer intrusivamente). */
  backupDeclined?: boolean
}
```

**settings.ts — helper (partial merge, never clobber siblings), mirroring `setAdvanced`:**
```ts
export async function setOnboarding(patch: Partial<NonNullable<Settings['onboarding']>>): Promise<void> {
  const s = await loadSettings()
  s.onboarding = { ...s.onboarding, ...patch }
  await saveSettings(s)
}
export async function getOnboarding(): Promise<Required<NonNullable<Settings['onboarding']>>> {
  const { onboarding } = await loadSettings()
  return {
    completedFirstRun: onboarding?.completedFirstRun ?? false,
    tourCompleted:     onboarding?.tourCompleted ?? false,
    backupDeclined:    onboarding?.backupDeclined ?? false
  }
}
```

**Contract additions:**
- `IPC`: `onboardingGet: 'geode:onboarding-get'`, `onboardingSet: 'geode:onboarding-set'`
- New interface `OnboardingState { completedFirstRun; tourCompleted; backupDeclined }` + `OnboardingApi { get(): Promise<OnboardingState>; set(patch: Partial<OnboardingState>): Promise<OnboardingState> }`
- Add `onboarding: OnboardingApi` to `GeodeApi`; preload namespace `onboarding: { get, set }`.
- Handlers return the resolved state (like `advancedSet` returning `{ enabled }`), so the renderer keeps its mirror in sync from the reply.

**Why a getter with defaults, not raw read:** matches `advanced`'s fail-safe (default `false` on missing/IPC error). First-run defaults to "nothing seen yet" so a brand-new user (or a corrupted settings file) gets the full onboarding rather than silently skipping it.

## (c) Renderer design — Backup assistant + TourOverlay

### C1. Backup assistant (multi-step, non-blocking)

**New component `CloudBackupWizard.tsx`** modeled on `NewVaultDialog` (same modal-overlay + step state machine already proven there for device flow). It differs by operating on the **current, already-local vault** rather than creating a new folder.

**Step model (local `useState<'intro'|'account'|'device'|'creating'|'done'|'error'>`):**
1. `intro` — explain "copia de seguridad en la nube", `Continuar` / `Ahora no` (the latter → `onboarding.set({ backupDeclined: true })`).
2. `account` — account-creation hand-off: `shell.openExternal('https://github.com/signup')` via a tiny new channel *or* reuse the device-flow which already opens `github.com`. Prefer folding this into device flow: `startDeviceFlow()` already opens GitHub and shows a code; users without an account can register then authorize. So `account` can be a one-screen explainer before `device`.
3. `device` — reuse `window.geode.github.startDeviceFlow()` + `completeDeviceFlow()` verbatim (already used in NewVaultDialog).
4. `creating` — **new channel** `geode:vault-enable-backup`: create repo on the **current** vault + set remote + first push.
5. `done` / `error`.

**Why a new channel `geode:vault-enable-backup`:** existing `createWithRepo` *creates a new folder + new local repo*. The backup flow must attach a remote to the **existing** local vault and push its history. Reusing `createWithRepo` would create a second folder. New handler:
```ts
ipcMain.handle(IPC.vaultEnableBackup, async (_e, name: string, isPrivate: boolean): Promise<GithubConfig> => {
  const token = await getGithubToken(); if (!token) throw new Error('Conectá tu cuenta de GitHub')
  const root = requireRoot()
  const repo = await createRepo(token, name, isPrivate)   // existing github.ts
  await gitService.setRemote(root, repo.cloneUrl)          // existing
  const s = await loadSettings(); s.github = { ...s.github, remote: repo.cloneUrl }; await saveSettings(s)
  await gitService.push(root)                              // first push (existing git push path)
  return getGithubConfigForRenderer()
})
```
- `GithubApi`/`VaultApi`: add `enableBackup(name, isPrivate): Promise<GithubConfig>` (place on `vault` for symmetry with `createWithRepo`, or on `github`; either is defensible — recommend `vault` since it mutates the vault's remote).
- Runs non-blocking: it's a normal modal the user can close; declining sets `backupDeclined` so the app never nags.

**Titlebar entry point + tour anchor:** add a **"Habilitar copia en la nube"** button in the `tb-actions` cluster (App.tsx ~line 1163), shown when `!(githubCfg?.connected && githubCfg.remote)` — i.e. the local-only state where today no cloud button renders. Give it `data-tour="backup"`. This is the anchor the tour's backup step targets.

### C2. TourOverlay (renderer-only)

**New component `TourOverlay.tsx` rendered via `createPortal(…, document.body)`** so it escapes the `shell` layout/stacking and can draw a full-window dimmer + a spotlight hole + a tooltip.

**Anchoring via `data-tour` attributes** placed on existing elements (no refs threaded through the tree — attribute selectors keep the tour decoupled from component internals):
| Step | Anchor element (existing) | `data-tour` |
|------|---------------------------|-------------|
| Crear nota | `notesActions` FilePlus button | `data-tour="new-note"` |
| Guardar versión | titlebar Save `.tb-btn.cta` | `data-tour="save"` |
| Línea de tiempo | `SidebarSection id="timeline"` header | `data-tour="timeline"` |
| Cambiar/crear bóveda | `VaultSwitcher` | `data-tour="vaults"` |
| Copia en la nube | **new backup button** | `data-tour="backup"` |
| Ayuda / repetir | status-bar `Info` item (or new `?`) | `data-tour="help"` |

**Step model (module constant, Spanish copy):**
```ts
interface TourStep { anchor: string; title: string; body: string; placement?: 'bottom'|'right'|'left' }
const TOUR: TourStep[] = [ { anchor: 'new-note', title: 'Creá tu primera nota', body: '…' }, … ]
```

**Positioning:** on each step, `document.querySelector('[data-tour="'+step.anchor+'"]')` → `getBoundingClientRect()` → position the tooltip + spotlight. Recompute on `resize`/`scroll` (sidebar is scrollable) with a `ResizeObserver` or window listeners; step advance on `Siguiente`/`Enter`, dismiss on `Esc`/`Saltar`.

**State ownership in App.tsx (fits existing hooks pattern):**
```ts
const [tourStep, setTourStep] = useState<number | null>(null)  // null = tour off
const [onboarding, setOnboardingState] = useState<OnboardingState | null>(null)
```
- Load `onboarding` in the existing startup `useEffect` (App.tsx:886) alongside `advanced`/`github`.
- **Trigger-after-first-notebook:** in `createLocal`'s renderer handler (a new `createLocalNotebook` callback that calls `window.geode.vault.createLocal` then `adoptVault`), if `!onboarding.tourCompleted` → `setTourStep(0)` after the vault is adopted and the anchors are mounted.
- **Completion:** finishing/skipping → `window.geode.onboarding.set({ tourCompleted: true })` + mirror update + `setTourStep(null)`.
- **Replay from "Ayuda":** an entry (status-bar Info popover or ActivityBar) calls `setTourStep(0)` — independent of the persisted flag, so users can re-run anytime.

**PluginHost interaction:** none required — the tour is core UI, not a plugin. It may optionally call `host`'s `notify()` for a closing toast ("¡Listo! Podés repetir el tour desde Ayuda."), reusing the existing toast pipeline.

**Anchor-timing gotcha:** the tour must not start until the target elements exist. After creating the first notebook, `adoptVault` re-renders into the full shell; start the tour in a `useEffect` gated on `vault != null && tourStep === 0` (or a micro-delay/`requestAnimationFrame`) so `querySelector` finds mounted anchors. The `backup` anchor only exists when the vault is local-only — acceptable, since that's exactly the state a first-run user is in.

## (d) Build order & phase boundary

**Dependency that fixes the boundary:** the tour's `backup` step needs the backup button (`data-tour="backup"`) to exist. So backup UI ships **before** the tour.

### Phase A — Creation onboarding (foundation, no tour)
1. `VaultService.createLocal` + `defaultNotebooksDir` + `sanitizeFolderName`; channel `geode:vault-create-local`; contract + preload wiring.
2. Welcome screen (App.tsx `!vault` branch, line 1079): add a **primary one-click "Crear cuaderno"** action calling `createLocalNotebook` (no dialog). Keep "Abrir carpeta" and "Clonar/crear en GitHub" as secondary.
3. Onboarding persistence: `Settings.onboarding`, `getOnboarding`/`setOnboarding`, channels `geode:onboarding-get/-set`, `OnboardingApi`, preload, startup load.
4. Backup assistant: `CloudBackupWizard.tsx` + channel `geode:vault-enable-backup` + titlebar **backup button with `data-tour="backup"`** (shown in local-only state). Wire `backupDeclined`.
5. Set `completedFirstRun: true` after the first notebook is created.

*Deliverable:* a new user one-clicks a local notebook and can optionally add cloud backup. All tour anchors now exist in the DOM.

### Phase B — Interactive tour (depends on A)
6. Add `data-tour` attributes to the existing anchors (new-note, save, timeline, vaults, help) — the `backup` anchor already exists from Phase A.
7. `TourOverlay.tsx` (portal, spotlight, tooltip, step model, keyboard nav, reposition on resize/scroll).
8. Trigger-after-first-notebook (gated on `!tourCompleted`); persist `tourCompleted` on finish/skip.
9. "Repetir tour" entry in Ayuda → `setTourStep(0)`.

*Deliverable:* first notebook auto-launches the tour; replayable from Ayuda.

**Rationale for two phases:** Phase A is pure IPC/service/state plumbing with immediate standalone value (fast local start + optional backup) and low UI risk. Phase B is renderer-only overlay work whose only external dependency (the backup anchor) is satisfied by A. Splitting keeps each phase independently shippable and testable, and avoids building the tour against anchors that don't exist yet.

## New vs Modified — explicit inventory

**New files**
| File | Purpose |
|------|---------|
| `src/renderer/src/CloudBackupWizard.tsx` | Multi-step backup assistant modal |
| `src/renderer/src/TourOverlay.tsx` | Portal spotlight/tooltip tour |
| `src/renderer/src/tour/steps.ts` (opt.) | Step model + Spanish copy |

**New IPC channels** (all `geode:`-prefixed)
| Channel const | String | Direction |
|---|---|---|
| `vaultCreateLocal` | `geode:vault-create-local` | renderer→main |
| `vaultEnableBackup` | `geode:vault-enable-backup` | renderer→main |
| `onboardingGet` | `geode:onboarding-get` | renderer→main |
| `onboardingSet` | `geode:onboarding-set` | renderer→main |

**Modified files**
| File | Change |
|------|--------|
| `src/shared/ipc.ts` | 4 channel consts; `VaultApi.createLocal`/`enableBackup`; `OnboardingApi` + `OnboardingState`; `GeodeApi.onboarding` |
| `src/preload/index.ts` | Wire `vault.createLocal`, `vault.enableBackup`, `onboarding.get/set` |
| `src/main/index.ts` | Handlers for the 4 channels |
| `src/main/services/vault.ts` | `createLocal`, `defaultNotebooksDir`, `sanitizeFolderName` |
| `src/main/services/settings.ts` | `onboarding` in `Settings`; `getOnboarding`/`setOnboarding` |
| `src/renderer/src/App.tsx` | Welcome one-click button; backup button + `data-tour`; `data-tour` on anchors; tour state + trigger + startup load; render `<TourOverlay/>`/`<CloudBackupWizard/>` |
| `src/main/services/git.ts` | none required (reuses `ensureRepo`, `setRemote`, `push`) |

## Data-flow changes

**First-run create (new):**
```
Welcome "Crear cuaderno" → createLocalNotebook()
  → geode:vault-create-local → VaultService.createLocal (Documents/Geode/<name>, collision-safe)
  → gitService.ensureRepo (git init main) → rememberVault → restartSnapshotTimer
  → adoptVault(info) → onboarding.set({completedFirstRun:true})
  → if !tourCompleted → setTourStep(0) → TourOverlay reads getBoundingClientRect of data-tour anchors
```

**Enable backup (new, sequences existing pieces):**
```
Backup button → CloudBackupWizard
  → github.startDeviceFlow (opens github.com / signup) → completeDeviceFlow (token cifrado, main)
  → geode:vault-enable-backup → createRepo + setRemote(current root) + push → GithubConfig
  → App.refreshGithub() → titlebar swaps backup button for existing push button
```

**Startup (modified):** existing init `useEffect` additionally calls `onboarding.get()` to seed `onboarding` state (decides whether a returning user with `completedFirstRun` but `!tourCompleted` should still be offered the tour, or resume normally).

## Anti-patterns to avoid

- **Overloading `createWithRepo` with a `local` flag.** Forks its body around token/dialog/remote; a sibling `createLocal` is clearer and safer.
- **Constructing the default path in the renderer.** Absolute paths must be built in main (`app.getPath('documents')`); the renderer only passes a name — preserves the path-traversal boundary.
- **Threading React refs through the whole tree for tour anchors.** Use `data-tour` attribute selectors + `getBoundingClientRect`; keeps the overlay decoupled and the anchored components untouched beyond one attribute.
- **Persisting tour/first-run flags in `localStorage`.** App-level onboarding is app config, not vault/UI state — it belongs in `settings.json` via SettingsService (survives across vaults, consistent with `advanced`/`snapshots`). (`localStorage` is fine for the purely-cosmetic `sidebarWidth`, but not for onboarding lifecycle.)
- **Making the backup assistant modal-blocking or nagging.** Honor `backupDeclined`; the local-first value is "works fully offline" — cloud is opt-in.
- **Rendering TourOverlay inside `.shell`.** Overflow/stacking will clip the spotlight; use a `document.body` portal.

## Integration Points

### Internal boundaries
| Boundary | Communication | Notes |
|---|---|---|
| Welcome/App ↔ VaultService | `geode:vault-create-local` | Returns `VaultInfo`, never null (no dialog) |
| CloudBackupWizard ↔ GithubService | existing device-flow + new `enable-backup` | Token stays in main (safeStorage) |
| App ↔ SettingsService | `geode:onboarding-get/-set` | Partial-merge patch, resolved defaults on read |
| TourOverlay ↔ DOM | `data-tour` attrs + `getBoundingClientRect` | No IPC; pure renderer |

### External services
| Service | Pattern | Gotchas |
|---|---|---|
| GitHub (signup + device flow + createRepo + push) | Reuse existing `github.ts`; new handler wraps createRepo/setRemote/push for the current vault | Account hand-off can fold into device flow (it already opens github.com); no client secret; HTTPS-only remotes |

## Sources

- Repository source (HIGH): `src/shared/ipc.ts`, `src/main/services/{vault,settings,github,git}.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/{App,NewVaultDialog}.tsx`
- `CLAUDE.md` project constraints/conventions; `.planning/PROJECT.md` milestone context
- Electron `app.getPath('documents')` / `shell.openExternal` (standard Electron APIs, already used elsewhere in the codebase)

---
*Architecture research for: onboarding + first-run tour integration in Geode*
*Researched: 2026-07-08*
