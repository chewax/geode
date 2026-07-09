---
phase: 13-tour-interactivo-de-primera-vez
plan: 03
subsystem: onboarding-tour
tags: [react, hook, state-machine, tour, onboarding, first-run, tri-state, palette, activity-bar]

# Dependency graph
requires:
  - phase: 13-01
    provides: "window.geode.tour.get()/set() (TourState tri-state persistente)"
  - phase: 13-02
    provides: "TourOverlay (portal/spotlight) + TOUR_STEPS (modelo de 4 pasos)"
provides:
  - "Hook useTour: máquina de estado tri-state + recuperación 'reaparecer una vez' + Esc"
  - "Disparo del tour tras el primer cuaderno (createLocalVault), una sola vez"
  - "Gate !tour.active en la BackupCard (tour primero, tarjeta después)"
  - "Comando de paleta 'core.tour' ('Ver el recorrido guiado', categoría Ayuda)"
  - "Anclas data-tour Capa 0: escribir/guardar/historial (respaldo reusado de Fase 12)"
  - "Botón HelpCircle de la ActivityBar habilitado como re-lanzamiento del tour"
affects: [onboarding, first-run]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hook máquina-de-estado tri-state con ref-espejo para callbacks estables (skip/finish/Esc)"
    - "Recuperación 'reaparecer una vez': 'started' + vaultReady → relanza y fija 'seen' con guarda oneShot"
    - "Ref al re-lanzamiento (tourRef) para comando de paleta registrado una sola vez (deps [])"

key-files:
  created:
    - src/renderer/src/tour/useTour.ts
  modified:
    - src/renderer/src/App.tsx
    - src/renderer/src/ActivityBar.tsx

key-decisions:
  - "El disparo de primer uso se encapsula en startFirstRun() (persiste 'started' + launch), no vive en App: App solo consulta tour.tourState === 'unseen'"
  - "launch() nunca toca persistencia (re-verlo no re-nag); solo startFirstRun/skip/finish/recuperación escriben en disco"
  - "Guarda oneShotRef unifica 'primer uso' y 'recuperación': una sola apertura automática por sesión, evitando que la recuperación 'started' colisione con el disparo recién persistido"
  - "El ancla 'historial' envuelve al Timeline DENTRO del SidebarSection para que el auto-expand de TourOverlay encuentre el toggle colapsado en el .sidebar-section más cercano"
  - "Comando de paleta lee tourRef.current() (ref-espejo) por el efecto de registro con deps [] (mismo idioma que commandApiRef)"

requirements-completed: [TOUR-01, TOUR-02, TOUR-03]

# Metrics
duration: 11min
completed: 2026-07-09
tasks: 3
files: 3
---

# Phase 13 Plan 03: Cableado del tour de primera vez Summary

**Último eslabón de la Fase 13: el hook `useTour` (máquina de estado tri-state con recuperación "reaparecer una vez" y cierre por Esc) más su cableado en App.tsx (disparo tras el primer cuaderno, gate de la BackupCard, comando de paleta, anclas Capa 0 y montaje del overlay) y el botón de Ayuda de la ActivityBar como re-lanzamiento — convierten las piezas aisladas de los Planes 01/02 en un recorrido de primera vez funcional y coordinado con la Fase 12.**

## What Was Built

- **`src/renderer/src/tour/useTour.ts` (NUEVO):** hook máquina-de-estado. Posee `tourState` ('unseen'|'started'|'seen'), `active` y `stepIndex`; expone `launch`, `startFirstRun`, `next`, `prev`, `skip`, `finish`.
  - **Carga inicial + recuperación:** un `useEffect` lee `window.geode.tour.get()`; si el estado guardado es `'started'` (interrumpido) y hay un cuaderno abierto (`vaultReady`), relanza UNA vez y fija `'seen'` de inmediato (guarda `oneShotRef`) para que una segunda interrupción no cicle (RESEARCH Pitfall 4).
  - **`launch()`:** `stepIndex=0; active=true`. NO persiste (re-verlo no re-nag).
  - **`startFirstRun()`:** persiste `'started'`, abre el tour, y marca `oneShotRef` (evita colisión con la recuperación).
  - **`skip()`/`finish()`/Esc:** cierran y persisten `'seen'` una sola vez (ref-espejo `tourStateRef` para idempotencia sin re-crear el callback).
  - **Esc:** listener global gateado en `active`, con cleanup (patrón Ctrl+P de App.tsx).
- **`src/renderer/src/App.tsx` (EDIT):**
  - Instancia `const tour = useTour(!!vault)`.
  - Dispara `tour.startFirstRun()` en `createLocalVault` tras `adoptVault`/`openNote` y el bloque de invitación al respaldo, solo si `tour.tourState === 'unseen'`.
  - Gate de la BackupCard extendido a `... && vault && !tour.active` (tour primero, tarjeta después).
  - Comando `core.tour` ('Ver el recorrido guiado', categoría 'Ayuda') en el array `cmds` NO-git, invocando `tourRef.current()`.
  - Anclas `data-tour="escribir"` (`.pane-root`), `"guardar"` (botón Save), `"historial"` (envoltura del Timeline dentro del SidebarSection).
  - `onShowTour={() => tour.launch()}` en `<ActivityBar>`.
  - Montaje de `<TourOverlay steps={TOUR_STEPS} .../>` condicionado a `tour.active`.
