---
phase: 13-tour-interactivo-de-primera-vez
reviewed: 2026-07-09T19:10:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/renderer/src/App.tsx
  - src/renderer/src/tour/useTour.ts
  - src/renderer/src/index.css
  - src/renderer/src/TourOverlay.tsx
  - src/renderer/src/BackupButton.tsx
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
resolution: "Click-through variant fixed in f47acff (velo .tour-overlay pointer-events:auto absorbe clics; spotlight cosmético pointer-events:none; velo sin onClick = no cierra el tour). WR-01/02/03 + IN-01/02/03 previamente resueltos (4273b1a, 7249f6b, 5446665, 16f5557). typecheck + build verde."
---

# Phase 13: Code Review Report (re-review)

**Reviewed:** 2026-07-09T19:10:00Z
**Depth:** standard
**Files Reviewed:** 5 (scoped to the fix set for WR-01/02/03 + IN-01/02/03; full file list of the
original review remains valid for anything not touched by this fix round)
**Status:** issues_found

## Summary

Re-reviewed the fixes applied for the six findings from the prior `13-REVIEW.md` pass. Ran
`npm run typecheck` (node + web) and `npm run build` — both green, no errors.

**Verified resolved, no regression:**

- **WR-01 (keyboard shortcuts escape the tour):** `tourActiveRef` (`App.tsx:993-994`) mirrors
  `tour.active` on every render and is read at the top of both global `keydown` handlers
  (`App.tsx:999` for Ctrl/Cmd+S, `App.tsx:1157` for Ctrl/Cmd+P and Ctrl+\\), each with an
  early `return` before any other logic. Confirmed there are only these two global `keydown`
  listeners in `App.tsx` (grepped `addEventListener('keydown'`) — no other shortcut was
  collaterally disabled. `useTour`'s own Esc handler (`useTour.ts:129-136`) is a separate
  effect gated on `active` directly (not the ref) and is untouched by this fix, so Esc still
  closes the tour. However, see **WR-01 (new)** below — the keyboard-only scope of this fix
  leaves a mouse-click path to the identical underlying bug wide open.
- **WR-02 (`.tour-overlay` blocked all clicks):** `index.css:3096-3101` now sets
  `.tour-overlay { pointer-events: none }` and `index.css:3120-3131` sets
  `.tour-card { pointer-events: auto }`. `.tour-spotlight` (`index.css:3106-3114`) keeps its
  pre-existing `pointer-events: none`, so it doesn't re-block the cutout. Card buttons
  (Saltar/Anterior/Siguiente/Listo) remain clickable (they live inside `.tour-card`), and the
  veil no longer intercepts clicks elsewhere. No other overlay child needed an explicit
  `pointer-events` override. This fix is correct as scoped — but see the new finding below for
  a side effect of combining it with WR-01's keyboard-only gate.
