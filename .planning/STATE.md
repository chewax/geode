---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Onboarding guiado
status: executing
stopped_at: Completed 12-03-PLAN.md
last_updated: "2026-07-09T04:40:00.000Z"
last_activity: 2026-07-09 -- Completed 12-03 (enable + auto-push + onboarding handlers)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 7
  completed_plans: 5
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-08)

**Core value:** Non-destructive editing — nothing is ever lost and the git plumbing stays invisible to non-technical users.
**Current focus:** Phase 12 — Asistente de respaldo en la nube

## Current Position

Phase: 12 (Asistente de respaldo en la nube) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Last activity: 2026-07-09 -- Completed 12-03 (enable + auto-push + onboarding handlers)

Progress: [███████░░░] 71%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 11 P01 | 5 | 3 tasks | 5 files |
| Phase 11 P02 | 3 | 2 tasks | 1 files |
| Phase 12 P01 | 6 | 3 tasks | 6 files |
| Phase 12 P02 | 12 | 2 tasks | 2 files |
| Phase 12 P03 | 8 | 3 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.3 se estructura en 3 fases, numeradas 11-13 (continúan de v1.2 que cerró en Phase 10). Cobertura 13/13 requisitos: Phase 11 (5), Phase 12 (5), Phase 13 (3).
- **Orden fijado por dependencia dura:** el paso "respaldar" del tour se ancla vía `data-tour` a un botón de respaldo que solo existe tras construir el asistente (Phase 12). Por eso Phase 13 (tour) va DESPUÉS de Phase 12 (respaldo), y ambos después de Phase 11 (creación local, que da la bóveda a la que se engancha el remoto y el escenario que el tour recorre).
- Phase 11 (ONB-01..04 + COPY-01): bienvenida sin jerga + `VaultService.createLocal` + `geode:vault-create-local` (sin picker, sin cuenta, default `~/Documents/Geode/<nombre>` vía `app.getPath('documents')`), nota de bienvenida sembrada, persistencia de onboarding (`geode:onboarding-get/-set`). La reescritura de jerga (COPY-01) se ancla aquí como reframe fundacional y sigue transversal en cada fase.
- Phase 12 (BACKUP-01..05): tarjeta no bloqueante, hand-off de cuenta + checklist resumible, `geode:vault-enable-backup` (reusa device flow + createRepo + setRemote + push), primer commit sembrado para que el push no sea vacío, auto-backup invisible honrando STAT-01, boundary de traducción de errores a español humano.
- Phase 13 (TOUR-01..03): `TourOverlay` renderer-only (portal + getBoundingClientRect), anclas `data-tour` en botones siempre montados, ≤5 pasos disparados tras el primer cuaderno, progreso + Saltar + re-lanzar desde Ayuda, degradación grácil, nunca anclar Modo Avanzado.
- Verificación por fase: typecheck+build en verde + UAT humano end-of-phase (human_verify_mode=end-of-phase), consistente con v1.0/v1.1/v1.2. El repo sigue con cero tests automatizados.
- [Phase ?]: Phase 11-01: createLocal hace solo el lado FS; ensureRepo/commit('Primera versión')/rememberVault/restartSnapshotTimer viven en el handler (orden load-bearing seed→commit)
- [Phase ?]: Phase 11-01: colisión de carpeta con pathExists(absPath) vía stat (no this.exists); sufijo ' (2)' resuelto ANTES de mkdir para no pisar datos
- [Phase ?]: Phase 11-02: welcome sin jerga cableada; el flujo de creación encadena openNote('Bienvenida.md') tras adoptVault (que deja panel vacío); 'Elegir otra ubicación' = createLocal(name,true), null (picker cancelado) = no-op silencioso
- [Phase 12]: Phase 12-01: contrato IPC de respaldo declarado interface-first (4 canales + BackupApi + puente preload); mapBackupError traduce errores a 4 mensajes LOCKED sin filtrar crudo; githubRepoSlug con fallback no vacio
- [Phase 12]: Phase 12-03: vaultEnableBackup orquesta createRepo(private)->setRemote->push idempotente (salta createRepo si ya hay remoto -> evita 422 propio); autoPush deja de ser config muerta -> autoPushAfterCommit best-effort tras cada commit real (manual+snapshot), nunca lanza, nunca IA; signup a URL fija hardcodeada

### Pending Todos

None yet.

### Blockers/Concerns

- **Cero cobertura de tests automatizados**; cada fase se apoya en typecheck+build + UAT humano.
- **STAT-01 (invariante de honestidad):** la copy de onboarding NO puede decir "a salvo/respaldado/en la nube" mientras el cuaderno siga siendo local-only; "Todo en la nube" solo con árbol limpio + pusheado. Riesgo alto en Phase 12.
- **Creación de cuenta no automatizable** (captcha + verificación de email) → solo hand-off guiado + checklist; nada de webview embebido ni signup scripteado (Phase 12).
- **Anclas del tour:** los botones de rama/merge/grafo/push están condicionalmente renderizados; solo Save y la paleta están siempre montados. El tour debe guardar cada resolución de ancla, caer a cartel centrado y nunca hacer spotlight sobre un rect null (Phase 13, PITFALLS #1).
- **Errores crudos de GitHub/git** (422 nombre tomado, 401/404, non-fast-forward) hoy salen por `e.message` directo → hace falta un boundary de traducción a español cloud-framed en la capa de onboarding (Phase 12, BACKUP-05).
- Convención IPC: canales nuevos con prefijo `geode:` (4 nuevos: `geode:vault-create-local`, `geode:vault-enable-backup`, `geode:onboarding-get`, `geode:onboarding-set`).
- Restricciones duras: solo íconos Lucide (sin emojis), strings y comentarios en español, TS strict con tipos de retorno explícitos, preload permanece CommonJS.
- Research flag: el UX del hand-off de cuenta (Phase 12) no tiene precedente limpio → merece un research-phase pass antes de planificar tasks (copy exacta + manejo de races: tab cerrada, "Ya tengo cuenta" prematuro).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260708-3om | Fixes del árbol lateral: eliminar carpetas, crear en raíz, mostrar en explorador, duplicar, foco al crear | 2026-07-08 | e1c2ac3 | [260708-3om-arreglar-5-problemas-del-arbol-lateral-d](./quick/260708-3om-arreglar-5-problemas-del-arbol-lateral-d/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Plugins | aislamiento de plugins de terceros — Fase B MVP (PLUG-02) | Deferred | v1.2 close |
| Capa 1 | try/keep/discard sin nombres técnicos (CAPA1-01) | Deferred | v1.0 close |
| Sync | conflictos en lenguaje humano (CONF-01) | Deferred | v1.0 close |
| Editor | edición Markdown enriquecida (EDIT-xx) | Deferred | v1.2 planning |
| Input | dictado por voz / STT (VOICE-xx) | Deferred | v1.2 planning |

## Session Continuity

Last session: 2026-07-09T04:40:00.000Z
Stopped at: Completed 12-03-PLAN.md
Resume file: None

## Operator Next Steps

- Planificar la Fase 11 con /gsd-plan-phase 11
