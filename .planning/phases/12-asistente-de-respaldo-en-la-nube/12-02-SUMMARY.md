---
phase: 12-asistente-de-respaldo-en-la-nube
plan: 02
subsystem: renderer-ui
tags: [copy, ui, backup, github, lucide]
requires:
  - "Fase 11 shell (COPY-01 diferido)"
provides:
  - "SettingsModal: sección 'Respaldo en la nube' sin jerga de Capa 0"
  - "NewVaultDialog: diálogo 'Traer un cuaderno respaldado' con ícono Lucide en error"
affects:
  - src/renderer/src/SettingsModal.tsx
  - src/renderer/src/NewVaultDialog.tsx
tech-stack:
  added: []
  patterns:
    - "Opción avanzada con <details>/<summary> para ocultar la URL del repo del flujo normal"
    - "Íconos de estado/error siempre Lucide (CloudOff), nunca símbolos Unicode"
key-files:
  created: []
  modified:
    - src/renderer/src/SettingsModal.tsx
    - src/renderer/src/NewVaultDialog.tsx
decisions:
  - "El campo URL del repo se conserva como opción avanzada (details) en vez de eliminarse, para no perder la capacidad saveRemote"
  - "El ítem de nav de Ajustes también pasó a 'Respaldo en la nube' (UI-SPEC:196 cubre nav + h2)"
  - "El comentario JSDoc de NewVaultDialog se reescribió para eliminar 'bóveda' y cumplir el grep de aceptación"
metrics:
  duration: 12
  completed: 2026-07-09
---

# Phase 12 Plan 02: Reescritura de copy diferida (COPY-01) en Ajustes y NewVaultDialog Summary

Reescritura de copy sin plomería nueva: la sección de respaldo de Ajustes (`SettingsModal`) y el diálogo de importación (`NewVaultDialog`) pasan a vocabulario de respaldo/cuaderno, sacan "GitHub/repo/bóveda/clonar" de la Capa 0 y reemplazan el símbolo Unicode `⚠` por un ícono Lucide `CloudOff`.

## What Was Built

- **SettingsModal** (`section === 'github'` + ítem de nav): el título y la navegación pasan a "Respaldo en la nube"; subtítulo, device flow y botón ("Conectar mi cuenta") usan copy de respaldo. El device flow deja de interpolar `verificationUri` (mitiga T-12-04). El campo "URL del repo" se movió a una opción avanzada (`<details>` "Dirección del respaldo (avanzado)") conservando `saveRemote`/`remoteInput`. Hint reescrito para reflejar respaldo automático al guardar.
- **NewVaultDialog** (archivo completo): título "Traer un cuaderno respaldado", copy de cuaderno/respaldo en prompt, tabs, listas, CTAs, labels, placeholder y hints. Import cambia `GitFork` → `CloudDownload` y agrega `CloudOff`. El error inline usa `<CloudOff size={14} />` en vez de `⚠`. Device flow, clonar/crear y toggle privado intactos.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Reescribir la sección de respaldo de Ajustes (SettingsModal) | 82b0402 | src/renderer/src/SettingsModal.tsx |
| 2 | Reescribir NewVaultDialog (copy sin jerga + ⚠ → Lucide) | aa5e644 | src/renderer/src/NewVaultDialog.tsx |

## Verification

- `npm run typecheck` en verde tras cada task.
- Grep de aceptación:
  - `⚠` en NewVaultDialog.tsx → 0
  - `GitFork` en NewVaultDialog.tsx → 0
  - `bóveda` (ci) en NewVaultDialog.tsx → 0
  - `Clonar existente` en NewVaultDialog.tsx → 0
  - `guardar en tu repo` (ci) en SettingsModal.tsx → 0
- Verificación conductual visual (recorrer Ajustes + NewVaultDialog) queda para el UAT visual de fin de fase.

## Deviations from Plan

### Auto-fixed / scope-consistent adjustments

**1. [Rule 2 - Consistencia con must_have] Ítem de nav de Ajustes también renombrado**
- **Found during:** Task 1
- **Issue:** El plan describe la sección (líneas 331-376) pero el ítem de nav (línea 208) seguía diciendo "GitHub", contradiciendo la must_have truth "La sección de Ajustes se llama 'Respaldo en la nube'". UI-SPEC:196 cubre explícitamente "Ítem de nav / h2".
- **Fix:** Nav item → "Respaldo en la nube".
- **Files modified:** src/renderer/src/SettingsModal.tsx
- **Commit:** 82b0402

**2. [Rule 3 - Desbloqueo de aceptación] Comentario JSDoc de NewVaultDialog reescrito**
- **Found during:** Task 2
- **Issue:** El acceptance criterion greps `bóveda` (case-insensitive) = 0, pero el comentario JSDoc del componente contenía "Nueva bóveda" y "la bóveda lista".
- **Fix:** Comentario reescrito a vocabulario de cuaderno respaldado.
- **Files modified:** src/renderer/src/NewVaultDialog.tsx
- **Commit:** aa5e644

## Known Stubs

Ninguno. El campo "Dirección del respaldo (avanzado)" no es un stub: conserva la función real `saveRemote`; solo se ocultó del flujo normal según UI-SPEC:203 (el repo se derivará del nombre del cuaderno en 12-03).

## Self-Check: PASSED

- FOUND: src/renderer/src/SettingsModal.tsx
- FOUND: src/renderer/src/NewVaultDialog.tsx
- FOUND commit: 82b0402
- FOUND commit: aa5e644
