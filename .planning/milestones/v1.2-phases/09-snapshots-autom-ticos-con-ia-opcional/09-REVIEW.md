---
phase: 09-snapshots-automaticos-con-ia-opcional
reviewed: 2026-07-07T00:00:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - src/main/services/settings.ts
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/main/index.ts
  - src/renderer/src/SettingsModal.tsx
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 9: Code Review Report — AISNAP-01 (IA opcional en snapshots automáticos)

**Reviewed:** 2026-07-07
**Depth:** deep (cross-file: IPC contract main↔preload↔renderer, auto-snapshot engine, AI/cost/no-loss invariants)
**Files Reviewed:** 5
**Status:** issues_found

## Summary

I traced every path added by commits `33c8cf4` (backend) and `6ca9448` (UI) against the six invariants in the brief. **The two product-critical invariants hold:**

- **No-loss (CRITICAL):** verified sound. `snapshotIfChanged` captures `vault.getInfo()` once, wraps everything after it in a `try/catch` that returns `null`, and `aiSnapshotMessage` has its own catch-all returning `null`. Every AI failure mode (missing key/model, empty `pendingDiff`, `generateNamedVersion` rejection, 10s race timeout) resolves to `null` and falls back to `snapshotMessage()`. `loadSettings()` itself never throws (internal `catch → {}`), so even a corrupt `settings.json` can't skip a cadence snapshot. No exception can escape the exit path.
- **Orphaned race-loser promise:** verified **safe, no fix needed.** The brief asked whether the losing `generateNamedVersion` promise causes an `unhandledRejection` if it rejects after the timeout wins. It does not: `Promise.race` internally attaches a reject reaction to every input promise, so a late rejection is considered handled. No `.catch` is required. (Documented as IN-01.)
- **Cost:** AI is reached only via the `'cadencia'` caller (`allowAi=true`) AND only when `resolveAiTitles(...)` is true AND only when `pendingDiff` is non-empty. The three lifecycle callers pass `allowAi=false`; the `&&` short-circuit means the exit/switch paths never even call `loadSettings`, let alone the network. A clean tree never calls AI.
- **Default OFF / defensive resolve:** `resolveAiTitles(raw) => raw === true` (absent/null/garbage → false). `snapshotsSetAiTitles` coerces `!!enabled` and does NOT restart the timer.
- **Racy-git:** change detection stays content-hash (`pendingDiff`/`pendingChanges`/`commit`), never `statusMatrix`.
- **IPC contract:** channel `geode:snapshots-set-ai-titles` matches across `ipc.ts`/`preload`/`main`; `SnapshotsConfig.aiTitles` is non-optional and every producer (`snapshotsGet`, `snapshotsSet`, `snapshotsSetAiTitles`) returns it; renderer reads a guaranteed-boolean `s.aiTitles`.
- **Concurrency (wrong-root):** verified safe. `info.root` is captured once and passed to both `aiSnapshotMessage` and `commit`; a vault switch mid-await cannot redirect the commit to the new root.

The remaining findings are quality/robustness issues, not correctness or data-loss defects. The two Warnings concern resource hygiene of the new 10s timeout (diverges from the established `getOpenRouterUsage` pattern) and a low-probability wasted-AI-cost window when a cadence tick overlaps a vault switch/quit.

## Warnings

### WR-01: 10s AI timeout neither aborts the fetch nor clears its timer

**File:** `src/main/index.ts:138-143`
**Issue:** `aiSnapshotMessage` races `generateNamedVersion(diff)` against a bare `setTimeout(..., 10_000)`. Two divergences from the codebase's own established pattern in `getOpenRouterUsage` (`ai.ts:203-221`), which uses an `AbortController` and clears its timer in `finally`:
1. When the AI **wins** the race (typical case, ~1-3s), the 10s `setTimeout` is never cleared. Its promise is orphaned and the timer stays armed, keeping a live handle for up to 10s. This is a minor resource leak repeated on every cadence tick with AI enabled.
2. When the **timeout** wins, the underlying `fetch` in `generateNamedVersion` is never aborted (no `AbortController` reaches `OpenRouterProvider.chat`), so the socket stays open until the server responds — a leaked in-flight request the app has already discarded.