- **WR-03 (recovery effect could clobber `startFirstRun`'s write):** the guard
  (`if (oneShotRef.current) return`) in `useTour.ts:114` now sits before `setTourState(snap.state)`,
  matching the suggested fix exactly. Traced both interleavings of the two concurrent
  `tour.get()` fetches (mount-time fetch with stale `vaultReady=false` vs. the
  `vaultReady=true` re-fire during `createLocalVault`): regardless of which async response
  lands first, at most one write to `tourState`/`oneShotRef` "wins" and the guard correctly
  discards the stale one. Fresh-mount recovery (existing vault, `started` state at startup) is
  unaffected — `oneShotRef.current` starts `false`, so the very first authoritative fetch
  still runs the recovery branch normally. No regression.
- **IN-01 (`aria-modal` missing):** `TourOverlay.tsx:216` now sets `aria-modal="true"` on the
  `role="dialog"` element. No layout/behavior change.
- **IN-02 (`'center'` placement unused):** left as-is (matches the review's own "leave as
  documented future-proofing" option); `TOUR_STEPS` in `steps.ts` still has zero steps using
  `placement: 'center'`, and `computeCardPos`/the `centered` derivation in `TourOverlay.tsx`
  still handle it correctly via the `default`/fallback branch. No behavior risk, nothing to
  verify beyond "still compiles and is still dead code by design."
- **IN-03 (`.tour-card` missing `max-height`/`overflow-y`):** `index.css:3120-3125` now has
  `max-height: calc(100vh - 32px); overflow-y: auto;`, matching the suggested fix. No
  regression to placement/clamp logic in `TourOverlay.tsx` (`computeCardPos` measures the
  card's real `getBoundingClientRect()` after this CSS applies, so the clamp still uses the
  correct, now-capped, height).
- Graceful degradation (null/huge rect → centered card), Capa-0-only `data-tour` anchors (none
  on advanced-gated buttons — confirmed `guardar`, `historial`, `escribir`, `respaldo` are all
  outside any `advanced &&` block), and listener/`ResizeObserver` cleanup in `TourOverlay.tsx`
  are all unchanged and still correct.

**One new issue found**, caused by the *interaction* of the WR-01 and WR-02 fixes (each correct
in isolation) — see below.

## Warnings

### WR-01: WR-02's click pass-through reopens WR-01's "modal hidden behind the tour" bug via mouse, for the two exact buttons the tour highlights

**File:** `src/renderer/src/App.tsx:1332-1340` (`data-tour="guardar"` button →
`openCommitDialog()`), `src/renderer/src/App.tsx:1704-1712` (unguarded `CommitDialog` render),
`src/renderer/src/BackupButton.tsx:82-93` (`data-tour="respaldo"` button → `onOpenWizard()`),
`src/renderer/src/App.tsx` (unguarded `BackupWizard` render, `backupWizardOpen`)

**Issue:** The original WR-01 fix only gated the *global keyboard* listeners
(Ctrl+S/Ctrl+P/Ctrl+\\) on `tourActiveRef.current`. It did not — and per its own scope,
couldn't — gate the `onClick` handlers of the real DOM buttons, because those clicks were
previously unreachable: before the WR-02 fix, `.tour-overlay` had implicit
`pointer-events: auto` and physically blocked every click, including on the spotlighted
anchor.

The WR-02 fix intentionally removes that blocking (`pointer-events: none` on `.tour-overlay`,
per the locked "clic fuera no rompe" requirement) so users *can* click through the spotlight
cutout onto the real, highlighted control. That is by design. But two of the four tour steps
spotlight buttons whose `onClick` opens a real modal, and **neither the button nor the modal
checks `tour.active`**:

1. **Step 2 ("Marcá una versión")** spotlights the `data-tour="guardar"` button
   (`App.tsx:1332-1340`), whose `onClick` calls `openCommitDialog()` unconditionally. If there
   are pending changes, this sets `commitChanges`, and `CommitDialog` renders
   (`App.tsx:1704-1712`) with no `tour.active` guard — unlike `BackupCard`, which explicitly
   checks `!tour.active` (`App.tsx:1368`) for exactly this reason.
2. **Step 3 ("Respaldá en la nube")** spotlights the `data-tour="respaldo"` button
   (`BackupButton.tsx:88-93`). For a freshly created vault (`backedUp === false`, the common
   first-run case this tour targets), `handleClick` unconditionally calls `onOpenWizard()`
   (`BackupButton.tsx:82-85`), which sets `backupWizardOpen`. `BackupWizard` also renders
   unguarded and uses `.modal-overlay` (z-index 100, confirmed via
   `BackupWizard.tsx:90` → `className="modal-overlay"`).

Both `CommitDialog` and `BackupWizard` render at `.modal-overlay`'s `z-index: 100`, well below
the tour's `.tour-overlay`/`.tour-spotlight` (`z-index: 300`) and `.tour-card`
(`z-index: 301`). Clicking either spotlighted button while the tour is active therefore opens
a real modal that is instantly obscured by the tour's dark spotlight veil — exactly the
"invisible dialog that pops into view once the tour closes" bug WR-01 described, except this
path is reachable by mouse on the two controls the tour is actively drawing the user's
attention to (a spotlight strongly implies "you can interact with this"), and it did **not**
exist before the WR-02 fix (clicks were fully blocked then). In other words, fixing WR-02 as
specified silently reopened a mouse variant of WR-01 that the original fix's scope (keyboard
listeners only) never covered.

**Fix:** Gate the click-triggered side effects the same way the keyboard handlers are gated,
using the same `tour.active`/`tourActiveRef` idiom already established in this file, e.g.:
```tsx
// App.tsx — "guardar" button
onClick={() => { if (!tour.active) void openCommitDialog() }}

// App.tsx — CommitDialog render
{commitChanges && !tour.active && (
  <CommitDialog ... />
)}
```
```tsx
// BackupButton.tsx — accept a `disabled`/`tourActive` prop (or gate at the call site in
// App.tsx before passing onOpenWizard/onForcePush) so handleClick no-ops while the tour owns
// the button it's spotlighting:
const handleClick = (): void => {
  if (tourActive) return
  if (!backedUp || failed) onOpenWizard()
  else if (!backingUp) onForcePush()
}
```
and gate the `BackupWizard` render the same way `BackupCard` already is (`&& !tour.active`).
Alternatively, if clicking the spotlighted "guardar"/"respaldo" controls mid-tour is meant to
be a valid escape hatch (skip the tour by just doing the real action), then `tour.skip()`
should be invoked alongside the click so the tour closes cleanly instead of leaving a hidden
modal stacked underneath it — either resolution is acceptable, but the current unguarded state
is not.

---

_Reviewed: 2026-07-09T19:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
