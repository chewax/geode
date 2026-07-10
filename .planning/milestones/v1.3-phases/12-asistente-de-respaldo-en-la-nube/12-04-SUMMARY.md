---
phase: 12-asistente-de-respaldo-en-la-nube
plan: 04
subsystem: renderer-ui
tags: [backup, onboarding, wizard, status-bar, banner, react, lucide, copy-locked, stat-01]

# Dependency graph
requires:
  - phase: 12-01
    provides: "contrato IPC window.geode.backup.* (enable/openSignup/getOnboarding/setOnboarding), tipos BackupApi/DeviceFlowStart"
provides:
  - "BackupWizard(githubConnected,onDone,onClose): wizard de cuenta con dos caminos + checklist resumible + device flow + enable + errores inline"
  - "BackupCard(onBackup,onLater): banner de invitación no bloqueante (.time-banner tinte --accent)"
  - "BackupButton(connected,pushCount,backingUp,failed,login,autoPush,onOpenWizard,onForcePush): botón persistente 4 estados, data-tour='respaldo'"
affects: [12-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Componentes presentacionales: sólo props + window.geode; montaje/estado los cablea 12-05"
    - "Checklist resumible como estado de React que sobrevive shell.openExternal (los pasos no se desmontan)"
    - "Ancla de tour siempre montada (data-tour en nodo no condicional) — evita getBoundingClientRect() null en Fase 13"
    - "Popover accesible con spans/<b> para que la raíz sea un <button> válido (contenido en línea)"

key-files:
  created:
    - src/renderer/src/BackupWizard.tsx
    - src/renderer/src/BackupCard.tsx
    - src/renderer/src/BackupButton.tsx
  modified:
    - src/renderer/src/index.css

key-decisions:
  - "El botón persistente es un <button> real (a11y, aria-label por estado) y su popover se arma con spans/<b> — no divs — para ser HTML válido dentro del botón"
  - "data-tour='respaldo' va en el propio <button> (siempre montado, nunca condicional) — cumple Pitfall 4"
  - "Estado 'sin subir' (conectado + pushCount>0) usa texto neutro honesto, jamás 'Todo en la nube' (STAT-01)"
  - "El wizard dispara enable() vía useEffect al quedar connected; el reintento tras error llama runEnable() directo (sin re-disparo automático)"
  - "Se añadió CSS mínimo (tinte --accent del banner + reset de .status-item.backup-btn) para honrar el contrato de color LOCKED del UI-SPEC (banner de respaldo en acento, no en el teal --head reservado al time-travel)"

requirements-completed: [BACKUP-01, BACKUP-02, BACKUP-03, BACKUP-05, COPY-01]

# Metrics
duration: 9min
completed: 2026-07-09
---

# Phase 12 Plan 04: Superficies React del respaldo (wizard, tarjeta, botón) Summary

**Tres componentes presentacionales que reutilizan clases CSS existentes: el wizard de cuenta (dos caminos + checklist resumible + device flow sin jerga + enable + errores humanos con ícono Lucide), la tarjeta-banner de invitación no bloqueante, y el botón de respaldo persistente de 4 estados honestos (STAT-01) con `data-tour="respaldo"` siempre montado y popover sin la URL del repo.**

## Performance

- **Duration:** ~9 min
- **Tasks:** 2
- **Files:** 3 creados, 1 modificado

## Accomplishments

- `BackupWizard`: modal con encuadre de cuenta (GitHub nombrado sólo aquí, "gratis + privado"), dos caminos ("Ya tengo cuenta" → device flow directo / "Crear una gratis" → `openSignup` + checklist de 2 pasos que sobrevive el ida-y-vuelta al navegador). Device flow sin jerga (código en `.device-code` + "Esperando que autorices…" con `RefreshCw.spin`). Dispara `backup.enable()` y muestra el error humano de `mapBackupError` tal cual en `.modal-error` con `CloudOff`, nunca `⚠`. El éxito lo señala `onDone` sólo tras el push real (STAT-01).
- `BackupCard`: banner `.time-banner` (tinte `--accent`) no bloqueante con CTA "Respaldar en la nube" (`CloudUpload`) + "Hacerlo después" siempre presente.
- `BackupButton`: `<button>` accesible siempre montado con `data-tour="respaldo"`; 4 estados derivados por prioridad (respaldando / error / al-día / sin subir / sin respaldo) coherentes con STAT-01; `.push-badge` con pendientes; popover reescrito (COPY-01) con "Cuenta / Sin respaldar / Copia automática" y SIN la fila "Repo · {remote}" (T-12-10).

## Task Commits

1. **Task 1: BackupWizard** — `149c7df` (feat)
2. **Task 2: BackupCard + BackupButton** — `68021dc` (feat)

## Files Created/Modified

- `src/renderer/src/BackupWizard.tsx` (creado) — wizard de cuenta + checklist + device flow + enable + errores inline.
- `src/renderer/src/BackupCard.tsx` (creado) — banner de invitación no bloqueante.
- `src/renderer/src/BackupButton.tsx` (creado) — botón persistente de respaldo (4 estados, data-tour, popover).
- `src/renderer/src/index.css` (modificado) — tinte `--accent` del banner de respaldo (`.time-banner.backup`) + reset de la píldora `<button>` (`.status-item.backup-btn`).

## Decisions Made

- El botón persistente es un `<button>` real con `aria-label`/`title` por estado; su popover usa spans/`<b>` (contenido en línea) para ser HTML válido dentro del botón sin perder el `.status-pop` en hover.
- `data-tour="respaldo"` vive en el propio `<button>` no condicional (Pitfall 4): el tour de Fase 13 nunca resolverá un rect null.
- El estado "sin subir" (conectado con `pushCount>0`) usa texto neutro honesto; "Todo en la nube" sólo aparece con `pushCount===0` (STAT-01).

## Deviations from Plan

### Auto-fixed / Additions

**1. [Rule 2 - Missing critical] CSS mínimo en `index.css` para el contrato de color LOCKED**
- **Found during:** Task 2 (BackupCard/BackupButton)
- **Issue:** `.time-banner` base tiñe con el teal `--head`, pero el UI-SPEC (Color, LOCKED) prohíbe `--head` en superficies de respaldo (reservado al time-travel, "evitar confusión") y exige acento `--accent`. Además el botón base (`button {}`) dibuja una caja (fondo/borde) que la píldora `.status-item` no debe tener, pero la a11y exige un `<button>` real.
- **Fix:** Se agregó un bloque CSS mínimo: `.time-banner.backup` (tinte acento) y `.status-item.backup-btn` (reset de caja del botón). Sólo color/reset con tokens aprobados; sin valores de spacing/íconos nuevos.
- **Files modified:** `src/renderer/src/index.css`
- **Commit:** `68021dc`
- **Nota:** `index.css` no estaba en `files_modified` del plan; el cambio es necesario para NO violar el contrato de color LOCKED y para cumplir la a11y del UI-SPEC ("`<button>` real con aria-label").

## Threat Surface

Mitigaciones del `<threat_model>` aplicadas: T-12-10 (popover sin fila "Repo · {remote}", URL no expuesta), T-12-11 (error inline muestra sólo el string del main, nunca arma texto desde `e` crudo), T-12-12 (éxito sólo vía `onDone` tras `enable()` resuelto — STAT-01). Sin superficie de seguridad nueva fuera del `threat_model`.

## Known Stubs

None. Los tres componentes son presentacionales: reciben datos/callbacks por props (los cablea 12-05). `login ?? '—'` es un fallback de render, no un stub de datos.

## Issues Encountered

None. `npm run typecheck` (node + web) y `npm run build` en verde tras la wave.

## Next Phase Readiness

- Los tres componentes quedan listos para que 12-05 los importe, monte (tarjeta entre header y cuerpo; botón en la status bar reemplazando `UploadCloud` + píldora; wizard como modal) y cablee su estado (`connected`, `pushCount`, `backingUp`, `failed` efímero, onboarding).
- Sin blockers.

## Self-Check: PASSED