No no-loss or cost-invariant impact (commit still happens with the marker), but it is avoidable resource churn and inconsistent with the sibling AI-timeout code.
**Fix:** Mirror `getOpenRouterUsage`: capture the timer id and `clearTimeout` it once the race settles (e.g. in a `finally`), and thread an `AbortController` through `generateNamedVersion`/`chat` so the timeout also aborts the fetch:
```ts
const ctrl = new AbortController()
const timer = setTimeout(() => ctrl.abort(), 10_000)
try {
  const generado = await new OpenRouterProvider(key, ai.model)
    .generateNamedVersion(diff, ctrl.signal) // pasar signal → fetch({ signal })
  ...
} catch { return null } finally { clearTimeout(timer) }
```
(If plumbing a signal into the provider is out of scope, at minimum keep the `Promise.race` but `clearTimeout` the losing timer.)

### WR-02: Cadence AI call can overlap a vault switch/quit — wasted AI cost, no re-entrancy guard

**File:** `src/main/index.ts:166-180` (engine) and `222-224` (timer)
**Issue:** There is no in-flight guard around `snapshotIfChanged`. A cadence tick holds an open window of up to ~10s while awaiting `aiSnapshotMessage`. If the user switches vaults (`vaultSwitch` → `snapshotIfChanged('cambio-de-boveda', false)`) or quits (`before-quit` → `snapshotIfChanged('cierre', false)`) during that window, two `snapshotIfChanged` runs execute concurrently against the **same** captured root. The lifecycle run (fast marker commit) wins; when the cadence AI resolves, its `commit` finds a now-clean tree and no-ops. No-loss holds (both target the captured root, clean-tree commit is idempotent), but the AI request was already billed and its title is silently discarded. Given the stated product constraint that "AI inference cost is user-visible," a paid-for-but-thrown-away title is a real (if low-probability, cadence ≥5min) cost edge. Concurrent isomorphic-git commits against one repo also widen a race on the index/ref, though errors are swallowed and no content is lost.
**Fix:** Add a simple in-flight boolean guard so the cadence path yields to (or is skipped by) lifecycle snapshots, e.g.:
```ts
let snapshotInFlight = false
async function snapshotIfChanged(reason: string, allowAi: boolean): Promise<string | null> {
  const info = vault.getInfo(); if (!info) return null
  if (snapshotInFlight) return null // ya hay un snapshot en curso; no re-entrar
  snapshotInFlight = true
  try { /* ...existing... */ } finally { snapshotInFlight = false }
}
```
Alternatively, skip the AI branch (fall straight to the marker) when a lifecycle snapshot is pending, so no billed title is ever discarded.

## Info

### IN-01: Verified — race-loser rejection does not leak (no change needed)

**File:** `src/main/index.ts:139-142`
**Issue:** The brief flagged the orphaned `generateNamedVersion` promise as a possible `unhandledRejection` source. This is **not** a defect: `Promise.race` attaches an internal reject reaction to every input promise, so a rejection arriving after the timeout has already won is treated as handled. No `.catch` is required. Recorded here so the concern is closed explicitly rather than left ambiguous.
**Fix:** None required. (If WR-01's `AbortController` fix is applied, the losing fetch is aborted anyway, further neutralizing the concern.)

### IN-02: `loadSettings()` called twice per AI-enabled cadence tick

**File:** `src/main/index.ts:171` and `src/main/index.ts:131`
**Issue:** On every cadence tick with `aiTitles` ON, `snapshotIfChanged` calls `loadSettings()` to read `snapshots?.aiTitles`, then `aiSnapshotMessage` immediately calls `loadSettings()` again to read `ai?.model`. Redundant file read + JSON parse. Not a bug (values are consistent within the tick), but avoidable.
**Fix:** Load settings once in `snapshotIfChanged` and pass the resolved `ai.model` (or the whole `settings`) into `aiSnapshotMessage`, or have `aiSnapshotMessage` accept the already-loaded settings.

### IN-03: Settings load fallback resets only `aiTitles`, not `cadence`

**File:** `src/renderer/src/SettingsModal.tsx:92-100`
**Issue:** The `catch` for `snapshots.get()` sets `setAiTitles(false)` but leaves `cadence` at whatever the state currently holds (the `useState(10)` default on a fresh mount). The comment says "cadencia y aiTitles quedan en sus defaults," which is accurate for a first open but would show a stale/default cadence (10) rather than the persisted value if the read fails. Cosmetic only — this is strictly more robust than the pre-phase code (which let the throw break the whole load) and cannot cause a wrong write (the select only persists on explicit change).
**Fix:** For symmetry, also reset cadence in the catch (`setCadence(10)`), or leave as-is and drop "cadencia" from the comment to avoid implying cadence is re-defaulted there.

---

_Reviewed: 2026-07-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
