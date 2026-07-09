---
phase: 12-asistente-de-respaldo-en-la-nube
plan: 05
subsystem: renderer-integration
tags: [backup, onboarding, status-bar, wizard, banner, react, stat-01, data-tour]

# Dependency graph
requires:
  - phase: 12-asistente-de-respaldo-en-la-nube
    plan: 03
    provides: "handlers window.geode.backup.* (enable/getOnboarding/setOnboarding/openSignup) + auto-push real tras cada commit"
  - phase: 12-asistente-de-respaldo-en-la-nube
    plan: 04
    provides: "componentes BackupCard/BackupWizard/BackupButton (presentacionales) + clases CSS"
  - phase: 11-creacion-local
    provides: "createLocalVault -> adoptVault -> openNote('Bienvenida.md')"
provides:
  - "App.tsx: estado de onboarding (backupOnboarding/backupWizardOpen/backupFailed) + montaje de tarjeta/wizard + BackupButton persistente en la status bar"
  - "BackupButton siempre montado (data-tour='respaldo') absorbe el UploadCloud del header y la pildora 'GitHub/sin GitHub' del footer"
  - "statusLabel (STAT-01) preservado sin cambio de logica; comentario obsoleto de doCommit corregido"
affects: [13-tour]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Onboarding no-nag: 'invitado' se marca al mostrar la tarjeta; 'diferido'/'completado' bloquean la reaparicion; el boton persistente es la unica re-entrada"
    - "Estado de error de respaldo efimero (no se persiste): backupFailed vive solo en la sesion; al reabrir, pushCount>0 ya senala pendiente"
    - "Superficie de respaldo unica y siempre montada (data-tour) reemplaza dos superficies condicionales -> el tour de Fase 13 nunca resuelve un rect null"

key-files:
  created: []
  modified:
    - src/renderer/src/App.tsx

key-decisions:
  - "El exito 'tu cuaderno esta a salvo en la nube' se anuncia SOLO en onDone del wizard (tras el push real que hizo enable), via el toast existente (setToast) — nunca antes (STAT-01)"
  - "backupFailed se limpia al inicio de doPush (reintento) y se marca en el catch: refleja 'No se pudo respaldar' sin persistir; el auto-push del main no toca este flag (solo el push manual forzado desde el boton)"
  - "El comentario 'El push es SIEMPRE manual' de doCommit se reemplazo: el auto-push ahora vive en el main (12-03); doCommit solo refresca el estado para reflejar el nuevo pushCount"
  - "backupOnboarding se anade a las deps de createLocalVault para leer el estado fresco al decidir si invitar (solo cuando es null)"

requirements-completed: [BACKUP-01, BACKUP-04, COPY-01]

# Metrics
duration: 4min
completed: 2026-07-09
---

# Phase 12 Plan 05: Integracion en App.tsx (tarjeta + wizard + boton persistente) Summary

**El ultimo eslabon: cablea las tres superficies del respaldo (12-04) contra los handlers del main (12-03) dentro de `App.tsx` — monta la tarjeta de invitacion una sola vez tras el primer cuaderno (sin re-nag), el wizard como modal, y el `BackupButton` persistente que absorbe el `UploadCloud` del header y la pildora "GitHub/sin GitHub" del footer, preservando exactamente la logica honesta de `statusLabel` (STAT-01).**

## Performance

- **Duration:** ~4 min
- **Tasks:** 2
- **Files modified:** 1 (`src/renderer/src/App.tsx`)

## Accomplishments

- **Estado de onboarding + tarjeta/wizard** (BACKUP-01): estado `backupOnboarding` cargado al arranque via `backup.getOnboarding()`; `createLocalVault` marca `'invitado'` una sola vez tras crear el primer cuaderno (solo cuando el estado es `null`). La `<BackupCard>` se renderiza gateada por `backupOnboarding === 'invitado' && !backupWizardOpen && vault`: "Hacerlo despues" persiste `'diferido'` (no re-nag), "Respaldar" abre el wizard. El `<BackupWizard>` en `onDone` persiste `'completado'`, refresca GitHub (nuevo `pushCount`/conexion) y anuncia el exito honesto **solo tras el push real**.
- **BackupButton persistente** (BACKUP-04, COPY-01): reemplaza las DOS superficies condicionales anteriores (el boton `UploadCloud` del header y la pildora/popover "GitHub/sin GitHub" del footer) por un unico `<BackupButton>` siempre montado con `data-tour="respaldo"`. Recibe `connected`/`pushCount`/`backingUp`/`failed`/`login`/`autoPush` + `onOpenWizard`/`onForcePush`. `UploadCloud` retirado del import de lucide (sin uso).
- **STAT-01 preservado + comentario corregido**: `statusLabel` intacto ("Todo en la nube" SOLO con `clean && pushCount===0`). `doPush` refleja `backupFailed` efimero. El comentario obsoleto "El push es SIEMPRE manual" de `doCommit` se reemplazo por la realidad: el auto-push vive en el main (12-03) y `doCommit` solo refresca el estado.

