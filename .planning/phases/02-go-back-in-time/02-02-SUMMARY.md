---
phase: 02-go-back-in-time
plan: 02
subsystem: renderer
tags: [react, codemirror, typescript, i18n-es, timeline]

# Dependency graph
requires:
  - phase: 02-go-back-in-time
    provides: "GitCommitNode/GitTagRef IPC types consumed by the label helpers (already present)"
provides:
  - "src/renderer/src/time/labels.ts → entryLabel / relativeDate / changedSummary (pure Spanish helpers)"
  - "CodeMirrorEditor readOnly?: boolean prop (runtime toggle via CM6 Compartment)"
affects: [02-03, 02-04, 02-05, "Timeline section + past-banner + EditorPane preview wave"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, DOM/IPC-free renderer helpers extracted to time/labels.ts for testability"
    - "CM6 Compartment reconfigure to toggle EditorState.readOnly + EditorView.editable without remounting the view"

key-files:
  created:
    - src/renderer/src/time/labels.ts
  modified:
    - src/renderer/src/editor/CodeMirrorEditor.tsx

key-decisions:
  - "entryLabel fallback chain returns tag.name → trimmed message → relativeDate, and never emits an oid/hash (TIME-03)"
  - "readOnly nullish-coalesced to false so both the initial compartment slot and the reconfigure effect are safe for undefined-prop callers"

patterns-established:
  - "Read-only editor via a single Compartment slot in the create-once extension array + a [readOnly]-keyed reconfigure effect mirroring the reloadKey doc-swap effect"

requirements-completed: [TIME-03, TIME-04, SOFT-05]

# Metrics
duration: 6min
completed: 2026-07-04
---

# Phase 2 Plan 02: Pure timeline helpers + read-only editor toggle Summary

**Two dependency-free renderer leaves: the TIME-03/TIME-04 Spanish label/date humanizers (`time/labels.ts`) and a SOFT-05 runtime `readOnly` toggle on `CodeMirrorEditor` via a CM6 `Compartment` — both unconsumed, so the app is behavior-neutral and `npm run typecheck` is green.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2
- **Files created:** 1
- **Files modified:** 1

## Accomplishments
- New pure module `src/renderer/src/time/labels.ts` with three named exports, explicit `: string` return types, all user-facing text in Spanish, and no DOM/IPC access:
  - `entryLabel(c, tags, now?)` — TIME-03 fallback chain tag name → trimmed commit message → `relativeDate`; never emits a hash/oid.
  - `relativeDate(ts, now?)` — Spanish relative strings with correct singular/plural (`ahora mismo` <60s; `hace N minuto(s)`/`hora(s)`/`día(s)` <7d; then `hace N semana(s)`), negatives clamped to 0.
  - `changedSummary(names)` — `1 nota cambiada` / `N notas cambiadas` (human "nota", not "archivo").
- `CodeMirrorEditor` gains an optional `readOnly?: boolean` prop backed by a CM6 `Compartment`: a compartment slot in the create-once extension array plus a `[readOnly]`-keyed reconfigure effect that dispatches `EditorState.readOnly.of(...)` + `EditorView.editable.of(...)`, toggling read-only + caret-less "inert" state at runtime without remounting the view.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure timeline helpers (entryLabel, relativeDate, changedSummary)** - `5bfc356` (feat)
2. **Task 2: Read-only Compartment on CodeMirrorEditor** - `a22be46` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `src/renderer/src/time/labels.ts` (created) - three pure Spanish named-export helpers with explicit return types; `import type { GitCommitNode, GitTagRef } from '@shared/ipc'`.
- `src/renderer/src/editor/CodeMirrorEditor.tsx` (modified) - `Compartment` added to the `@codemirror/state` import; `readOnly?: boolean` on `CodeMirrorEditorProps` (Spanish doc comment); `readOnlyComp` ref; compartment slot in the create extensions array; new `[readOnly]` reconfigure effect mirroring the `reloadKey` effect shape.

## Decisions Made
- **`readOnly` is nullish-coalesced (`readOnly ?? false`)** in both the initial compartment `.of([...])` and the reconfigure effect, so existing callers passing no prop compile and behave exactly as before (editable). Prop is optional per plan.
- **`EditorView.editable.of(!readOnly)` accompanies `EditorState.readOnly.of(readOnly)`** so the past editor loses its caret and looks inert, not merely edit-blocked (per plan + T-02-06 mitigation at the CM6 state level).
- **Helpers extracted verbatim from the RESEARCH reference bodies**, matching the module-top pure-helper idiom already used in `TimelineScrubber.tsx` (`noteName`/`fmtDate`).

## Deviations from Plan
None - plan executed exactly as written.

## Threat Surface
- T-02-06 (readOnly editor bypass): mitigated at the CM6 state level (`EditorState.readOnly` + `EditorView.editable.of(false)`). The belt-and-suspenders disk-write guard remains deferred to the later EditorPane flush-guard plan, as scoped. No new trust boundary, IPC, fs, network, or eval introduced. No threat flags.

## Known Stubs
None. Both artifacts are complete leaves; they are intentionally unconsumed until the Timeline/preview wave (02-03..02-05) wires them.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `entryLabel`/`relativeDate`/`changedSummary` are ready for the Timeline section and the "past" banner.
- `CodeMirrorEditor readOnly` is ready for `EditorPane` to pass `readOnly={previewOid !== null}` during preview.
- App behavior is unchanged (both leaves unconsumed); `npm run typecheck` exits 0.

## Self-Check: PASSED

---
*Phase: 02-go-back-in-time*
*Completed: 2026-07-04*
