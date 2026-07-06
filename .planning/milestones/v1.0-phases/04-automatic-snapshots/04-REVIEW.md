---
phase: 04-automatic-snapshots
reviewed: 2026-07-04T00:00:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - src/main/index.ts
  - src/main/services/settings.ts
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/renderer/src/SettingsModal.tsx
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** deep
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 4 "Automatic Snapshots" diff (`56fea3b..HEAD`): snapshot engine,
cadence timer, safety snapshots on vault-switch and quit, config persistence, IPC
contract, preload bridge, and the "Guardado automático" settings UI.

The four highlighted high-risk items hold up under scrutiny:

- **before-quit loop / quit guarantee (index.ts:585-593):** The `quitting` re-entrancy
  guard is correct. First fire calls `preventDefault()` + sets `quitting=true`, then the
  async IIFE snapshots and calls `app.quit()`, which re-dispatches `before-quit`; the
  second pass returns early and the app exits. No infinite loop. `snapshotIfChanged`
  cannot throw (see below), so a failed snapshot never blocks the exit.
- **Leaked intervals on vault switch:** `restartSnapshotTimer` clears the prior interval
  before setting a new one, and every switch path (vaultOpen, vaultSwitch,
  restoreLastVault, snapshotsSet) routes through it. No leak in the sequential case.
  (One concurrency edge remains — see WR-02.)
- **Cadence validation bypass (index.ts:435-440):** `new Set([null,5,10,15,30]).has(x)`
  correctly rejects `0`, negatives, `NaN`, strings, and huge numbers, coercing them to
  `null`. `Set.has(NaN)` is `false`, so `NaN` is caught. The SET boundary is airtight.
- **snapshotIfChanged never throws (index.ts:119-127):** `vault.getInfo()` is a pure
  getter that cannot throw; `gitService.commit()` is wrapped in try/catch returning
  `null`. Confirmed safe on the quit path.

**SNAP-02 (no empty commits):** All snapshot paths call `gitService.commit()`, which
returns `null` when `pendingChanges().length === 0` (git.ts:135). Verified.

**SNAP-04 (never AI):** `snapshotIfChanged` calls `commit(root, snapshotMessage())` with
an explicit marker string; no AI service is touched on any snapshot path. Verified.

No blocking defects. The three warnings are defense-in-depth / robustness gaps that
should be fixed before relying on the "app always quits" and "no tight-loop" guarantees
under non-happy-path conditions.

## Warnings

### WR-01: Cadence read path bypasses validation — corrupted settings can create a 0ms/negative-interval tight loop

**File:** `src/main/index.ts:136-147`
**Issue:** Validation of `cadenceMinutes` exists only at the SET boundary
(`snapshotsSet`, line 435). `restartSnapshotTimer` reads the persisted value directly
and trusts it:
```ts
const raw = snapshots?.cadenceMinutes
const minutes = raw === undefined ? 10 : raw
if (minutes == null) return
snapshotTimer = setInterval(() => { void snapshotIfChanged('cadencia') }, minutes * 60_000)
```
If `settings.json` ever holds `cadenceMinutes: 0` (or a negative / fractional value) —
via manual edit, a corrupted write, an older/newer build, or any future code path that
writes settings without going through `setSnapshotCadence` — then `minutes == null` is
`false` (0 !== null), and `setInterval(fn, 0)` (or a negative delay, clamped to 0 by
Node) spins as fast as the event loop allows, hammering `pendingChanges()` /
`git.commit` continuously. The whole reason the SET validation exists (prevent a 0ms
tight loop) is defeated because the consumer re-derives the delay from untrusted
persisted state. The `commit()` calls also serialize a lot of I/O, compounding the spin.
**Fix:** Re-validate at the point of use, so the timer can never accept a bad delay
regardless of how the value got persisted:
```ts
const raw = snapshots?.cadenceMinutes
const minutes = raw === undefined ? 10 : raw
const ALLOWED = new Set<number | null>([null, 5, 10, 15, 30])
const safe = ALLOWED.has(minutes) ? minutes : null
if (safe == null) return // Manual o valor inválido: sin timer
snapshotTimer = setInterval(() => { void snapshotIfChanged('cadencia') }, safe * 60_000)
```
(Ideally extract a single `normalizeCadence(raw)` helper shared by `snapshotsGet`,
`snapshotsSet`, and `restartSnapshotTimer` — see IN-01.)

### WR-02: restartSnapshotTimer can leak an interval under concurrent invocation

