# Phase 1: Sidebar Sections - Research

**Researched:** 2026-07-03
**Domain:** React renderer UI restructure (Electron sandboxed renderer, custom CSS design system)
**Confidence:** HIGH

## Summary

This is a **pure visual restructure** of the Geode sidebar into a VSCode-Explorer-style stack of collapsible sections, plus refactoring the vault switcher from a footer popover into a top vault header with an inline (in-flow) disclosure. No new libraries, no IPC changes, no git-logic changes. Everything is achievable by (1) adding one new component `SidebarSection.tsx`, (2) refactoring `VaultSwitcher.tsx` into a top-anchored in-flow `VaultHeader`, (3) restructuring the `<aside className="sidebar">` JSX block in `App.tsx` (currently lines 855-926), and (4) adding/adapting CSS classes in `index.css`. All state and handlers the sidebar depends on already exist and are reused verbatim.

The codebase is fully self-contained for this work: `FileTree` is reused with **zero** prop/behavior changes, all four toolbar action icons (`FilePlus`, `FolderPlus`, `ArrowDownUp`, `FoldVertical`/`UnfoldVertical`) are already imported in `App.tsx`, the twisty chevrons (`ChevronDown`/`ChevronRight`) are the same ones `FileTree` uses, and the `localStorage` persistence pattern is already established by `geode.sidebarWidth`. The two real landmines are that `App.tsx` is a 47KB monolith with 40+ state vars (so the JSX edit must be surgical and prop-threading-aware) and that there is **no automated test harness** (so verification is `npm run typecheck` + a manual behavior-parity UAT checklist).

**Primary recommendation:** Build `SidebarSection` as a self-contained collapsible container that owns its collapse state and `localStorage` persistence (`geode.section.{id}.collapsed`), keep the Notes body mounted with `display:none` when collapsed (to preserve FileTree internal folder-expansion state), pass the four header actions in via an `actions` prop rendered by `App` (so `App` keeps owning `sortAsc`/`allExpanded`/handlers), and refactor the vault switcher in place to render its list in flow. Gate every step on `npm run typecheck` and the manual UAT checklist below.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Section collapse/expand + twisty | Renderer / `SidebarSection` (local `useState`) | — | Pure presentation state, no main-process involvement |
| Section collapse persistence | Renderer / `localStorage` | — | Matches existing `geode.sidebarWidth` pattern; no settings-service round trip needed |
| Notes header actions (new note/folder, sort, collapse-all) | Renderer / `App.tsx` state + handlers | `SidebarSection` (renders them via `actions` prop) | Handlers mutate App-owned tree/sort state; section is a dumb container |
| File tree render/interaction | Renderer / `FileTree` | — | Reused unchanged; git/IO happens over existing IPC |
| Vault list + switch | Renderer / `VaultHeader` (refactored `VaultSwitcher`) | Main / `vault.switch` IPC (unchanged) | UI-only refactor; switch logic already lives in `App.switchVault` |
| Sidebar resize + width persistence | Renderer / `App.tsx` (`startSidebarResize`, `sidebarWidth`) | — | Unchanged; lives outside the section stack |

**No capability crosses the IPC boundary as part of this phase.** This is entirely a `src/renderer/src/` change.

## Standard Stack

No new packages. Everything required is already installed and imported.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.7 | Functional components + hooks | [CITED: CLAUDE.md] Established renderer framework |
| lucide-react | 1.23.0 | Monochrome icons (`ChevronDown/Right`, `ChevronsUpDown`, `Check`, `FolderOpen`, `Cloud`, `FilePlus`, `FolderPlus`, `ArrowDownUp`, `FoldVertical`, `UnfoldVertical`) | [CITED: CLAUDE.md] Icon library, never emojis |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `SidebarSection` | shadcn/Radix `Collapsible`/`Accordion` | Rejected in UI-SPEC (`Tool: none`). Would fork the visual language and add a dependency for ~40 lines of trivial toggle logic. Do not introduce. |
| `localStorage` for collapse state | `SettingsService` JSON (main process, over IPC) | Rejected. Collapse state is transient UI preference; the existing `geode.sidebarWidth` precedent uses `localStorage` synchronously with no IPC round-trip. Match it. |

**Installation:** None. `npm install` is not run this phase.

