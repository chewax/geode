---
phase: 04-automatic-snapshots
plan: 01
subsystem: infra
tags: [electron, ipc, setInterval, isomorphic-git, settings, react]

# Dependency graph
requires:
  - phase: 02 (versionado / timeline)
    provides: "git commit() content-hash vs HEAD (racy-safe, null on clean tree) reused verbatim as the snapshot engine; relative-date secondary line in the timeline that satisfies SNAP-04 labeling"
  - phase: ai/github settings surface
    provides: "SettingsService sub-object + IPC round-trip pattern (ai/github) mirrored for snapshots"
provides:
  - "SnapshotsConfig/SnapshotsApi types + geode:snapshots-get/set IPC channels"
  - "settings.snapshots.cadenceMinutes persistence + setSnapshotCadence writer"
  - "main-process snapshotMessage(), snapshotIfChanged(reason), restartSnapshotTimer() + cadence timer"
  - "validated snapshots-get/set handlers (cadence clamped to null|5|10|15|30)"
  - "'Guardado automatico' Settings section (Manual/5/10/15/30 cadence select)"
affects: [04-02 (safety snapshots on vault switch + quit reuse snapshotIfChanged), phase-05 (timeline auto-vs-manual visual distinction)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Main-process lifecycle timer (setInterval) with module-scoped handle, rebound on every vault-entry point"
    - "undefined-vs-null cadence resolution (raw === undefined ? 10 : raw) — never ?? to preserve explicit Manual"
    - "IPC input validation via allow-set before setInterval (DoS mitigation T-04-01)"

key-files:
  created: []
  modified:
    - src/shared/ipc.ts
    - src/main/services/settings.ts
    - src/preload/index.ts
    - src/main/index.ts
    - src/renderer/src/SettingsModal.tsx

key-decisions:
  - "snapshotMessage() is a distinct marker ('Instantanea automatica — {fecha}'), never reusing autoCommitMessage() — explicit message guarantees no AI (SNAP-04)"
  - "No changes() pre-check before commit() — commit() already returns null on a clean tree, so a pre-check would be a redundant TOCTOU window"
  - "Default 10 min ON when config absent (undefined); explicit Manual (null) preserved and never coerced back to 10"

patterns-established:
  - "restartSnapshotTimer() rebinds on vaultOpen/vaultSwitch/restoreLastVault + cadence change"
  - "snapshotIfChanged() never throws (uses vault.getInfo() not requireRoot(), wraps commit() in try/catch) — safe for the quit path in Plan 02"

requirements-completed: [SNAP-01, SNAP-02, SNAP-04]

# Metrics
duration: ~12min
completed: 2026-07-04
---

# Phase 4 Plan 01: Automatic Snapshot Engine Summary

**Configurable main-process cadence timer that auto-commits the vault only when content changed, using a distinct marker message and never invoking AI, with a new "Guardado automatico" Settings section.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-04T22:40 (approx)
- **Completed:** 2026-07-04T22:51:43-03:00
- **Tasks:** 3 completed
- **Files modified:** 5

## Accomplishments
- End-to-end auto-snapshot engine: cadence persisted like `ai`/`github`, a `setInterval` timer in the main process bound to the active vault, and a central `snapshotIfChanged(reason)` that commits via the reused racy-safe `git commit()` only when content changed (SNAP-02).
- Auto-snapshots use the marker message `"Instantanea automatica — {fecha}"` and never touch AI (SNAP-04); the manual `autoCommitMessage()` fallback is kept distinct.
- New "Guardado automatico" Settings section (Manual / 5 / 10 / 15 / 30, default 10 ON) that persists and drives the timer (SNAP-01), plus cadence validation that makes a 0ms tight-loop impossible (T-04-01).

## Task Commits

Each task was committed atomically:

1. **Task 1: Snapshots config contract + persistence + preload bridge** - `456b783` (feat)
2. **Task 2: Main-process snapshot engine + cadence timer + validated handlers** - `5bf93ee` (feat)
3. **Task 3: "Guardado automatico" Settings section** - `ed15a16` (feat)

## Files Created/Modified
- `src/shared/ipc.ts` - Added `snapshotsGet`/`snapshotsSet` channels, `SnapshotsConfig`, `SnapshotsApi`, and `snapshots: SnapshotsApi` on `GeodeApi`.
- `src/main/services/settings.ts` - Added `Settings.snapshots.cadenceMinutes` sub-object and `setSnapshotCadence()` writer (plain, no encryption).
- `src/preload/index.ts` - Added the `snapshots.{get,set}` bridge block (stays CommonJS `.cjs`).
- `src/main/index.ts` - Added `snapshotMessage()`, `snapshotIfChanged()`, `restartSnapshotTimer()`, module-scoped `snapshotTimer`, the two validated IPC handlers, and timer rebinding in `vaultOpen`/`vaultSwitch`/`restoreLastVault`.
- `src/renderer/src/SettingsModal.tsx` - Added the `'snapshots'` section, `Clock` nav button, cadence `<select>` (with a `'manual'` sentinel round-tripping to `null`), load-on-open and write-through-then-apply.

## Decisions Made
- **Distinct marker message:** `snapshotMessage()` is separate from `autoCommitMessage()`; the explicit message is what guarantees AI is never invoked on the snapshot path (SNAP-04).
- **No redundant `changes()` pre-check:** `commit()` returns `null` on a clean tree, so an empty commit is structurally impossible; adding a pre-check would only open a TOCTOU window.
- **undefined vs null cadence:** resolved with `raw === undefined ? 10 : raw` (not `?? 10`) in both `restartSnapshotTimer()` and the `snapshots-get` handler, so an explicit Manual choice is never re-enabled to 10.
- **Cadence validation:** the `snapshots-set` handler coerces anything outside `null|5|10|15|30` to `null` with a `console.warn`, so a tampered value can never reach `setInterval` as a 0ms loop (T-04-01).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npm run typecheck` passed after each task and `npm run build` (main + preload + renderer) passed after the plan.

## Threat Model Compliance
- **T-04-01 (DoS via bad cadence):** mitigated — `snapshots-set` validates against `null|5|10|15|30` before `setSnapshotCadence`/`setInterval`.
- **T-04-02/03/04 (accept):** commit spam impossible (null-on-clean); marker message carries no note content/secrets; no new file paths (writes go through existing `GitService`/`atomicWrite`).
- No new dependencies added (reused `electron`, `isomorphic-git`, in-repo `SettingsService`).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can reuse `snapshotIfChanged` verbatim for the safety snapshots on vault switch and app quit (it already never throws and reads `vault.getInfo()`), and `restartSnapshotTimer` is already wired to every vault-entry point.
- No blockers. `before-quit` hook and the `vaultSwitch` safety snapshot are intentionally deferred to Plan 02.

## Self-Check: PASSED

All 5 modified source files, the SUMMARY, and all 3 task commits verified present.