## Task Commits

1. **Task 1: Estado del onboarding + montaje de BackupCard y BackupWizard** — `b8ae4ab` (feat)
2. **Task 2: BackupButton persistente reemplaza UploadCloud + pildora** — `ec01fb8` (feat)

## Files Created/Modified

- `src/renderer/src/App.tsx` (modificado) — imports de `BackupCard`/`BackupWizard`/`BackupButton` y del tipo `BackupOnboarding`; estados `backupOnboarding`/`backupWizardOpen`/`backupFailed`; carga inicial del onboarding; disparo de la tarjeta en `createLocalVault`; montaje de tarjeta (banner) y wizard (modal); reemplazo del `UploadCloud` y la pildora por `BackupButton`; `doPush` con `backupFailed`; comentario de `doCommit` actualizado; `UploadCloud` retirado del import de lucide.

## Decisions Made

- El exito del primer respaldo se muestra via `setToast(...)` (el toast existente) solo en `onDone` del wizard, tras el push real que ya hizo `enable()`. No hay ninguna afirmacion de nube antes de ese punto.
- `backupFailed` es de sesion (no se persiste): al reabrir la app, `pushCount>0` ya indica pendiente sin necesidad de recordar el fallo (RESEARCH Open Q #3).
- La tarjeta se gatea tambien por `!backupWizardOpen` para que el banner no compita visualmente con el modal abierto.

## Deviations from Plan

None - plan executed exactly as written. (Nota de secuencia: en la Task 1 se importo/declararon momentaneamente `BackupButton`/`backupFailed`, que pertenecen a la Task 2; se movieron a la Task 2 para que el `typecheck` de la Task 1 quedara verde y cada commit fuera auto-contenido — sin desviacion funcional respecto al plan.)

## Threat Mitigations Applied

- **T-12-13** (spoofing de honestidad UX): `statusLabel` LOCKED sin cambio; el `BackupButton` deriva sus estados de los mismos flags (`connected`/`pushCount`); "a salvo" solo en `onDone` tras el push real.
- **T-12-14** (tour roto): `BackupButton` siempre montado (no condicional) — la ancla `data-tour="respaldo"` nunca desaparece, asi el tour de Fase 13 no hace `getBoundingClientRect` sobre `null`.
- **T-12-15** (information disclosure): la fila "Repo · {remote}" ya no existe (12-04) y App.tsx no la reintroduce; el popover del `BackupButton` no expone la URL.

## STAT-01 / Costo

- La logica de `statusLabel` (1783-1798) queda intacta: "Todo en la nube" SOLO con `clean && pushCount===0`. No se agrego ninguna variante que afirme respaldo antes de un push real.
- La integracion no invoca IA en ningun path; el costo de respaldo lo gobierna el auto-push del main (solo red).

## Known Stubs

None.

## Verification

- `npm run typecheck` (node + web) en verde tras la Task 1.
- `npm run build` en verde tras la Task 2 (typecheck + build de main/preload/renderer, `built in 5.29s`).
- Grep: `UploadCloud` = 0, `sin GitHub` = 0, `El push es SIEMPRE manual` = 0, `<BackupButton` = 1, `pushCount === 0` (statusLabel) intacto, `tu cuaderno está a salvo en la nube` dentro de `onDone` = 1.

## Self-Check: PASSED

- `src/renderer/src/App.tsx` existe y contiene `<BackupCard`, `<BackupWizard`, `<BackupButton`, `backup.getOnboarding`, `backup.setOnboarding`, y `data-tour="respaldo"` (via el componente).
- Commits `b8ae4ab` y `ec01fb8` presentes en el historial.

---
*Phase: 12-asistente-de-respaldo-en-la-nube*
*Completed: 2026-07-09*
