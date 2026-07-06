---
phase: 05-advanced-mode-capa-0-polish
plan: 02
subsystem: ui
tags: [react, diff, accessibility, git, typescript]

# Dependency graph
requires:
  - phase: 05-advanced-mode-capa-0-polish
    provides: time/labels.ts (entryLabel/relativeDate) para etiquetas humanas
provides:
  - "DiffView con encabezado humano (fecha + nombre) sin hash"
  - "DiffViewProps con props opcionales date? y label? (consumidas por App en Plan 03)"
  - "patchLines oculta hunks @@ como divisor mudo y descarta lineas 'No newline'"
  - "Leyenda agregado/quitado en palabras + aria-label por linea add/del"
affects: [05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Estilos inline (CSSProperties) para colores semanticos del diff, manteniendo scope de un solo archivo"
    - "aria-label por linea para comunicar tipo de cambio sin depender del color"

key-files:
  created: []
  modified:
    - src/renderer/src/DiffView.tsx

key-decisions:
  - "Estilos inline en vez de nuevas reglas CSS para respetar el scope DiffView.tsx-only"
  - "Fallback humano 'Cambios de la version' cuando faltan date/label; nunca el oid"

patterns-established:
  - "Divisor de hunk como elemento aria-hidden sin texto (regla fina --border)"
  - "Leyenda de color en palabras sobre la lista de archivos (DIFF-02)"

requirements-completed: [DIFF-01, DIFF-02]

# Metrics
duration: 12 min
completed: 2026-07-05
---

# Phase 5 Plan 2: Humanizar el visor de diff Summary

**DiffView ahora lee como cambios de una versión: encabezado humano (fecha + nombre) sin hash, hunks `@@` ocultos como divisor mudo, líneas "No newline" descartadas, y leyenda agregado/quitado en palabras con aria-label por línea.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-05
- **Completed:** 2026-07-05
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- El cuerpo del diff nunca muestra encabezados de hunk `@@` (se emiten como `divider` mudo) ni marcadores `\ No newline at end of file` (se descartan con `continue`).
- Cada línea agregada/quitada expone un `aria-label` prefijado con `agregado`/`quitado`, y una leyenda con swatches verde `#68d391` / rojo `#ff6b6b` comunica el código de color en palabras.
- El encabezado usa la etiqueta humana `Cambios del {date} — {label}` recibida por props; el `oid` desaparece de toda la UI del visor y solo se usa como argumento de `commitDiff`.
- `DiffViewProps` gana `date?` y `label?` opcionales con fallback humano, de modo que el archivo compila de forma independiente (App las cablea en Plan 03).

## Task Commits

Each task was committed atomically:

1. **Task 1: Ocultar hunks/No-newline, leyenda y aria-labels** - `370f249` (feat)
2. **Task 2: Encabezado humano del diff vía props (sin hash)** - `57a8f4e` (feat)

**Plan metadata:** (docs commit for this SUMMARY)

## Files Created/Modified
- `src/renderer/src/DiffView.tsx` - Encabezado humano vía `headLabel(date, label)`, `patchLines` con `LnKind` `'divider'` + filtro "No newline", leyenda agregado/quitado con swatches, `aria-label` por línea add/del, y estilos inline `CSSProperties`. Se eliminó el span `.diff-oid` y `oid.slice`.

## Decisions Made
- **Estilos inline en vez de CSS nueva:** El scope de este plan era `DiffView.tsx` ONLY. Para que la leyenda (swatches verde/rojo) y el divisor sean visibles sin tocar `index.css`, los colores/regla se aplican con `CSSProperties` inline. Se conservan igualmente classNames kebab-case (`diff-legend`, `diff-swatch-add`, `diff-swatch-del`, `diff-ln.divider`) por si una regla CSS futura quiere engancharse.
- **Fallback del encabezado:** Cuando `date`/`label` faltan, `headLabel` devuelve una etiqueta humana (`Cambios de la versión`, o con solo uno de los dos) — nunca el hash.

## Deviations from Plan

None - plan executed exactly as written.

El plan dejaba la forma del divisor y las clases CSS "a discreción"; la elección de estilos inline (documentada arriba) cae dentro de esa discreción y del scope de un solo archivo, por lo que no constituye una desviación de reglas.

## Issues Encountered
None.

## Deferred Issues
- La regla CSS `.diff-ln.hunk` en `src/renderer/src/index.css` (L2121-2124) queda muerta al dejar de emitirse `kind: 'hunk'`. No se toca por estar fuera del scope `DiffView.tsx`-only; puede limpiarse en un plan de pulido de estilos.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 03 (App wiring) debe pasar `date` y `label` humanos al render de `DiffView` (resueltos con `entryLabel`/`relativeDate` de `time/labels.ts`).
- Verificación manual del encabezado/leyenda/ausencia de `@@` cubierta por el UAT de 05-04.

## Self-Check: PASSED
- `src/renderer/src/DiffView.tsx` existe en disco (modificado).
- Commits presentes: `370f249` (Task 1), `57a8f4e` (Task 2).
- `npm run typecheck:web` pasa sin errores tras ambas tareas.
- `patchLines` no emite `kind: 'hunk'`; header sin `oid.slice`/`.diff-oid`; `oid` solo en `commitDiff`.

---
*Phase: 05-advanced-mode-capa-0-polish*
*Completed: 2026-07-05*
