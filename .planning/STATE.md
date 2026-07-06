---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Power-user y plataforma
status: planning
last_updated: "2026-07-06T22:30:00.000Z"
last_activity: 2026-07-06
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-06)

**Core value:** Non-destructive editing — nothing is ever lost and the git plumbing stays invisible to non-technical users.
**Current focus:** Phase 8 — Versionado avanzado (borrar rama VER-01 + contador +N/-N CHG-01)

## Current Position

Phase: 8 — Versionado avanzado (not started; roadmap approved)
Plan: —
Status: Roadmap created — ready to plan Phase 8
Last activity: 2026-07-06 — v1.2 roadmap created (Phases 8-11)

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.2 se estructura en 4 fases, numeradas 8-11 (continúan de v1.1 que cerró en Phase 7). Cobertura 5/5 requisitos, uno por fase salvo Phase 8 que agrupa las dos superficies cohesivas de Modo Avanzado (VER-01 + CHG-01).
- Phase 8: borrar rama (VER-01) + contador +N/-N (CHG-01) — ambas viven en Modo Avanzado / status bar; reutilizan las ops de rama de git.ts y pendingChanges/diffs.
- Phase 9 (AISNAP-01): la IA en auto-snapshots es opt-in, default OFF, solo-idle + solo-con-cambios. NO reintroducir costo por tiempo transcurrido (invariante v1.0). Con la opción apagada, el marcador sin IA queda idéntico.
- Phase 10 (PLUG-01) y Phase 11 (PLUG-02) van separadas a propósito: PLUG-01 (desactivar built-ins) es chico; PLUG-02 (aislamiento Fase B: iframe + puente postMessage + permisos + quitar unsafe-eval + API editor async) es grande y merece fase dedicada. Sigue el orden de migración de docs/PLUGINS.md.
- Verificación por fase: typecheck+build en verde + UAT humano end-of-phase (human_verify_mode=end-of-phase), consistente con v1.0/v1.1. El repo sigue con cero tests automatizados.

### Pending Todos

None yet.

### Blockers/Concerns

- Cero cobertura de tests automatizados; cada fase se apoya en typecheck+build + UAT humano.
- VER-01: borrar rama debe proteger `main` y avisar antes de perder trabajo sin mergear (valor central: nada se pierde). Hoy la app bloquea el borrado de ramas → hay que habilitarlo con salvaguardas.
- AISNAP-01: no romper el invariante de costo; la IA solo al generar snapshot con cambios + tras idle, nunca por tiempo. Con opción OFF, comportamiento de Phase 4 intacto.
- PLUG-02 (grande): cruzar el límite del sandbox obliga a volver async la API de editor (editorInsertAtCursor/getSelection). Riesgo de romper plugins built-in existentes → verificar que outline/insert-date/reading-time siguen funcionando tras el puente. Quitar unsafe-eval del CSP sin romper la app.
- Convención IPC: los canales de plugins usan prefijo `plugins:` (no `geode:`) — mantenerlo. El resto de canales nuevos van con prefijo `geode:`.
- Restricciones duras: solo íconos Lucide (sin emojis/glyphs), strings y comentarios en español, TS strict con tipos de retorno explícitos, preload permanece CommonJS.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Capa 1 | try/keep/discard sin nombres técnicos (CAPA1-01) | Deferred | v1.0 close |
| Sync | conflictos en lenguaje humano (CONF-01) | Deferred | v1.0 close |
| Plugins | marketplace / instalación remota / firma / minAppVersion (PLUG-marketplace) | Deferred | v1.2 planning |
| Editor | edición Markdown enriquecida (EDIT-xx) | Deferred | v1.2 planning |
| Input | dictado por voz / STT (VOICE-xx) | Deferred | v1.2 planning |

## Session Continuity

Last session: 2026-07-06T22:30:00.000Z
Stopped at: v1.2 roadmap created (ROADMAP.md, REQUIREMENTS.md traceability, STATE.md)
Resume file: None

## Operator Next Steps

- Plan the first phase with /gsd-plan-phase 8
