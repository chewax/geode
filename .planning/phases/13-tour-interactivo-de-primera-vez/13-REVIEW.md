---
phase: 13-tour-interactivo-de-primera-vez
reviewed: 2026-07-09T17:32:18Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/shared/ipc.ts
  - src/main/services/settings.ts
  - src/main/index.ts
  - src/preload/index.ts
  - src/renderer/src/tour/steps.ts
  - src/renderer/src/TourOverlay.tsx
  - src/renderer/src/tour/useTour.ts
  - src/renderer/src/App.tsx
  - src/renderer/src/ActivityBar.tsx
  - src/renderer/src/index.css
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-09T17:32:18Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the first-run guided tour (custom `TourOverlay` — the repo's first `createPortal`
usage — plus the `useTour` tri-state hook and its IPC/settings plumbing). The lifecycle
code is careful: every `addEventListener`/`ResizeObserver.observe` in `TourOverlay.tsx` is
paired with cleanup, the anchor-measurement degrades gracefully to a centered card when the
anchor is missing/zero-area/huge, and the tri-state machine (`unseen → started → seen`,
"reappear once") was traced end-to-end and behaves correctly, including the
new-vault-creation race between the mount/recovery effect and `startFirstRun` (verified
harmless because the persisted end-state converges correctly regardless of ordering).
`geode:tour-set` is defensively coerced server-side to the 3-value enum, matching the
`geode:backup-onboarding-set` precedent — no arbitrary payload can be persisted. All four
`data-tour` anchors (`escribir`, `guardar`, `respaldo`, `historial`) are wired on Capa-0
controls only; none of the advanced-gated git buttons (branch/merge/graph) carry an anchor,
and the `core.tour` re-launch command lives in the non-advanced command block. The
"respaldo" step copy is correctly instructive/future-tense (STAT-01 compliant). `tsc --noEmit`
is clean for both the node and web TypeScript projects.

The issues found are all around the tour's "modal-like" claim not being fully enforced:
the overlay visually looks like it should block/highlight interaction, but keyboard
shortcuts and Tab-focus can still reach and activate the real UI underneath it, and the
CSS doesn't actually deliver on the `.tour-spotlight` comment's implied click-through
behavior either way. None of these cause data loss or crashes; they're flagged as Warnings.

## Warnings

### WR-01: Global keyboard shortcuts and Tab-focus escape the tour, opening modals invisibly behind it

**File:** `src/renderer/src/App.tsx:990-999` (Ctrl/Cmd+S), `src/renderer/src/App.tsx:1147-1159` (Ctrl/Cmd+P, Ctrl+\\)

**Issue:** The tour overlay is styled like a modal (`z-index: 300/301`, reuses the
`.modal-overlay` dim pattern per the comment at `index.css:3087-3091`) and visually blocks
the rest of the app. However:

1. The global `keydown` listeners for "Guardar versión" (Ctrl/Cmd+S) and "Paleta de
   comandos" (Ctrl/Cmd+P) / "Dividir editor" (Ctrl+\\) in `App.tsx` are registered
   unconditionally and never check `tour.active`. Step 2 of the tour ("Marcá una versión")
   literally advertises the `Ctrl+S` shortcut on the spotlighted button's tooltip
   (`title="Crear versión (Ctrl+S)"`, `App.tsx:1325`), inviting the exact keypress that
   opens `CommitDialog`.
2. `CommitDialog` and `CommandPalette` render via `.modal-overlay` (`z-index: 100`,
   see `CommitDialog.tsx:67`, `CommandPalette.tsx:57`), which is **below** the tour's
   `z-index: 300`. Triggering either while the tour is active opens the dialog
   invisibly, fully obscured by the tour's dimmed backdrop.
3. Because the tour overlay only affects *pointer* hit-testing indirectly (see WR-02) and
   does not `inert`/`aria-hidden` the rest of the DOM, the background dialog also remains
   focusable/keyboard-operable while hidden.

Net effect: a user who presses Ctrl+S (or Ctrl+P) while the tour is open gets no visible
feedback, and the previously-invoked dialog "pops into view" unexpectedly the moment the
tour is dismissed (Esc/Saltar/Listo) — a confusing, hard-to-diagnose UX bug directly
caused by this phase's new highest-z-index layer.

**Fix:** Gate the global shortcut handlers on `!tour.active`, e.g.:
```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (tour.active) return // el recorrido guiado absorbe el teclado global
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void openCommitDialog()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [openCommitDialog, tour.active])
```
Apply the same guard to the Ctrl+P/Ctrl+\\ handler. Consider also adding
`inert` (or `aria-hidden="true"` + `tabIndex={-1}` sweep) to the app shell's root while
`tour.active` is true, so Tab navigation can't reach/activate background controls either.

---

### WR-02: `.tour-overlay` blocks all pointer interaction, contradicting the `.tour-spotlight` "no captura clics" comment

**File:** `src/renderer/src/index.css:3092-3109`

