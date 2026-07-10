---
phase: 11
slug: bienvenida-y-creaci-n-local
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-08
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — el repo no tiene tests automatizados (riesgo standing declarado en PROJECT.md) |
| **Config file** | none |
| **Quick run command** | `npm run typecheck` (tsc --noEmit vía electron-vite) |
| **Full suite command** | `npm run build` (electron-vite build: main + preload + renderer) |
| **Estimated runtime** | ~30-60 segundos |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd-verify-work`:** Build must be green + UAT manual
- **Max feedback latency:** ~60 segundos

---

## Per-Task Verification Map

> El repo no tiene runner de tests unitarios. La verificación es typecheck+build verde (automatizable) + UAT humano (manual). La lógica pura sanitizable (util de sanitización Windows) es la única con verificación por aserción de fuente clara; el resto es comportamiento de UI/IPC verificado manualmente.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-XX | — | 1 | ONB-04 | — | Sanitiza ilegales Windows + reservados; nunca pisa datos (sufijo) | typecheck | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 11-XX | — | 2 | ONB-02 | — | createLocal crea bajo ~/Documents/Geode sin picker | build | `npm run build` | ❌ W0 | ⬜ pending |
| 11-XX | — | 3 | ONB-03 | — | Bienvenida.md sembrada + commiteada como 1ª versión | manual | UAT | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Ningún runner de tests a instalar — la política del proyecto es typecheck+build+UAT (no se introduce framework de tests en esta fase; sería scope nuevo).

*Existing infrastructure (typecheck + build) covers automated verification for this phase; behavior is confirmed via human UAT.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bienvenida sin jerga, CTA único "Crear mi primer cuaderno", link secundario | ONB-01, COPY-01 | UI visual sin runner de tests de render | Borrar/renombrar settings para forzar estado sin vault; abrir app; verificar copy y ausencia de "GitHub/bóveda/repo" |
| Creación local en 1 click en ~/Documents/Geode/<nombre> sin picker ni cuenta | ONB-02 | Efecto de FS + diálogo del SO | Click CTA con nombre prefijado; confirmar carpeta creada en Documentos/Geode y editor abierto |
| Cuaderno abre con Bienvenida.md (nunca editor vacío), borrable, commiteada | ONB-03 | Estado de editor + primera versión git | Tras crear, confirmar Bienvenida.md abierta y que "ver historial" muestra 1 versión |
| Nombres ilegales/repetidos siempre crean bien sin pisar | ONB-04 | Interacción FS + colisión de carpeta | Crear "a/b:c" y luego repetir mismo nombre; confirmar sanitización y sufijo ` (2)` |

*Manual UAT is the primary behavioral gate for this frontend phase, consistent with the project's zero-automated-tests verification model.*

---

## Validation Sign-Off

- [ ] Todas las tareas tienen verificación por typecheck/build (automatizada) o UAT manual documentada
- [ ] Continuidad de muestreo: typecheck tras cada commit, build tras cada wave
- [ ] Wave 0 no introduce framework de tests (política del proyecto)
- [ ] Sin flags de watch-mode
- [ ] Latencia de feedback < 60s
- [ ] `nyquist_compliant: true` a fijar cuando el planner mapee cada tarea a su verificación

**Approval:** pending