## Package Legitimacy Audit

**No external packages are installed in this phase.** All code reuses dependencies already present in `package-lock.json` (react 19.2.7, lucide-react 1.23.0). No registry lookups, slopcheck, or legitimacy gate required. `[VERIFIED: package.json]`

## Architecture Patterns

### System Architecture Diagram

```
                    <aside className="sidebar">  (App.tsx, was L855-926)
                    ┌───────────────────────────────────────────────┐
   user click ───►  │  VaultHeader  (refactored VaultSwitcher)       │
                    │   ├─ trigger row: ChevronsUpDown + vault.name  │
                    │   └─ [open?] inline disclosure  ◄── IN FLOW,    │
                    │        · <li> per vault (+ Check on active)     │  pushes
                    │        · "Abrir carpeta…" → onManage            │  stack
                    │        · "Clonar o crear…" → onNew              │  down
                    ├───────────────────────────────────────────────┤
   header click ─►  │  SidebarSection id="notas"  flex=1             │
                    │   ├─ header: twisty + "NOTAS" + actions(hover) │──► actions prop
                    │   │     actions = [FilePlus,FolderPlus,          │    (owned + rendered
                    │   │               ArrowDownUp,Fold/Unfold]      │     by App; click →
   action click ─►  │   │     (stopPropagation; hidden when collapsed)│     App handlers)
                    │   └─ body [display:none when collapsed]:        │
                    │         FileTree  (unchanged)  OR empty-state   │──► IPC (unchanged)
                    ├───────────────────────────────────────────────┤
                    │  .sidebar-footer:  Ayuda · Ajustes  (unchanged) │
                    └───────────────────────────────────────────────┘
                    │  .sidebar-resizer  (unchanged, startSidebarResize)
```

Data flow that must remain intact: header action click → `stopPropagation` (so section does not toggle) → App handler (`newNoteIn`/`newFolderIn`/`setSortAsc`/`toggleCollapseAll`) → existing IPC/state → `FileTree` re-renders. Section collapse click → `SidebarSection` local `useState` toggle → `localStorage.setItem('geode.section.notas.collapsed', ...)` → body `display` flips. These two paths must not interfere.

### Recommended Project Structure
```
src/renderer/src/
├── App.tsx              # restructure the <aside> block; keep all state/handlers
├── SidebarSection.tsx   # NEW — reusable collapsible section primitive
├── VaultSwitcher.tsx    # refactor into top-anchored in-flow VaultHeader
│                        #   (rename to VaultHeader.tsx OR keep filename, rename export — see Pitfall 4)
├── FileTree.tsx         # UNCHANGED — reused inside Notes section body
└── index.css            # add .sidebar-section*, .vault-header; adapt .vault-menu; retire .sidebar-toolbar
```

