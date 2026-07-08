---
phase: 11-freeze-api-v1-puente-async-del-plugincontext
plan: 01
subsystem: api
tags: [plugins, api-versioning, semver, electron, typescript]

# Dependency graph
requires:
  - phase: fase-a-plugins
    provides: PluginManifest, InstalledPlugin, listPlugins y loader que saltea plugins con error
provides:
  - Campo apiVersion? en PluginManifest y constante HOST_API_VERSION = 1
  - Gate de compatibilidad en listPlugins (apiVersion > host, minAppVersion > app.getVersion())
  - Contrato API v1 congelado documentado sobre Workspace/PluginContext
affects: [11-02 puente async PluginContext v2, 11-03 UAT compat, fase-b sandbox plugins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Versionado explícito de la API de plugins (HOST_API_VERSION) con gate en el host antes del eval del renderer"
    - "compareSemver por segmento tolerante a segmentos faltantes para datos externos del manifiesto"

key-files:
  created: []
  modified:
    - src/shared/ipc.ts
    - src/renderer/src/plugins/types.ts
    - src/main/services/plugins.ts

key-decisions:
  - "apiVersion ausente ⇒ v1 (retrocompatible con manifiestos existentes, no rechaza plugins previos)"
  - "Plugin incompatible se lista con InstalledPlugin.error (visible en Ajustes) en vez de descartarse; el loader ya lo saltea por p.error"
  - "No se tocó la semántica ?? false de plugins externos ni el loader del renderer"

patterns-established:
  - "Gate de compatibilidad en main/listPlugins: valida dato externo (manifiesto) antes de exponerlo al renderer"
  - "Freeze grepable 'API v1' como encabezado del contrato público en types.ts"

requirements-completed: [APIVER-01]

# Metrics
duration: 2min
completed: 2026-07-08
---

# Phase 11 Plan 01: Freeze API v1 + compat check Summary

**Congelamiento del contrato API v1 de plugins (Workspace/PluginContext) más gate de compatibilidad en el host: el manifiesto declara `apiVersion`/`minAppVersion` y `listPlugins` marca con error visible los plugins incompatibles antes de que el renderer los evalúe.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-07-08T02:05:46Z
- **Completed:** 2026-07-08T02:07:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `PluginManifest.apiVersion?: number` añadido y constante `HOST_API_VERSION = 1` exportada desde `@shared/ipc`.
- `Workspace` y `PluginContext` marcados como contrato **API v1 congelado** (encabezado grepable "API v1"); ninguna firma cambió.
- Gate de compatibilidad en `listPlugins`: `apiVersion > HOST_API_VERSION` o `minAppVersion` (semver) mayor que `app.getVersion()` ⇒ `InstalledPlugin.error` en español; `apiVersion` ausente ⇒ v1 sin error.
- Helper privado `compareSemver(a, b)` por segmento, tolerante a segmentos faltantes/no numéricos.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: apiVersion + HOST_API_VERSION en ipc.ts y freeze API v1 en types.ts** - `0bd70dc` (feat)
2. **Task 2: chequeo de compatibilidad (apiVersion + minAppVersion) en listPlugins** - `cb30907` (feat)

## Files Created/Modified
- `src/shared/ipc.ts` - Campo `apiVersion?` en `PluginManifest` + constante exportada `HOST_API_VERSION = 1` con doc en español.
- `src/renderer/src/plugins/types.ts` - Encabezado "Contrato API v1 congelado" sobre `Workspace`/`PluginContext`; sin cambios de firma.
- `src/main/services/plugins.ts` - Import de `HOST_API_VERSION`, helper `compareSemver`, helper `compatibilityError`, y gate en `listPlugins` que setea `error` en plugins incompatibles.

## Decisions Made
- `apiVersion` ausente se asume v1 para no romper manifiestos existentes.
- Plugins incompatibles se listan con `error` (visible en Ajustes) en lugar de descartarse; el loader del renderer ya los saltea por `p.error` (no se tocó).
- No se modificó la semántica `?? false` de habilitación de externos ni el loader.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Contrato v1 congelado y gate de compatibilidad listos: el plan 11-02 puede introducir la variante async (v2) del `PluginContext` con capa de compatibilidad sin romper plugins v1.
- El UAT del comportamiento del gate (manifiesto con `apiVersion: 2` ⇒ error) se cubre en el plan 11-03.

## Self-Check: PASSED
- `src/shared/ipc.ts` — FOUND (HOST_API_VERSION en commit `0bd70dc`)
- `src/renderer/src/plugins/types.ts` — FOUND ("API v1" en commit `0bd70dc`)
- `src/main/services/plugins.ts` — FOUND (compareSemver + HOST_API_VERSION en commit `cb30907`)
- Commits `0bd70dc` y `cb30907` — FOUND en git log
- `npm run typecheck` (node + web) — VERDE (exit 0)

---
*Phase: 11-freeze-api-v1-puente-async-del-plugincontext*
*Completed: 2026-07-08*
