---
phase: 05-advanced-mode-capa-0-polish
reviewed: 2026-07-05T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/main/services/settings.ts
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/main/index.ts
  - src/renderer/src/SettingsModal.tsx
  - src/renderer/src/DiffView.tsx
  - src/renderer/src/App.tsx
  - src/renderer/src/index.css
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-05
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 5 wires a persisted `advanced` flag through settings → ipc → preload → main → renderer and uses it to gate every git surface, humanizes the save-status indicator (STAT-01) and the diff viewer (DIFF-01/02), and rewrites the GitHub popover/tooltip copy. I traced the flag round-trip, the command-palette gating/dispose lifecycle, the STAT-01 state matrix, and the `patchLines()` parser edge cases.

The mechanical work is solid: the advanced flag lifecycle has no stale-closure or race defect, the command-palette git commands are correctly registered in a dedicated `[advanced, host]` effect that `dispose()`s on toggle-off (no leak, no double-register — `host` is a stable ref, `registerCommand` is Map-keyed by id), every gated toolbar/statusbar/graph surface is both hidden and non-invocable in default mode, no keyboard shortcut bypasses the palette gating, the old `✓`/`●` glyphs and `toLocaleTimeString()` are gone, and `patchLines()` cannot misparse a content line beginning with `@@` or `\` (content lines always carry a `+`/`-`/space prefix, which is checked before the `@@`/`\ No newline` markers). Change-detection was untouched.

One real trust defect stands out: the "Todo en la nube" state can assert cloud safety for edits that live only on local disk. The rest are Info-level dead code / consistency nits.

## Warnings

### WR-01: "Todo en la nube" overstates cloud safety for uncommitted disk edits

**File:** `src/renderer/src/App.tsx:1373-1400` (definition), `src/renderer/src/App.tsx:1126-1136` (usage), `src/renderer/src/App.tsx:363-367` (`onPaneSaved`)

**Issue:** The two axes fed to `statusLabel(status, githubConnected, pushCount)` are independent. `status === 'saved'` means the file was autosaved **to disk** (`onPaneSaved` sets it; a disk write, not a git commit — see `onPaneNoteChange`→`'saving'`, `onPaneSaved`→`'saved'`). `pushCount` reflects **committed-but-unpushed** commits and is not refreshed by a disk save. Consequently, during normal typing with GitHub connected and a previously-pushed HEAD (`pushCount === 0`), the indicator continuously reads **"Todo en la nube"** even though the freshly edited content has been neither committed nor pushed — it exists only on the local disk. For an app whose core value is "you can never lose anything," telling the user everything is in the cloud while their latest edits are not even a local commit is a genuine trust regression (the previous label was the neutral "✓ guardado {hora}", which made no cloud claim). Following the spec's literal state matrix reproduced the flaw rather than avoiding it.

**Fix:** Require the working tree to be clean (no pending, uncommitted changes) before showing "Todo en la nube" — fold in a pending-changes signal so disk-saved-but-uncommitted content maps to "Guardado en este dispositivo":

```ts
// pass a hasUncommitted flag (derive from the existing content-hash pending check)
case 'saved':
  return githubConnected && pushCount === 0 && !hasUncommitted
    ? { text: 'Todo en la nube', Icon: Cloud }
    : { text: 'Guardado en este dispositivo', Icon: HardDrive }
```

Alternatively, treat any `status === 'saved'` (i.e. edits since the last version) as device-only until a commit occurs. Either way, "Todo en la nube" must not be shown while uncommitted edits exist.

## Info

### IN-01: Dead CSS rule `.diff-oid`

**File:** `src/renderer/src/index.css:2048-2052`

**Issue:** The `<span className="diff-oid">{oid.slice(0,7)}</span>` was removed from `DiffView.tsx` (replaced by `headLabel()`). The rule is now unreferenced. `noUnusedLocals` does not cover CSS, so it lingers silently.

**Fix:** Delete the `.diff-oid { ... }` block.

### IN-02: Dead CSS rule `.diff-ln.hunk`

**File:** `src/renderer/src/index.css:2121-2124`

**Issue:** `patchLines()` no longer emits `kind: 'hunk'` — `LnKind` is now `'add' | 'del' | 'divider' | 'ctx'`, and `@@` lines render as `.diff-ln.divider`. The `.diff-ln.hunk` rule is unreachable.

**Fix:** Delete the `.diff-ln.hunk { ... }` block.

### IN-03: Diff legend/swatch/divider colors hardcoded inline instead of using the CSS design system

**File:** `src/renderer/src/DiffView.tsx:118-160` (`SWATCH_ADD_STYLE`/`SWATCH_DEL_STYLE`/`DIVIDER_STYLE`/`LEGEND_STYLE`)

**Issue:** The new diff legend, swatches, and divider are styled via inline `CSSProperties` constants with hardcoded hex (`#68d391`, `#ff6b6b`). These are the same semantic colors already defined in the hand-written CSS design system (`.diff-ln.add` uses `rgba(104,211,145,…)` = `#68d391`; `.diff-ln.del` uses `#ff6b6b`). This duplicates design tokens as magic values and deviates from the project convention (all other diff styling lives in `index.css` as kebab-case classes). The already-present `.diff-legend`/`.diff-swatch-add`/`.diff-swatch-del` class names on the elements are unstyled.

**Fix:** Move these styles into `index.css` under the existing `.diff-*` block and drop the inline `style` constants, or at minimum reference the semantic colors from a shared source rather than re-hardcoding hex in two places.

### IN-04: Redundant unassociated `<label>` for the Modo Avanzado switch

**File:** `src/renderer/src/SettingsModal.tsx:199-208`

**Issue:** `<label className="field-label">Modo Avanzado</label>` has no `htmlFor` and wraps nothing, while the actual control is the separate wrapping `<label className="switch-row">` that contains the checkbox. Two labels reference one control; the `.field-label` one is a dangling label element (harmless, but semantically noise for assistive tech).

**Fix:** Use a plain `<div className="field-label">` for the caption, or give the checkbox an `id` and point a single `<label htmlFor>` at it.

### IN-05: `graphOpen` is not reset when Advanced mode is toggled off

**File:** `src/renderer/src/App.tsx:1099`

**Issue:** The VersionGraph modal render is gated by `advanced && graphOpen && graph`, but toggling Advanced off does not reset `graphOpen`. If the user had the graph open, disabled Advanced, then re-enabled it, the graph modal reappears unexpectedly on re-enable because the stale `graphOpen === true` persists. Minor UX surprise, no data risk.

**Fix:** Reset `setGraphOpen(false)` when the flag transitions to false (e.g. in `refreshAdvanced` when the new value is false, or in the `[advanced]` effect).

---

_Reviewed: 2026-07-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
