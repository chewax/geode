---
phase: 05-advanced-mode-capa-0-polish
plan: 01
subsystem: ui
tags: [electron, ipc, react, settings, advanced-mode, feature-flag]

# Dependency graph
requires:
  - phase: 04-automatic-snapshots
    provides: patrón de config persistida (snapshots) settings→ipc→preload→main→SettingsModal
provides:
  - "Tipos AdvancedConfig/AdvancedApi en src/shared/ipc.ts"
  - "Canales IPC geode:advanced-get / geode:advanced-set"
  - "window.geode.advanced (get/set) expuesto por el preload"
  - "settings.advanced.enabled persistido + setAdvanced() en settings.ts"
  - "Handlers ipcMain advancedGet (default false) / advancedSet (coerción !!enabled)"
  - "Sección 'General' en SettingsModal con el toggle Modo Avanzado (default off)"
affects: [advanced-mode, git-surfaces, ADV-01, ADV-03, mode-gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Feature-flag booleano persistido siguiendo el análogo snapshots (load→spread→save)"
    - "Switch accesible: checkbox semántico estilado con foco de teclado visible (--accent)"

key-files:
  created: []
  modified:
    - src/main/services/settings.ts
    - src/shared/ipc.ts
    - src/preload/index.ts
    - src/main/index.ts
    - src/renderer/src/SettingsModal.tsx
    - src/renderer/src/index.css

key-decisions:
  - "El flag advanced usa coerción booleana pura (!!enabled) en el handler; sin resolver numérico ni reinicio de timer (a diferencia de snapshots)"
  - "General se renderiza como PRIMERA sección de la nav pero la sección abierta por defecto sigue siendo 'ai' (no se cambió el estado inicial)"
  - "Switch implementado como <input type=checkbox> estilado (.switch-*), no como botón-toggle, para semántica y accesibilidad nativas"

patterns-established:
  - "Modo Avanzado se lee en el montaje de Ajustes dentro de try/catch → fallback a off ante fallo IPC (git-free por defecto)"

requirements-completed: [ADV-02]

# Metrics
duration: 12 min
completed: 2026-07-05
---

# Phase 5 Plan 01: Modo Avanzado — flag persistido + sección General Summary

**Cableado de punta a punta del flag booleano "Modo Avanzado" (settings.json → IPC `geode:advanced-get/set` → preload → main) y una nueva sección "General" en Ajustes con un toggle accesible, default off, que persiste entre sesiones.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-05
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Round-trip del flag `advanced`: tipos `AdvancedConfig`/`AdvancedApi`, canales `geode:advanced-get`/`geode:advanced-set`, `window.geode.advanced`, `settings.advanced.enabled` + `setAdvanced()`, y handlers en main (get devuelve `false` por defecto; set coacciona con `!!enabled`).
- Nueva sección "General" en `SettingsModal` como primer botón de nav y primer bloque de contenido, con el toggle "Modo Avanzado".
- Lectura inicial del flag envuelta en try/catch → cae a off sin error bloqueante (experiencia git-free por defecto).
- Switch CSS accesible y operable por teclado (`.switch-*`), con estado on en `--accent` y foco visible.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: Round-trip del flag advanced (settings + ipc + preload + main)** - `a983cb5` (feat)
2. **Task 2: Sección "General" en Ajustes con toggle Modo Avanzado** - `061aae8` (feat)

## Files Created/Modified
- `src/main/services/settings.ts` - Campo `advanced?: { enabled?: boolean }` en `Settings` + `setAdvanced(enabled)`.
- `src/shared/ipc.ts` - Canales `advancedGet`/`advancedSet`, tipos `AdvancedConfig`/`AdvancedApi`, `advanced: AdvancedApi` en `GeodeApi`.
- `src/preload/index.ts` - Puente `advanced.get`/`advanced.set` vía `ipcRenderer.invoke`.
- `src/main/index.ts` - Import `setAdvanced` + `type AdvancedConfig`; handlers `IPC.advancedGet`/`IPC.advancedSet`.
- `src/renderer/src/SettingsModal.tsx` - Union `Section` con `'general'`, import `SlidersHorizontal`, estado `advanced` + `changeAdvanced`, lectura en montaje con fallback, nav + bloque de sección.
- `src/renderer/src/index.css` - Estilos `.switch-row/.switch-input/.switch-track/.switch-text` (switch accesible, on en `--accent`, foco visible).

## Decisions Made
- Coerción booleana pura `!!enabled` en el handler (mitigación T-05-01); sin resolver numérico ni timer, a diferencia del análogo `snapshots`.
- "General" renderiza primero pero la sección inicial abierta sigue siendo `'ai'` (el plan lo permite explícitamente: "debe RENDERIZAR primero, no necesariamente abrir por defecto").
- Toggle como checkbox semántico estilado (no botón-toggle) por accesibilidad nativa de teclado.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Threat Model Compliance
- T-05-01 (Tampering en `IPC.advancedSet`): mitigado con coerción `!!enabled` antes de persistir; el valor crudo nunca condiciona lógica.
- T-05-02 / T-05-SC: aceptados según el plan (flag booleano no sensible; sin instalación de paquetes npm en esta fase).

## Verification
- `npm run typecheck:node` — PASS (Task 1).
- `npm run typecheck:web` — PASS (Task 2).
- `npm run typecheck` (node + web) — PASS.
- Manual (persistencia entre reinicios): diferido al UAT 05-04 por diseño.

## Next Phase Readiness
- El interruptor `window.geode.advanced` está disponible para gatear ADV-01/ADV-03 (superficies git en toolbar/statusbar) en los planes siguientes de la Fase 5.
- Sin blockers.

## Self-Check: PASSED

- Todos los archivos modificados existen en disco (6/6).
- Ambos commits de tarea presentes: `a983cb5`, `061aae8`.

---
*Phase: 05-advanced-mode-capa-0-polish*
*Completed: 2026-07-05*
