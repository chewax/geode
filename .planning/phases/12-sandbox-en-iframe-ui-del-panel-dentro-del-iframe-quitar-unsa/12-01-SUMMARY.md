---
phase: 12-sandbox-en-iframe-ui-del-panel-dentro-del-iframe-quitar-unsa
plan: 01
subsystem: plugins
tags: [iframe, sandbox, csp, message-channel, vite, electron, isolation, security]

# Dependency graph
requires:
  - phase: 11-puente-async-bridge
    provides: "MessageChannel bridge (attachHostBridge / buildAsyncContext), envelope RPC BridgeMessage, orden de teardown plugin-side → host-side"
provides:
  - "Plugins externos ejecutados AISLADOS en un iframe sandbox='allow-scripts' de origen opaco (sin allow-same-origin)"
  - "pluginRuntime.ts: lado-plugin del puente autocontenido (solo import type), apto para bundlear dentro del iframe"
  - "iframe-runtime/index.ts: bootstrap del iframe (require shim + new Function eval + activate + buildAsyncContext)"
  - "iframeHost.ts: createPluginIframe (srcdoc con CSP connect-src 'none' + runtime inline + transferencia de port1) y dispose() que remueve el iframe y cierra el port"
  - "Mecanismo de build del runtime del iframe: IIFE autocontenido vía vite.iframe.config.ts, consumido por el host con ?url+fetch"
  - "loader.ts sin eval in-window: devuelve { entries:{pluginId,source}[], errors }"
affects: [12-02-ui-del-panel, 12-03-quitar-unsafe-eval, 13-permisos-network]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "iframe sandbox de origen opaco como boundary de seguridad para código de terceros"
    - "Bundle IIFE autocontenido pre-compilado aparte (vite lib) e inyectado inline en srcdoc"
    - "Host lee el artefacto con import '?url' + fetch() same-origin; el fetch corre en el host, no en el iframe"
    - "Transferencia de MessagePort a un iframe vía contentWindow.postMessage(init, '*', [port1]) tras el evento load"

key-files:
  created:
    - src/renderer/src/plugins/pluginRuntime.ts
    - src/renderer/iframe-runtime/index.ts
    - src/renderer/src/plugins/iframeHost.ts
    - vite.iframe.config.ts
  modified:
    - src/renderer/src/plugins/bridge.ts
    - src/renderer/src/plugins/loader.ts
    - src/renderer/src/plugins/types.ts
    - src/renderer/src/plugins/index.ts
    - src/renderer/src/App.tsx
    - electron.vite.config.ts
    - package.json
    - tsconfig.web.json
    - .gitignore

key-decisions:
  - "Mecanismo de build del runtime del iframe: FALLBACK del plan (build dedicado en package.json) en vez del primario (entrada extra de Vite del renderer), porque una build multi-entrada del renderer emite ESM con chunks compartidos (react) que no se pueden inyectar inline en un iframe de origen opaco"
  - "El artefacto IIFE se marca como asset (assetsInclude en electron.vite.config.ts) para que `?url` lo resuelva; el host hace fetch() same-origin de su texto y lo inyecta inline"
  - "El eval del plugin (new Function) MIGRA del host (loader.ts) al bootstrap del iframe; loader.ts ya no evalúa nada in-window"

patterns-established:
  - "Boundary de seguridad real: el plugin corre en un contexto JS/DOM propio (origen opaco), solo habla por el MessagePort transferido"
  - "Teardown Fase 11 conservado: al deshabilitar/desmontar, se dispone primero el iframe (remueve <iframe> + cierra port) y luego el lado host"

requirements-completed: [ISO-01]

# Metrics
duration: ~40min
completed: 2026-07-08
---

# Phase 12 Plan 01: Plugins externos aislados en iframe sandbox (ISO-01) Summary

