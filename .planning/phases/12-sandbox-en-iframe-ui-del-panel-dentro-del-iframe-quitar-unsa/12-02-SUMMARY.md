---
phase: 12-sandbox-en-iframe-ui-del-panel-dentro-del-iframe-quitar-unsa
plan: 02
subsystem: plugins
tags: [sandbox, iframe, ui, panels, status-bar, bridge, ISO-01, UI-01]
requires: ["12-01"]
provides:
  - "Paneles de plugins externos renderizados DENTRO de su iframe (host dibuja header)"
  - "Resize continuo del panel externo vía ResizeObserver → mensaje panel/resize"
  - "Status-items externos serializables {id,text,tooltip,icon} dibujados host-side"
  - "Tema estático (dark) pasado una vez en el init del iframe"
  - "editorExtensions sigue vedado a externos (Error en español)"
affects:
  - src/renderer/src/plugins/types.ts
  - src/renderer/src/plugins/host.ts
  - src/renderer/src/plugins/bridge.ts
  - src/renderer/src/plugins/pluginRuntime.ts
  - src/renderer/iframe-runtime/index.ts
  - src/renderer/src/plugins/iframeHost.ts
  - src/renderer/src/plugins/iconByName.tsx
  - src/renderer/src/plugins/PluginPanels.tsx
  - src/renderer/src/plugins/PluginStatusBar.tsx
  - examples/plugins/hola-mundo-async/main.js
tech-stack:
  added: []
  patterns:
    - "UI de plugin aislado: el panel vive en el iframe; el host solo reserva el rectángulo y lo superpone por posición (no reparenta el iframe)"
    - "Superficies no serializables cruzan como DATOS (status-item) o se montan del otro lado (panel)"
key-files:
  created:
    - src/renderer/src/plugins/iconByName.tsx
  modified:
    - src/renderer/src/plugins/types.ts
    - src/renderer/src/plugins/host.ts
    - src/renderer/src/plugins/bridge.ts
    - src/renderer/src/plugins/pluginRuntime.ts
    - src/renderer/iframe-runtime/index.ts
    - src/renderer/src/plugins/iframeHost.ts
    - src/renderer/src/plugins/PluginPanels.tsx
    - src/renderer/src/plugins/PluginStatusBar.tsx
    - examples/plugins/hola-mundo-async/main.js
decisions:
  - "El iframe del plugin NO se reparenta al panel-body: mover un <iframe> en el DOM lo recarga y mataría el runtime; se superpone por position:fixed sobre el rectángulo del panel-body y se sincroniza con un ResizeObserver + resize/scroll"
  - "El montaje React del panel (createRoot) vive en el bootstrap del iframe (iframe-runtime), que empaqueta react-dom; pluginRuntime.ts sigue AUTOCONTENIDO (solo tipos) y recibe un adaptador IframePanelUi inyectado"
  - "Tema estático: init lleva theme:'dark'; sin op de tema ni suscripción de cambio"
metrics:
  duration: ~35m
  completed: 2026-07-08
---

# Phase 12 Plan 02: Panel dentro del iframe + status-items serializables (UI-01) Summary

UI de plugins externos bajo aislamiento: el panel de un plugin de terceros se renderiza DENTRO de su iframe (react-dom del bundle del runtime) y el host solo dibuja el header y le pasa el tamaño de forma continua; los status-items cruzan como un modelo serializable `{id,text,tooltip,icon}` que el host dibuja y actualiza. Built-ins intactos; `editorExtensions` sigue vedado a externos.

## Qué se construyó

