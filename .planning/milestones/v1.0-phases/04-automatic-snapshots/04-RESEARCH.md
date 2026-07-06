# Phase 4: Automatic Snapshots - Research

**Researched:** 2026-07-04
**Domain:** Electron main-process lifecycle timers + isomorphic-git commit orchestration (brownfield extension)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Config shape:** `settings.snapshots = { cadenceMinutes: number | null }` (`null` = manual), reusing `SettingsService` (same pattern as `ai`/`github`). [CITED: 04-CONTEXT.md]
- **Cadence options:** manual / 5 / 10 / 15 / 30 minutes (SNAP-01).
- **Default:** every 10 minutes, ON — coherent with "git as automatic, invisible memory."
- **UI:** new **"Guardado automático"** section in the Settings panel, reusing the AI section's visual pattern (label + control).
- **Timer runs in the MAIN process** (`setInterval`); (re)starts on cadence change and vault change. Lives in main to survive renderer reloads and enable the on-quit snapshot.
- **Change detection:** reuse `git.changes()` (content-hash vs HEAD, racy-safe). Snapshot **only if there are changes** (SNAP-02). NEVER `statusMatrix`.
- **Auto/safety snapshots NEVER invoke AI** (SNAP-04); AI cost scales only with manual saves.
- **Auto-snapshot label:** marker message `"Instantánea automática — {fecha local}"` (user chose a marker over an empty message). SNAP-04 ("labeled by relative date") is satisfied because the timeline already shows the relative date as the secondary line per Phase 2 (`entryLabel`), and the marker is consistent with the existing `"Instantánea de seguridad — {fecha}"` used by `bringBack`.
- **Safety snapshots** (only if changes) before: (1) time travel — already in `bringBack` (App.tsx:510); (2) vault switch — before `vault.setRoot` in `vaultSwitch` (main/index.ts:193); (3) quitting the app — intercept quit, snapshot before exit.
- **Centralization:** a single main-process `snapshotIfChanged(reason)` reused by the timer + all 3 safety points ("if there are changes, commit without AI using the marker message").
- **MVP:** do NOT visually distinguish auto vs manual in the timeline (label/date already separates them from named versions).

### Claude's Discretion
- Exact IPC channel names for reading/writing `settings.snapshots` (suggested `geode:snapshots-get` / `geode:snapshots-set`).
- How the timer is restarted (helper function structure), re-entrancy guard mechanics, and whether the renderer is signalled to refresh the timeline after an auto-snapshot.
- Whether to intercept `BrowserWindow` `close` vs `app.before-quit` for the on-quit snapshot (see Pitfall 2 — this materially affects whether the last ~600 ms of edits are captured).

### Deferred Ideas (OUT OF SCOPE)
- Distinguishing auto vs manual with icon/dimming in the timeline — Phase 5.
- Advanced-mode toggle / revealing git jargon — Phase 5.
- Inactivity-based (debounce) cadence instead of a fixed interval — not in MVP.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SNAP-01 | User configures auto-snapshot cadence in Settings (manual / 5 / 10 / 15 / 30 min) | New `settings.snapshots.cadenceMinutes`; new IPC get/set; new "Guardado automático" Settings section reusing the AI section pattern. Timer restart on cadence change (Pattern 3). |
| SNAP-02 | A timed snapshot is created only when there are actual changes, content-detected (racy-safe), never on an unchanged tree | `snapshotIfChanged` calls the existing `GitService.commit()`, which internally runs `pendingChanges()` (content-hash vs HEAD blobs) and returns `null` when empty — an empty commit is structurally impossible (git.ts:133-153, 852-865). |
| SNAP-03 | Safety snapshots before going back / switching vault / quitting — only when changed | `bringBack` already does it (App.tsx:508-511). Add `snapshotIfChanged` call in `vaultSwitch` before `setRoot` (main/index.ts:193), and on quit (Pattern 2). All three route through the same central function. |
| SNAP-04 | Auto-snapshots never invoke AI, labeled by relative date; AI only on manual save | `commit(dir, message)` with an explicit marker message never touches AI — the AI fallback lives only in the renderer's manual `doCommit`/`suggestVersion` path (App.tsx:538, main/index.ts:319-341). Timer calls `commit()` directly. Relative-date labeling is already handled by `entryLabel` (Phase 2). |
</phase_requirements>

## Summary

