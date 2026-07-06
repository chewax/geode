---
phase: 03-save-a-named-version
plan: 02
subsystem: renderer
tags: [react, typescript, electron-ipc, dialog, ai]

# Dependency graph
requires:
  - phase: 03-save-a-named-version
    provides: window.geode.ai.suggestVersion() → { title, description }, NamedVersion shared type
provides:
  - "Reframed two-field 'Guardar versión' dialog (Nombre + Descripción) consuming suggestVersion()"
  - "Human 'N notas cambiadas' summary (filtered to .md) replacing the commit-framed file list"
  - "Empty-safe message composition: [name, description].filter(Boolean).join('\\n\\n')"
affects: [save-a-named-version, timeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-field discriminated save flow: optional autofocus Nombre (title) over editable Descripción (body)"
    - "Auto-generate-on-open via useEffect(aiReady) overwriting both fields from a single suggestVersion() call"
    - "Empty-safe join composition so saving with both fields empty is always allowed"

key-files:
  created: []
  modified:
    - src/renderer/src/CommitDialog.tsx

key-decisions:
  - "Note-count filter (.md) applied inside CommitDialog (renderer) so this plan touches only CommitDialog.tsx as scoped"
  - "changedSummary(noteNames) reused for pluralization instead of hand-rolling the count copy"
  - "Primary CTA disabled ONLY while committing || generating; empty name AND description remain saveable"

patterns-established:
  - "Pattern 1: suggestVersion() sets both name+description; regenerar con IA re-runs and overwrites both"
  - "Pattern 2: Lucide AlertTriangle for the error line — no ⚠ glyph, no emojis (CLAUDE.md)"
  - "Pattern 3: No git vocabulary — no file list, no ledger/permanence warning"

requirements-completed: [SAVE-01, SAVE-02, SAVE-03]

# Metrics
duration: 4min
completed: 2026-07-04
---

# Phase 3 Plan 02: Named-Version Save Dialog Reframe Summary

**Reframed CommitDialog into the two-field "Guardar versión" flow (optional autofocus Nombre + AI-written editable Descripción) consuming suggestVersion(), with a human "N notas cambiadas" summary, a Lucide error icon, no git jargon, and empty-safe save**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-04T21:29:57Z
- **Completed:** 2026-07-04T21:34:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `CommitDialog.tsx` is now the user-visible half of the phase: an optional, autofocused `Nombre` `text-input` on top (mapped to the message title) over an editable `Descripción` `commit-message` textarea (mapped to the body).
- Consumes the Wave 1 `window.geode.ai.suggestVersion()` — on open with AI ready it auto-populates BOTH fields in one pass; `regenerar con IA` (with `RefreshCw`) re-runs and overwrites both; while generating the primary CTA is disabled.
- Replaced the commit-framed `change-list` path list with a single muted human line via `changedSummary(noteNames)`, filtering `changes` to `.md` notes so the count is truthful ("N notas cambiadas").
- Removed the "versión permanente (ledger)" `modal-warn` entirely — no git vocabulary anywhere.
- Replaced the literal `⚠` glyph in the error line with a Lucide `AlertTriangle` (Lucide-only rule); error copy is now `No se pudo generar la descripción`.
- Empty-safe composition: `const message = [name.trim(), description.trim()].filter(Boolean).join('\n\n')`; saving with both fields empty is allowed (falls back to relative-date label via `entryLabel`). CTA disabled only while `committing || generating`, never on empty fields.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebuild CommitDialog as the two-field "Guardar versión" flow** - `5941804` (feat)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified
- `src/renderer/src/CommitDialog.tsx` - Split single `message` state into `name` + `description`; new `suggestVersion()` generation setting both; human `changedSummary` summary; removed file list + ledger warning; Lucide error icon; empty-safe save composition. Imports `changedSummary` from `./time/labels`; `RefreshCw, AlertTriangle` retained.

## Decisions Made
- The `.md` note-count filter for the summary is applied inside `CommitDialog` (renderer-side), keeping this plan scoped to the single file listed in `files_modified`. The App-side count still passes all non-ignored changes; the dialog filters to `.md` for a truthful human summary consistent with the AI diff scope.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npm run typecheck` passed after the task; `npm run typecheck && npm run build` (main + preload + renderer) green after the plan.

## Threat Model Compliance
- T-03-03 (stored-XSS via model output): mitigated. Title/description render only as React text nodes (`value={...}` on `input`/`textarea`, `{error}` as text). No `dangerouslySetInnerHTML` or any HTML sink in the dialog.
- T-03-SC: zero new dependencies (`react`, `lucide-react` already installed). Package Legitimacy Gate N/A.

## Known Stubs
None — the dialog is fully wired to `suggestVersion()` and composes the save message end to end. `App.doCommit` already applies its relative-date fallback on an empty message and `entryLabel` covers the empty-name label, so the empty case is valid without App/CSS edits.

## User Setup Required
None - AI generation reuses the existing OpenRouter BYOK key path. With AI off, both fields are empty and saving proceeds immediately.

## Next Phase Readiness
- The user now experiences SAVE-01/02/03: name-a-moment title, AI-written editable description, no git jargon, no file list, no ledger warning, empty save allowed.
- Manual UAT (open with AI on → both fields auto-fill and editable; AI off → both empty and Guardar enabled; no ⚠, no paths, no "ledger") is covered formally in Plan 03.

## Self-Check: PASSED

- FOUND: src/renderer/src/CommitDialog.tsx
- FOUND commit: 5941804 (Task 1)

---
*Phase: 03-save-a-named-version*
*Completed: 2026-07-04*