- **`src/renderer/src/ActivityBar.tsx` (EDIT):** prop `onShowTour` añadida; el botón `HelpCircle` deja de estar `disabled`, con `title`/`aria-label` = "Ver el recorrido guiado" y `onClick={onShowTour}`.

## Task Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Hook useTour (máquina de estado + persistencia + recuperación + Esc) | 6f858f2 | src/renderer/src/tour/useTour.ts |
| 2 | Cableado en App.tsx (disparo, gate, paleta, anclas, montaje) | 6108652 | src/renderer/src/App.tsx |
| 3 | Habilitar el botón de Ayuda en ActivityBar | 3d0a2fc | src/renderer/src/ActivityBar.tsx |

## Verification

- **Task 1:** `npm run typecheck` en verde (node + web).
- **Tasks 2 y 3:** `npm run build` en verde (typecheck node + web + bundle main/preload/renderer). Estado final del árbol: verde.
- **Grep del plan:** `<TourOverlay` = 1 en App.tsx; `data-tour="escribir|guardar|historial"` presentes; `id: 'core.tour'` = 1; `onShowTour` en ActivityBar.tsx (3) y App.tsx (1); ningún `data-tour` dentro de un bloque `advanced &&` (verificado por lectura: las anclas viven en `.pane-root`, el botón Save siempre montado y la sección Timeline, ninguno advanced-gated). El `data-tour="respaldo"` del grep en App.tsx es solo un comentario; el atributo real vive en BackupButton.tsx:90 (Fase 12), sin duplicación.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ref-espejo `tourRef` para el comando de paleta**
- **Found during:** Task 2
- **Issue:** El efecto de registro de comandos corre una sola vez (deps `[]`). Registrar `run: () => tour.launch()` directamente capturaría una clausura obsoleta del hook.
- **Fix:** Se añadió `tourRef = useRef(tour.launch); tourRef.current = tour.launch` (mismo idioma que el `commandApiRef` existente) y el comando invoca `tourRef.current()`. Sin cambio de comportamiento; el re-lanzamiento desde la paleta siempre usa el `launch` actual.
- **Files modified:** src/renderer/src/App.tsx
- **Commit:** 6108652

### Note on interface-first ordering (Tasks 2/3 mutuamente dependientes)

Task 2 pasa `onShowTour` a `<ActivityBar>` y Task 3 agrega esa prop (requerida) a `ActivityBarProps`. Ninguno de los dos commits compila en aislamiento estricto (dependencia mutua), igual que el split interface-first del Plan 01. El `npm run build` se corrió con ambas ediciones en el árbol; el estado final tras Task 3 es verde. No se alteró el alcance de ningún task.

## Threat Model Compliance

- **T-13-06 (Elevation / Info leak — Modo Avanzado en Capa 0, mitigate):** cumplido — `data-tour` solo en `escribir`/`guardar`/`historial` (+ `respaldo` existente); los botones `advanced &&` (rama/merge/grafo) no reciben ancla alguna. Verificado por lectura y grep.
- **T-13-07 (Tampering en tour.set, mitigate):** el renderer solo envía literales del enum (`'started'`/`'seen'`); la coerción vive en el handler del main (Plan 01).
- **T-13-08 (DoS — re-nag / atasco, mitigate):** Esc/Saltar siempre cierran; `'seen'` es terminal (no auto-repite); `'started'` reaparece exactamente una vez (guarda `oneShotRef` + fijar `'seen'` al recuperar). Sin trampa de foco.

## Known Stubs

Ninguno. El recorrido está cableado end-to-end: disparo, progreso, re-lanzamiento (paleta + HelpCircle), persistencia tri-state y degradación grácil (provista por TourOverlay en Plan 02).

## User Setup Required

Ninguna. Sin servicios externos, sin claves.

## Next Phase Readiness

- Recorrido de primera vez operativo end-to-end. Pendiente el UAT manual del gate de fase (13-VALIDATION.md): crear primer cuaderno → tour arranca (no la app) → 4 pasos con spotlight → Saltar marca visto y no reaparece → BackupCard aparece tras el tour → re-lanzar desde paleta y HelpCircle → Timeline colapsada se expande en el paso historial → cierre a mitad reaparece una vez → con Modo Avanzado ON no resalta rama/merge/grafo.

## Self-Check: PASSED

- FOUND: src/renderer/src/tour/useTour.ts
- FOUND: commit 6f858f2 (Task 1)
- FOUND: commit 6108652 (Task 2)
- FOUND: commit 3d0a2fc (Task 3)
- FOUND: `<TourOverlay` en src/renderer/src/App.tsx
- FOUND: `id: 'core.tour'` en src/renderer/src/App.tsx
- FOUND: `onShowTour` en src/renderer/src/ActivityBar.tsx