This is a **brownfield extension phase**, not greenfield. Every primitive needed already exists and is battle-tested: `GitService.commit()` performs racy-safe, content-hash change detection and returns `null` on no-op (so empty commits are impossible); `GitService.changes()` exposes the same detection read-only; `SettingsService` already persists a JSON settings object with the exact `ai`/`github` sub-object pattern the new `snapshots` config should mirror; and `bringBack` already establishes the "safety snapshot with an explicit message ⇒ no AI" precedent. **No new npm packages are required.**

The genuinely new work is a **main-process lifecycle concern**: a single `setInterval` timer, a central `snapshotIfChanged(reason)` function, wiring the timer's start/restart to vault-open / vault-switch / cadence-change, and an on-quit snapshot. The two subtle areas are (1) the on-quit path — `before-quit` fires *after* windows are already closed when the app quits via `window-all-closed → app.quit()`, so the renderer may be gone and the last ~600 ms of debounced edits not yet on disk; and (2) confirming there is no harmful race between the timer's commit and the renderer's debounced autosave writes. The race is **benign**: `atomicWrite` uses temp-file + `rename` (atomic), so the timer always reads either the old or the new complete file, never a partial one, and any edit it misses is caught by the next tick or manual save — no corruption, no data loss.

**Primary recommendation:** Add `snapshots` to `Settings`; add two IPC channels (`snapshots-get`/`snapshots-set`); implement one `snapshotIfChanged(reason)` and one `restartSnapshotTimer()` in `main/index.ts`; call `restartSnapshotTimer()` from `vaultOpen`, `vaultSwitch`, `restoreLastVault`, and the `snapshots-set` handler; add the safety snapshot to `vaultSwitch` (before `setRoot`) and to the quit path; add a "Guardado automático" section to `SettingsModal.tsx`. Do not build any new git/change-detection logic — reuse `commit()`/`changes()` verbatim.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cadence timer (interval firing) | Main process | — | Must survive renderer reloads and run at quit; renderer is transient and sandboxed (locked decision). |
| Change detection + commit | Main process (`GitService`) | — | Only main touches disk/git; renderer is sandboxed (`nodeIntegration=false`). Reuse existing `commit()`. |
| Cadence config persistence | Main process (`SettingsService`) | — | Settings live in `userData` outside any vault; same tier as `ai`/`github` config. |
| Cadence config UI | Renderer (`SettingsModal`) | Preload bridge | User interaction; reads/writes via `window.geode` IPC only. |
| Safety snapshot on time-travel | Renderer (`bringBack`) → Main (`commit`) | — | Trigger is renderer UX (already implemented); the actual commit is main-side. |
| Safety snapshot on vault switch | Main process (`vaultSwitch` handler) | — | The switch happens in main; snapshot the OLD root before `setRoot` reassigns it. |
| Safety snapshot on quit | Main process (quit lifecycle) | Renderer (flush) | Quit is a main-process lifecycle event; the renderer may need to flush pending edits first (see Pitfall 2). |
| Timeline refresh after auto-snapshot | Renderer | Main (push event) | The timeline is renderer state; if it should update live, main must push a `webContents.send` event (see Open Question 1). |

## Standard Stack

### Core

No new libraries. This phase composes existing runtime dependencies only.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 43.0.0 | `app` lifecycle events (`before-quit`), `BrowserWindow`, `setInterval` in main | Already the app framework; timer + quit hooks are core `app` API. [VERIFIED: package.json / CLAUDE.md] |
| isomorphic-git | 1.38.6 | Commit engine behind `GitService.commit()` | Already the versioning engine; fully async, no sync API. [VERIFIED: package.json] |
| Node.js `timers` (global `setInterval`/`clearInterval`) | bundled (Node 18+) | The cadence timer | Standard global; no import needed. [VERIFIED: Node bundled with Electron 43] |

### Supporting

