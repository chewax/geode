---
phase: 11-freeze-api-v1-puente-async-del-plugincontext
plan: 02
subsystem: plugins
tags: [plugins, bridge, messageport, rpc, async-api]
requires: ["11-01"]
provides: ["activateExternalViaBridge", "AsyncPluginContext", "BridgeMessage"]
affects: ["src/renderer/src/plugins", "src/renderer/src/App.tsx"]
tech-stack:
  added: []
  patterns: ["MessageChannel RPC (request/response con id)", "proxy async lado-plugin", "allowlist de métodos host-side"]
key-files:
  created:
    - src/renderer/src/plugins/bridge.ts
  modified:
    - src/renderer/src/plugins/types.ts
    - src/renderer/src/plugins/index.ts
    - src/renderer/src/App.tsx
decisions:
  - "El camino de externos se bifurca al puente; los built-ins quedan intactos en la API v1 síncrona in-host."
  - "panels/statusBar/editorExtensions se difieren a Fase 12: el proxy lanza Error en español (no serializables por MessagePort)."
  - "unsafe-eval y la evaluación in-window de externos se mantienen (aislamiento en iframe es Fase 12)."
metrics:
  duration: "~15 min"
  completed: 2026-07-07
---

# Phase 11 Plan 02: Puente async del PluginContext (BRIDGE-01) Summary

Puente async por `MessageChannel` real para plugins externos: el lado-plugin recibe un `AsyncPluginContext` (API v2) cuyas llamadas viajan como RPC `{type:'call',id,method,args}` y el lado-host las traduce a `PluginHost`/`window.geode`, respondiendo `result`/`error`; eventos e invocación de comandos van host→plugin (`event`/`invoke`). Los built-ins siguen en la API v1 síncrona sin tocar.

## What Was Built

- **types.ts**: `BridgeMessage` (unión `call`/`result`/`error`/`event`/`invoke`) documentando la dirección de cada mensaje; `AsyncWorkspace` y `AsyncPluginContext` como espejo async de la API v1 (editor devuelve `Promise`; vault/git/activeNote/runCommand/notify/events/commands cruzan el puente). `panels`/`statusBar`/`editorExtensions` tipados pero marcados como diferidos a Fase 12.
- **bridge.ts**:
  - `attachHostBridge(host, port)`: escucha el port, despacha cada `call` por una allowlist explícita de métodos, responde `result`/`error`; un método fuera de la lista lanza y devuelve `error` (T-11-04). Rutea `editor.*` → `host.editorInsertAtCursor/getSelection/revealRange`, `vault.*`/`git.graph` → `window.geode.*`, `events.on` → `host.on` empujando `event`, `commands.register` → `host.registerCommand` con `run()` que emite `invoke`. Disposable limpia listener + subs + comandos.
  - `buildAsyncContext(port)`: proxy async lado-plugin con contador de ids y `Map` de calls pendientes; descarta `result`/`error` huérfanos sin colgar (T-11-03); despacha `event` al handler local por `sub` e `invoke` al `run()` local por commandId. `commands.register` manda solo `{id,title,category,shortcut}` (T-11-06). `panels/statusBar/editorExtensions` lanzan Error en español.
  - `activateExternalViaBridge(host, plugins)`: un `new MessageChannel()` por plugin (port1=plugin, port2=host), aísla fallos por plugin, devuelve Disposable agregado.
- **index.ts**: re-exporta `activateExternalViaBridge` (sin tocar `activatePlugins`).
- **App.tsx**: el bloque de externos usa `activateExternalViaBridge(host, plugins)`; el bloque de built-ins sigue con `activatePlugins(host, enabledBuiltins)` intacto; cleanup sin cambios de forma.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run typecheck:web` en verde tras Task 1 y Task 2.
- `npm run build` (typecheck node+web + electron-vite) en verde, exit 0.
- `host.ts` y `react.tsx` NO modificados (`git diff --name-only` no los lista).
- `unsafe-eval` sigue en `src/renderer/index.html` (script-src 'self' 'unsafe-eval').

## Self-Check: PASSED

- FOUND: src/renderer/src/plugins/bridge.ts
- FOUND: src/renderer/src/plugins/types.ts (BridgeMessage, AsyncPluginContext)
- FOUND commit ec9b6f2 (types.ts), 3707fdb (bridge.ts)
