---
phase: 12
slug: asistente-de-respaldo-en-la-nube
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 12 — Validation Strategy

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
- **Before `/gsd-verify-work`:** Build verde + UAT manual (con cuenta GitHub real)
- **Max feedback latency:** ~60 s

---

## Per-Task Verification Map

> Sin runner de tests unitarios. Verificación = typecheck+build verde (automatizable) + UAT humano. La lógica pura verificable por aserción de fuente: sanitización de nombre de repo GitHub y el mapeo de errores (funciones puras). El resto (device flow, createRepo, push, auto-push en save, STAT-01) requiere UAT con una cuenta GitHub real y red.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-XX | — | 1 | BACKUP-05 | — | Mapeo de errores API→humano, nunca texto crudo | typecheck | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 12-XX | — | 1 | BACKUP-03 | — | Nombre de repo GitHub-válido derivado del cuaderno | typecheck | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 12-XX | — | 2 | BACKUP-03/04 | — | enable-backup: createRepo→setRemote→push idempotente + autoPush ON | build | `npm run build` | ❌ W0 | ⬜ pending |
| 12-XX | — | 2 | BACKUP-04 | — | Auto-push tras cada commit; "Todo en la nube" solo limpio+pusheado (STAT-01) | manual | UAT | ❌ W0 | ⬜ pending |
| 12-XX | — | 3 | BACKUP-01/02 | — | Tarjeta no bloqueante + wizard + checklist; botón persistente data-tour | manual | UAT | ❌ W0 | ⬜ pending |
| 12-XX | — | 3 | COPY-01 | — | Reescritura "GitHub/bóveda/repo"→respaldo en Ajustes/píldora/popover/NewVaultDialog | build+manual | `npm run build` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Ningún runner de tests a instalar — política del proyecto (typecheck+build+UAT). No se introduce framework de tests en esta fase.

*Existing infrastructure (typecheck + build) covers automated verification for pure logic; behavior confirmed via human UAT with a real GitHub account.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Invitación no bloqueante tras crear cuaderno; "Hacerlo después" sin re-nag; botón persistente | BACKUP-01 | UI + estado post-creación | Crear cuaderno nuevo; ver tarjeta; "Hacerlo después"; confirmar que no reaparece sola y que el botón de respaldo sigue en la status bar |
| Onboarding de cuenta: hand-off a signup + checklist sobrevive ida-y-vuelta; "GitHub" solo acá | BACKUP-02 | Navegador externo + persistencia | "Crear una gratis" abre github.com/signup; volver a la app; checklist intacta; "Conectar" reusa device flow |
| Primer respaldo automático: repo privado + push sin exponer jerga | BACKUP-03 | GitHub real + red | Conectar cuenta; confirmar que se crea repo privado y sube la Primera versión sin pedir nombre ni mostrar repo/commit/push |
| Auto-respaldo tras guardar + "Todo en la nube" honesto | BACKUP-04 | Red + STAT-01 | Guardar una versión; confirmar push automático; el indicador dice "Todo en la nube" solo cuando todo está subido (no antes) |
| Errores en lenguaje humano | BACKUP-05 | Requiere provocar fallos reales | Conectar con nombre de repo ya existente → "Ya tenés un respaldo con ese nombre"; desconectar red → mensaje offline; nunca texto crudo de API |
| Copy sin jerga en Capa 0 | COPY-01 | Revisión visual | Recorrer Ajustes, píldora de estado, popover, NewVaultDialog; confirmar "respaldo/copia/cuaderno", "GitHub" solo en el paso de crear cuenta |

*Manual UAT (con cuenta GitHub real) es el gate conductual principal, consistente con el modelo de verificación del proyecto (cero tests automatizados).*

---

## Validation Sign-Off

- [ ] Cada tarea tiene verificación por typecheck/build o UAT manual documentada
- [ ] Continuidad de muestreo: typecheck tras cada commit, build tras cada wave
- [ ] Wave 0 no introduce framework de tests (política del proyecto)
- [ ] Sin flags de watch-mode
- [ ] Latencia de feedback < 60s
- [ ] `nyquist_compliant: true` a fijar cuando el planner mapee cada tarea a su verificación

**Approval:** pending
