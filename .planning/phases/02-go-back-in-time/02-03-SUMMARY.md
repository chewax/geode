---
phase: 02-go-back-in-time
plan: 03
subsystem: renderer
tags: [react, codemirror, preview, ghost-tab, i18n-es, soft-05]

# Dependency graph
requires:
  - phase: 02-go-back-in-time
    provides: "CodeMirrorEditor readOnly Compartment prop (02-02); git.readNoteAt IPC (02-01/pre-existing)"
provides:
  - "PaneView previewOid?: string | null prop, forwarded to every leaf EditorPane (recursive splits inherit via {...props})"
  - "EditorPane previewOid-aware load source (git.readNoteAt vs vault.readNote), ghost tab state, flush() disk-write guard, readOnly wiring"
affects: [02-05, "App preview orchestration wave"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional previewOid prop threaded PaneView → EditorPane; unset = live present (behavior-neutral until App wires it in 02-05)"
    - "Per-pane preview content via git.readNoteAt inside try/catch; throw → ghost placeholder (SOFT-03)"
    - "flush() early-return backstop so no autosave/unmount write reaches disk during preview (SOFT-05, Pitfall 1)"

key-files:
  created: []
  modified:
    - src/renderer/src/PaneView.tsx
    - src/renderer/src/EditorPane.tsx

key-decisions:
  - "Ghost className applies only to the active tab (path === pane.active && ghost), since only the active note is loaded/ghosted per pane"
  - "flush() reads previewOid via propsRef.current (not the destructured prop) so the guard sees fresh props even though flush is a stable closure"
  - "readOnly={props.previewOid != null} and previewOid in the load-effect deps so entering/stepping/leaving preview reloads and re-locks panes automatically"

patterns-established:
  - "previewOid == null is the single source of truth for 'live present': load source, read-only, ghost, and flush guard all branch on it"

requirements-completed: [SOFT-01, SOFT-03, SOFT-05]

# Metrics
duration: 7min
completed: 2026-07-04
---

# Phase 2 Plan 03: Preview-aware editor panes (previewOid + ghost tabs + flush guard) Summary

**`PaneView` now threads an optional `previewOid` to every leaf `EditorPane`, which — when set — loads each note from `git.readNoteAt(previewOid, path)` instead of disk, renders a Spanish `FileQuestion` ghost placeholder when the note did not exist at that commit (SOFT-03), locks the editor `readOnly`, and early-returns from `flush()` so no preview content can ever reach disk (SOFT-05); the prop is optional and unset by App, so the app renders exactly as today and `npm run typecheck` is green.**

## Performance
- **Duration:** ~7 min
- **Tasks:** 2
- **Files created:** 0
- **Files modified:** 2

## Accomplishments
- `PaneView.tsx`: added `previewOid?: string | null` (Spanish doc: "oid en preview; null/undefined = presente en vivo") to `PaneViewProps` and forwarded `previewOid={props.previewOid ?? null}` to each leaf `<EditorPane>`. The recursive split branch already spreads `{...props}`, so nested panes inherit it with no extra change.
- `EditorPane.tsx`:
  - Added `previewOid?: string | null` to `EditorPaneProps` and a local `const [ghost, setGhost] = useState(false)`.
  - Load effect now branches the read source: `props.previewOid ? git.readNoteAt(previewOid, pane.active) : vault.readNote(pane.active)`, wrapped in try/catch — success clears ghost + sets content/epoch/onNoteOpen as before; throw (blob absent at that commit) sets `ghost` and does NOT set content. `props.previewOid` added to the effect dependency array so entering/stepping/leaving preview reloads panes.
  - `flush()` early-returns `if (propsRef.current.previewOid != null) return` at the top — belt-and-suspenders backstop (Pitfall 1 / T-02-04) so autosave-timer and unmount flushes never write during preview.
  - Ghost body: `.placeholder.ghost-note` with Lucide `FileQuestion` (size 32), heading `Esta nota no existía todavía`, body `En el momento que estás viendo, «{nombre}» aún no había sido creada.` using the note basename — rendered instead of `<CodeMirrorEditor>`/`<MarkdownPreview>` when ghosted.
  - Active tab className appends ` ghost` when ghosted (`.tab.ghost` styling hook) — the tab stays open (SOFT-03).
  - `readOnly={props.previewOid != null}` passed to `<CodeMirrorEditor>` (the 02-02 Compartment prop).

## Task Commits
Each task was committed atomically (committed EditorPane first so every commit type-checks, since PaneView references the new prop):

1. **Task 2: previewOid-aware load + ghost + flush guard + readOnly in EditorPane** - `3ba1427` (feat)
2. **Task 1: thread previewOid through PaneView** - `beada27` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `src/renderer/src/EditorPane.tsx` (modified) - `FileQuestion` import; `previewOid?` prop; `ghost` state; branched load effect with ghost try/catch and `props.previewOid` dep; `flush()` preview guard; ghost placeholder render; `.tab.ghost` className; `readOnly` passed to editor.
- `src/renderer/src/PaneView.tsx` (modified) - `previewOid?: string | null` on `PaneViewProps`; forwarded to leaf `EditorPane`.

## Decisions Made
- **Ghost applies to the active tab only** (`path === pane.active && ghost`): only the active note is loaded per pane, so only it can be ghosted; the other tabs keep their normal styling.
- **`flush()` guard reads `propsRef.current.previewOid`**, not the destructured prop, because `flush` is a stable closure captured by the handle/effects — the ref guarantees the fresh preview state at write time.
- **A single `previewOid == null` branch drives everything** (load source, read-only, ghost eligibility, flush guard), matching the plan's "unset = behavior exactly as today" contract.

## Deviations from Plan
None - plan executed exactly as written. Committed the two tasks in reverse numeric order (EditorPane before PaneView) so each individual commit passes `npm run typecheck`; both files together were required for a green typecheck since PaneView forwards the new EditorPane prop.

## Threat Surface
- **T-02-04** (disk write during preview): mitigated — `flush()` early-returns when `previewOid` is set AND the editor is `readOnly` (so `docChanged` never fires and `pendingRef` stays null). No preview content can reach `vault.writeNote`.
- **T-02-07** (readNoteAt on non-existent path): accepted as designed — the throw is caught and rendered as a ghost placeholder; no path/content leak, no crash.
- No new IPC, fs, network, or eval surface introduced. No threat flags.

## Known Stubs
None. The prop is intentionally optional and left unset by App; App wiring (enter/step/exit preview, snapshot/restore) is plan 02-05 as scoped. `.tab.ghost` / `.ghost-note` CSS styling is cosmetic and owned by the App/CSS wave (02-04/02-05); the class hooks and structure are in place.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `EditorPane`/`PaneView` are preview-ready: App (02-05) only needs to pass `previewOid` down through `PaneView` to activate past-preview, read-only editing, and ghost tabs.
- App behavior is unchanged (prop unset); `npm run typecheck` exits 0.

## Self-Check: PASSED

---
*Phase: 02-go-back-in-time*
*Completed: 2026-07-04*
