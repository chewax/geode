---
phase: 8
slug: versionado-avanzado-borrar-rama-contador-de-cambios
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-06
---

# Phase 8 — UI Design Contract

> Visual and interaction contract for Geode's advanced-versioning phase: styled branch-delete dialog (VER-01) + always-visible uncommitted line counter +N/-N (CHG-01). Brownfield Electron + React + TS app with hand-written CSS — this contract is derivative and reference-heavy. No new design tokens are invented; everything reuses existing patterns.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (hand-written CSS, `src/renderer/src/index.css`) |
| Preset | not applicable |
| Component library | none (custom `.modal` / `.statusbar` primitives) |
| Icon library | Lucide (`lucide-react`) — monochrome `currentColor`, never emojis/glyphs |
| Font | app default system stack (inherited; do not override) |

**Language:** all UI strings and code comments in Spanish. Títulos con mayúscula solo al inicio. Labels de botón en formato verbo+sustantivo ("Borrar rama").

**Non-negotiables carried from CLAUDE.md + CONTEXT:**
- Icons Lucide only. No emojis in JSX (the current `deleteBranch` uses a `⚠` glyph in `window.confirm` copy — replace it with a Lucide icon in the styled dialog, do not carry the glyph over).
- kebab-case class names, reuse existing classes.
- Detección de cambios SIEMPRE por content-hash vs blobs de HEAD (regla racy-git). El `+N/-N` NUNCA usa statusMatrix.

---

## Spacing Scale

Reuse the existing implicit scale (multiples of 4). No new spacing.

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Icon↔text gap inside the +N/-N counter and `.save-status` (existing `gap: 4`) |
| sm | 8px | Compact gaps inside dialog rows |
| md | 16px | `.status-left` inter-item gap (existing `gap: 16px`); modal content rhythm |
| lg | 24px | Modal padding (inherited from `.modal`) |

Exceptions: none. Do not introduce spacing values outside the existing CSS.

---

## Typography

Reuse existing sizes only (3 sizes, 2 weights — no new type scale).

| Role | Size | Weight | Line Height | Source |
|------|------|--------|-------------|--------|
| Modal heading (`.modal h2`) | 18px icon + inherited heading | 600 (semibold) | inherited | mirrors `ConfirmDeleteDialog` `<h2>` with `<Trash2 size={18} />` |
| Modal body (`.modal-sub`) | 13px | 400 (regular) | inherited | existing `.modal-sub` (color `--muted`) |
| Status bar / counter | 12px | 400 (regular) | inherited | existing `.status-left`, `.save-status` |

Weights: regular (400) for all body/status text; semibold (600) reserved for the dialog heading and any `<b>` emphasis already present. No third weight.

---

## Color

Reuse existing token palette. No new colors.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg` `#16161a` | App/window background, modal-overlay base |
| Secondary (30%) | `--panel` `#1c1c22` / `--panel-2` `#202027` / `--border` `#2a2a32` | Modal surface, status bar surface, dialog chrome |
| Accent (10%) | `--accent` `#b794f6` | NOT used by this phase's new surfaces (accent stays reserved for primary/create actions and `.branch-tag.current`). The delete dialog and counter must not borrow the purple accent. |
| Destructive | `#ff6b6b` | `button.danger` (unmerged-branch delete CTA); `-N` removed-lines count |
| Diff add (green) | `#68d391` | `+N` added-lines count |
| Muted | `--muted` `#9a9aa6` | `.modal-sub` copy; merged-branch softer state; counter when neutral context needed |

Accent reserved for: primary/create/CTA controls and the "actual" branch tag only — **never** the destructive dialog nor the +N/-N counter.

**Counter color contract (CHG-01):** `+N` uses `#68d391` (same token as `.diff-swatch-add` / `.diff-file-head.added`); `-N` uses `#ff6b6b` (same token as `.diff-swatch-del` / `.diff-file-head.deleted`). Exact reuse — do not invent a counter-specific green/red.

**Dialog color states (VER-01):**
- Branch **unmerged** (`merged === false`): confirm button is `button.danger` (`#ff6b6b`) + explicit "se pierden versiones" warning line in body.
- Branch **already merged** (`merged === true`): confirm button is the plain `<button>` (neutral, no `.danger` class), softer copy — mirrors the merged/non-destructive branch of `ConfirmRemoveVaultDialog`.

---

## Copywriting Contract

All Spanish. Replace the current `window.confirm`/`window.alert` strings entirely.

| Element | Copy |
|---------|------|
| Dialog heading (both states) | `¿Borrar la rama "{name}"?` (with a Lucide icon `size={18}`, e.g. `GitBranch` or `Trash2`) |
| Body — merged state | `La rama ya está fusionada: se puede descartar sin perder versiones.` |
| Body — unmerged state | `Esta rama tiene versiones que no están en su base. Si la borrás, esas versiones se pierden.` |
| Primary CTA — unmerged | `Borrar rama` on `button.danger` |
| Primary CTA — merged | `Borrar rama` on plain `button` (neutral) |
| Cancel (autofocus, both states) | `Cancelar` |
| Error state (replaces `window.alert`) | Show inline via `.modal-error` (existing class): `No se pudo borrar la rama.` + the underlying message when available. Do not use `window.alert`. |
| Protección de `main` | No new copy needed — `main`/`PROD` never shows a delete affordance (`canDelete` gate stays); the existing service-level guard message is retained if reached. |
| Counter (CHG-01) — has changes | `+{added}` (green) `−{removed}` (red), shown only when `added + removed > 0` |
| Counter — clean vault | render nothing (component returns null when no pending changes) |

