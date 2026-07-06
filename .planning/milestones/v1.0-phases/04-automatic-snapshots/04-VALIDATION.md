---
phase: 4
slug: automatic-snapshots
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-04
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test harness in this repo (out of scope this milestone, matches Phases 1–3) |
| **Config file** | none |
| **Quick run command** | `npm run typecheck` |
| **Full suite command** | `npm run typecheck && npm run build` |
| **Estimated runtime** | ~25 s |

---

## Sampling Rate

- **After every task commit:** `npm run typecheck`
- **After every plan wave:** `npm run typecheck && npm run build`
- **Before `/gsd-verify-work`:** Full suite green
- **Max feedback latency:** ~25 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-*-* | * | * | SNAP-01..04 | T-04-loop | cadenceMinutes validado contra el set permitido (sin 0ms tight-loop) | typecheck+build | `npm run typecheck && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Sin harness unitario; la corrección de comportamiento (timer, detección de cambios, snapshots de seguridad, sin IA) se confirma por UAT manual + typecheck/build, como en Fases 1–3.*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — no test framework to install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| §A — Configurar cadencia en Ajustes y que persista | SNAP-01 | Interacción con Ajustes + persistencia entre sesiones | En Ajustes → "Guardado automático" elegí una cadencia (p. ej. 5 min); cerrá y reabrí Ajustes: quedó elegida. Opciones: manual/5/10/15/30. |
| §B — Snapshot temporizado solo si hubo cambios | SNAP-02 | Requiere esperar el intervalo y observar la timeline | Con cadencia corta, editá una nota → tras el intervalo aparece una nueva entrada en la timeline. Sin editar nada, tras el intervalo NO aparece ninguna (nada de commits vacíos). |
| §C — Snapshot de seguridad antes de acción riesgosa (solo si hay cambios) | SNAP-03 | Requiere provocar cada acción y ver la timeline/estado git | Con cambios sin guardar: (1) viajá en el tiempo y "Volver aquí" → hay snapshot; (2) cambiá de bóveda → antes del cambio hay snapshot del anterior; (3) cerrá la app y reabrí → los cambios quedaron versionados. Sin cambios, ninguna de las 3 crea snapshot. |
| §D — Auto/safety snapshots por fecha y SIN IA | SNAP-04 | Verificación visual de etiqueta + confirmar que no hay costo/llamada de IA | Las entradas automáticas se ven con el marcador "Instantánea automática/de seguridad" y la fecha relativa como secundaria; el indicador de costo de IA NO cambia por un auto-snapshot (solo cambia en guardado manual con IA). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (typecheck+build) or are manual-UAT (documented above)
- [x] Sampling continuity: typecheck after every task
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
