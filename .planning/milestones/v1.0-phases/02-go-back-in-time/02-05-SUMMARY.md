---
phase: 02-go-back-in-time
plan: 05
subsystem: renderer-integration
tags: [time-travel, app-integration, preview, css, react]

# Dependency graph
requires:
  - "02-01: git.treeAt / git.restoreTree / git.changedFiles + typed IPC"
  - "02-02: ./time/labels (entryLabel, relativeDate)"
  - "02-03: PaneView/EditorPane previewOid (read-only editor, ghost tabs, readNoteAt)"
  - "02-04: Timeline + TimeTravelBanner presentation components"
provides:
  - "App previewOid orchestration: enterPreview/exitPreview/restoreLayoutSnapshot/stepPreview/selectPreview/bringBack"
  - "Preview-aware refreshTree (git.treeAt vs vault.tree) + previewOid threaded to PaneView"
  - "LÍNEA DE TIEMPO SidebarSection (repo-level) below NOTAS, above vault switcher"
  - "Full-width TimeTravelBanner mounted between titlebar and body while previewing"
  - "CSS: .time-banner, .tl-transport, .tl-entry, .tab.ghost, .main.past editor tint"
affects: ["02-06 (phase UAT)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "refreshTree(oidOverride?) — optional override sidesteps stale-closure when called in the same tick as setPreviewOid"
    - "Layout snapshot as an immutable paneTree reference (no deep clone) restored verbatim on exit/jump-to-present"
    - "bringBack: flushAll → racy-safe git.changes() dirty check → explicit-message (no-AI) safety commit → git.restoreTree (working-dir only, HEAD unmoved)"

key-files:
  created: []
  modified:
    - src/renderer/src/App.tsx
    - src/renderer/src/index.css
  deleted:
    - src/renderer/src/TimelineScrubber.tsx

key-decisions:
  - "refreshTree takes an optional oidOverride so enterPreview/exitPreview/bringBack fetch the correct tree in the same tick as setPreviewOid (state hasn't re-rendered yet), avoiding a stale-closure bug"
  - "Timeline mount + enter/exit wiring moved into the Task-1 commit (not Task-2) so each commit keeps noUnusedLocals + npm run typecheck green; final state matches the plan exactly"
  - "Preview paths never call git.checkout/goToVersion; those remain only on the pre-existing VersionGraph/BranchSwitcher paths"

requirements-completed: [SOFT-01, SOFT-02, SOFT-04, SOFT-05, SOFT-06, TIME-05, TIME-06, SIDE-03]

# Metrics
duration: ~15min
completed: 2026-07-04
---

# Phase 2 Plan 05: App integration (time-travel wiring) Summary

**A single `previewOid` switch in `App.tsx` reroutes the whole app (tree, tabs, editor) into a read-only preview of any past version, mounts the repo-level LÍNEA DE TIEMPO section and the full-width "Estás viendo el pasado" banner, restores the exact prior layout on exit, and materializes a moment via `bringBack` (safety snapshot → `restoreTree`, HEAD unmoved) — with the per-note TimelineScrubber retired.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3
- **Files:** 2 modified, 1 deleted

## What Was Built

### Task 1 — previewOid state, source switching, layout snapshot, scrubber retirement (`c37f5da`)
- `const [previewOid, setPreviewOid] = useState<string | null>(null)` — transient, never persisted (T-02-10).
- `refreshTree(oidOverride?)` branches: `git.treeAt(oid)` in preview vs `vault.tree()` live; `previewOid` in deps, override for same-tick correctness.
- `previewOid` threaded to `<PaneView>`; `<main>` gets a `past` modifier class when previewing (drives the editor tint).
- `layoutSnapshotRef` + `enterPreview` (flushAll → snapshot immutable paneTree ref → setPreviewOid → refreshTree), `restoreLayoutSnapshot`, `exitPreview`, `stepPreview` (transport index math; forward past newest = exit), `selectPreview`.
- Mounted `<SidebarSection id="timeline" title="LÍNEA DE TIEMPO">` between NOTAS (keeps `flex`) and `<VaultSwitcher>`, hosting `<Timeline>` (guarded on `graph`); always available (TIME-02/SIDE-03).
- Retired the per-note scrubber: removed the import, `timelineOpen` state, the History `tb-btn` toggle, the scrubber render, the orphaned `restoreVersion` and now-orphaned `bumpPane`, and the unused `History` lucide icon; deleted `src/renderer/src/TimelineScrubber.tsx`.

### Task 2 — Timeline transport already wired; TimeTravelBanner + bringBack (`7ea6614`)
- `<TimeTravelBanner>` rendered between `<header className="titlebar">` and `<div className="body">` only when `previewOid != null`, labelled via `entryLabel(previewedCommit, graph.tags)` + `relativeDate(previewedCommit.timestamp)`.
- `bringBack()`: `flushAll` → `git.changes()` (racy-safe) → when dirty, `git.commit('Instantánea de seguridad — …')` (explicit message ⇒ NO AI, T-02-03) → `git.restoreTree(oid)` (working-dir only, **no** `checkout`, HEAD unmoved, T-02-05) → clear preview, restore layout, `syncPanesToTree`, `refreshGraph`, light Spanish toast (SOFT-06).
- `previewedCommit` derived from `graph.commits` for the banner.

### Task 3 — CSS (`712b350`)
- `.time-banner` (36px, teal wash `color-mix(var(--head) 14%, var(--panel))`, teal bottom border, teal leading icon/title, `no-drag`) + teal-filled `.tb-btn.primary.head` CTA; ghost secondary via base `.tb-btn`.
- `.tl-transport` (sticky, 22px, 2px gaps, disabled 0.4), `.tl-pos`(+`.viewing` teal), `.tl-list`, `.tl-entry` (8px pad, hover `--panel-2`, `.viewing` → 2px teal left border + 10% teal wash), `.tl-entry-main/-label/-chips/-sub`.
- `.tab.ghost` (italic, muted, dashed) + `.ghost-note` placeholder.
- `.main.past .epane-body` preview tint: 7% teal veil + `inset 0 2px 0` 55% teal top accent, content `opacity: 0.9`.
- All via existing tokens (`--head`/`--accent`/`--panel*`/`--border`/`--text`/`--muted`); no new color or spacing scale; reuses `.chip.current`/`.chip.head-chip` as-is.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Timeline mount + enter/exit wiring moved from Task 2 into the Task 1 commit**
- **Found during:** Task 1 (before first commit).
- **Issue:** With `noUnusedLocals` ON and `npm run typecheck` as the per-task gate, defining `enterPreview`/`exitPreview`/`restoreLayoutSnapshot`/`stepPreview`/`selectPreview` (and `setPreviewOid`) in Task 1 without any consumer fails typecheck (`TS6133 … never read`) at the Task 1 commit. Their only consumer is the Timeline mount, which the plan places in Task 2.
- **Fix:** Mounted the `<SidebarSection id="timeline">` + `<Timeline>` (wired to `enterPreview`/`exitPreview`/`stepPreview`/`selectPreview`) inside the Task 1 commit so every new symbol is used and typecheck stays green. Task 2 then adds only `bringBack` + the `<TimeTravelBanner>` mount. This mirrors the plan-01 precedent (deferring the `rm` import to keep per-commit typecheck green).
- **Files modified:** src/renderer/src/App.tsx
- **Verification:** `npm run typecheck` exits 0 after both the Task 1 and Task 2 commits.
- **Impact:** Commit-boundary shift only; the final `App.tsx` matches the plan's intended structure exactly (Timeline between NOTAS and VaultSwitcher; banner between titlebar and body). No scope change.

**2. [Rule 3 - Blocking] Removed the now-orphaned `bumpPane` callback**
- **Found during:** Task 1.
- **Issue:** `restoreVersion` (removed per plan) was `bumpPane`'s only caller; leaving `bumpPane` defined trips `noUnusedLocals`.
- **Fix:** Removed `bumpPane` too (the plan only names `restoreVersion` explicitly). `bumpAll` is retained (still used by `syncPanesToTree`).
- **Files modified:** src/renderer/src/App.tsx
- **Verification:** `npm run typecheck` exits 0.

**3. [Rule 3 - Blocking] `refreshTree` gained an optional `oidOverride` parameter**
- **Found during:** Task 1.
- **Issue:** The plan writes `setPreviewOid(oid); await refreshTree()`. Because `setPreviewOid` is async and doesn't re-render before the awaited `refreshTree()`, a `refreshTree` closure reading `previewOid` state would still see the stale value and fetch `vault.tree()` instead of `git.treeAt(oid)` — a real bug for the very first preview render.
- **Fix:** `refreshTree(oidOverride?: string | null)` uses the override when provided (`enterPreview(oid)`, `exitPreview()`/`bringBack()` pass `null`), else falls back to `previewOid` state (which stays in its deps). All other callers invoke `refreshTree()` unchanged (live present).
- **Files modified:** src/renderer/src/App.tsx
- **Verification:** `npm run typecheck` + `npm run build` exit 0.

## Known Stubs

None. All wiring is over real IPC (`git.treeAt`/`git.changes`/`git.commit`/`git.restoreTree`/`git.graph`) and the shipped presentation components.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes. The only new write path is `bringBack` → `git.restoreTree` (working-dir only) guarded by a safety `git.commit`; preview is strictly read-only. Matches the plan's `<threat_model>` (T-02-03/04/05/10 mitigations implemented as specified).

## Verification

- `npm run typecheck` exits 0 after Task 1 and Task 2.
- `npm run build` exits 0 after Task 3 (built in ~10s).
- Grep confirms the preview paths (`enterPreview`/`exitPreview`/`bringBack`) contain no `checkout`/`goToVersion`; those remain only on the pre-existing VersionGraph/BranchSwitcher paths.
- No `TimelineScrubber`/`timelineOpen`/`restoreVersion` references remain in `App.tsx`; `TimelineScrubber.tsx` deleted.
- Full non-destructive UAT (HEAD unmoved, no detached-HEAD/new branch, dirty edit preserved via safety snapshot, layout restore, read-only during preview) deferred to plan 02-06.

## Self-Check: PASSED
- FOUND: src/renderer/src/App.tsx (previewOid + enterPreview/exitPreview/bringBack + Timeline + banner)
- FOUND: src/renderer/src/index.css (.time-banner, .tl-transport, .tl-entry, .tab.ghost, .main.past tint)
- MISSING (intentionally deleted): src/renderer/src/TimelineScrubber.tsx
- FOUND commit: c37f5da (Task 1)
- FOUND commit: 7ea6614 (Task 2)
- FOUND commit: 712b350 (Task 3)

---
*Phase: 02-go-back-in-time*
*Completed: 2026-07-04*
