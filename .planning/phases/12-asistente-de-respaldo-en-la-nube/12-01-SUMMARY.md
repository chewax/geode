---
phase: 12-asistente-de-respaldo-en-la-nube
plan: 01
subsystem: infra
tags: [ipc, github, isomorphic-git, backup, onboarding, settings, error-mapping]

# Dependency graph
requires:
  - phase: 11-creacion-local
    provides: patrón de canales IPC geode:, VaultService.createLocal, persistencia de onboarding en settings
provides:
  - "githubRepoSlug(raw): slug de repo GitHub-válido con fallback no vacío"
  - "BackupError + mapBackupError(e): traduce offline/auth/name-taken/unknown a 4 mensajes en español"
  - "createRepo lanza Error con .status y .body adjuntos"
  - "settings.backup.onboarding + getBackupOnboarding/setBackupOnboarding"
  - "4 canales IPC tipados: vaultEnableBackup/backupOnboardingGet/-Set/backupOpenSignup + BackupApi + puente preload"
affects: [12-02, 12-03, 12-04, 12-05, 13-tour]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interface-first: el plan declara canales + tipos + puente que los handlers (12-03) y el renderer (12-04/05) cablean"
    - "Boundary de traducción de errores: mapBackupError devuelve solo strings fijos, nunca el crudo de la API"
    - "Sanitizer puro que nunca lanza + fallback constante (forma de sanitizeVaultName, reglas GitHub)"

key-files:
  created:
    - src/main/fs/githubRepoSlug.ts
    - src/main/services/backupErrors.ts
  modified:
    - src/main/services/github.ts
    - src/main/services/settings.ts
    - src/shared/ipc.ts
    - src/preload/index.ts

key-decisions:
  - "githubRepoSlug NO reutiliza sanitizeVaultName: comparten forma pero las reglas GitHub ([A-Za-z0-9._-], sin diacríticos, sin bordes -/.) difieren de las de carpeta Windows"
  - "mapBackupError clasifica por señales estructuradas (e.status, e.data.statusCode, e.code de red) y solo usa regex de texto como último recurso"
  - "createRepo adjunta .status/.body al Error para clasificar por status HTTP; el .body queda en el main y nunca cruza al renderer"
  - "settings.backup.onboarding ausente = null (default seguro, sin migración)"
  - "Los 4 mensajes de error son LOCKED de UI-SPEC.md:159-164, copiados textualmente"

patterns-established:
  - "Pattern: los canales IPC nuevos se declaran completos (IPC → Api interface → GeodeApi → puente preload) en un solo plan interface-first"
  - "Pattern: la palabra 'token'/'credencial' nunca aparece interpolable en el boundary de errores (grep token = 0 en backupErrors.ts salvo doc)"

requirements-completed: [BACKUP-01, BACKUP-02, BACKUP-03, BACKUP-05]

# Metrics
duration: 6min
completed: 2026-07-09
---

# Phase 12 Plan 01: Cimientos del respaldo en la nube (main) Summary

**Slug de repo GitHub-válido, boundary de errores a español humano (4 mensajes LOCKED), createRepo con status HTTP, persistencia del onboarding y el contrato IPC completo (4 canales tipados + puente preload) que consumirán los planes 12-03/04/05.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-09T04:13:29Z
- **Completed:** 2026-07-09T04:19:41Z
- **Tasks:** 3
- **Files modified:** 6 (2 creados, 4 modificados)

## Accomplishments
- `githubRepoSlug`: sanitizer puro que convierte cualquier nombre libre (acentos, símbolos, 100% no-ASCII) en un nombre de repo GitHub-válido no vacío, con fallback `cuaderno-geode`.
- `mapBackupError`: boundary que traduce las dos familias de error (fetch de `createRepo` + clases de isomorphic-git de `push`) a uno de 4 mensajes fijos en español, sin filtrar crudo de API ni credencial.
- `createRepo` ahora adjunta `.status` y `.body` al Error para clasificar por status HTTP en vez de regex frágil.
- Contrato IPC end-to-end: 4 canales `geode:`, tipos `BackupOnboardingState`/`BackupOnboarding`/`BackupApi`, `backup` en `GeodeApi` y puente preload en CommonJS.
- Persistencia del onboarding de respaldo en `settings.backup.onboarding` (ausente = null, default seguro).

## Task Commits

Each task was committed atomically:

1. **Task 1: Util githubRepoSlug** - `ccac06c` (feat)
2. **Task 2: backupErrors + status en createRepo** - `b31db24` (feat)
3. **Task 3: Persistencia onboarding + contrato IPC** - `1776718` (feat)

## Files Created/Modified
- `src/main/fs/githubRepoSlug.ts` (creado) - Sanitizer puro de nombre de repo GitHub con fallback no vacío.
- `src/main/services/backupErrors.ts` (creado) - `BackupError` + `mapBackupError`: clasifica offline/auth/name-taken/unknown a 4 mensajes en español.
- `src/main/services/github.ts` (modificado) - `createRepo` lanza `Error` con `.status`/`.body` adjuntos en vez del texto crudo.
- `src/main/services/settings.ts` (modificado) - Campo `backup.onboarding` + `getBackupOnboarding`/`setBackupOnboarding` (spread inmutable).
- `src/shared/ipc.ts` (modificado) - 4 canales IPC + tipos `BackupOnboardingState`/`BackupOnboarding`/`BackupApi` + `backup` en `GeodeApi`.
- `src/preload/index.ts` (modificado) - Namespace `backup` con las 4 invocaciones (CommonJS intacto).

## Decisions Made
- `githubRepoSlug` es una función nueva y no una extensión de `sanitizeVaultName`: se documenta en el header por qué las reglas divergen (GitHub vs carpeta Windows).
- La clasificación de errores prioriza señales estructuradas (`e.status`, `e.data.statusCode`, `e.code`) sobre regex de texto, que queda como último recurso — evita el anti-patrón de RESEARCH:230.
- La palabra "token" se eliminó de los comentarios de `backupErrors.ts` (reemplazada por "credencial") para satisfacer estrictamente el criterio de aceptación `grep token = 0` y reforzar la garantía de no-fuga.

## Deviations from Plan

None - plan executed exactly as written. (El único ajuste fue de redacción de comentarios en `backupErrors.ts` para cumplir el criterio de aceptación `grep token = 0`; no afecta lógica ni contrato.)

## Issues Encountered
None. `npm run typecheck` (node + web) salió en verde tras cada task.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Los 4 canales IPC quedan tipados y puenteados; los handlers del main que los implementan llegan en 12-03 (`ipcMain.handle`), y el renderer que los consume en 12-04/12-05.
- `mapBackupError` y `githubRepoSlug` están listos para que el handler `vaultEnableBackup` los componga sobre el device flow + `createRepo` + `setRemote` + `push` existentes.
- Sin blockers. El campo `settings.backup.onboarding` está disponible para la tarjeta no bloqueante (BACKUP-01/02).

## Self-Check: PASSED

---
*Phase: 12-asistente-de-respaldo-en-la-nube*
*Completed: 2026-07-09*