**File:** `src/main/index.ts:136-147`
**Issue:** There is an `await loadSettings()` between clearing the old interval and
assigning the new one:
```ts
if (snapshotTimer) { clearInterval(snapshotTimer); snapshotTimer = null }
const { snapshots } = await loadSettings()   // <-- yields the event loop
...
snapshotTimer = setInterval(...)
```
`ipcMain.handle` callbacks are not serialized. If two calls interleave (e.g. two rapid
`vaultSwitch` invocations, or a `snapshotsSet` racing a `vaultOpen`), both can pass the
`clearInterval` guard while `snapshotTimer` is `null`, both `await loadSettings()`, then
both call `setInterval` — the second assignment overwrites the reference to the first
interval, which now runs forever with no handle to clear it. Low probability in a
single-user UI, but the result is exactly the leaked-timer class the phase set out to
avoid, and it survives until app exit.
**Fix:** Capture and clear synchronously without yielding, or clear again right before
assigning:
```ts
async function restartSnapshotTimer(): Promise<void> {
  const { snapshots } = await loadSettings()
  // ... compute safe minutes ...
  if (snapshotTimer) { clearInterval(snapshotTimer); snapshotTimer = null } // clear AFTER await, just before set
  if (safe == null) return
  snapshotTimer = setInterval(() => { void snapshotIfChanged('cadencia') }, safe * 60_000)
}
```

### WR-03: "App always quits" is not guaranteed if the closing snapshot hangs

**File:** `src/main/index.ts:585-593`
**Issue:** The exit path awaits `snapshotIfChanged('cierre')` before calling
`app.quit()`. `snapshotIfChanged` never *rejects*, but it can *never resolve* if the
underlying `gitService.commit` hangs (a large repo, a stuck fs handle, an
isomorphic-git edge case). Because `event.preventDefault()` already fired, a hung
commit means `app.quit()` is never reached and the app stays alive with no window —
the user perceives a frozen/undead process. The header comment claims "la app siempre
termina saliendo," which is only true for *errors*, not *hangs*.
**Fix:** Bound the wait so quit always proceeds:
```ts
void (async () => {
  await Promise.race([
    snapshotIfChanged('cierre'),
    new Promise((r) => setTimeout(r, 3000)) // techo de seguridad
  ])
  app.quit()
})()
```

## Info

### IN-01: Duplicated "undefined→10 vs null→manual" default logic and magic number 10

**File:** `src/main/index.ts:142-143`, `422-423`
**Issue:** The `raw === undefined ? 10 : raw` derivation and the allowed-cadence set
`[null,5,10,15,30]` are duplicated across `snapshotsGet`, `snapshotsSet`, and
`restartSnapshotTimer`. The default `10` is a bare magic number in multiple spots. This
is how WR-01 arose — the SET path validates but the timer path re-implements the
derivation without the validation.
**Fix:** Extract shared helpers, e.g. `const DEFAULT_CADENCE = 10`,
`function normalizeCadence(raw: number | null | undefined): number | null` returning the
validated default, and use it in all three sites.

### IN-02: Snapshot commit messages are locale/timezone dependent

**File:** `src/main/index.ts:112` (`snapshotMessage`)
**Issue:** `snapshotMessage()` uses `new Date().toLocaleString()`, so the committed
message format varies by the machine's locale and timezone (e.g. `4/7/2026, 14:03` vs
`7/4/2026, 2:03 PM`). This makes snapshot commits inconsistent across machines and not
lexically sortable, and complicates any future "recognize snapshot by label" parsing the
comment alludes to. Note the manual-commit fallback `autoCommitMessage()` (line ~100)
already uses `new Date().toISOString()`.
**Fix:** Use a stable format, e.g. `'Instantánea automática — ' + new Date().toISOString()`,
keeping any localized rendering in the UI layer instead of the persisted message.

---

## Resolution (2026-07-04)

| Finding | Severity | Disposition | Rationale |
|---------|----------|-------------|-----------|
| WR-01 — el read del timer no revalida la cadencia (0/negativo en settings.json → tight-loop) | Warning | **Fixed** | Nuevo `resolveCadenceMinutes()` (única fuente de verdad con `SNAPSHOT_CADENCES`) usado por el timer y el handler get: `undefined`→10, `null`→manual, cualquier otro→manual. Un settings.json corrupto ya no puede derivar un `setInterval` de 0 ms. |
| WR-02 — race entre clearInterval y setInterval (await en el medio) orfana timers | Warning | **Fixed** | `restartSnapshotTimer` hace `loadSettings()` primero y recién después clear+set adyacentes (sin await entre medio), así una llamada concurrente limpia el timer vigente antes de asignar. |
| WR-03 — before-quit no garantiza el cierre si el commit se cuelga | Warning | **Fixed** | `Promise.race([snapshotIfChanged('cierre'), timeout(3s)])` antes de `app.quit()`: la app siempre cierra aunque el commit no resuelva. |
| IN-01 — lógica `undefined→10` + número mágico duplicada en 3 sitios | Info | **Fixed** | Consolidada en `resolveCadenceMinutes()` + `SNAPSHOT_CADENCES` (raíz de WR-01). |
| IN-02 — `snapshotMessage()` usa `toLocaleString()` (locale/TZ) vs `toISOString()` del fallback manual | Info | **Accepted** | El marcador es deliberadamente legible por humanos y consistente con "Instantánea de seguridad — {toLocaleString}" de `bringBack`. Diferido. |

Verificado tras los fixes: `npm run typecheck` + `npm run build` exit 0.

---

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