**Issue:** `.tour-spotlight` is documented as "No captura clics" (`index.css:3100`), implying
the highlighted real control should remain clickable through the spotlight cutout. In
practice it can't: `.tour-overlay` (`position: fixed; inset: 0; z-index: 300;`) has no
`pointer-events` declaration, so it defaults to `pointer-events: auto` and, being a
full-viewport sibling/parent layer above the real app, intercepts every click — including
clicks landing inside the spotlighted rect — before they can reach the real anchor
underneath. `.tour-spotlight`'s own `pointer-events: none` only affects hit-testing on the
decorative rectangle itself; it does not make the parent `.tour-overlay` transparent to
clicks.

This may be an intentional "look, don't touch" design (consistent with reusing the
`.modal-overlay` blocking pattern), in which case the comment is misleading and should be
corrected. If pass-through interactivity was actually intended (as the comment suggests),
the CSS doesn't deliver it.

**Fix:** Either:
- Confirm blocking is intentional and fix the comment to stop implying the anchor stays
  clickable, e.g. `/* Decorativo: el bloqueo de clicks lo hace .tour-overlay, no este recorte */`, or
- If pass-through was intended, add `pointer-events: none` to `.tour-overlay` and
  `pointer-events: auto` back on `.tour-card` (the only element that needs to capture
  clicks):
```css
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  pointer-events: none;
}
.tour-card {
  pointer-events: auto;
  /* ...existing... */
}
```

---

### WR-03: Recovery effect can transiently clobber `tourState` set by a concurrent `startFirstRun`

**File:** `src/renderer/src/tour/useTour.ts:106-119`

**Issue:** The mount/recovery effect re-runs on every `vaultReady` transition and
unconditionally does `setTourState(snap.state)` from a freshly-fetched
`window.geode.tour.get()` snapshot before checking the recovery condition. During
first-vault creation (`App.tsx` `createLocalVault`), `vaultReady` flips `true` when
`adoptVault` calls `setVault`, re-running this effect concurrently with the later
`await tour.startFirstRun()` call further down the same async function. If the effect's
`tour.get()` IPC round-trip resolves *after* `startFirstRun` has already persisted
`'started'` and locally set `tourState`, the effect's `setTourState(snap.state)` would
still be applied with the **stale** pre-fetch value (`'unseen'`), because the fetch itself
was issued before `startFirstRun` ran, transiently reverting `tourState`/`tourStateRef`
even though `active` stays `true` and the persisted setting is correctly `'started'`.

In the traced flow this is currently harmless — `close()` treats anything `!== 'seen'` as
"needs to persist seen", so the final persisted state converges correctly regardless of
this in-memory hiccup — but it's a fragile pattern (two independent async writers to the
same piece of state with no sequencing/"latest wins" guard) that would be easy to turn into
a real bug with a future change (e.g. any code path that reads `tourState` mid-flight to
decide something other than the terminal "seen" check).

**Fix:** Make the ordering explicit instead of relying on incidental timing, e.g. track a
monotonically increasing "fetch token" and ignore stale responses, or simply don't
overwrite `tourState` from the recovery effect when `oneShotRef.current` is already `true`
(it means a more authoritative write — either `startFirstRun` or the recovery branch
itself — already happened this session):
```ts
useEffect(() => {
  void (async () => {
    const snap = await window.geode.tour.get()
    if (oneShotRef.current) return // ya hubo una escritura más autoritativa esta sesión
    setTourState(snap.state)
    if (snap.state === 'started' && vaultReady) {
      oneShotRef.current = true
      launch()
      await window.geode.tour.set('seen')
      setTourState('seen')
    }
  })()
}, [vaultReady, launch])
```

## Info

### IN-01: `.tour-card`'s `role="dialog"` is missing `aria-modal="true"`

**File:** `src/renderer/src/TourOverlay.tsx:213-216`
**Issue:** Screen readers won't be told the rest of the page is inert while the coach-mark
is open, which is also consistent with WR-01's lack of an actual interaction block.
**Fix:** Add `aria-modal="true"` to the `role="dialog"` element (and pair with a real
inert/focus-trap fix from WR-01 for it to be meaningful).

### IN-02: `TourStep['placement']` declares an unused `'center'` variant

**File:** `src/renderer/src/tour/steps.ts:23`, `src/renderer/src/TourOverlay.tsx:80-100`
**Issue:** None of the 4 fixed `TOUR_STEPS` use `placement: 'center'`; it's handled only by
`computeCardPos`'s `default` branch. Speculative/dead union member.
**Fix:** Either drop `'center'` from the type until a step needs it, or leave as documented
future-proofing — low priority, no behavior risk.

### IN-03: `.tour-card` has no `max-height`/`overflow-y` guard

**File:** `src/renderer/src/index.css:3112-3122`
**Issue:** On a very short viewport (small window height), a long body string plus footer
could theoretically overflow past the screen edge before `computeCardPos`'s clamp has a
chance to account for content that grows taller than expected. Current copy is short and
fixed, so risk is low today.
**Fix:** Add `max-height: calc(100vh - 32px); overflow-y: auto;` defensively.

---

_Reviewed: 2026-07-09T17:32:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
