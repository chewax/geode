---
phase: 03-save-a-named-version
plan: 01
subsystem: ai
tags: [electron-ipc, openrouter, isomorphic-git, react, typescript]

# Dependency graph
requires:
  - phase: 02-go-back-in-time
    provides: entryLabel timeline helper, git.pendingDiff/pendingChanges, OpenRouterProvider
provides:
  - "window.geode.ai.suggestVersion() → { title, description } discriminated round-trip"
  - "NamedVersion shared type + geode:ai-suggest-version IPC channel"
  - "OpenRouterProvider.generateNamedVersion + NAMED_VERSION_PROMPT + parseNamedVersion"
  - "pendingDiff scoped to .md notes (AI diff bug fix) — commit path untouched"
  - "entryLabel returns only the first line (title) of a message"
affects: [03-02-dialog-reframe, save-a-named-version, timeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated AI result via model-agnostic text-parse (first line = title, body = description)"
    - "Scoped .md filter in pendingDiff only, never in shared pendingChanges"
    - "Additive IPC channel instead of breaking an existing contract"

key-files:
  created: []
  modified:
    - src/shared/ipc.ts
    - src/preload/index.ts
    - src/main/index.ts
    - src/main/services/ai.ts
    - src/main/services/git.ts
    - src/renderer/src/time/labels.ts

key-decisions:
  - "New geode:ai-suggest-version channel added; existing aiSuggestMessage (Promise<string>) left intact"
  - "Text-parse discrimination (not OpenRouter JSON-schema) for BYOK arbitrary-model safety"
  - ".md filter lives only in pendingDiff so commit()/changes() still version attachments"

patterns-established:
  - "Pattern 1: Discriminated AI result via text-parse reusing toOneLine for the title"
  - "Pattern 2: Scoped .md filter in pendingDiff (never the shared pendingChanges)"
  - "Pattern 3: entryLabel first-line trim with tag-first + relative-date fallbacks preserved"

requirements-completed: [SAVE-01, SAVE-02]

# Metrics
duration: 9min
completed: 2026-07-04
---

# Phase 3 Plan 01: Named-Version Backend Engine Summary

**AI title/description round-trip via new geode:ai-suggest-version channel, pendingDiff scoped to .md notes, and entryLabel trimmed to the title line — all additive, no user-visible change yet**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-04T21:23:00Z
- **Completed:** 2026-07-04T21:32:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `window.geode.ai.suggestVersion()` now returns a discriminated `{ title, description }` built from the pending diff, end to end (ipc.ts → preload → main handler → `OpenRouterProvider.generateNamedVersion`).
- Fixed the confirmed AI-diff bug: `pendingDiff` is scoped to `.md` notes so generation no longer describes non-note attachments; `commit()`/`changes()`/`pendingChanges` stay unfiltered and keep versioning attachments.
- `entryLabel` now returns only the first non-empty line (title) so multi-line descriptions never leak into the timeline label; tag-first and relative-date fallbacks unchanged.
- Existing `aiSuggestMessage` (`Promise<string>`) channel/method/handler left fully intact — zero blast radius.

## Task Commits

Each task was committed atomically:

1. **Task 1: AI title/description round-trip (shared contract + preload + handler + provider)** - `1be36c7` (feat)
2. **Task 2: Scope pendingDiff to .md + trim entryLabel to first line** - `c032784` (fix)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified
- `src/shared/ipc.ts` - Added `NamedVersion { title, description }`, `aiSuggestVersion` channel, `AiApi.suggestVersion()`
- `src/preload/index.ts` - Mapped `ai.suggestVersion` → `ipcRenderer.invoke(IPC.aiSuggestVersion)` (CommonJS unchanged)
- `src/main/index.ts` - Registered `ipcMain.handle(IPC.aiSuggestVersion, …)` returning `{ title:'', description:'' }` on empty diff
- `src/main/services/ai.ts` - Added `NAMED_VERSION_PROMPT`, `parseNamedVersion`, `OpenRouterProvider.generateNamedVersion` (reuses `toOneLine`)
- `src/main/services/git.ts` - Scoped `pendingDiff` changes to `.md` (mirrors `changedFiles` idiom)
- `src/renderer/src/time/labels.ts` - `entryLabel` returns first non-empty line only

## Decisions Made
- None beyond the plan: followed the researched approach exactly (new additive channel, text-parse discrimination, scoped `.md` filter, first-line label trim).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npm run typecheck` passed after each task; `npm run build` (main + preload + renderer) green after the plan.

## Known Stubs
None — all wiring is functional. No dialog consumes `suggestVersion()` yet (intentional; Plan 02 builds the reframed `CommitDialog` that calls it). This is the non-UI half of the phase by design, not a stub.

## User Setup Required
None - no external service configuration required. AI generation reuses the existing OpenRouter BYOK key path unchanged.

## Next Phase Readiness
- `suggestVersion()` and the `NamedVersion` type exist and typecheck — ready for Plan 02 to build the two-field "Guardar versión" dialog.
- No user-visible change shipped; existing one-line commit labels render identically (first-line trim is a no-op on them).

## Self-Check: PASSED

- FOUND: src/shared/ipc.ts, src/preload/index.ts, src/main/index.ts, src/main/services/ai.ts, src/main/services/git.ts, src/renderer/src/time/labels.ts
- FOUND commit: 1be36c7 (Task 1)
- FOUND commit: c032784 (Task 2)

---
*Phase: 03-save-a-named-version*
*Completed: 2026-07-04*