None. `SettingsService`, `atomicWrite`, and the IPC bridge are all in-repo.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setInterval` in main | `setInterval` in renderer | REJECTED by locked decision — dies on renderer reload, cannot run at quit, would need an IPC round-trip per tick. Main is correct. |
| Fixed-interval timer | Debounce-on-inactivity | Deferred (CONTEXT). Fixed interval is simpler and matches SNAP-01's literal cadence options. |
| Marker commit message | Empty commit message | User explicitly chose the marker for recognizability and consistency with `bringBack`. |

**Installation:** None — no packages to install.

## Package Legitimacy Audit

**Not applicable.** This phase installs no external packages; all work reuses in-repo modules and already-installed runtime dependencies (`electron`, `isomorphic-git`). No registry lookups, no slopcheck run required. If a future planning decision introduces a package, run the Package Legitimacy Gate before adding it.

## Architecture Patterns

### System Architecture Diagram

```
                         MAIN PROCESS (Node)
  ┌───────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   settings.json ──load──> settings.snapshots.cadenceMinutes     │
  │        ▲                          │                             │
  │        │ save                     ▼                             │
  │        │                  restartSnapshotTimer()                │
  │        │                     │        ▲                         │
  │        │                     │        │ (re)start on:           │
  │        │                     ▼        │  - vaultOpen            │
  │        │              setInterval(cadenceMinutes)               │
  │        │                     │        - vaultSwitch             │
  │        │                     │ tick   - restoreLastVault        │
  │        │                     ▼        - snapshots-set           │
  │        │            snapshotIfChanged('cadencia')  <────────────┼─── quit path
  │        │                     │                     <────────────┼─── vaultSwitch (before setRoot)
  │        │                     ▼                                  │
  │        │            GitService.changes(root) ──[none]──> no-op  │
  │        │                     │[changes]                         │
  │        │                     ▼                                  │
  │        │      GitService.commit(root, "Instantánea automática…")│
  │        │        (content-hash vs HEAD; NEVER AI; null if empty) │
  │        │                     │                                  │
  │        │                     ▼ (optional) webContents.send      │
  │        │              'geode:snapshot-created'                  │
  └────────┼─────────────────────────────┬────────────────────────┘
           │ IPC (snapshots-get/set)      │ IPC event (optional)
  ┌────────┴─────────────────────────────┴────────────────────────┐
  │  RENDERER (sandboxed)                                           │
  │   SettingsModal "Guardado automático"      Timeline refresh     │
  │   (select cadence) ── window.geode.snapshots.set() ─┘           │
  │   EditorPane autosave ── vault.writeNote (600ms debounce,       │
  │        atomicWrite temp+rename) ── writes real files on disk    │
  │   bringBack ── git.commit("Instantánea de seguridad…") (exists) │
  └────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new files. All changes land in existing files:

```
src/
├── main/
│   ├── index.ts            # timer state + snapshotIfChanged() + restartSnapshotTimer()
│   │                       #   + quit hook + safety snapshot in vaultSwitch
│   │                       #   + 2 new IPC handlers (snapshots-get/set)
│   └── services/
│       └── settings.ts     # extend Settings with `snapshots`; add get/set helpers
├── shared/
│   └── ipc.ts              # 2 new channels + SnapshotsConfig type + SnapshotsApi
├── preload/
│   └── index.ts            # bridge the 2 new channels (CommonJS — do NOT convert to ESM)
└── renderer/src/
    └── SettingsModal.tsx   # new "Guardado automático" section (nav item + panel)
```

### Pattern 1: Central `snapshotIfChanged(reason)` in main

**What:** One function that all triggers (timer, vault switch, quit) call. It never invokes AI and never creates an empty commit.
**When to use:** Every automatic/safety snapshot.
**Example:**
```typescript
// src/main/index.ts — reason is for logging/marker only; message is the marker.
// Source: mirrors bringBack (App.tsx:510) and gitCommit handler (main/index.ts:255)
async function snapshotIfChanged(reason: string): Promise<string | null> {
  const info = vault.getInfo()
  if (!info) return null // sin vault activo: nada que snapshotear
  try {
    // commit() ya hace la detección racy-safe y devuelve null si no hay cambios.
    // Mensaje marcador explícito ⇒ NUNCA invoca IA (SNAP-04).
    const oid = await gitService.commit(info.root, snapshotMessage())
    return oid
  } catch (e) {
    // Un snapshot fallido nunca debe tumbar la app ni bloquear el cierre.
    console.warn(`[snapshot] falló (${reason}):`, e)
    return null
  }
}

function snapshotMessage(): string {
  return `Instantánea automática — ${new Date().toLocaleString()}`
}
```
> Note: `commit()` already calls `pendingChanges()` internally, so an explicit pre-check with `changes()` is redundant for the timer/quit path. Only call `changes()` first where you need to branch on dirtiness *before* doing other work (e.g., `bringBack` measures the tree before `restoreTree`).

### Pattern 2: On-quit snapshot (async commit + prevent-default + re-entrancy guard)