**Los plugins externos ahora se ejecutan aislados en un `<iframe sandbox="allow-scripts">` de origen opaco (sin `allow-same-origin`), con el eval del código no confiable movido del host al bootstrap del iframe; el host habla con el plugin solo por el `MessagePort` de la Fase 11, ahora transferido al iframe, y lee/inyecta el runtime con `?url`+`fetch` same-origin.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-08T04:05:00Z (aprox.)
- **Completed:** 2026-07-08T04:44:02Z
- **Tasks:** 3
- **Files modified:** 13 (4 creados, 9 modificados)

## Accomplishments

- **Puente dividido:** `buildAsyncContext` (lado-plugin del puente) se extrajo a `pluginRuntime.ts`, AUTOCONTENIDO (solo `import type` de `./types` y `@shared/ipc`; sin `./host`, sin la API global del host). Es lo que se bundlea dentro del iframe.
- **Runtime del iframe:** `iframe-runtime/index.ts` es el bootstrap: escucha el mensaje `init`, toma `event.ports[0]`, ofrece un `require` shim con 5 módulos (react/react-dom/react-jsx-runtime/@codemirror/state|view), evalúa la fuente CommonJS del plugin con `new Function(...)` (ahora AISLADO en el iframe), y activa el plugin sobre `buildAsyncContext(port)`.
- **Host del iframe:** `iframeHost.ts#createPluginIframe` crea el iframe `sandbox="allow-scripts"` (sin same-origin), fija el `srcdoc` con CSP `connect-src 'none'` + el runtime IIFE inline, y tras el `load` transfiere `port1` con `contentWindow.postMessage({type:'init',...}, '*', [port1])`. Su `dispose()` remueve el `<iframe>` del DOM y cierra el port. Hay timeout de arranque para plugins que no responden.
- **loader.ts sin eval in-window:** ahora devuelve `{ entries: {pluginId, source}[], errors }`; se eliminaron `evalCjs`, `makeRequire`, `SHARED_MODULES` y `new Function`.
- **App.tsx:** lee el bundle del runtime UNA vez con `import iframeRuntimeUrl from '../iframe-runtime/runtime.iife.js?url'` + `fetch()` (same-origin, permitido por el CSP del host) y lo pasa a `activateExternalViaBridge`. El cleanup del effect ya invoca `offExternal?.dispose()` — el SITIO de la llamada existe, no solo la definición.
- **Built-ins intactos:** `activatePlugins` + `buildPluginContext` + paneles built-in sin cambios; `unsafe-eval` del host se conserva (se quita en el Plan 03).

## Mecanismo de build usado (RIESGO del plan)

Se usó el **FALLBACK documentado del plan** (build dedicado en `package.json`), NO el mecanismo primario (entrada extra de Vite del renderer). Razón concreta:

- El primario (segunda entrada en `renderer.build.rollupOptions.input`) produce un chunk **ESM con code-splitting**: react/react-dom se separan a chunks compartidos con la app, así que el chunk del runtime lleva `import` de nivel superior sin resolver. Un iframe de **origen opaco** no puede resolver esos `import` (ni cargar `<script src>` del host), por lo que el artefacto NO sería inyectable inline. Rollup no admite `format: 'iife'` con múltiples entradas en un solo pase, y `inlineDynamicImports` exige una sola entrada — incompatible con la entrada HTML del renderer.
- **Solución:** `vite.iframe.config.ts` compila `src/renderer/iframe-runtime/index.ts` como `build.lib` en formato **IIFE autocontenido** (bundlea react/react-dom/react-jsx-runtime/@codemirror/state|view + `pluginRuntime` + bootstrap; `define` fija `process.env.NODE_ENV` para que react no referencie `process`). Salida: `src/renderer/iframe-runtime/runtime.iife.js` (265 kB, IIFE `(function(){...})()`, 0 imports/exports de nivel superior, sin `window.geode`).
- El paso `build:iframe` se ejecuta ANTES de `electron-vite build` (y de `dev`). El host importa el artefacto con `?url` y hace `fetch()` de su texto. Para que Vite trate el `.js` pre-compilado como **asset** (y `?url` resuelva su URL emitida), se añadió `assetsInclude: ['**/iframe-runtime/runtime.iife.js']` en `electron.vite.config.ts`. En la build principal el artefacto se emite como `out/renderer/assets/runtime.iife-<hash>.js`.