### Pattern 1: Self-contained collapsible section with localStorage persistence
**What:** `SidebarSection` owns its own collapse boolean and persists it, mirroring the exact `geode.sidebarWidth` lazy-init + write-on-change idiom already in `App.tsx`.
**When to use:** Every section in the stack (Notes now; Timeline in Phase 2 with `id="timeline"` and zero primitive changes).
**Example:**
```typescript
// Patrón calcado de App.tsx L115-117 (lazy init) y L380 (setItem al cambiar).
// [VERIFIED: src/renderer/src/App.tsx:115-117,380]
import { useState, useCallback } from 'react'
import type { JSX, ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface SidebarSectionProps {
  /** Id de persistencia: escribe geode.section.{id}.collapsed */
  id: string
  /** Etiqueta en mayúsculas (p. ej. "NOTAS"). */
  title: string
  /** Nodos de acción alineados a la derecha; se muestran al hover. */
  actions?: ReactNode
  /** Si el cuerpo crece para llenar el alto disponible. */
  flex?: boolean
  children: ReactNode
}

export function SidebarSection({ id, title, actions, flex, children }: SidebarSectionProps): JSX.Element {
  const key = `geode.section.${id}.collapsed`
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(key) === '1')

  const toggle = useCallback((): void => {
    setCollapsed((v) => {
      const next = !v
      localStorage.setItem(key, next ? '1' : '0')
      return next
    })
  }, [key])

  return (
    <section className={`sidebar-section${flex && !collapsed ? ' flex' : ''}`}>
      <div
        className="sidebar-section-header"
        tabIndex={0}
        role="button"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expandir' : 'Colapsar'} sección ${title}`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
        }}
      >
        {collapsed ? <ChevronRight className="twisty" size={14} /> : <ChevronDown className="twisty" size={14} />}
        <span className="sidebar-section-label">{title}</span>
        {!collapsed && actions && (
          // stopPropagation: un click en una acción NO debe alternar la sección.
          <div className="sidebar-section-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {/* display:none (no desmontar) para conservar el estado interno del FileTree. */}
      <div className="sidebar-section-body" style={collapsed ? { display: 'none' } : undefined}>
        {children}
      </div>
    </section>
  )
}
```
**Why `display:none` and not unmount:** `FileTree`'s per-folder expanded state is local `useState` inside each `TreeItem` (`FileTree.tsx:55`). Unmounting on collapse would reset every folder to `defaultExpanded` when the section re-expands — a subtle behavior loss. `display:none` keeps the tree mounted, preserving folder expansion and avoiding remount cost. (UI-SPEC permits either; this is the safer choice for "no regressions.")

### Pattern 2: Actions owned by App, rendered by the section
**What:** The four action buttons are built in `App.tsx` (where `sortAsc`, `allExpanded`, `selected`, `createTargetDir`, `newNoteIn`, `newFolderIn`, `toggleCollapseAll` live) and passed to `<SidebarSection actions={...}>`. The section is a dumb container.
**Why:** Keeps all sidebar state in one place; avoids threading 6+ props into the section. The section stays generic for Phase 2 Timeline (which will pass entirely different actions).
**Example (in App.tsx, replacing the old `.sidebar-toolbar` block):**
```typescript
// size={14} (antes 16) para la cabecera compacta de 22px. [CITED: 01-UI-SPEC.md L137]
const notesActions = (
  <>
    <button className="icon-btn" title={selected?.isDir ? `Nueva nota en "${selected.path}"` : 'Nueva nota'}
      onClick={() => void newNoteIn(createTargetDir())}><FilePlus size={14} /></button>
    <button className="icon-btn" title={selected?.isDir ? `Nueva carpeta en "${selected.path}"` : 'Nueva carpeta'}
      onClick={() => void newFolderIn(createTargetDir())}><FolderPlus size={14} /></button>
    <button className="icon-btn" title={sortAsc ? 'Orden A→Z (click: Z→A)' : 'Orden Z→A (click: A→Z)'}
      onClick={() => setSortAsc((v) => !v)}><ArrowDownUp size={14} /></button>
    <button className="icon-btn" title={allExpanded ? 'Colapsar todo' : 'Expandir todo'}
      onClick={toggleCollapseAll}>{allExpanded ? <FoldVertical size={14} /> : <UnfoldVertical size={14} />}</button>
  </>
)
```

### Pattern 3: In-flow inline disclosure (VaultHeader)
**What:** Remove `position: absolute` / `.vault-overlay` / `bottom: calc(100% + 6px)` from the vault menu; render the `<ul>` in normal flow directly under the trigger so it pushes the section stack down. Keep the Escape-to-close listener and the transient (`useState`, not persisted) open state.
**Example (refactored VaultSwitcher render):**
```typescript
// Sin overlay ni posicionamiento absoluto: la lista fluye y empuja las secciones.
return (
  <div className="vault-header">
    <button className="vault-trigger" title={current.root} onClick={() => setOpen((v) => !v)}>
      <ChevronsUpDown size={14} className="twisty" />
      <span className="vault-trigger-name">{current.name}</span>
    </button>
    {open && (
      <ul className="vault-menu">   {/* ya NO position:absolute — ver CSS abajo */}
        {vaults.map((v) => ( /* … igual que hoy … */ ))}
        <li className="vault-menu-sep" />
        <li className="vault-menu-manage" onClick={() => { setOpen(false); onManage() }}>
          <FolderOpen size={14} /> Abrir carpeta…
        </li>
        <li className="vault-menu-manage" onClick={() => { setOpen(false); onNew() }}>
          <Cloud size={14} /> Clonar o crear en GitHub…
        </li>
      </ul>
    )}
  </div>
)
```

### Anti-Patterns to Avoid
- **Threading collapse state up into App:** Don't lift section collapse state into `App.tsx`'s already-overloaded state. It belongs in the section (self-contained, per the `geode.sidebarWidth` precedent). App has 40+ state vars already (CONCERNS.md).
- **Unmounting FileTree on collapse:** Loses folder expansion state (see Pattern 1).
- **Forgetting `stopPropagation` on the action cluster:** Clicking "new note" would also toggle the section — a real interaction bug.
- **Keeping the popover positioning on the disclosure:** SIDE-04 explicitly requires in-flow, not floating. Remove `.vault-overlay` and absolute positioning entirely.
- **Introducing an 8-point spacing scale:** UI-SPEC L34-45 mandates reusing the existing 2px-step values (2/4/6/8/10/14px) for pixel parity. New scale = visible regression.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapse animation/accordion | Custom height-transition JS | Plain `display:none` toggle (no animation this phase) | UI-SPEC specifies no animation; VSCode sections snap. Simpler and regression-free. |
| Twisty icons | Custom SVG/CSS triangles | `ChevronDown`/`ChevronRight` from lucide-react | Already the twisty in `FileTree.tsx:120`; visual consistency is a locked decision. |
| Persistence layer | New settings key/IPC | `localStorage` (`geode.section.{id}.collapsed`) | Matches `geode.sidebarWidth`; synchronous, no IPC. |
| Reveal-on-hover | JS mouseenter/leave state | CSS `:hover` / `:focus-within` on the header | Pure CSS, keyboard-accessible, zero re-renders. |

**Key insight:** Every primitive this phase needs already exists in the codebase or in CSS. The work is restructuring and styling, not building mechanisms.

## Common Pitfalls

### Pitfall 1: `noUnusedLocals` / `noUnusedParameters` break the build when moving code
**What goes wrong:** TypeScript strict mode has `noUnusedLocals: true` and `noUnusedParameters: true` (CLAUDE.md). If you remove the `.sidebar-toolbar` JSX but a moved icon import (`FilePlus`, etc.) ends up unreferenced — or you leave a now-unused handler — `npm run typecheck` fails.
**Why it happens:** The four action icons are imported at `App.tsx:4-18`. They must remain referenced by the new `notesActions` cluster. `ChevronsUpDown`/`Check`/`FolderOpen`/`Cloud` live in `VaultSwitcher.tsx` and stay there.
**How to avoid:** After the edit, run `npm run typecheck` immediately. Keep all four action icons used in `notesActions`. `SidebarSection.tsx` imports its own `ChevronDown`/`ChevronRight` (not from App).
**Warning signs:** `TS6133: 'X' is declared but its value is never read.`

### Pitfall 2: Action click also toggles the section
**What goes wrong:** Clicking "Nueva nota" both creates a note and collapses the section.
**Why it happens:** The action buttons are children of the clickable header; the click bubbles to the header's `onClick={toggle}`.
**How to avoid:** Wrap the action cluster in a container with `onClick={(e) => e.stopPropagation()}` (shown in Pattern 1). Individual buttons keep their own handlers.
**Warning signs:** Section unexpectedly collapses/expands when using toolbar actions.

### Pitfall 3: Explicit return types required
**What goes wrong:** New functions/components without explicit return types violate the convention ("Explicit return types on all exported functions and methods", CLAUDE.md).
**How to avoid:** `SidebarSection(...): JSX.Element`; callbacks typed (`(): void`, `(e: ...) => void`). Import `type { JSX, ReactNode }` from `react`.
**Warning signs:** Code-review flag (not a compile error, but a convention violation).

### Pitfall 4: Renaming VaultSwitcher.tsx vs. keeping the filename
**What goes wrong:** UI-SPEC calls the refactored component `VaultHeader`. If you rename the file, you must update the import in `App.tsx:` (currently `import { VaultSwitcher } from './VaultSwitcher'`) and there is no other importer to worry about.
**How to avoid:** Two safe options — (a) keep `VaultSwitcher.tsx` filename and its export name, only change its render/CSS (lowest risk, fewest edits); or (b) rename file + export + the single `App.tsx` import together in one commit. Recommendation: **keep the filename and export** to minimize diff surface in the monolith; the "header" nature is conveyed by CSS class `.vault-header` and placement, not the identifier. Document whichever you pick.
**Warning signs:** `Cannot find module './VaultSwitcher'` after a partial rename.

### Pitfall 5: Empty-state copy still contains emoji glyphs
**What goes wrong:** The current empty state at `App.tsx:905` is `Vault vacío. Creá una nota con ＋ o una carpeta con 📁.` — it uses `＋`/`📁` glyphs, violating the "Lucide icons, never emojis" constraint (CLAUDE.md).
**How to avoid:** Replace with the two-line copy from UI-SPEC L105: heading `Bóveda vacía` + body `Creá una nota o una carpeta con las acciones de la cabecera de esta sección.` (no glyphs). This is an in-scope copy correction.
**Warning signs:** Glyphs visible in the empty vault state.

### Pitfall 6: Vault header must always have a non-null `current`
**What goes wrong:** `VaultSwitcher`/`VaultHeader` requires `current: VaultInfo`. The sidebar (and thus the header) renders inside the app shell; confirm `vault` is non-null at that render point (today it is passed directly as `current={vault}` at `App.tsx:911`, so the contract already holds).
**How to avoid:** Preserve the existing render guard — do not move the header to a place that renders before a vault is loaded.

## Runtime State Inventory

This phase is a renderer-only visual restructure. The only runtime state introduced is browser `localStorage`.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New `localStorage` key `geode.section.notas.collapsed` ("1"/"0"). Phase 2 adds `geode.section.timeline.collapsed`. Existing `geode.sidebarWidth` unchanged. | Code writes the new key; no migration (absent key ⇒ default expanded, which `getItem(key) === '1'` handles correctly as `false`). |
| Live service config | None — no external services touched. | None. |
| OS-registered state | None. | None — verified: no OS-level registration in a renderer UI change. |
| Secrets/env vars | None — no `.env`, no `safeStorage`, no tokens touched. | None. |
| Build artifacts | None — no package/rename; `out/renderer` rebuilds normally via `electron-vite build`. | None. |

**Canonical check:** After the restructure, the only new persistent runtime state is the `geode.section.notas.collapsed` localStorage entry. It is self-healing (missing ⇒ expanded). No data migration needed.

## Code Examples

### CSS to add (new section primitive) — index.css
```css
/* ── Sección colapsable del sidebar (estilo VSCode Explorer) ─────────────── */
.sidebar-section {
  display: flex;
  flex-direction: column;
  min-height: 0;              /* permite que el cuerpo scrollee dentro del flex */
}
.sidebar-section.flex { flex: 1; }   /* Notas ocupa el alto disponible */

