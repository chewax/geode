---
phase: 02-go-back-in-time
plan: 04
subsystem: renderer-timeline
tags: [timeline, time-travel, ui, presentation]
requires:
  - "git.graph() → GitGraph (commits newest-first, tags)"
  - "git.changedFiles(oid) → basenames"
  - "./time/labels: entryLabel, relativeDate, changedSummary (plan 02-02)"
provides:
  - "Timeline component: repo-level version list with transport + dual persistent markers"
  - "TimeTravelBanner component: full-width 'you are in the past' chrome"
affects:
  - "02-05 (App wires both components, adds CSS classes)"
tech-stack:
  added: []
  patterns:
    - "lazy per-oid changedFiles fetch cached in a useMemo Map keyed by graph"
    - "forceRender counter to re-render when async cache fills"
    - "scrollIntoView({ block: 'nearest' }) to keep active entry in view"
key-files:
  created:
    - src/renderer/src/Timeline.tsx
    - src/renderer/src/TimeTravelBanner.tsx
  modified: []
decisions:
  - "Timeline consumes GitGraph via props (does not fetch history itself) per plan contract"
  - "Only the empty state is rendered inline; loading/error live in App (02-05) since graph is a prop"
  - "Secondary line collapses to just what-changed when the label already fell back to the relative date (avoids duplication)"
metrics:
  duration: ~6m
  completed: 2026-07-04
---

# Phase 02 Plan 04: Timeline + TimeTravelBanner Summary

Two self-contained, unmounted presentation components for the whole-vault time-travel UI: `Timeline.tsx` (transport row + newest-first entry list with persistent `presente`/`viendo` markers, human-only labels, lazy what-changed) and `TimeTravelBanner.tsx` (full-width "Estás viendo el pasado" chrome with the two Spanish CTAs). Both typecheck; App wires them and adds CSS in plan 05.

## What Was Built

### Task 1 — Timeline (`src/renderer/src/Timeline.tsx`)
- `export function Timeline({ graph, previewOid, onStep, onJumpToPresent, onSelect }): JSX.Element`.
- Sources `graph.commits` (already newest-first). `idx = previewOid ? findIndex : 0`.
- Sticky transport bar: `ChevronLeft` (Un paso atrás, disabled at oldest), `ChevronRight` (Un paso adelante), `ChevronsRight` (Saltar al presente); forward + jump disabled when `previewOid === null`. Right position label: `en el presente` or the viewing entry's `relativeDate` (teal via `.viewing`).
- Entry rows: primary line = `entryLabel(c, graph.tags)` (never a hash); secondary = `relativeDate · changedSummary(names)`.
- TIME-06 dual markers: `commits[0]` always shows `chip current` (presente); the `previewOid` entry shows `chip head-chip` (viendo) + `.viewing` row highlight — both visible at once.
- TIME-04 lazy what-changed: `useMemo(() => new Map(), [graph])` cache; a `useEffect` fetches `window.geode.git.changedFiles(oid)` per entry, caches basenames by oid, and `forceRender`s. Changed basenames go in the row `title`.
- TIME-05 keep-active-in-view: `useEffect` on `previewOid` calls `scrollIntoView({ block: 'nearest' })` on the viewing row ref.
- Empty state: `.tree-empty` + `History` icon + "Todavía no hay versiones" / "Guardá una versión para empezar tu línea de tiempo."
- Clicking the newest row → `onJumpToPresent()`; any other row → `onSelect(oid)`.

### Task 2 — TimeTravelBanner (`src/renderer/src/TimeTravelBanner.tsx`)
- `export function TimeTravelBanner({ label, relativeDate, onReturnToPresent, onBringBack }): JSX.Element`.
- Full-width `.time-banner`: left = `Eye` icon + "Estás viendo el pasado" (600) + " — {label}" + " · {relativeDate}" (muted); right = ghost `Volver al presente` (`ChevronsRight`) + teal primary `Volver aquí` (`CornerUpLeft`).
- All strings Spanish; Lucide icons only; explicit `JSX.Element` return.

## Deviations from Plan

None — plan executed as written. Note: the Timeline's loading/error states listed in the UI-SPEC are unreachable from within this component because `graph` arrives as a prop; those states are owned by App in plan 05, so only the empty state is rendered inline. This matches the plan's "consumes the GitGraph passed as props" contract.

## Known Stubs

None. Both components are complete presentation over real IPC (`git.changedFiles`) and the pure label helpers. They are intentionally unmounted until plan 05 wires App state and adds the referenced CSS classes.

## Threat Flags

None. Both components are read-only presentation over `git.graph()` + `git.changedFiles()`; no new writes, fs, network, or eval. T-02-08 (hash leak) mitigated: labels flow only through `entryLabel` (tag → message → relative date, never an oid). T-02-09 (DoS) mitigated: `changedFiles` fetched lazily per entry and cached by oid.

## Verification

- `npm run typecheck` exits 0 (both node + web projects).
- Manual UAT deferred to plan 06 (§A): human-only labels, transport-driven preview, both markers during travel, scroll-into-view.

## Self-Check: PASSED
- FOUND: src/renderer/src/Timeline.tsx
- FOUND: src/renderer/src/TimeTravelBanner.tsx
- FOUND commit: 0f21de7 (Timeline)
- FOUND commit: d022c0c (TimeTravelBanner)