## Task Commits

Se realizó un único commit al final (según indicación explícita), cubriendo las 3 tareas + el SUMMARY:

1. **Task 1: dividir el puente (pluginRuntime.ts + mensaje init)** — incluido en el commit final
2. **Task 2: bundle IIFE del runtime del iframe + entrada de build (fallback)** — incluido en el commit final
3. **Task 3: host crea iframe sandbox, transfiere port, recablea loader/App + dispose** — incluido en el commit final

**Commit:** `feat(12-01): plugins externos aislados en iframe sandbox (ISO-01)`

## Files Created/Modified

- `src/renderer/src/plugins/pluginRuntime.ts` (nuevo) — lado-plugin del puente autocontenido (`buildAsyncContext`), solo `import type`.
- `src/renderer/iframe-runtime/index.ts` (nuevo) — bootstrap del iframe: listener `init`, `require` shim, `new Function` eval, `activate`.
- `src/renderer/src/plugins/iframeHost.ts` (nuevo) — `createPluginIframe` (srcdoc + CSP `connect-src 'none'` + runtime inline + transferencia de port1) y `dispose()`.
- `vite.iframe.config.ts` (nuevo) — build dedicado del IIFE autocontenido del runtime del iframe.
- `src/renderer/src/plugins/bridge.ts` — `attachHostBridge` conservado; `activateExternalViaBridge(host, entries, runtimeSource)` recableado a iframes con teardown Fase 11.
- `src/renderer/src/plugins/loader.ts` — sin eval in-window; devuelve `{ entries, errors }`.
- `src/renderer/src/plugins/types.ts` — variante `{ type: 'init'; pluginId; source }` en `BridgeMessage` + interfaz `PluginEntry`.
- `src/renderer/src/plugins/index.ts` — exporta `PluginEntry`.
- `src/renderer/src/App.tsx` — import `?url` del runtime + `fetch()` + `activateExternalViaBridge(host, entries, runtimeSource)`; cleanup dispone los externos.
- `electron.vite.config.ts` — `assetsInclude` del artefacto IIFE.
- `package.json` — script `build:iframe` + wiring en `build` y `dev`.
- `tsconfig.web.json` — incluye `src/renderer/iframe-runtime/**/*` para cobertura de typecheck.
- `.gitignore` — ignora el artefacto generado `runtime.iife.js`.

## Decisions Made

- **Build mechanism = fallback (build dedicado):** ver sección "Mecanismo de build usado". El primario no puede emitir un IIFE autocontenido inyectable inline junto a la entrada HTML del renderer.
- **`assetsInclude` para `?url`:** un `.js` pre-compilado no lo trata Vite como asset por defecto; marcarlo permite `?url`+`fetch` sin cambiar la mecánica pedida por el plan.
- **`init` con id `-1` para errores de arranque:** el bootstrap postea `{type:'error', id:-1, message}` por el port si el eval/validación del plugin falla; el host lo ignora (solo actúa sobre `call`), pero deja rastro serializable sin colgar.

## Deviations from Plan

Todas son Rule 3 (build/config para poder completar la tarea), explícitamente autorizadas por la cláusula de fallback del plan.

### Auto-fixed Issues

**1. [Rule 3 - Blocking/Build] Se usó el fallback (build dedicado) en vez de la entrada extra de Vite**
- **Found during:** Task 2 (bundle del runtime del iframe)
- **Issue:** Una segunda entrada del renderer emite ESM con chunks compartidos (react), no un IIFE autocontenido inyectable inline en un iframe de origen opaco; Rollup no admite IIFE multi-entrada.
- **Fix:** `vite.iframe.config.ts` (build.lib IIFE autocontenido) + `build:iframe` en `package.json` corriendo antes de `electron-vite build`/`dev`.
- **Files modified:** vite.iframe.config.ts, package.json
- **Verification:** `runtime.iife.js` es `(function(){...})()`, 0 imports/exports de nivel superior, sin `window.geode`; `npm run build` en verde.