.sidebar-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  cursor: pointer;
  user-select: none;
}
.sidebar-section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
/* Acciones a la derecha, reveladas al hover (o con foco de teclado). */
.sidebar-section-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  opacity: 0;
}
.sidebar-section-header:hover .sidebar-section-actions,
.sidebar-section-actions:focus-within { opacity: 1; }

.sidebar-section-actions .icon-btn {
  background: transparent;
  border-color: transparent;
  color: var(--muted);
  padding: 2px;
}
.sidebar-section-actions .icon-btn:hover {
  color: var(--text);
  background: var(--panel-2);
  border-color: var(--border);
}

/* Cuerpo scrolleable de la sección (reemplaza a .sidebar-tree). */
.sidebar-section-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
```
> Source: derived from existing `.sidebar-toolbar` (L345-367), `.sidebar-tree` (L370-374), and UI-SPEC section-header spec (L133-141). [VERIFIED: src/renderer/src/index.css]

### CSS to adapt — turn the vault popover into an in-flow header + disclosure
```css
/* Cabecera de bóveda arriba del sidebar (reemplaza el switcher del footer). */
.vault-header {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
}
/* Reutiliza .vault-trigger / .vault-trigger-name tal cual (L416-443). */

/* La lista ahora fluye (sin overlay ni posición absoluta). */
.vault-header .vault-menu {
  position: static;           /* antes: absolute + bottom: calc(100% + 6px) */
  min-width: 0;
  max-width: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
  border-bottom: 1px solid var(--border);
}
/* .vault-overlay ya no se usa: eliminar del JSX y su regla (L445-449). */
```
> Retire `.sidebar-toolbar` rules (L345-367) once the block is removed from JSX. Keep `.sidebar-footer` (now only Ayuda + Ajustes). [VERIFIED: src/renderer/src/index.css:345-506]

### JSX target shape — App.tsx `<aside>` block
```tsx
<aside className="sidebar" style={{ width: sidebarWidth }}>
  <VaultSwitcher            /* refactored: renders as .vault-header, in-flow */
    current={vault} vaults={vaults}
    onSwitch={(root) => void switchVault(root)}
    onManage={() => void openVault()}
    onNew={() => setNewVaultOpen(true)} />

  <SidebarSection id="notas" title="NOTAS" flex actions={notesActions}>
    {tree.length > 0 ? (
      <FileTree /* …props idénticas a hoy, sin cambios… */ />
    ) : (
      <div className="tree-empty">
        <p className="tree-empty-title">Bóveda vacía</p>
        <p>Creá una nota o una carpeta con las acciones de la cabecera de esta sección.</p>
      </div>
    )}
  </SidebarSection>

  <div className="sidebar-footer">
    <div className="sidebar-footer-actions">
      <button className="icon-btn" title="Ayuda" disabled><HelpCircle size={16} /></button>
      <button className="icon-btn" title="Ajustes" onClick={() => setSettingsOpen(true)}><SettingsIcon size={16} /></button>
    </div>
  </div>
