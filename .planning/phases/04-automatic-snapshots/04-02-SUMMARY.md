---
phase: 04-automatic-snapshots
plan: 02
subsystem: main-lifecycle
tags: [electron, app-lifecycle, before-quit, vault-switch, isomorphic-git, safety-snapshot]

# Dependency graph
requires:
  - phase: 04-01 (automatic snapshot engine)
    provides: "central snapshotIfChanged(reason) (never AI, null on clean tree, never throws) + restartSnapshotTimer + snapshotMessage in main/index.ts, reused verbatim by both new triggers"
provides:
  - "vaultSwitch safety snapshot: snapshotIfChanged('cambio-de-boveda') before vault.setRoot (commits the OLD/active root)"
  - "app.on('before-quit') safety snapshot on exit with a module-scoped 'quitting' re-entrancy guard"
affects: [phase-05 (timeline auto-vs-manual visual distinction, still deferred)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "before-quit async snapshot: preventDefault + module-scoped 'quitting' guard + async IIFE that awaits the snapshot then app.quit() (guard lets the re-fire through — no infinite loop)"
    - "load-bearing ordering: snapshot the active vault BEFORE setRoot reassigns the root"

key-files:
  created: []
  modified:
    - src/main/index.ts

key-decisions:
  - "vaultSwitch snapshot is the FIRST awaited statement in the try, strictly before vault.setRoot, so snapshotIfChanged (which reads vault.getInfo()) targets the OLD vault — order is load-bearing (T-04-06)"
  - "before-quit uses a module-scoped 'quitting' boolean guard; first pass preventDefault + snapshot + app.quit(), second pass returns early so quit proceeds (T-04-05, Pitfall 3)"
  - "MVP limitation documented in-code: on the window-all-closed → app.quit() path the renderer may already be torn down, so <600ms of undebounced edits may not be on disk — accepted per locked decision"

patterns-established:
  - "Both safety triggers route through Plan 01's snapshotIfChanged verbatim — no new commit/change-detection logic added"

requirements-completed: [SNAP-03]

# Metrics
duration: ~6min
completed: 2026-07-04
---

# Phase 4 Plan 02: Safety Snapshots on Vault Switch and Quit Summary

**Two remaining SNAP-03 safety-snapshot triggers wired on top of Plan 01's engine — a snapshot of the OLD vault before a vault switch, and a snapshot on app quit via a before-quit handler with a re-entrancy guard — both routed through the central snapshotIfChanged so they never invoke AI, never create an empty commit, and never block on failure.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-07-04
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments
- **Vault-switch safety snapshot (SNAP-03):** `await snapshotIfChanged('cambio-de-boveda')` is now the first statement inside the `vaultSwitch` handler's `try`, before `vault.setRoot(root)`. Because `snapshotIfChanged` reads `vault.getInfo()` internally and runs while the OLD vault is still active, it correctly commits the old vault's pending changes before the root is reassigned. The existing Plan-01 `restartSnapshotTimer()` call after `rememberVault` is untouched.
- **Quit safety snapshot (SNAP-03):** a new `app.on('before-quit', ...)` handler, sibling to `window-all-closed`, takes one safety snapshot before exit. A module-scoped `let quitting = false` guard makes the internal `app.quit()` re-fire pass through, so there is no infinite loop (T-04-05 / Pitfall 3). Since `snapshotIfChanged` never throws, the app can never hang on a failed snapshot.
- **No new logic:** both triggers reuse Plan 01's `snapshotIfChanged` verbatim (never AI — SNAP-04 inherited; `null` on a clean tree — SNAP-02 inherited; never throws). Zero new dependencies.

## Task Commits

Each task was committed atomically:

1. **Task 1: Safety snapshot on vault switch (snapshot OLD root first)** - `f00a7a2` (feat)
2. **Task 2: Safety snapshot on quit (before-quit + re-entrancy guard)** - `3887e64` (feat)

## Files Created/Modified
- `src/main/index.ts` - Added `snapshotIfChanged('cambio-de-boveda')` as the first awaited statement in the `vaultSwitch` handler (before `setRoot`); added a module-scoped `let quitting = false`; added an `app.on('before-quit', ...)` handler with the re-entrancy guard, `preventDefault`, and an async IIFE that awaits `snapshotIfChanged('cierre')` then `app.quit()`.

## Decisions Made
- **Load-bearing ordering (T-04-06):** the vault-switch snapshot runs strictly before `vault.setRoot` so it targets the old/active vault. Documented with a Spanish comment at the call site.
- **Re-entrancy guard (T-04-05):** module-scoped `quitting` boolean mirrors the existing `pendingDeviceCode` module-`let` precedent; first pass preventDefault + snapshot + quit, second pass early-return.
- **MVP edit-capture limitation (A3):** the on-quit path may miss the last <600 ms of undebounced edits when quitting via `window-all-closed → app.quit()` (renderer already torn down). Accepted for MVP per the locked decision; documented in an in-code comment. The periodic timer captures the rest.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npm run typecheck` passed after each task; `npm run typecheck && npm run build` (main + preload + renderer) passed after the plan.

## Threat Model Compliance
- **T-04-05 (DoS: before-quit re-fire loop):** mitigated — module-level `quitting` guard lets the second `before-quit` pass through so the app exits.
- **T-04-06 (Tampering: snapshot the wrong vault):** mitigated — `snapshotIfChanged('cambio-de-boveda')` runs before `vault.setRoot`, committing the old/active vault; asserted by the call ordering.
- **T-04-07 (DoS: failed snapshot blocks quit/switch):** accepted — `snapshotIfChanged` never throws (Plan 01 try/catch → null); both call sites tolerate a null result, degrading to "no snapshot" rather than a hang.
- **T-04-SC (installs):** N/A — zero new dependencies (reuses `electron` `app` lifecycle + Plan 01 `snapshotIfChanged`).

## Time-Travel Trigger (unchanged, confirmed only)
The third SNAP-03 trigger — safety snapshot before going back in time — remains handled by the pre-existing `bringBack` (App.tsx:507-511) and is intentionally left as-is; it is only confirmed in the Plan 03 UAT, not re-implemented here.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SNAP-03 is now closed; the full phase behavioral surface (SNAP-01..04) is implemented. Remaining phase gate is manual UAT (vault-switch snapshot of old vault, quit snapshot, no-loop-on-close) before `/gsd-verify-work`.
- No blockers.

## Self-Check: PASSED
