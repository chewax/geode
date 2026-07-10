---
phase: 12-asistente-de-respaldo-en-la-nube
plan: 03
subsystem: main
tags: [ipc, github, isomorphic-git, backup, auto-push, onboarding, main-process]

# Dependency graph
requires:
  - phase: 12-asistente-de-respaldo-en-la-nube
    plan: 01
    provides: githubRepoSlug, mapBackupError/BackupError, createRepo con .status, settings.backup.onboarding + get/setBackupOnboarding, 4 canales IPC + BackupApi + puente preload
  - phase: 11-creacion-local
    provides: seed "Primera versión" que el primer push respalda
provides:
  - "handler geode:vault-enable-backup: orquesta createRepo(private)->setRemote->push, idempotente, autoPush ON, onboarding completado, errores via mapBackupError"
  - "helper autoPushAfterCommit(root): auto-push best-effort tras cada commit real (manual + snapshot), gated en autoPush+remoto+token, nunca IA, nunca lanza"
  - "handlers geode:backup-onboarding-get/-set (coercion defensiva) + geode:backup-open-signup (URL fija)"
affects: [12-04, 12-05, 13-tour]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Orquestador en el main que encadena primitivas probadas (createRepo/setRemote/push) con boundary de errores unico (mapBackupError)"
    - "Idempotencia por presencia de remoto: el reintento salta createRepo para evitar el 422 autoinfligido"
    - "Auto-push best-effort espejo del try/catch de snapshotIfChanged: nunca lanza, traga el fallo, refleja pushCount>0"
    - "Hand-off de OS con URL fija hardcodeada (sin superficie de arbitrary-URL launch)"

key-files:
  created: []
  modified:
    - src/main/index.ts

key-decisions:
  - "vaultEnableBackup detecta idempotencia por settings.github?.remote (no por existencia del repo en GitHub): retry-safe sin round-trip extra a la API"
  - "autoPushAfterCommit se cablea en DOS puntos (snapshotIfChanged tras commit no-null y el handler gitCommit) para cubrir guardado automatico y manual con un solo helper"
  - "gitCommit se convirtio a async para poder await el auto-push tras el commit; sigue devolviendo el oid (contrato intacto)"
  - "backupOnboardingSet valida contra la lista fija de 3 estados y, ante basura, devuelve el estado actual sin mutar (no persiste valor crudo del renderer)"
  - "backupOpenSignup no acepta parametro: la URL es una constante literal en el handler"

patterns-established:
  - "Pattern: el auto-push nunca invoca IA (solo sube bytes ya commiteados = costo de red, no de IA); grep de aiSnapshotMessage|OpenRouter|generateNamedVersion dentro del helper = 0"
  - "Pattern: el token solo se pasa a createRepo/gitService.push; grep de console.log con token = 0"

requirements-completed: [BACKUP-01, BACKUP-02, BACKUP-03, BACKUP-04, BACKUP-05]

# Metrics
duration: 8min
completed: 2026-07-09
---

# Phase 12 Plan 03: Corazón del respaldo en el main (enable + auto-push + onboarding) Summary

**El handler orquestador `vaultEnableBackup` (createRepo privado → setRemote → primer push, idempotente, autoPush ON, onboarding completado, errores humanos) + el AUTO-PUSH REAL tras cada commit (manual y snapshot, best-effort, sin IA — antes era config muerta) + los handlers de persistencia del onboarding y el hand-off de signup a una URL fija.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 3
- **Files modified:** 1 (`src/main/index.ts`)

## Accomplishments
- **`vaultEnableBackup`** (BACKUP-03): un solo handler crea el repo privado, enlaza el remoto y sube el primer respaldo (el seed "Primera versión" de Fase 11), persiste `pushed[branch]`, enciende `autoPush` y marca el onboarding `completado`. Idempotente en el reintento (si ya hay remoto, salta `createRepo` y va directo al push → evita el 422 autoinfligido). Todo error pasa por `mapBackupError`; devuelve solo `GithubConfig` (sin exponer repo/commit/push ni token).
- **`autoPushAfterCommit`** (BACKUP-04, el hallazgo de mayor riesgo — antes `autoPush` era config muerta): helper best-effort cableado en `snapshotIfChanged` (tras commit no-null) y en el handler `gitCommit` (convertido a async). Gated en `autoPush && remote && token`; nunca lanza (traga el fallo → el cuaderno sigue local, se reintenta al próximo commit, refleja `pushCount>0`); nunca invoca IA (solo sube bytes ya escritos).
- **Onboarding + signup** (BACKUP-01/02): `backupOnboardingGet/Set` con coerción defensiva a los 3 estados válidos; `backupOpenSignup` abre `https://github.com/signup` hardcodeada sin aceptar URL del renderer.

## Task Commits

1. **Task 1: Handler vaultEnableBackup** - `baac887` (feat)
2. **Task 2: Auto-push real tras cada commit** - `d509117` (feat)
3. **Task 3: Handlers de onboarding + signup a URL fija** - `f636b9f` (feat)

## Files Created/Modified
- `src/main/index.ts` (modificado) - 4 handlers nuevos (`vaultEnableBackup`, `backupOnboardingGet`, `backupOnboardingSet`, `backupOpenSignup`) + el helper `autoPushAfterCommit` invocado en `snapshotIfChanged` y `gitCommit`; imports de `githubRepoSlug`, `mapBackupError`, `getBackupOnboarding`, `setBackupOnboarding`, y tipos `BackupOnboarding`/`BackupOnboardingState`.

## Decisions Made
- La idempotencia se decide por `settings.github?.remote` (estado local), no consultando GitHub: retry-safe y sin round-trip extra.
- `gitCommit` pasó a `async` para poder `await` el auto-push; el contrato (devuelve el oid) queda intacto.
- El `before-quit` ya envuelve `snapshotIfChanged` en un `Promise.race` de 3s, así que un push colgado en el path de cierre no bloquea la salida (no se tocó ese código).

## Deviations from Plan
None - plan executed exactly as written.

## Threat Mitigations Applied
- **T-12-06** (arbitrary-URL launch): `backupOpenSignup` usa una URL literal fija, sin parámetro del renderer.
- **T-12-07** (token disclosure): el token solo se pasa a `createRepo`/`gitService.push`; grep de `console.log` con `token` = 0.
- **T-12-08** (tampering del onboarding): `backupOnboardingSet` coacciona a los 3 estados válidos; no persiste valor crudo.
- **T-12-09** (error crudo): todo throw de `vaultEnableBackup` pasa por `mapBackupError` → 1 de 4 strings.

## Issues Encountered
None. `npm run typecheck` (node + web) en verde tras cada task; `npm run build` en verde tras la wave.

## Known Stubs
None.

## STAT-01 / Costo
- Este plan NO toca `statusLabel`; solo alimenta `pushCount` vía `pushed[branch]`, así que la honestidad del estado queda intacta.
- El auto-push nunca invoca IA (verificado por grep): el costo escala con red, no con inferencia.

## Self-Check: PASSED

- `src/main/index.ts` existe y contiene `IPC.vaultEnableBackup`, `autoPushAfterCommit` (3 matches), `IPC.backupOnboardingGet/Set`, `IPC.backupOpenSignup` y `https://github.com/signup`.
- Commits `baac887`, `d509117`, `f636b9f` presentes en el historial.

---
*Phase: 12-asistente-de-respaldo-en-la-nube*
*Completed: 2026-07-09*
