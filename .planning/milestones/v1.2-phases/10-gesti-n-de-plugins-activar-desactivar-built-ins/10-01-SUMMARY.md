---
phase: 10-gesti-n-de-plugins-activar-desactivar-built-ins
plan: 01
subsystem: plugins
tags: [ipc, plugins, settings, read-only]
requires: []
provides:
  - "Canal IPC geode:plugins-get-enabled"
  - "PluginsApi.getEnabled(): Promise<Record<string, boolean>>"
  - "Puente preload window.geode.plugins.getEnabled"
  - "Handler main pluginsGetEnabled → getPluginsEnabled()"
affects:
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/main/index.ts
tech-stack:
  added: []
  patterns: ["IPC de solo lectura reutilizando getter de settings existente"]
key-files:
  created: []
  modified:
    - src/shared/ipc.ts
    - src/preload/index.ts
    - src/main/index.ts
decisions:
  - "Reusar getPluginsEnabled() de settings.ts (mapa crudo `plugins?.enabled ?? {}`) sin crear función nueva"
  - "El default (built-in `?? true`, externo `?? false`) lo resuelve el consumidor, no el IPC"
metrics:
  duration: "~4 min"
  completed: 2026-07-07
  tasks: 2
  files: 3
---

# Phase 10 Plan 01: IPC plugins.getEnabled (lectura del mapa de habilitados) Summary

IPC de solo lectura `geode:plugins-get-enabled` que expone al renderer el mapa crudo `settings.plugins.enabled` (Record<id, boolean>) reutilizando el getter `getPluginsEnabled()` ya existente en settings.ts, sin alterar la semántica opt-in de los externos.

## What Was Built

- **src/shared/ipc.ts**: nueva clave `pluginsGetEnabled: 'geode:plugins-get-enabled'` en el objeto `IPC` (prefijo `geode:plugins-*`), y método `getEnabled(): Promise<Record<string, boolean>>` en la interfaz `PluginsApi` con comentario en español que aclara que devuelve el mapa crudo y que el consumidor resuelve los defaults (`?? true` built-ins, `?? false` externos).
- **src/preload/index.ts**: puente `getEnabled: () => ipcRenderer.invoke(IPC.pluginsGetEnabled)` dentro del objeto `plugins` de `window.geode`.
- **src/main/index.ts**: handler `ipcMain.handle(IPC.pluginsGetEnabled, async () => getPluginsEnabled())` — solo lectura, no muta settings, reutiliza la función ya importada desde `./services/settings`.

## Task Commits

- Task 1 — Canal y método getEnabled al contrato IPC (src/shared/ipc.ts)
- Task 2 — Puente en preload + handler en main (src/preload/index.ts, src/main/index.ts)

Ambas tareas se agrupan en un único commit de plan por indicación del orquestador.

## Verification

- `env -u ELECTRON_RUN_AS_NODE npm run typecheck` (node + web) → exit 0 (verde).
- `env -u ELECTRON_RUN_AS_NODE npm run build` (electron-vite) → exit 0 (verde, `✓ built in 6.29s`).
- Grep de aceptación:
  - `geode:plugins-get-enabled` en ipc.ts → 1
  - `getEnabled(): Promise<Record<string, boolean>>` en ipc.ts → 1
  - `getEnabled: () => ipcRenderer.invoke(IPC.pluginsGetEnabled)` en preload → 1
  - `ipcMain.handle(IPC.pluginsGetEnabled` en main → 1
  - `?? false` en plugins.ts intacto → 1

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/shared/ipc.ts (canal + método)
- FOUND: src/preload/index.ts (puente)
- FOUND: src/main/index.ts (handler)
- Typecheck y build en verde.
