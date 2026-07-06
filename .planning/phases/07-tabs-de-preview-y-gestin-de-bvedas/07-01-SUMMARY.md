---
phase: 07-tabs-de-preview-y-gestin-de-bvedas
plan: 01
subsystem: ui
tags: [react, panes, tabs, vscode-preview, paneTree]

# Dependency graph
requires:
  - phase: (previo) modelo de panes recursivo
    provides: paneTree.ts con LeafPane/SplitPane y ops puras; EditorPane/PaneView; FileTree
provides:
  - Campo preview en LeafPane (una preview temporal por panel)
  - openInLeaf con modo { preview: true } y swap in-place
  - pinTab (fija la preview como permanente)
  - Distinción single-click (preview) vs double-click (permanente) en el árbol
  - Fijado de la preview al editar y al doble-click sobre la tab
  - Señal visual itálica de la tab de preview (.tab.preview)
affects: [07-02, 07-03, gestión de bóvedas, tabs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ops puras de paneTree que preservan/limpian estado auxiliar (preview) sin regenerar ids de hoja"
    - "Preview de tab estilo VSCode: una por panel, reutilizable por swap in-place"

key-files:
  created: []
  modified:
    - src/renderer/src/paneTree.ts
    - src/renderer/src/FileTree.tsx
    - src/renderer/src/App.tsx
    - src/renderer/src/EditorPane.tsx
    - src/renderer/src/PaneView.tsx
    - src/renderer/src/index.css

key-decisions:
  - "La itálica es la única señal visual de la preview (sin nuevo color/peso/icono), por UI-SPEC"
  - "Se agregó onPinTab a PaneView (no listado explícito en el plan) para propagar el pin desde EditorPane a App"

patterns-established:
  - "Preview de panel: swap in-place para no crecer el array de tabs al hojear notas"
  - "Fijado idempotente vía pinTab: no-op si la ruta no es la preview"

requirements-completed: [FILE-04]

# Metrics
duration: ~12min
completed: 2026-07-06
---

# Phase 7 Plan 01: Tabs de preview estilo VSCode Summary

**Tabs de preview reutilizables (itálicas, una por panel) con single-click en el árbol; doble-click, edición o doble-click sobre la tab la fijan como permanente.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-06
- **Completed:** 2026-07-06
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- `LeafPane` gana `preview: string | null` y todas las ops puras (openInLeaf, dropTab, removePathEverywhere, keepOnly) preservan o limpian ese estado sin regenerar ids de hoja.
- `openInLeaf` soporta `{ preview: true }` con reemplazo in-place de la preview existente (el conteo de tabs no crece al hojear); el modo permanente por defecto fija la preview si coincidía.
- Nueva `pinTab` idempotente que fija la preview como permanente.
- El árbol distingue click (preview) de doble-click (permanente); cualquier edición fija la preview del panel; doble-click sobre la tab también la fija.
- La tab de preview se renderiza en itálica (`.tab.preview .tab-label`), sin introducir nuevo color/peso/icono.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: Modelar la preview en paneTree.ts** - `d8a9056` (feat)
2. **Task 2: Distinguir single/double click en el árbol y fijar-al-editar** - `853686d` (feat)
3. **Task 3: Señal visual itálica y pin por doble-click en la tab** - `37e9219` (feat)

## Files Created/Modified
- `src/renderer/src/paneTree.ts` - Campo `preview` en LeafPane; `openInLeaf` con opts; nueva `pinTab`; limpieza de preview en dropTab/removePathEverywhere/keepOnly.
- `src/renderer/src/FileTree.tsx` - `onOpen` acepta `{ pinned }`; `onDoubleClick` en tree-file fija permanente.
- `src/renderer/src/App.tsx` - `openNote` propaga pinned; `newNoteIn` abre permanente; `onPaneNoteChange` llama `pinTab`; `onPinTab` pasado a PaneView; import de `pinTab`.
- `src/renderer/src/EditorPane.tsx` - Clase `.preview` en la tab; `onDoubleClick` → `onPinTab`; prop `onPinTab`.
- `src/renderer/src/PaneView.tsx` - Passthrough de `onPinTab` a EditorPane.
- `src/renderer/src/index.css` - Regla `.tab.preview .tab-label { font-style: italic; }`.

## Decisions Made
- La itálica es la única señal visual de la preview (sin color/peso/icono nuevo), conforme UI-SPEC.
- `onPinTab` se agregó a la interfaz de props de `PaneView` para propagar el pin (EditorPane → App); es el único punto no listado literalmente en el plan pero implícito en el passthrough estándar de PaneView.

## Deviations from Plan

None - plan executed exactly as written. (El añadido de `onPinTab` a `PaneView` estaba previsto en el plan como passthrough condicional.)

## Issues Encountered
None. `npm run typecheck` (node+web) en verde tras cada tarea.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FILE-04 (mitad de preview tabs) implementado; listo para UAT en 07-03.
- Los splits y el drag-and-drop de tabs no se tocaron; `makeLeaf` inicializa `preview: null` para todas las hojas nuevas (splits nacen con tabs permanentes).

## Self-Check: PASSED
- Commits verificados: d8a9056, 853686d, 37e9219
- SUMMARY.md presente

---
*Phase: 07-tabs-de-preview-y-gestin-de-bvedas*
*Completed: 2026-07-06*
