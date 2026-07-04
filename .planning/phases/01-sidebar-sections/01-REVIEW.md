---
phase: 01-sidebar-sections
reviewed: 2026-07-03T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/renderer/src/ActivityBar.tsx
  - src/renderer/src/SidebarSection.tsx
  - src/renderer/src/VaultSwitcher.tsx
  - src/renderer/src/App.tsx
  - src/renderer/src/index.css
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-03
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the Phase 1 "Sidebar Sections" renderer-only restructure: the new `SidebarSection`
collapsible primitive, the new `ActivityBar` rail, the `VaultSwitcher` refactor (popover →
in-flow disclosure at the sidebar bottom), the `notesActions` memo + sidebar/aside region in
`App.tsx`, and the related `index.css` blocks.

Scope was limited to the phase's changes. Structure is generally clean, Spanish strings and
Lucide icons are consistent with project conventions, emojis were correctly removed from the
empty-state copy, and `localStorage` persistence in `SidebarSection` is read defensively. No
security issues were found (renderer-only UI, no injection surface, no secrets).

Two real interaction/accessibility defects were found in `SidebarSection`'s header, both
stemming from the header being a `role="button"` div that wraps interactive action buttons.
The remaining items are dead CSS, stale comments, and carried-over keyboard-accessibility gaps.

## Warnings

### WR-01: Keyboard activation of a header action button also toggles the section collapse

**File:** `src/renderer/src/SidebarSection.tsx:48-56, 77-81`
**Issue:** The section header `<div>` owns `onKeyDown` (lines 48-56), which toggles collapse on
`Enter` / `Space`. The actions container only stops **click** propagation (`onClick` at line 78),
not keydown. Action buttons (Nueva nota, Nueva carpeta, orden, expandir/colapsar) are children of
the header, so a `keydown` fired while one of them has focus bubbles to the header's `onKeyDown`.
Consequences for a keyboard user tabbed into the revealed actions:
- Pressing `Enter` on an action button runs the button's `onClick` **and** toggles the section.
- Pressing `Space` is worse: the header calls `e.preventDefault()`, which cancels the button's
  own native activation, so `Space` collapses the section instead of performing the action.

The actions are only visible on hover / `:focus-within`, so this is exactly the path a keyboard
user hits when operating them.
**Fix:** Ignore keydown that did not originate on the header itself:
```tsx
const onKeyDown = useCallback(
  (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return // no capturar teclas de las acciones internas
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  },
  [toggle]
)
```
(Alternatively, add `onKeyDown={(e) => e.stopPropagation()}` to the `.sidebar-section-actions`
container, but the `e.target !== e.currentTarget` guard is more robust.)

### WR-02: `role="button"` header contains nested interactive buttons (invalid a11y semantics)

**File:** `src/renderer/src/SidebarSection.tsx:60-82`
**Issue:** The header `<div role="button" tabIndex={0}>` wraps the `<div className="sidebar-section-actions">`
which renders the `actions` prop — a set of `<button>` elements (see `notesActions` in
`App.tsx:772-800`). Interactive controls nested inside an element with an interactive role is
invalid ARIA/HTML: assistive tech announces a button-inside-a-button, focus/activation semantics
are ambiguous, and it is the root cause enabling WR-01. VSCode's own explorer headers avoid this
by not making the whole header a single `role="button"` when it hosts action buttons.
**Fix:** Make only the twisty+label region the toggle target (e.g. a real `<button>` wrapping the
chevron and `sidebar-section-label`), and render the actions as siblings of that button rather than
descendants of the `role="button"` element. This also removes the keydown-bubbling surface in WR-01.

## Info

### IN-01: Dead CSS rule `.sidebar-tree` with stale comment

**File:** `src/renderer/src/index.css:345-350`
**Issue:** `App.tsx` no longer renders any element with class `sidebar-tree` (it was replaced by
`<SidebarSection>` / `.sidebar-section-body`). The rule at lines 345-350 is now dead code, and its
comment ("ocupa el alto entre toolbar y footer") references a toolbar and footer that no longer
exist. Confirmed via grep: `sidebar-tree` appears only in CSS, never in TSX.
**Fix:** Delete the `.sidebar-tree` block. The scrolling role is now covered by `.sidebar-section-body`
(lines 407-411).

### IN-02: Stale layout comment on `.sidebar`

**File:** `src/renderer/src/index.css:310`
**Issue:** The comment describes the sidebar as "explorador estilo Obsidian: toolbar · árbol ·
footer", but the structure changed to `SidebarSection` (NOTAS) + `.vault-header`. The `toolbar`
and `footer` are gone (`.sidebar-toolbar` / `.sidebar-footer` were removed).
**Fix:** Update the comment to reflect the section + vault-header layout.

### IN-03: Vault-menu list items are not keyboard-operable

**File:** `src/renderer/src/VaultSwitcher.tsx:59-91`
**Issue:** The vault list, separator, and management entries are clickable `<li>` elements with
`onClick` but no `role`, `tabIndex`, or key handler — they cannot be reached or activated by
keyboard. This is inconsistent with the keyboard support the phase adds to `SidebarSection`. Note:
this pattern was carried over unchanged from the previous `VaultSwitcher`, so it is a pre-existing
gap surfaced (not newly introduced) by the refactor.
**Fix:** Render the options as `<button>`s (or add `role="menuitem" tabIndex={0}` + `onKeyDown`
handling Enter/Space), matching the keyboard affordances added elsewhere this phase.

### IN-04: In-flow vault disclosure no longer closes on outside interaction

**File:** `src/renderer/src/VaultSwitcher.tsx:37-44, 57`
**Issue:** The refactor dropped the `.vault-overlay` click-catcher that the old popover used, so
the disclosure now only closes via `Escape`, re-clicking the trigger, or selecting an item. Clicking
elsewhere in the app (e.g. a note in the tree) leaves it open, keeping the notes section pushed up.
The component doc comment documents this as intentional ("Se cierra con Escape"), so this is a
heads-up rather than a defect.
**Fix (optional):** If closing on outside click is desired, add a lightweight `pointerdown`
listener on `document` (guarded by `open`, ref-scoped to `.vault-header`) mirroring the Escape
handler; otherwise no change needed.

---

_Reviewed: 2026-07-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
