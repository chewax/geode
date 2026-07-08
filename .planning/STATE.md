---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Onboarding guiado
status: planning
last_updated: "2026-07-08T22:29:31.386Z"
last_activity: 2026-07-08
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-06)

**Core value:** Non-destructive editing — nothing is ever lost and the git plumbing stays invisible to non-technical users.
**Current focus:** v1.2 RE-SCOPED a 3 fases (8/9/10) — PLUG-02/Fase 11 diferido a hito dedicado. Corriendo lifecycle: audit → complete → cleanup → tag v1.2

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-08 — Milestone v1.3 started

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
| Phase 08 P01 | 12 min | 2 tasks | 4 files |
| Phase 08 P02 | 12 min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.2 se estructura en 4 fases, numeradas 8-11 (continúan de v1.1 que cerró en Phase 7). Cobertura 5/5 requisitos, uno por fase salvo Phase 8 que agrupa las dos superficies cohesivas de Modo Avanzado (VER-01 + CHG-01).
- Phase 8: borrar rama (VER-01) + contador +N/-N (CHG-01) — ambas viven en Modo Avanzado / status bar; reutilizan las ops de rama de git.ts y pendingChanges/diffs.
- Phase 9 (AISNAP-01) CERRADA: IA en auto-snapshots opt-in, default OFF, gate emergente "solo con cambios" (árbol limpio = no-op; SIN detector de idle ni cambios al timer — decisión del usuario). IA solo en el path de cadencia; ciclo de vida (cierre/cambio de bóveda) sin IA. Fallback siempre al marcador si falta key o la IA falla. Con la opción apagada, el marcador sin IA queda idéntico.
- Phase 10 (PLUG-01) y Phase 11 (PLUG-02) van separadas a propósito: PLUG-01 (desactivar built-ins) es chico; PLUG-02 (aislamiento Fase B: iframe + puente postMessage + permisos + quitar unsafe-eval + API editor async) es grande y merece fase dedicada. Sigue el orden de migración de docs/PLUGINS.md.
- Verificación por fase: typecheck+build en verde + UAT humano end-of-phase (human_verify_mode=end-of-phase), consistente con v1.0/v1.1. El repo sigue con cero tests automatizados.

### Pending Todos

None yet.

### Blockers/Concerns

- Cero cobertura de tests automatizados; cada fase se apoya en typecheck+build + UAT humano.
- VER-01: borrar rama debe proteger `main` y avisar antes de perder trabajo sin mergear (valor central: nada se pierde). Hoy la app bloquea el borrado de ramas → hay que habilitarlo con salvaguardas.
- (RESUELTO en Phase 9) AISNAP-01: invariante de costo respetado — IA solo con cambios reales en cadencia (árbol limpio = no-op), nunca por tiempo; sin detector de idle. Con opción OFF, comportamiento de Phase 4 intacto.
- PLUG-02 (grande): cruzar el límite del sandbox obliga a volver async la API de editor (editorInsertAtCursor/getSelection). Riesgo de romper plugins built-in existentes → verificar que outline/insert-date/reading-time siguen funcionando tras el puente. Quitar unsafe-eval del CSP sin romper la app.
- Convención IPC: los canales de plugins usan prefijo `plugins:` (no `geode:`) — mantenerlo. El resto de canales nuevos van con prefijo `geode:`.
- Restricciones duras: solo íconos Lucide (sin emojis/glyphs), strings y comentarios en español, TS strict con tipos de retorno explícitos, preload permanece CommonJS.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260708-3om | Fixes del árbol lateral: eliminar carpetas, crear en raíz, mostrar en explorador, duplicar, foco al crear | 2026-07-08 | e1c2ac3 | [260708-3om-arreglar-5-problemas-del-arbol-lateral-d](./quick/260708-3om-arreglar-5-problemas-del-arbol-lateral-d/) |

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

Last session: 2026-07-06T23:14:10.181Z
Stopped at: Completed 10-03-PLAN.md (Phase 10 closed)
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