**What:** isomorphic-git is fully async; "synchronous snapshot before exit" means *block the quit* until the async commit resolves, then quit.
**When to use:** The quit lifecycle.
**Example:**
```typescript
// src/main/index.ts
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return // segunda pasada: dejar salir (evita loop infinito)
  event.preventDefault()
  quitting = true
  void (async () => {
    await snapshotIfChanged('cierre') // nunca throwea (try/catch interno)
    app.quit() // re-dispara before-quit; el guard lo deja pasar
  })()
})
```
**Verified ordering caveat** — see Pitfall 2. On Windows/Linux the common quit path is *close last window → `window-all-closed` → `app.quit()`*. By the time `before-quit` runs there, **all windows are already closed**, so the renderer is gone and cannot flush its last debounced edits. [CITED: electronjs.org/docs/latest/api/app]

### Pattern 3: Timer start/restart tied to the active vault and cadence

**What:** A single module-level handle; `restartSnapshotTimer()` clears any existing interval and installs a new one from the current cadence. Called wherever the vault or cadence changes.
**Example:**
```typescript
// src/main/index.ts
let snapshotTimer: NodeJS.Timeout | null = null

async function restartSnapshotTimer(): Promise<void> {
  if (snapshotTimer) {
    clearInterval(snapshotTimer)
    snapshotTimer = null
  }
  const { snapshots } = await loadSettings()
  const minutes = snapshots?.cadenceMinutes ?? 10 // default 10, ON
  if (minutes == null) return // manual: sin timer
  snapshotTimer = setInterval(() => {
    void snapshotIfChanged('cadencia')
  }, minutes * 60_000)
}
```
Call sites: after `vault.setRoot`/`ensureRepo` in `vaultOpen`, `vaultSwitch`, `restoreLastVault`, and inside the `snapshots-set` handler after saving.

### Pattern 4: Safety snapshot on vault switch (snapshot OLD root first)

**What:** Snapshot the *currently active* vault before `setRoot` reassigns `vault.root` to the new one.
**Example:**
```typescript
// src/main/index.ts — inside the vaultSwitch handler, BEFORE vault.setRoot(root)
ipcMain.handle(IPC.vaultSwitch, async (_e, root: string): Promise<VaultInfo | null> => {
  try {
    await snapshotIfChanged('cambio-de-boveda') // usa el root ACTUAL vía vault.getInfo()
    const info = await vault.setRoot(root)       // recién ahora cambia el root
    await gitService.ensureRepo(info.root)
    await rememberVault(info.root)
    await restartSnapshotTimer()                 // reinicia el timer para la nueva bóveda
    return info
  } catch {
    return null
  }
})
```
> Because `snapshotIfChanged` reads `vault.getInfo()` internally and runs **before** `setRoot`, it correctly commits the old vault. Order matters — do not reorder.

### Pattern 5: Settings config sub-object (mirror `ai`/`github`)

**What:** Extend the `Settings` interface and add read/write helpers exactly like `ai`.
**Example:**
```typescript
// src/main/services/settings.ts — add to interface Settings:
snapshots?: {
  /** minutos entre snapshots automáticos; null = manual (sin timer). */
  cadenceMinutes?: number | null
}

// helper writer (partial update, no pisar el resto):
export async function setSnapshotCadence(cadenceMinutes: number | null): Promise<void> {
  const settings = await loadSettings()
  settings.snapshots = { ...settings.snapshots, cadenceMinutes }
  await saveSettings(settings)
}
```

### Anti-Patterns to Avoid

- **Re-implementing change detection.** Do NOT call `git.statusMatrix` or read stat mtimes — the racy-git landmine (CLAUDE.md constraint). Reuse `GitService.commit()` / `changes()`, which hash real content vs HEAD blobs.
- **Pre-checking `changes()` then committing separately in the timer.** Redundant and introduces a TOCTOU window. `commit()` already no-ops on an unchanged tree.
- **Calling AI in the snapshot path.** The marker message must be passed explicitly; never route through `aiSuggestMessage`/`suggestVersion`.
- **Forgetting the re-entrancy guard in `before-quit`.** Without `quitting`, the `app.quit()` inside the async handler re-fires `before-quit` and loops forever.
- **Starting the timer at app boot regardless of vault.** If no vault is open, `snapshotIfChanged` no-ops harmlessly, but restart the timer on vault open so a fresh cadence is bound to a real repo.
- **Converting the preload to ESM to add the new bridge.** Preload MUST stay CommonJS (`.cjs`) — Electron sandbox requirement (CLAUDE.md).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Did anything change since HEAD?" | Custom mtime/stat diff or `statusMatrix` | `GitService.changes()` / the internal `pendingChanges()` inside `commit()` | Racy-git landmine: same-size same-second edits are lost by stat-based detection. Content-hash is the only safe path (git.ts:900-922). |
| Skip empty commits | Manual "is dirty" gate around `git.commit` | `GitService.commit()` return value (`null` when nothing changed) | Already implemented and tested; empty commit is structurally impossible. |
| Atomic, corruption-safe writes | Direct `fs.writeFile` | `atomicWrite` (already used by autosave) | temp + fsync + rename; the reason the timer/autosave race is benign. |
| Encrypted-at-rest config persistence | New config file | `SettingsService` (`loadSettings`/`saveSettings`) | Same JSON, same atomic write, same location as `ai`/`github`. |
| Marker message formatting | New date lib | `new Date().toLocaleString()` | Matches the exact existing `bringBack` precedent; timeline shows relative date separately (`entryLabel`). |

