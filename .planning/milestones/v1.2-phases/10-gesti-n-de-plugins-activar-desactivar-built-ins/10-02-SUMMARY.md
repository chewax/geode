---
phase: 10-gesti-n-de-plugins-activar-desactivar-built-ins
plan: 02
subsystem: plugins
tags: [plugins, settings, built-ins, gating, PLUG-01]
requires:
  - "window.geode.plugins.getEnabled (Plan 10-01)"
  - "window.geode.plugins.setEnabled"
provides:
  - "Activación gateada de built-ins al arrancar (default ON, async-safe)"
  - "Grupo 'Integrados' con toggles funcionales en Ajustes → Plugins"
  - "GeodePlugin.description? poblado en los 3 built-ins"
affects:
  - src/renderer/src/App.tsx
  - src/renderer/src/SettingsModal.tsx
tech-stack:
  added: []
  patterns:
    - "Resolución default-ON con `?? true` para built-ins (vs `?? false` opt-in de externos)"
    - "Activación async-safe respetando flag `cancelled` del unmount"
key-files:
  created: []
  modified:
    - src/renderer/src/plugins/types.ts
    - src/renderer/src/plugins/builtin/insertDate.ts
    - src/renderer/src/plugins/builtin/readingTime.tsx
    - src/renderer/src/plugins/builtin/outline.tsx
    - src/renderer/src/App.tsx
    - src/renderer/src/SettingsModal.tsx
decisions:
  - "Built-ins ausentes del mapa se activan (`?? true`); solo `false` explícito desactiva, preservando el arranque actual en instalación nueva."
  - "Apply-on-restart: App.tsx filtra BUILTIN_PLUGINS antes de activar; sin dispose/re-activate en vivo."
  - "toggleBuiltin relee getEnabled() tras setEnabled (cuyo retorno es la lista de externos, no usada acá)."
metrics:
  duration: ~10m
  completed: 2026-07-07
---

# Phase 10 Plan 02: Gating de built-ins + grupo "Integrados" en Ajustes Summary

Gateo de la activación de plugins internos al arrancar (default ON, async-safe con `?? true`) y reemplazo de la lista estática "Internos" de Ajustes por un grupo funcional "Integrados" con un toggle por built-in cableado a `plugins.setEnabled`, cerrando el núcleo de PLUG-01.

## What Was Built

- **Task 1 — `GeodePlugin.description?`:** Nuevo campo opcional en la interfaz (`types.ts`) con comentario en español, poblado en los 3 built-ins (`insert-date`, `reading-time`, `outline`) con descripciones cortas en español. Ids y names sin cambios.
- **Task 2 — Gating en App.tsx:** La activación síncrona `activatePlugins(host, BUILTIN_PLUGINS)` se reemplazó por un IIFE async que lee `window.geode.plugins.getEnabled()`, filtra `BUILTIN_PLUGINS` con `enabledMap[p.id] ?? true` (default ON) y activa solo los habilitados. Respeta el flag `cancelled` tras el await (no activa si el effect se desmontó); el cleanup dispone tanto `offPlugins` como `offExternal`. La carga de externos se mantiene independiente en su propio IIFE, compartiendo `cancelled`. Comentario en español explica el default ON y por qué difiere de los externos.
- **Task 3 — Grupo "Integrados" en SettingsModal:** Nuevo estado `builtinEnabled: Record<string, boolean>` cargado en `refreshPlugins` vía `getEnabled()`. Handler `toggleBuiltin(id, enabled)` que persiste con `setEnabled` y relee el mapa. El render agrega el grupo `<h3>Integrados</h3>` ENCIMA de "Instalados" con nota `modal-sub` (activos por defecto, aplica al reiniciar) y filas `.plugin-settings-row` con nombre, id, `description` en `.ps-desc` y un `<label className="ps-toggle">` cuyo `checked` es `builtinEnabled[p.id] ?? true`. Se eliminó el bloque estático "Internos" (`<h3>Internos</h3>` + badge `ps-on` con `<Check/> activo`).

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `env -u ELECTRON_RUN_AS_NODE npm run build` en verde (typecheck node + web + electron-vite). Exit code 0.
- Greps de aceptación confirmados:
  - `description?: string` en types.ts = 1; `description:` en cada built-in = 1.
  - App.tsx: `plugins.getEnabled` = 1, `?? true` = 2, `activatePlugins(host, BUILTIN_PLUGINS)` = 0.
  - SettingsModal.tsx: `Integrados` = 1, `<h3>Internos</h3>` = 0, `ps-on` = 0, `plugins.getEnabled` = 2, `plugins.setEnabled` = 2, `?? true` = 3.

## Self-Check: PASSED
