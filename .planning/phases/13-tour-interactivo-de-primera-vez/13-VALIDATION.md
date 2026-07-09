---
phase: 13
slug: tour-interactivo-de-primera-vez
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — el repo no tiene runner de tests (riesgo standing declarado en PROJECT.md) |
| **Config file** | none |
| **Quick run command** | `npm run typecheck` (tsc --noEmit, node + web) |
| **Full suite command** | `npm run build` (electron-vite: main + preload + renderer) |
| **Estimated runtime** | ~30-60 s |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd-verify-work`:** Build verde + UAT manual (recorrido de primera vez)
- **Max feedback latency:** ~60 s

---

## Per-Task Verification Map

> Sin runner de tests. Verificación = typecheck+build verde (automatizable) + UAT humano. La lógica pura verificable por aserción de fuente: el modelo de pasos, el cálculo de placement/auto-flip, la coerción de estado tri-state. El comportamiento visual (spotlight, posicionamiento, recálculo en resize/scroll, disparo tras crear cuaderno) requiere UAT manual.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-----------|--------|
| 13-XX | — | 1 | TOUR-02 | — | Persistencia tour.state (unseen/started/seen) + IPC get/set | typecheck | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 13-XX | — | 1 | TOUR-01 | — | data-tour en editor/Save/Timeline (respaldo ya existe) | build | `npm run build` | ❌ W0 | ⬜ pending |
| 13-XX | — | 2 | TOUR-01/03 | — | TourOverlay: spotlight vía getBoundingClientRect, degrada sin romper | build | `npm run build` | ❌ W0 | ⬜ pending |
| 13-XX | — | 2 | TOUR-02 | — | Disparo tras crear cuaderno; re-lanzar (paleta + HelpCircle); nunca auto-repite | manual | UAT | ❌ W0 | ⬜ pending |
| 13-XX | — | 3 | TOUR-01/03 | — | Integración: tour primero vs BackupCard; nunca ancla Modo Avanzado | manual | UAT | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Ningún runner de tests a instalar — política del proyecto (typecheck+build+UAT). No se introduce framework de tests.

*Existing infrastructure (typecheck + build) covers automated verification for pure logic; el comportamiento visual del overlay se confirma por UAT humano.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| El tour se dispara tras crear el primer cuaderno (no al arrancar), una sola vez | TOUR-01, TOUR-02 | Timing + estado post-creación | Crear un cuaderno nuevo; confirmar que aparece el recorrido; reiniciar la app; confirmar que NO reaparece solo |
| 4 pasos anclados a botones reales con spotlight + "Paso N de M" | TOUR-01 | Posicionamiento visual real | Recorrer escribir→guardar→respaldar→historial; confirmar que el spotlight cae sobre el control correcto y el cartel se posiciona bien (auto-flip) |
| Saltar/Siguiente/Anterior/Esc; no se atasca | TOUR-01, TOUR-02 | Interacción | Probar Saltar (cierra + marca visto), Anterior/Siguiente, Esc; confirmar que nunca queda trabado |
| Re-lanzable desde la paleta y el botón de Ayuda | TOUR-02 | Superficie de re-entrada | Ejecutar "Ver el recorrido guiado" desde la paleta y desde el HelpCircle del ActivityBar; confirmar que reinicia el tour |
| Degradación: ancla ausente → cartel centrado sin romper | TOUR-03 | Estado raro del DOM | Forzar (si se puede) un paso cuyo ancla no esté montado; confirmar cartel centrado, sin crash de rect null |
| Nunca ancla Modo Avanzado; tour primero, tarjeta de respaldo no encimada | TOUR-03 | Coordinación visual | Con Modo Avanzado ON, confirmar que el tour no resalta rama/merge/grafo; confirmar que el tour corre antes que la tarjeta de respaldo y no se superponen |
| Timeline colapsado se expande para el paso "historial" | TOUR-03 | Estado de la sección | Colapsar la sección Timeline; correr el tour; confirmar que el paso historial la expande/ancla bien |

*Manual UAT es el gate conductual principal (recorrido visual), consistente con el modelo del proyecto (cero tests automatizados).*

---

## Validation Sign-Off

- [ ] Cada tarea tiene verificación por typecheck/build o UAT manual documentada
- [ ] Continuidad de muestreo: typecheck tras cada commit, build tras cada wave
- [ ] Wave 0 no introduce framework de tests (política del proyecto)
- [ ] Sin flags de watch-mode
- [ ] Latencia de feedback < 60s
- [ ] `nyquist_compliant: true` a fijar cuando el planner mapee cada tarea a su verificación

**Approval:** pending