- **Protocolo (types.ts):** `ExternalPanelDef` / `ExternalPanelInput` / `ExternalStatusItem` / `ExternalStatusHandle` serializables; variante `BridgeMessage` `{ type:'panel'; op:'resize'; width; height }` (único mensaje de panel); campo estático `theme?: 'dark'` en el `init`. `AsyncPluginContext.panels/statusBar` re-tipados a la forma serializable; `editorExtensions` documentado como no soportado para externos.
- **host.ts:** registros PARALELOS a los in-host — `registerExternalPanel(def, iframe)` / `listExternalPanels()` y `addExternalStatusItem` / `updateExternalStatusItem` / `listExternalStatusItems`. `togglePanel`/`isPanelOpen` reconocen ids externos reusando `openPanels`. Built-ins sin cambios.
- **bridge.ts:** `attachHostBridge` recibe un `getIframe()` perezoso y despacha `panels.register/toggle/dispose` y `statusBar.addItem/update/dispose`, conservando la allowlist (método desconocido → `error`). `activateExternalViaBridge` asocia cada plugin con SU iframe.
- **pluginRuntime.ts:** `panels.register` monta la UI vía un adaptador `IframePanelUi` inyectado y manda solo `{id,title,icon}`; `statusBar.addItem` manda `{id,text,tooltip,icon}` y devuelve un handle con `update`; `editorExtensions.add` lanza Error en español. Sigue AUTOCONTENIDO (solo imports de tipos).
- **iframe-runtime/index.ts:** contenedor de montaje + `createRoot` (react-dom del bundle), `applyPanelResize` (aplica el tamaño recibido al contenedor) y `applyTheme` (una vez desde `init.theme`). El listener de `window` maneja `init` (arranque) y `panel`/resize (continuo).
- **iconByName.tsx (nuevo):** mapea una allowlist acotada de NOMBRES Lucide → componente; desconocido/ausente → null. Sin emojis.
- **PluginPanels.tsx:** fork built-in (`<panel.Component/>` in-host, sin cambios) vs externo (`ExternalPanel`: header host-drawn con `iconByName` + iframe del plugin superpuesto en el rectángulo del `plugin-panel-body`, con `ResizeObserver` + resize/scroll que postean `panel/resize` al `contentWindow` de forma continua; se desconecta al cerrar/desmontar).
- **PluginStatusBar.tsx:** fork built-in (Component) vs externo (render desde `{text,tooltip,icon}` con `iconByName`).
- **examples/plugins/hola-mundo-async/main.js:** comando async + panel React (`React.createElement`, montado en el iframe) + status-item serializable que se actualiza en `note:open`; cleanup desregistra los cuatro. Sin emojis.

## Decisiones y desviaciones del plan

### Desviación 1 — [Rule 1: bug] El iframe NO se reparenta al panel-body

El plan describía "adjuntar/reposicionar el iframe en el `plugin-panel-body`". Mover un `<iframe>` a otro padre del DOM **lo recarga** (spec HTML / Chromium): el runtime del plugin y su puente se destruirían y el `init` no se re-emite (queda `settled`), dejando el plugin muerto. Se implementó la variante correcta: el iframe vive persistente off-screen en `document.body` (aloja comandos/eventos/status con el panel cerrado) y se **superpone por `position:fixed`** sobre el rectángulo del `plugin-panel-body`, sincronizado por `ResizeObserver` + `resize`/`scroll`. Cumple igual el criterio (el panel se ve dentro de su iframe en el rectángulo del dock y refluye de forma continua) sin romper el aislamiento ni el runtime.

### Desviación 2 — [Rule 3: blocking] Se modificó `iframeHost.ts` (no listado en files_modified)

El `init` se postea en `createPluginIframe` (iframeHost.ts), así que para que el host pase el `theme:'dark'` estático UNA vez hubo que tocar ese archivo. Cambio mínimo (un campo en el mensaje `init`).

### Desviación 3 — `App.tsx` no se modificó (sí estaba en files_modified)

No hizo falta: `PluginPanels`/`PluginStatusItems` conservan su prop `host` y `activateExternalViaBridge` mantiene su firma pública `(host, entries, runtimeSource)`. Todo el cableado nuevo quedó dentro de los módulos de plugins.

### Decisión — `IframePanelUi` inyectado en vez de que pluginRuntime importe react-dom

`pluginRuntime.ts` es AUTOCONTENIDO por invariante (solo tipos). El `createRoot` vive en el bootstrap del iframe (que sí bundlea react-dom) y se inyecta como adaptador. Satisface "el panel se monta dentro del iframe con react-dom del bundle" sin violar el invariante del módulo.

## Threat model

- **T-12-05** (panel montándose en el DOM del host): mitigado — el panel se renderiza dentro del iframe; el host solo reserva el rectángulo y dibuja el header, nunca ejecuta el Component del plugin.
- **T-12-06** (status-item no serializable / HTML activo): mitigado — cruza como strings; se dibuja como texto + ícono Lucide por nombre (allowlist), sin `dangerouslySetInnerHTML`.
- **T-12-07** (Extension viva de CodeMirror): mitigado — `editorExtensions.add` lanza Error en español para externos.

## Verificación

- `env -u ELECTRON_RUN_AS_NODE npm run build` → **EXIT 0** (typecheck + build:iframe + electron-vite build en verde).
- Greps: `op: 'resize'` presente y `op: 'theme'` ausente en types.ts; `theme?: 'dark'` presente; `ResizeObserver` + `contentWindow` en PluginPanels; `listExternalPanels`/`listExternalStatusItems`; `editorExtensions.add: no soportado` en pluginRuntime; ejemplo con `panels.register` + `statusBar.addItem` + `createElement` y sin emojis.

## Pendiente (Plan 03)

Remoción de `unsafe-eval` del CSP del host (index.html). No se tocó en este plan.

## Known Stubs

Ninguno.

## Self-Check: PASSED