**Key insight:** The hard problem in this domain (safe change detection) was already solved in Phases 2–3. Phase 4 is orchestration, not algorithm. The risk is *re-solving* an already-solved problem incorrectly.

## Runtime State Inventory

Not a rename/refactor/migration phase — this section is largely N/A, but two runtime-state items are worth stating explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `settings.json` in `userData` gains a `snapshots` sub-object. Backward compatible: absent = default 10 min (handled by `?? 10`). | Code edit only; no migration — old settings files simply lack the key. |
| Live service config | None. | None. |
| OS-registered state | None (the timer is in-process; no OS scheduler/Task Scheduler involved). | None. |
| Secrets/env vars | None — cadence is not a secret; stored in plain JSON like `enabled` flags. | None. |
| Build artifacts | None. | None. |

## Common Pitfalls

### Pitfall 1: Timer commit vs. renderer autosave write race
**What goes wrong:** The main-process timer fires `commit()` while the renderer's debounced autosave (`vault.writeNote`, 600 ms debounce) has a write in flight for the same file.
**Why it happens:** Both are async and interleave at `await` points in the single-threaded main process.
**Why it's benign (VERIFIED by reading the code):** `atomicWrite` writes to a temp file then `rename`s (atomic within the filesystem). The timer's `workBlobs()` reads each file with `readFile` — it therefore reads either the complete old file or the complete new file, **never a partial/corrupt one**. If the timer snapshots a file a few hundred ms before the latest keystroke's flush lands, the missed edit is captured by the next tick or the next manual save. No corruption, no permanent data loss.
**How to avoid:** Nothing extra required. Do NOT add locking — it would only add complexity for a non-problem. Optionally note this reasoning in a code comment.
**Warning signs:** A snapshot whose content is one debounce-cycle stale — expected and self-healing.