Notes:
- The current copy contains a `⚠` emoji — drop it; the Lucide heading icon carries the severity signal.
- Titles use sentence case with only the first letter capitalized (project convention).

---

## Interaction & Placement Contracts

### VER-01 — Branch-delete dialog (mirror `ConfirmDeleteDialog`)

- **Component:** new dialog analogous to `ConfirmDeleteDialog.tsx` (recommended name `ConfirmDeleteBranchDialog.tsx`). Structure: `.modal-overlay` > `.modal` > `<h2>` (Lucide icon + heading) > `.modal-sub` body line(s) > `.modal-actions` (Cancelar + confirm).
- **Single entry point:** the branch menu inside `VersionGraph` (the `.branch-del` `Trash2` button, `VersionGraph.tsx` ~608). Make that option clearer/more visible, but do NOT add delete entries to `BranchSwitcher` or the toolbar (deferred/rejected in CONTEXT).
- **Wiring:** `App.deleteBranch(name, merged)` (~778) opens this dialog instead of calling `window.confirm`; on confirm it runs the existing `window.geode.git.deleteBranch(name)` + refresh flow (`refreshTree`/`refreshGraph`/`refreshGithub` already in place). `merged` is already computed in `VersionGraph` via `mergedBranchNames`.
- **Keyboard safety (MANDATORY — Phase 6 CR-01 lesson: Enter must NOT delete):**
  - `Cancelar` has `autoFocus`.
  - Container `onKeyDown` handles ONLY `Escape` → `onClose()`. There is NO container-level Enter→confirm binding, so a reflexive Enter activates the focused `Cancelar` and cancels.
  - Deleting requires an explicit click on the confirm button (or Tab to it + activate). Copy this exact pattern from `ConfirmDeleteDialog` / `ConfirmRemoveVaultDialog`.
- **Overlay dismissal:** click on `.modal-overlay` cancels; `.modal` stops propagation (existing pattern).

### CHG-01 — Uncommitted line counter (+N/-N)

- **Always visible** (VSCode-style), NOT gated by Modo Avanzado. Renders only when there are pending changes; disappears when the vault is clean.
- **Placement:** in the status bar `.status-left` (`App.tsx` ~1266), alongside `palabras / caracteres / líneas` and the `.save-status` (STAT-01). Place the counter AFTER the word/char/line stats and BEFORE or adjacent to `.save-status` so the two do not compete: the humanized save-status (STAT-01) communicates *state*, the +N/-N communicates *magnitude*. Keep them as sibling `<span>`s in `.status-left` separated by the existing `16px` gap.
- **Visual form:** a single inline `<span>` (new class e.g. `.line-stat`) containing two child spans — `+{added}` styled `#68d391`, `−{removed}` styled `#ff6b6b`, `4px` internal gap, `12px` font (matches `.save-status`). No icon required (numbers + color carry meaning); if an icon is desired keep it Lucide + `size={14}` consistent with neighbors.
- **Data source:** new `pendingLineStat(dir): { added, removed }` in `git.ts` over ALL pending files (not just `.md`), reusing `pendingChanges`/`commitDiff`/jsdiff machinery, content-hash vs HEAD blobs (never statusMatrix). Exposed via a typed `geode:git-*` IPC channel (e.g. `geode:git-pending-linestat`) + preload bridge.
- **Refresh cadence:** recompute at the same moments the save-status / tree already refresh (`onSaved` / `onChange` / `refreshTree`). No AI invocation (cost constraint).

---

## Component Inventory

| Component | Status | Reference |
|-----------|--------|-----------|
| `ConfirmDeleteBranchDialog` (branch delete) | NEW — clone of `ConfirmDeleteDialog.tsx` | `src/renderer/src/ConfirmDeleteDialog.tsx`, `ConfirmRemoveVaultDialog.tsx` |
| Line-stat counter span | NEW — inline in status bar | `src/renderer/src/App.tsx` `.status-left` ~1266 |
| `.modal` / `.modal-sub` / `.modal-actions` / `.modal-error` | REUSE | `index.css` ~1441 |
| `button.danger` | REUSE | `index.css` ~79 (`#ff6b6b`) |
| Diff color tokens `#68d391` / `#ff6b6b` | REUSE | `index.css` `.diff-swatch-add/del` ~2125 |
| `VersionGraph` branch menu `.branch-del` | MODIFY (clarity/visibility only) | `VersionGraph.tsx` ~608 |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none (no shadcn / no third-party registry) | none | not applicable |

No component registry in this project; all UI is hand-written. Registry vetting gate: not applicable.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