</aside>
```
> `.sidebar-footer` no longer contains the vault switcher; `.sidebar-footer-actions` may need `margin-left: 0` or the footer's `justify-content` adjusted since the flex-1 switcher is gone. Verify visually. [VERIFIED: src/renderer/src/App.tsx:855-926]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vault switch = footer popover (absolute, overlay) | Top vault header + in-flow disclosure | This phase (SIDE-04) | No floating layer; list pushes sections down |
| Flat toolbar row (`.sidebar-toolbar`) above tree | Actions on the section header, reveal-on-hover | This phase (SIDE-02) | Less chrome; VSCode-Explorer parity |
| Single implicit tree region | Named collapsible section stack | This phase (SIDE-01) | Container ready for Phase 2 Timeline |

**Deprecated/outdated (remove this phase):**
- `.sidebar-toolbar` CSS + JSX block — actions move to section header.
- `.vault-overlay` + absolute `.vault-menu` positioning — disclosure is in-flow.
- Emoji-glyph empty-state string — replaced with two-line Spanish copy.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `display:none` (vs unmount) is preferred to preserve FileTree folder-expansion state across section collapse | Pattern 1 | Low — UI-SPEC permits either; if unmount is chosen, folder expansion resets on re-expand (minor UX, not a functional regression) |
| A2 | Keeping the `VaultSwitcher.tsx` filename/export (vs renaming to VaultHeader) is the lower-risk choice | Pitfall 4 | Low — cosmetic; either works as long as the single `App.tsx` import stays consistent |
| A3 | Removing the flex-1 vault switcher from the footer may require a minor `.sidebar-footer` alignment tweak | Code Examples | Low — visual-only; caught by manual UAT |

**Note:** All three assumptions are low-risk visual/implementation choices, not locked-decision conflicts. The planner may present A1/A2 as implementer discretion.

## Open Questions

1. **Footer alignment after switcher removal**
   - What we know: `.sidebar-footer` currently uses `display:flex; gap:6px` with the switcher taking `flex:1` and `.sidebar-footer-actions` pushed right via `margin-left:auto`.
   - What's unclear: With the switcher gone, whether the two footer icon buttons should stay right-aligned or center/left.
   - Recommendation: Keep them right-aligned (leave `margin-left:auto`) for continuity; confirm in UAT.

## Environment Availability

Skipped — no external tools/services/runtimes are introduced. This is a renderer code/CSS change built by the existing `electron-vite` pipeline already present in the repo.

## Validation Architecture

There is **no automated test harness** in this repo (zero test files, no vitest/jest/playwright in devDependencies — CONCERNS.md L7-11, verified via package.json). `nyquist_validation` is enabled in config, but the only automated gate available is the TypeScript compiler. Establishing a full test harness is out of scope for a pure visual restructure; validation is **typecheck + structured manual UAT**.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (no unit/integration/E2E harness exists) |
| Config file | none |
| Quick run command | `npm run typecheck` (compiles both `tsconfig.node.json` + `tsconfig.web.json`) |
| Full suite command | `npm run build` (typecheck + `electron-vite build`) |

### Phase Requirements → Validation Map
| Req ID | Behavior | Validation Type | Command / Method | Automatable? |
|--------|----------|-----------------|------------------|-------------|
| SIDE-01 | Collapsible section stack, twisty toggles, collapse persists | manual UAT + typecheck | `npm run typecheck` + checklist §A | ❌ manual (UI) |
| SIDE-02 | Toolbar actions on section header, reveal-on-hover, hidden when collapsed | manual UAT + typecheck | checklist §B | ❌ manual (UI) |
| SIDE-04 | Inline in-flow vault disclosure (no popover), switch works | manual UAT + typecheck | checklist §C | ❌ manual (UI) |
| (parity) | Resizer, sort, collapse-all, keyboard, context menu, rename, delete unchanged | manual regression | checklist §D | ❌ manual (UI) |

### Manual UAT Checklist (behavior-parity — run in `npm run dev`)

**§A Section stack (SIDE-01)**
- [ ] "NOTAS" header shows `ChevronDown` when expanded, `ChevronRight` when collapsed.
- [ ] Clicking anywhere on the header toggles collapse; body hides/shows.
- [ ] Header is keyboard-focusable; Enter and Space toggle; `aria-expanded` flips.
- [ ] Collapse state survives reload (localStorage `geode.section.notas.collapsed` = "1"/"0" — inspect in DevTools).
- [ ] Notes body fills available height when expanded (flex).

**§B Notes header actions (SIDE-02)**
- [ ] Four actions (new note, new folder, sort, collapse-all) appear on header **hover** only.
- [ ] Actions hidden entirely when the section is collapsed.
- [ ] Clicking an action does its job and does **not** toggle the section (stopPropagation).
- [ ] New note / new folder still target the selected folder (tooltip shows `… en "ruta"`).
- [ ] Sort toggles A→Z/Z→A; collapse-all toggles Fold/Unfold icon and tree state.
- [ ] Icons render at size 14, monochrome, no emojis.

**§C Vault header + inline disclosure (SIDE-04)**
- [ ] Vault name + `ChevronsUpDown` sit at the **top** of the sidebar (not the footer).
- [ ] Clicking opens the list **in flow**, pushing sections down (no floating overlay).
- [ ] Active vault shows `Check` + accent; selecting a different vault switches; selecting the active one is a no-op.
- [ ] "Abrir carpeta…" and "Clonar o crear en GitHub…" present with `FolderOpen`/`Cloud` icons, still work.
- [ ] Escape closes the disclosure. Open state does **not** persist across reload.

**§D Behavior parity / no regressions**
- [ ] Sidebar resizer drags (clamp 160–520) and double-click resets to 250; width persists.
- [ ] File tree: open note, folder expand/collapse, rename (inline input), delete (with confirm), context menu, per-row delete-on-hover, keyboard Del — all unchanged.
- [ ] Empty vault shows the new two-line Spanish copy, no `＋`/`📁` glyphs.
- [ ] Settings + Help remain in the footer and work (Settings opens dialog).
- [ ] `npm run typecheck` passes with zero errors.

### Wave 0 Gaps
- [ ] No test harness to add — validation is `npm run typecheck` + manual UAT (documented above). Introducing vitest/RTL is explicitly out of scope for this visual restructure (tracked as tech debt in CONCERNS.md).

*Recommendation: gate each implementation task on `npm run typecheck`; gate the phase on the full §A–§D checklist before `/gsd-verify-work`.*

## Security Domain

`security_enforcement: true`, ASVS level 1. This phase is a **renderer-only UI restructure** with no new input surfaces, no crypto, no auth, no network, no IPC changes. Applicability is minimal.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not touched (GitHub OAuth unchanged) |
| V3 Session Management | no | No sessions in a UI restructure |
| V4 Access Control | no | No new privileged operations |
| V5 Input Validation | no (marginal) | Only pre-existing rename input (unchanged). New `localStorage` value is read defensively (`=== '1'`), so any tampered value degrades to "expanded" — no injection path. |
| V6 Cryptography | no | No secrets/crypto touched |

### Known Threat Patterns for renderer UI
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| localStorage tampering (`geode.section.notas.collapsed`) | Tampering | Value coerced via strict `=== '1'` comparison; worst case is a wrong collapse state, self-heals. No `eval`/DOM-injection of the value. |
| Untrusted vault name in header/list | Injection/XSS | Rendered as React text children (auto-escaped), never `dangerouslySetInnerHTML`. Existing behavior preserved. |

**Conclusion:** No security-blocking findings. No new attack surface. Standard React text-escaping and defensive localStorage parsing are the only relevant controls, and both are already the codebase norm.

## Project Constraints (from CLAUDE.md)

The planner must ensure all tasks comply:
- **Sandboxed renderer:** contextIsolation=true, nodeIntegration=false — this phase stays entirely in the renderer; no preload/main changes. Do not touch the `.cjs` preload.
- **Lucide icons only, never emojis:** reuse `ChevronDown/Right`, `ChevronsUpDown`, `Check`, `FolderOpen`, `Cloud`, `FilePlus`, `FolderPlus`, `ArrowDownUp`, `FoldVertical`/`UnfoldVertical`. Fix the emoji-glyph empty state (Pitfall 5).
- **Spanish UI strings and comments:** all new labels, tooltips, aria-labels, and code comments in Spanish (e.g., `NOTAS`, `Colapsar sección Notas`).
- **Strict TypeScript, explicit return types:** `SidebarSection(...): JSX.Element`; typed callbacks; `import type` for type-only imports; respect `noUnusedLocals`/`noUnusedParameters` (Pitfall 1).
- **Naming:** component file PascalCase (`SidebarSection.tsx`), CSS classes kebab-case (`.sidebar-section`, `.sidebar-section-header`), functions camelCase, props interface `SidebarSectionProps`.
- **No functional regressions:** racy-git, IPC, and git logic are untouched by definition; the value guarantee (non-destructive editing) is unaffected.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIDE-01 | Collapsible section stack, VSCode-Explorer style | `SidebarSection` primitive (Pattern 1); CSS `.sidebar-section*` (Code Examples); `localStorage` persistence `geode.section.{id}.collapsed` mirroring `geode.sidebarWidth` (App.tsx:115-117,380) |
| SIDE-02 | File-tree toolbar actions move onto the section header | `actions` prop owned by App, rendered by section (Pattern 2); reveal-on-hover via CSS `:hover`/`:focus-within`; `stopPropagation` guard (Pitfall 2); icons at size 14 |
| SIDE-04 | Vault switching becomes an inline disclosure under the vault header, not a floating popover | VaultSwitcher refactor to in-flow (Pattern 3); CSS `.vault-header` + `position:static` on `.vault-menu`, remove `.vault-overlay` (Code Examples); keep Escape-close + transient state |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- `src/renderer/src/App.tsx` (L1-23 imports, L79-117 state, L363-387 handlers, L626-629 toggleCollapseAll, L855-938 sidebar JSX) — current structure, state vars, handlers
- `src/renderer/src/VaultSwitcher.tsx` (full) — popover to refactor
- `src/renderer/src/FileTree.tsx` (full) — reused unchanged; local per-item expanded state (L55)
- `src/renderer/src/index.css` (L1-10 tokens, L311-616 sidebar/vault/tree styles) — classes to add/adapt/retire
- `.planning/phases/01-sidebar-sections/01-CONTEXT.md` — locked decisions
- `.planning/phases/01-sidebar-sections/01-UI-SPEC.md` — visual/interaction contract
- `./CLAUDE.md` — project constraints
- `.planning/codebase/CONCERNS.md` — no-test-harness, App.tsx monolith landmines
- `package.json` — scripts (no test script; typecheck is the gate)

### Secondary (MEDIUM confidence)
- None required — all findings are grounded in first-party source files.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all icons/hooks verified present in source.
- Architecture: HIGH — target structure fully derived from existing code + locked UI-SPEC.
- Pitfalls: HIGH — grounded in the actual tsconfig strictness, CONCERNS.md, and the real JSX.
- Validation: HIGH — confirmed no test harness exists; typecheck + manual UAT is the honest gate.

**Research date:** 2026-07-03
**Valid until:** 2026-08-02 (stable — internal restructure, no fast-moving external deps)