### Pitfall 2: On-quit snapshot misses the renderer's last unsaved edits
**What goes wrong:** On the common Windows/Linux path (user closes the last window → `window-all-closed` → `app.quit()` → `before-quit`), the renderer process is **already torn down** by the time `before-quit` runs. The editor's unmount-flush (`EditorPane` `useEffect` cleanup → async `writeNote`) races with process teardown and may not complete, so up to ~600 ms of typed-but-undebounced edits are not on disk and won't be in the quit snapshot. [CITED: electronjs.org/docs/latest/api/app — "before-quit is emitted before the application starts closing its windows"; when quitting via `window-all-closed`, windows are already closed.]
**Why it happens:** `before-quit` fires *before* window close only when quit is triggered by `app.quit()`/`Cmd+Q` *while windows are still open*. In the `window-all-closed → app.quit()` path, closure already happened.
**How to avoid (recommended, planner's discretion):** Intercept the window's `close` event in main *before* the renderer dies, ask the renderer to flush, then snapshot. Concretely:
- Add a `mainWindow.on('close', ...)` (or a `beforeunload`-driven IPC) that flushes pending edits (`flushAll`) and returns, so disk is current before teardown; then let the normal quit proceed and let `before-quit`'s `snapshotIfChanged` capture the now-flushed state. OR
- Send a `geode:flush-pending` IPC and `await` a reply inside a `close`/`before-quit` handler that first `preventDefault`s while the renderer is still alive.

For **MVP**, the locked decision (`before-quit` snapshot of on-disk state) is acceptable: the periodic timer already captures most edits, and only sub-debounce-window keystrokes at the exact moment of quit are at risk. Document the limitation; the robust `close`-interception variant can be a follow-up or included if cheap.
**Warning signs:** Closing the app immediately after a fast edit produces a snapshot missing the last word typed.

### Pitfall 3: `before-quit` infinite loop
**What goes wrong:** Calling `app.quit()` inside the `before-quit` handler re-emits `before-quit`, which `preventDefault`s again → the app never quits.
**How to avoid:** The `quitting` boolean guard (Pattern 2). First pass: preventDefault + snapshot + `app.quit()`. Second pass: guard returns early, quit proceeds.
**Warning signs:** App hangs on close; snapshot runs repeatedly.

### Pitfall 4: Timer bound to a stale vault after switch
**What goes wrong:** After a vault switch the interval keeps snapshotting; because `snapshotIfChanged` reads `vault.getInfo()` at fire time it will target the *new* vault, which is fine — but the cadence isn't rebound and a just-switched vault won't get a fresh cycle boundary.
**How to avoid:** Call `restartSnapshotTimer()` in `vaultSwitch`, `vaultOpen`, and `restoreLastVault` so the interval is always freshly bound (Pattern 3/4).
**Warning signs:** First auto-snapshot after a switch arrives at an unexpected time.

### Pitfall 5: Timer fires during time-travel preview
**What goes wrong:** The user is previewing an old version (renderer `previewOid` set). The timer fires and snapshots.
**Why it's actually safe:** Preview does NOT modify the working dir (the editor reads old content via `readNoteAt`; disk is untouched until "Volver aquí" → `restoreTree`). Autosave is suppressed during preview (`EditorPane.flush` returns early when `previewOid != null`). So a timer snapshot during preview simply commits the *present* on-disk changes (from before entering preview) — correct behavior, and it can only help (SNAP-02 gate still applies).
**How to avoid:** No action needed. Do NOT add cross-process preview-state gating for MVP; it adds coupling for no correctness benefit. Note as an intentional decision.
**Warning signs:** None — this is safe by construction.

## Code Examples

### New IPC channels (shared contract)
```typescript
// src/shared/ipc.ts — add to the IPC map:
snapshotsGet: 'geode:snapshots-get',
snapshotsSet: 'geode:snapshots-set',

// add type + api:
export interface SnapshotsConfig {
  /** minutos entre snapshots; null = manual. */
  cadenceMinutes: number | null
}
export interface SnapshotsApi {
  get(): Promise<SnapshotsConfig>
  set(cadenceMinutes: number | null): Promise<SnapshotsConfig>
}
// add `snapshots: SnapshotsApi` to interface GeodeApi
```

### Preload bridge (CommonJS — keep .cjs)
```typescript
// src/preload/index.ts — add to the api object:
snapshots: {
  get: () => ipcRenderer.invoke(IPC.snapshotsGet),
  set: (cadenceMinutes) => ipcRenderer.invoke(IPC.snapshotsSet, cadenceMinutes)
},
```

### Main handlers
```typescript
// src/main/index.ts — inside registerIpcHandlers()
ipcMain.handle(IPC.snapshotsGet, async (): Promise<SnapshotsConfig> => {
  const { snapshots } = await loadSettings()
  return { cadenceMinutes: snapshots?.cadenceMinutes ?? 10 } // default 10, ON
})
ipcMain.handle(IPC.snapshotsSet, async (_e, cadenceMinutes: number | null): Promise<SnapshotsConfig> => {
  await setSnapshotCadence(cadenceMinutes)
  await restartSnapshotTimer()
  return { cadenceMinutes }
})
```

### Settings UI section (mirror the AI toggle pattern)
```tsx
// src/renderer/src/SettingsModal.tsx — a new Section 'snapshots' with a <select>.
// Lucide icon (monochrome), Spanish strings, no emojis.
const CADENCIAS: { label: string; value: number | null }[] = [
  { label: 'Manual (sólo al guardar)', value: null },
  { label: 'Cada 5 minutos', value: 5 },
  { label: 'Cada 10 minutos', value: 10 },
  { label: 'Cada 15 minutos', value: 15 },
  { label: 'Cada 30 minutos', value: 30 }
]
// on mount: setCadence((await window.geode.snapshots.get()).cadenceMinutes)
// on change: await window.geode.snapshots.set(value)
```
> Reuse the existing `.settings-section` / `.field-label` / `.settings-nav` classes. Add a nav `<button>` with a Lucide icon (e.g. `History` or `Clock` — both are valid Lucide names; verify the import resolves).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual-only commits ("no auto-commit" per git.ts header comment lines 98-99) | Timer-driven + safety-driven auto-snapshots via a central function | This phase | The git.ts class comment "no hay auto-commit" becomes outdated; consider updating the comment when the phase lands. |
| Safety snapshot only in `bringBack` (renderer) | Same message/logic centralized in main `snapshotIfChanged`, reused by 3 triggers | This phase | `bringBack` can keep its inline renderer commit (it already flushes + measures the tree), OR be refactored to call a new IPC that wraps `snapshotIfChanged`. MVP: leave `bringBack` as-is (it works); just align the message string. |

**Deprecated/outdated:**
- The `autoCommitMessage()` helper in main/index.ts (`Snapshot {ISO}`) is used only by the `gitCommit` fallback and is NOT the auto-snapshot marker. Do not confuse it with `snapshotMessage()` (`Instantánea automática — {fecha}`). Keep them distinct.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bringBack` should remain a renderer-side commit rather than be refactored to route through the new main `snapshotIfChanged`. | State of the Art | Low — both produce the same result; a refactor is optional cleanup, not a correctness requirement. |
| A2 | Live timeline refresh after an auto-snapshot is out of MVP scope unless the planner opts in (Open Question 1). | Open Questions | Low/Medium — if the timeline must update live without a manual refresh, a `webContents.send` event is needed; otherwise the next natural `refreshGraph` shows it. |
| A3 | For MVP, the on-quit snapshot capturing on-disk state (possibly missing the last <600 ms of edits) is acceptable per the locked `before-quit` decision. | Pitfall 2 | Medium — if the product requires guaranteed capture of the very last keystroke on quit, the `close`-interception + flush variant must be implemented. Confirm with user during planning/UAT. |

## Open Questions

1. **Should the timeline refresh live when an auto-snapshot is created?**
   - What we know: The timeline is renderer state, rebuilt by `refreshGraph()`. Auto-snapshots happen in main with no current push channel (only `windowMaximizeChanged` uses `webContents.send`).
   - What's unclear: Whether the user expects the sidebar timeline to show a new entry the instant an auto-snapshot fires, or whether it's acceptable to appear on the next natural refresh (open a note, save, switch, reopen timeline).
   - Recommendation: MVP — do NOT push. Add a `geode:snapshot-created` event + `onSnapshotCreated` bridge subscription only if UAT shows the staleness is confusing. Cheap to add later (additive).

2. **On-quit edit capture (see Pitfall 2 / Assumption A3).**
   - What we know: `before-quit` runs after windows close on the `window-all-closed → app.quit()` path.
   - What's unclear: Product tolerance for losing sub-debounce-window keystrokes at the exact moment of quit.
   - Recommendation: Ship the `before-quit` snapshot for MVP; flag the limitation in UAT. Offer the `close`-interception + renderer-flush variant if the user wants guaranteed last-keystroke capture.

## Environment Availability

**Skipped** — no external tools, services, runtimes, or CLIs beyond the already-installed Electron/isomorphic-git stack. This phase is code-only, main-process orchestration with no new dependencies.

## Validation Architecture

> No automated test harness exists in this repo (zero test coverage per STATE.md line 89). Validation for Phases 1–3 has been **typecheck + build + manual UAT**, and Phase 4 follows the same model. There is no `pytest`/`jest`/`vitest` config, no `test/` directory, and no `test` script in `package.json`. Wave 0 does NOT introduce a framework — that would be scope creep for a small orchestration phase; it is called out as a known gap instead.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no runner configured) |
| Config file | none |
| Quick run command | `npx tsc --noEmit -p tsconfig.node.json` (typecheck main/preload) and `-p tsconfig.web.json` (renderer) |
| Full suite command | `npm run build` (electron-vite build: main + preload + renderer) + manual UAT script |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SNAP-01 | Cadence config persists + drives timer; options manual/5/10/15/30; default 10 ON | manual UAT + typecheck | `npx tsc --noEmit` (contract), then UAT: set each option, confirm `settings.json` value + observed interval | ❌ manual (no harness) |
| SNAP-02 | Timed snapshot only when changed; no empty commits | manual UAT | UAT: leave tree clean over one cadence → no new commit; edit + wait → exactly one new commit | ❌ manual |
| SNAP-03 | Safety snapshot before time-travel / vault-switch / quit, only when dirty | manual UAT | UAT: dirty edit → switch vault → confirm old vault got a snapshot; dirty edit → quit → reopen → confirm snapshot; time-travel already covered by Phase 2 UAT | ❌ manual |
| SNAP-04 | Never invokes AI; labeled by relative date | manual UAT + code review | Code review: grep the snapshot path for any AI call (must be none); UAT with AI enabled → confirm zero OpenRouter usage delta after an auto-snapshot; confirm timeline shows relative date | ❌ manual |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` (must pass; strict mode, `noUnusedLocals`, explicit return types).
- **Per wave merge:** `npm run build` green.
- **Phase gate:** Build green + UAT script (SNAP-01..04 above) approved before `/gsd-verify-work`, matching the Phase 1–3 close pattern.

### Wave 0 Gaps
- [ ] No automated test framework — **intentionally not introduced** this phase (matches Phases 1–3; adding one is out of scope for a small orchestration phase). Validation is typecheck + build + manual UAT.
- [ ] Manual UAT script must be written into the plan covering SNAP-01..04, including the AI-usage-delta check for SNAP-04 and the vault-switch/quit safety-snapshot checks for SNAP-03.

*(No conftest/fixtures needed — no runner.)*

## Security Domain

> `security_enforcement: true`, ASVS level 1. This phase adds no network surface, no auth, no user-supplied input parsing, and no new external data. Attack surface is minimal; most ASVS categories are N/A.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth touched. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No new privileges; renderer stays sandboxed (`contextIsolation=true`, `nodeIntegration=false`). New IPC channels expose only cadence get/set. |
| V5 Input Validation | yes (light) | `snapshots-set` receives `number | null`. Validate it is `null` or one of the allowed cadences (5/10/15/30) before persisting/using in `setInterval`; reject/clamp others to avoid a pathological interval (e.g., 0 → tight loop). |
| V6 Cryptography | no | Cadence is not a secret; stored in plain JSON like existing `enabled` flags (correct — no over-encryption). |
| V12 File Handling | yes (inherited) | All writes go through `atomicWrite` and `GitService`, which already enforce path-traversal protection (`resolveInside`) and atomic writes. No new file paths introduced. |

### Known Threat Patterns for Electron main-process timer + IPC

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious/garbage `cadenceMinutes` from renderer causing a 0ms tight-loop `setInterval` (DoS) | Denial of Service | Validate the value in the `snapshots-set` handler against the allowed set; treat unknown values as `null` (manual) or default 10. |
| Unbounded snapshot growth / commit spam | Denial of Service | Inherent gate: `commit()` no-ops when nothing changed (SNAP-02). A snapshot can only be created when content actually changed, so cadence spam cannot inflate history on an idle vault. |
| Snapshot writing outside the vault | Tampering | Already mitigated: `GitService`/`atomicWrite` resolve inside the vault root (`resolveInside`); this phase adds no new paths. |
| Leaking secrets into commits via marker message | Information Disclosure | Marker message is a fixed template with a timestamp only — no user content, no secrets. |

**Block-on:** `high`. No high-severity findings anticipated for this phase; the one actionable control is input validation on `cadenceMinutes` (V5).

## Sources

### Primary (HIGH confidence)
- In-repo source (read this session): `src/main/index.ts`, `src/main/services/settings.ts`, `src/main/services/git.ts`, `src/main/fs/atomic.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx` (bringBack + flush), `src/renderer/src/EditorPane.tsx` (autosave debounce), `src/renderer/src/SettingsModal.tsx` — authoritative for all "reuse X" claims.
- `.planning/phases/04-automatic-snapshots/04-CONTEXT.md` — locked decisions.
- `.planning/REQUIREMENTS.md` — SNAP-01..04.
- CLAUDE.md — tech stack, racy-git constraint, preload-CommonJS constraint, Spanish/Lucide conventions.
- Electron docs — `app` lifecycle events (`before-quit`/`will-quit`/`window-all-closed` ordering + `preventDefault`): https://www.electronjs.org/docs/latest/api/app [CITED]

### Secondary (MEDIUM confidence)
- Electron `before-quit` async + re-entrancy-guard pattern — well-established community idiom, cross-checked against the official `preventDefault` semantics above.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all reuse verified by reading the actual source.
- Architecture: HIGH — every integration point (timer, `snapshotIfChanged`, vaultSwitch, quit, settings, IPC, Settings UI) traced to concrete existing code.
- Pitfalls: HIGH for the race (verified via `atomicWrite` + `workBlobs` reading), MEDIUM for the on-quit edit-capture timing (verified event ordering via official docs; exact renderer-teardown timing is environment-dependent — flagged as Assumption A3 / Open Question 2).

**Research date:** 2026-07-04
**Valid until:** 2026-08-03 (stable; brownfield, no fast-moving external deps)