**2. [Rule 3 - Blocking] `assetsInclude` en electron.vite.config.ts**
- **Found during:** Task 3 (host lee el runtime con `?url`+`fetch`)
- **Issue:** `import ... 'runtime.iife.js?url'` no resolvía: Vite trataba el `.js` como módulo del grafo, no como asset.
- **Fix:** `assetsInclude: ['**/iframe-runtime/runtime.iife.js']` en el renderer.
- **Files modified:** electron.vite.config.ts
- **Verification:** `npm run build` en verde; el artefacto se emite como `out/renderer/assets/runtime.iife-<hash>.js`.

**3. [Rule 3 - Blocking] Ruta relativa del import `?url` corregida**
- **Found during:** Task 3
- **Issue:** Inicialmente `../../iframe-runtime/...` (apuntaba a `src/iframe-runtime`, inexistente) → "Could not resolve".
- **Fix:** `../iframe-runtime/runtime.iife.js?url` (App.tsx está en `src/renderer/src/`).
- **Files modified:** src/renderer/src/App.tsx
- **Verification:** `npm run build` en verde.

**4. [Rule 3 - Build coverage] tsconfig.web.json incluye iframe-runtime + imports type acotados**
- **Found during:** Tasks 1-2
- **Issue:** `iframe-runtime/` estaba fuera del `include` del typecheck web; y `pluginRuntime.ts` no puede importar tipos sin usar (noUnusedLocals) — el plan sugería importar `Disposable`/`GeodeEventName` que no se referencian en el cuerpo.
- **Fix:** se añadió `src/renderer/iframe-runtime/**/*` al include; `pluginRuntime.ts` importa solo los tipos usados (`AsyncPluginContext`, `BridgeMessage`, `Command`, `GitGraph`, `TreeNode`).
- **Files modified:** tsconfig.web.json, src/renderer/src/plugins/pluginRuntime.ts
- **Verification:** `npm run typecheck` (node+web) en verde con `noUnusedLocals` ON.

---

**Total deviations:** 4 auto-fixed (todas Rule 3 build/config, autorizadas por el fallback del plan).
**Impact on plan:** Sin scope creep. La restricción de diseño se respetó al 100%: iframe de origen opaco, sin `allow-same-origin`, `connect-src 'none'`, eval solo dentro del iframe, `?url`+`fetch` en el host, teardown Fase 11.

## Issues Encountered

- **`?url` no resolvía un `.js` pre-compilado:** resuelto con `assetsInclude` (deviation 2). El diagnóstico inicial (assetsInclude no bastaba) resultó ser un error de ruta relativa (deviation 3): tras corregir la ruta y con `assetsInclude`, la build quedó en verde.

## Known Stubs

- `panels`/`statusBar`/`editorExtensions` del `AsyncPluginContext` siguen lanzando (`deferred`) en español: es intencional y planificado — la UI del panel dentro del iframe llega en el **Plan 02 (UI-01)**. No bloquea el objetivo de este plan (aislar la ejecución + comandos/editor por el puente).

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan. El iframe mantiene `connect-src 'none'` (sin red; la Fase 13 abre `network`). El `fetch` del runtime es same-origin y corre en el host. `unsafe-eval` del host se conserva a propósito (lo quita el Plan 03).

## Next Phase Readiness

- **Plan 02 (UI-01):** el iframe ya existe oculto (`display:none`); resta reposicionarlo en el panel e implementar `panels`/`statusBar`/`editorExtensions` cruzando el puente. `react`/`react-dom` ya están bundleados en el runtime del iframe para renderizar UI dentro.
- **Plan 03:** quitar `unsafe-eval` del CSP del host (el host ya no evalúa plugins in-window; el eval vive solo en el iframe).
- **Nota de build:** `build:iframe` es obligatorio antes de `dev`/`build` (ya wireado). El artefacto `runtime.iife.js` está gitignoreado y se regenera.

---
*Phase: 12-sandbox-en-iframe-ui-del-panel-dentro-del-iframe-quitar-unsa*
*Completed: 2026-07-08*
