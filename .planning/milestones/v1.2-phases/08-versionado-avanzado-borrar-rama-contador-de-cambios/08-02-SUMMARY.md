---
phase: 08-versionado-avanzado-borrar-rama-contador-de-cambios
plan: 02
subsystem: ui
tags: [isomorphic-git, diff, jsdiff, ipc, react, status-bar, racy-git]

# Dependency graph
requires:
  - phase: 08-01
    provides: "Superficie de Phase 8 (VER-01) y patrón de status bar/save-status (STAT-01) sobre el que convive el contador"
provides:
  - "Método git.pendingLineStat(dir): { added, removed } que suma +/- de TODOS los pendientes (no solo .md) vía content-hash vs HEAD"
  - "Canal IPC geode:git-pending-linestat + GitApi.pendingLineStat + bridge preload"
  - "Contador +N verde / -N rojo en la status bar (CHG-01), siempre visible, solo con cambios"
affects: [08-03, status-bar, git-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recuento de líneas pendientes reutilizando pendingChanges/headOid/safeReadAt (content-hash, nunca statusMatrix)"
    - "Recálculo fire-and-forget del contador en los mismos puntos que el save-status (refreshTree/onPaneNoteChange/onPaneSaved)"

key-files:
  created: []
  modified:
    - src/main/services/git.ts
    - src/shared/ipc.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/App.tsx
    - src/renderer/src/index.css

key-decisions:
  - "pendingLineStat suma TODOS los pendientes (adjuntos incluidos), a diferencia de pendingDiff que acota a .md para la IA — el contador refleja la magnitud real del trabajo sin versionar"
  - "Detección por diffLines(oldText, newText) sobre content-hash vs blobs de HEAD; binarios saltados con looksBinary; jamás statusMatrix (regla racy-git)"
  - "Contador siempre visible (no gateado por Modo Avanzado ni por openPath); es el estado del vault, no de la nota abierta"
  - "Recálculo fire-and-forget (void, sin await) en edición para no bloquear el tecleo; sin invocar IA (invariante de costo)"

patterns-established:
  - "Colores reusados de tokens existentes: +#68d391 (diff-swatch-add), -#ff6b6b (diff-swatch-del) — sin inventar verde/rojo nuevos"

requirements-completed: [CHG-01]

# Metrics
duration: 12 min
completed: 2026-07-06
---

# Phase 8 Plan 02: Contador de líneas sin commitear (CHG-01) Summary

**Contador `+N` verde / `−N` rojo en la status bar que suma las líneas agregadas/quitadas de TODOS los archivos pendientes del vault (content-hash vs HEAD, nunca statusMatrix), expuesto por un nuevo canal IPC y siempre visible.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-06
- **Completed:** 2026-07-06
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `git.pendingLineStat(dir): Promise<{ added, removed }>` en `git.ts`: reutiliza `pendingChanges`/`headOid`/`safeReadAt`, cuenta con `diffLines` (jsdiff) sobre el contenido real, salta binarios y suma todos los pendientes (no solo `.md`).
- Canal IPC `geode:git-pending-linestat` + `GitApi.pendingLineStat` + handler `requireRoot()` en main + bridge `window.geode.git.pendingLineStat`.
- Contador `.line-stat` en `.status-left`: `+N` verde `#68d391` / `−N` rojo `#ff6b6b`, renderizado solo cuando `added+removed>0`, siempre visible, convive con el save-status (STAT-01).
- Recálculo en `refreshTree`, `onPaneSaved` y `onPaneNoteChange` (panel activo, fire-and-forget), sin invocar IA.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: Backend — pendingLineStat + canal IPC + handler + bridge** - `579f0df` (feat)
2. **Task 2: UI — contador .line-stat en la status bar + recálculo y CSS** - `0ec7622` (feat)

## Files Created/Modified
- `src/main/services/git.ts` - Nuevo método `pendingLineStat`; import de `diffLines` sumado al de `diff`.
- `src/shared/ipc.ts` - Canal `gitPendingLineStat` + método `GitApi.pendingLineStat`.
- `src/main/index.ts` - Handler `ipcMain.handle(IPC.gitPendingLineStat, ...)` con `requireRoot()`.
- `src/preload/index.ts` - Bridge `pendingLineStat` en `window.geode.git`.
- `src/renderer/src/App.tsx` - Estado `lineStat` + helper `refreshLineStat`; render del span `.line-stat`; recálculo en refreshTree/onPaneSaved/onPaneNoteChange.
- `src/renderer/src/index.css` - Clase `.line-stat` (12px, gap 4px) con `.added #68d391` / `.removed #ff6b6b`.

## Decisions Made
- **Suma de todos los pendientes:** a diferencia de `pendingDiff` (acota a `.md` para la IA), `pendingLineStat` cuenta todos los archivos porque el contador mide magnitud real de trabajo sin versionar.
- **Content-hash, nunca statusMatrix:** la detección de cambios va por `pendingChanges` → `headBlobs`/`workBlobs` (regla racy-git); binarios saltados con `looksBinary`.
- **Siempre visible:** no gateado por Modo Avanzado ni por `openPath`; es estado del vault. Convive con el save-status humanizado.
- **Sin costo de IA:** el recálculo nunca invoca IA (invariante de costo).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CHG-01 completo a nivel código; `npm run typecheck` (node+web) en verde.
- CHG-01 toca el proceso MAIN (nuevo método + canal IPC): la verificación funcional exige relanzar la app completa — se cubre en el UAT de `08-03-PLAN.md`. No se relanzó la app en este plan (por diseño).

## Self-Check: PASSED

- Commits `579f0df` y `0ec7622` presentes en `git log`.
- `pendingLineStat` en git.ts / ipc.ts / main/index.ts / preload/index.ts (grep OK).
- `.line-stat` en App.tsx (span) y index.css (clase + .added/.removed) (grep OK).
- `npm run typecheck` (node+web) en verde tras ambas tareas.

---
*Phase: 08-versionado-avanzado-borrar-rama-contador-de-cambios*
*Completed: 2026-07-06*
