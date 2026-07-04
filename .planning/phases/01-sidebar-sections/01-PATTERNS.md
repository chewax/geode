# Phase 1: Sidebar Sections - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 4 (1 new, 3 modified)
**Analogs found:** 4 / 4

All work is renderer-only (`src/renderer/src/`). No IPC, main-process, or git-logic changes. Every mechanism this phase needs already exists in the codebase; the work is restructuring + styling, not building new primitives. All analogs are first-party files in the same directory.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/renderer/src/SidebarSection.tsx` (NEW) | component (collapsible container primitive) | event-driven (toggle) + localStorage persistence | `src/renderer/src/FileTree.tsx` (twisty + local collapse state) + `App.tsx:115-118,379-382` (localStorage idiom) | exact (composite) |
| `src/renderer/src/VaultSwitcher.tsx` (MODIFY → in-flow header) | component (disclosure) | event-driven (open/close) + request-response (onSwitch) | itself — in-place refactor of the popover it already is | exact (self) |
| `src/renderer/src/App.tsx` (MODIFY — sidebar JSX L855-926) | component (renderer shell / composition root) | request-response (owns handlers, threads props) | its own existing `.sidebar-toolbar`/`.sidebar-footer` block | exact (self) |
| `src/renderer/src/index.css` (MODIFY — add/adapt/retire classes) | config (stylesheet) | n/a | its own `.sidebar-toolbar` (L345-374), `.vault-menu` (L451-506), `.tree-empty` (L612-616) | exact (self) |

`src/renderer/src/FileTree.tsx` is **reused verbatim** (rendered inside the Notes section body) — zero prop or behavior changes. It is a pattern donor, not a file to modify.

## Pattern Assignments

### `src/renderer/src/SidebarSection.tsx` (NEW — component, event-driven + persistence)

**Primary analog A (twisty toggle + local collapse state):** `src/renderer/src/FileTree.tsx`
**Primary analog B (localStorage lazy-init + write-on-change):** `src/renderer/src/App.tsx` (`sidebarWidth`)

**Imports pattern** — copy the `import type { JSX }` + named-hook + Lucide-twisty convention. From `FileTree.tsx:1-4`:
```typescript
import { useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Folder, FileText, Trash2 } from 'lucide-react'
import type { TreeNode } from '@shared/ipc'
```
For `SidebarSection` use only what it needs: `import { useState, useCallback } from 'react'`, `import type { JSX, ReactNode } from 'react'`, `import { ChevronDown, ChevronRight } from 'lucide-react'`. Note the codebase convention: `import type` for type-only symbols (CLAUDE.md), props interface named `SidebarSectionProps` and exported.

**Twisty toggle pattern** — the exact expanded/collapsed chevron idiom to reuse, from `FileTree.tsx:120`:
```typescript
{expanded ? <ChevronDown className="twisty" size={14} /> : <ChevronRight className="twisty" size={14} />}
```
`SidebarSection` inverts on `collapsed` and uses the same `.twisty` class + `size={14}`. The `.twisty` color (`var(--muted)`) already exists in CSS — no new twisty styling needed.

**Local collapse state pattern** — `FileTree.tsx:55` shows the per-item local-state precedent (why collapse state belongs *in* the section, not lifted to App):
```typescript
const [expanded, setExpanded] = useState(defaultExpanded)
```
This is also why the Notes body must use `display:none` (not unmount) on collapse: each `TreeItem` holds its own `expanded` state, so unmounting `FileTree` would reset every folder to `defaultExpanded`.

**localStorage persistence pattern (the core "copy this" excerpt)** — lazy init from `App.tsx:115-118`:
```typescript
const [sidebarWidth, setSidebarWidth] = useState(() => {
  const saved = Number(localStorage.getItem('geode.sidebarWidth'))
  return Number.isFinite(saved) && saved >= 160 ? saved : 250
})
```
…and write-on-change from `App.tsx:379-382` (inside the resize `onUp`):
```typescript
setSidebarWidth((w) => {
  localStorage.setItem('geode.sidebarWidth', String(w))
  return w
})
```
`SidebarSection` mirrors this exactly with a boolean and the key `geode.section.${id}.collapsed`:
```typescript
const key = `geode.section.${id}.collapsed`
const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(key) === '1')
const toggle = useCallback((): void => {
  setCollapsed((v) => { const next = !v; localStorage.setItem(key, next ? '1' : '0'); return next })
}, [key])
```
Note the defensive read `=== '1'`: any absent/tampered value coerces to `false` (expanded) — self-healing, satisfies the V5 note in RESEARCH.

**Keyboard/aria pattern** — the tree rows use `tabIndex={0}` + an `onKeyDown` handler (`FileTree.tsx:104,140,71-76`). The section header follows the same accessibility posture but for toggle: `tabIndex={0}`, `role="button"`, `aria-expanded={!collapsed}`, Enter/Space calls `toggle()` (see RESEARCH Pattern 1 for the full block). Spanish `aria-label`: `Colapsar sección Notas` / `Expandir sección Notas` (UI-SPEC L101).

**stopPropagation pattern** — `FileTree.tsx:90-91` and `205` already use `e.stopPropagation()` to stop child clicks bubbling to the row. Copy this exact guard for the actions cluster so an action click does not toggle the section:
```typescript
<div className="sidebar-section-actions" onClick={(e) => e.stopPropagation()}>{actions}</div>
```

---

### `src/renderer/src/VaultSwitcher.tsx` (MODIFY — component, disclosure)

**Analog:** itself (in-place refactor). Current full source is 96 lines; the logic is retained, only the render shell + positioning change.

**Keep verbatim — props contract** (`VaultSwitcher.tsx:6-17`): `current`, `vaults`, `onSwitch`, `onManage`, `onNew`. App's call site already passes exactly these (`App.tsx:910-916`). Per RESEARCH Pitfall 4 (Assumption A2), **keep the filename and export name** `VaultSwitcher` to minimize diff in the monolith; the "header" nature is conveyed by the CSS class `.vault-header`, not the identifier.

**Keep verbatim — transient open state + Escape-close** (`VaultSwitcher.tsx:31-41`):
```typescript
const [open, setOpen] = useState(false)
useEffect(() => {
  if (!open) return
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [open])
```
State stays transient (not persisted) — matches the old popover.

**Keep verbatim — vault list + Check on active + actions** (`VaultSwitcher.tsx:58-90`): the `vaults.map` with `className={v.root === current.root ? 'sel' : ''}`, the `{v.root === current.root && <Check size={14} />}`, the `.vault-menu-sep`, and both `.vault-menu-manage` rows (`FolderOpen` "Abrir carpeta…" / `Cloud` "Clonar o crear en GitHub…"). All retained verbatim (UI-SPEC L103-104, L150-153).

**Change — remove the popover shell** (`VaultSwitcher.tsx:44,54-57,91-93`): drop the `.vault-overlay` div (L56) entirely and render the `<ul className="vault-menu">` directly in flow under the trigger. Root wrapper class becomes `.vault-header` (was `.vault-switcher`). Target render shape is in RESEARCH Pattern 3 (L182-201).

---

### `src/renderer/src/App.tsx` (MODIFY — sidebar JSX, composition root)

**Analog:** the existing `<aside className="sidebar">` block, `App.tsx:855-926` (current source below is what gets restructured).

**Icons already imported** (`App.tsx:3-23`) — no new imports needed; all four action icons plus `HelpCircle`/`SettingsIcon` are present: `FilePlus, FolderPlus, ArrowDownUp, FoldVertical, UnfoldVertical, HelpCircle, Settings as SettingsIcon`. **Pitfall (RESEARCH Pitfall 1):** `noUnusedLocals` is on — all four action icons must stay referenced by the new `notesActions` cluster or `npm run typecheck` fails with `TS6133`.

**Current toolbar block to replace** (`App.tsx:856-885`) — this is the source of the four action buttons. They move into a `notesActions` node passed to `<SidebarSection actions={...}>`, with `size={16}` → `size={14}` for the 22px header (UI-SPEC L137):
```typescript
<div className="sidebar-toolbar">
  <button className="icon-btn"
    title={selected?.isDir ? `Nueva nota en "${selected.path}"` : 'Nueva nota'}
    onClick={() => void newNoteIn(createTargetDir())}><FilePlus size={16} /></button>
  <button className="icon-btn"
    title={selected?.isDir ? `Nueva carpeta en "${selected.path}"` : 'Nueva carpeta'}
    onClick={() => void newFolderIn(createTargetDir())}><FolderPlus size={16} /></button>
  <button className="icon-btn"
    title={sortAsc ? 'Orden A→Z (click: Z→A)' : 'Orden Z→A (click: A→Z)'}
    onClick={() => setSortAsc((v) => !v)}><ArrowDownUp size={16} /></button>
  <button className="icon-btn"
    title={allExpanded ? 'Colapsar todo' : 'Expandir todo'}
    onClick={toggleCollapseAll}>{allExpanded ? <FoldVertical size={16} /> : <UnfoldVertical size={16} />}</button>
</div>
```
Handlers referenced here already exist and stay in App: `createTargetDir` (`App.tsx:363-366`), `toggleCollapseAll` (`App.tsx:626-629`), `setSortAsc`/`sortAsc` (`App.tsx:79`), `allExpanded` (`App.tsx:80`), `selected` (`App.tsx:111`), plus `newNoteIn`/`newFolderIn`. This is the "actions owned by App, rendered by the section" pattern (RESEARCH Pattern 2) — keeps all sidebar state in one place.

**FileTree render block to preserve** (`App.tsx:887-907`) — moves inside `<SidebarSection>` body **unchanged** (all props identical):
```typescript
<FileTree
  nodes={sortedTree} openPath={openPath}
  selectedPath={selected?.path ?? null} editingPath={editingPath}
  revealPath={revealPath} defaultExpanded={allExpanded}
  collapseVersion={collapseVersion}
  onOpen={(p) => void openNote(p)}
  onSelect={(node) => setSelected({ path: node.path, isDir: node.isDir })}
  onContext={(node, x, y) => setMenu({ node, x, y })}
  onRename={(node, name) => void renameNode(node, name)}
  onRenameCancel={() => setEditingPath(null)}
  onDelete={(node) => void deleteNode(node)}
/>
```

**Empty-state to fix (Pitfall 5 / UI-SPEC L105)** — `App.tsx:905` currently violates the "never emojis" constraint:
```typescript
<p className="tree-empty">Vault vacío. Creá una nota con ＋ o una carpeta con 📁.</p>
```
Replace with the two-line no-glyph copy (heading + body):
```typescript
<div className="tree-empty">
  <p className="tree-empty-title">Bóveda vacía</p>
  <p>Creá una nota o una carpeta con las acciones de la cabecera de esta sección.</p>
</div>
```

**VaultSwitcher call site to move** (`App.tsx:910-916`) — moves out of `.sidebar-footer` to the **top** of the `<aside>`; props unchanged. Footer keeps only Help + Settings (`App.tsx:917-924`). Target `<aside>` shape is in RESEARCH Code Examples (L356-380).

**Resizer stays untouched** (`App.tsx:928-938` + `startSidebarResize` at L369-387).

---

### `src/renderer/src/index.css` (MODIFY — config)

**Analog:** the existing sidebar/vault/tree rules it edits.

**Add `.sidebar-section*`** — derive from `.sidebar-toolbar` (L345-367) hover treatment + `.sidebar-tree` (L370-374) scroll behavior. The `.sidebar-section-actions .icon-btn` transparent→hover rules copy the existing `.sidebar-toolbar .icon-btn` pattern (L357-367):
```css
.sidebar-toolbar .icon-btn { background: transparent; border-color: transparent; color: var(--muted); }
.sidebar-toolbar .icon-btn:hover { color: var(--text); background: var(--panel-2); border-color: var(--border); }
```
The scrollable body copies `.sidebar-tree` (L370-374):
```css
.sidebar-tree { flex: 1; min-height: 0; overflow: auto; }
```
Reveal-on-hover uses CSS only (`opacity:0` → `:hover`/`:focus-within` `opacity:1`) — no JS. Full target CSS in RESEARCH Code Examples (L273-327). Header spec: 22px height, `padding: 0 8px`, label 11px/600/uppercase/`letter-spacing:0.5px`/`var(--muted)` (UI-SPEC L133-141).

**Adapt `.vault-menu` → in-flow** (currently absolute-positioned popover, L451-465). Override to `position: static`, remove `min-width`/`max-width`/`border-radius`/`box-shadow` under `.vault-header`. Add `.vault-header` wrapper. Keep `.vault-trigger`/`.vault-trigger-name` (L416-443) and `.vault-menu li`/`.sel`/`.vault-menu-sep`/`.vault-menu-manage` (L467-506) verbatim. Full adapt CSS in RESEARCH Code Examples (L331-351).

**Retire** — `.sidebar-toolbar` rules (L345-367) once the JSX block is removed; `.vault-overlay` (L445-449); rename `.vault-switcher` (L410-414) usage to `.vault-header`.

**Add `.tree-empty-title`** — the existing `.tree-empty` (L612-616) is `color: var(--muted); font-size: 12px; padding: 10px;`; the new heading needs a slightly emphasized title style within it.

## Shared Patterns

### localStorage UI-preference persistence
**Source:** `src/renderer/src/App.tsx:115-118` (lazy read) + `379-382` (write-on-change)
**Apply to:** `SidebarSection` collapse state
**Key convention:** `geode.<domain>.<detail>` (existing: `geode.sidebarWidth`; new: `geode.section.{id}.collapsed`). Read defensively; missing ⇒ default. Synchronous, no IPC (deliberately not `SettingsService`).

### Lucide twisty (never emojis)
**Source:** `src/renderer/src/FileTree.tsx:120`
**Apply to:** section header (`ChevronDown`/`ChevronRight`), vault header (`ChevronsUpDown` from `VaultSwitcher.tsx:50`)
```typescript
{expanded ? <ChevronDown className="twisty" size={14} /> : <ChevronRight className="twisty" size={14} />}
```
Reuse the `.twisty` class (already `var(--muted)`) and `size={14}`.

### stopPropagation for nested interactive children
**Source:** `src/renderer/src/FileTree.tsx:90-91` (delete btn), `:205` (rename input)
**Apply to:** the section-header actions cluster so action clicks don't toggle collapse.
```typescript
onClick={(e) => e.stopPropagation()}
```

### Transient disclosure with Escape-to-close
**Source:** `src/renderer/src/VaultSwitcher.tsx:31-41`
**Apply to:** the refactored in-flow vault disclosure (retained verbatim).

### Explicit return types + Spanish strings/comments (CLAUDE.md)
**Apply to:** all new/edited code. `SidebarSection(...): JSX.Element`; typed callbacks (`(): void`, `(e: ...) => void`); `import type` for types; props interface `SidebarSectionProps`. All labels/tooltips/aria-labels/comments in Spanish. CSS classes kebab-case (`.sidebar-section`, `.vault-header`).

## No Analog Found

None. Every file has a first-party analog in `src/renderer/src/`. The only "new mechanism" (per-section collapse persistence) is a direct composite of two existing patterns (FileTree local collapse + App localStorage idiom), so no RESEARCH-only fallback pattern is needed.

## Metadata

**Analog search scope:** `src/renderer/src/` (App.tsx, VaultSwitcher.tsx, FileTree.tsx, index.css)
**Files scanned:** 4 source files (targeted reads: App.tsx L1-130, L355-394, L616-640, L855-938; VaultSwitcher full; FileTree full; index.css L311-520, L612-616)
**Pattern extraction date:** 2026-07-03
