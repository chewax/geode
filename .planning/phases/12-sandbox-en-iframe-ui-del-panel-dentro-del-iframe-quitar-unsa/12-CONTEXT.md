# Phase 12: Sandbox en iframe + UI del panel dentro del iframe + quitar unsafe-eval - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

El corazón del aislamiento (Fase B): los plugins de **terceros (externos)** dejan de evaluarse in-window y pasan a correr dentro de un **iframe sandboxed** (`sandbox="allow-scripts"`, sin `allow-same-origin`) — sin acceso a `window.geode`, Node ni globals del renderer principal, hablando con el host **solo por el puente** (el MessagePort de la Fase 11, ahora transferido al iframe). El **panel** de un plugin de terceros renderiza **dentro del iframe** (el host le reserva el rectángulo en el dock); los **status-items** de terceros usan un modelo **serializable** (texto/ícono/tooltip). Finalmente se **quita `'unsafe-eval'`** del CSP del renderer principal. Los **built-ins siguen first-party** en el host (in-host, síncronos, sin cambios). NO incluye: permisos/consentimiento (Fase 13), hot-reload, instalación desde zip/URL, firma (Future).

</domain>

<decisions>
## Implementation Decisions

### Aislamiento por iframe sandboxed (ISO-01)
- Un plugin externo corre en un **iframe `sandbox="allow-scripts"` (sin `allow-same-origin`)**: contexto JS/DOM propio, **origen opaco** (sin acceso a cookies/almacenamiento del host, sin `window.geode`, sin Node).
- **Un iframe por plugin** (aislamiento > memoria; ya hay un `MessageChannel` por plugin en Fase 11).
- **Carga vía `srcdoc`**: el host arma un iframe con `srcdoc` que contiene un **bootstrap inline** + el **runtime del plugin** (ver build abajo). Tras `load`, el host **transfiere `port1`** al iframe con `iframe.contentWindow.postMessage(init, '*', [port1])`, donde `init` lleva la **fuente CommonJS** del plugin. El bootstrap del iframe: arma un `require` shim, evalúa la fuente (`new Function` — el eval ahora vive DENTRO del iframe aislado, no en el host), construye el proxy async sobre `port1` y llama `plugin.activate(ctx)`.

### Split del módulo del puente (cierra IN-02 de Fase 11)
- `bridge.ts` se **divide**: el **lado-host** (`attachHostBridge`, `activateExternalViaBridge`) queda en el renderer (importa `PluginHost`). El **lado-plugin** (el proxy `buildAsyncContext` + la lógica RPC) se mueve a un **módulo autocontenido SIN imports del host** (`window.geode`, `PluginHost`, etc.), para que el bundle del iframe no arrastre nada del host.

### Runtime del iframe (build config — el punto de mayor riesgo)
- El iframe necesita un **bundle propio autocontenido**: el proxy RPC (lado-plugin) + un `require` shim que provea **react, react-dom, react/jsx-runtime, @codemirror/state, @codemirror/view** (para que el plugin pueda renderizar su panel DENTRO del iframe) + el bootstrap (recibe port+fuente, evalúa, activa, monta el panel).
- Se construye como una **entrada adicional de Vite/electron-vite** y se **inyecta inline** en el `srcdoc` del iframe (un iframe sandboxed de origen opaco no puede cargar `<script src>` del origen del host). A criterio: entrada extra en `electron.vite.config.ts` (renderer `build.rollupOptions.input`) que emita un IIFE/bundle único, leído en runtime e inyectado como `<script>` inline en el srcdoc.

### UI dentro del iframe (UI-01)
- **Paneles**: `panels.register` de un externo cruza solo lo serializable `{id, title, icon?}` (el `icon` como **nombre de ícono Lucide** string, que el host mapea; o sin ícono). El **cuerpo del panel es el iframe**: `PluginPanels` (`PluginPanels.tsx`), para un panel externo, renderiza el `<iframe>` del plugin posicionado en el `plugin-panel-body`; el header (título+ícono+cerrar) lo dibuja el host. El plugin monta su UI React dentro del iframe. El host pasa **tamaño/tema** por mensaje. Un plugin con lógica pero sin panel abierto mantiene el iframe vivo pero oculto (para comandos/eventos).
- **Status-items** (decisión del usuario: incluirlos): un externo registra un status-item con un **modelo serializable** `{id, text, tooltip?, icon?}` (NO un Component). El host lo renderiza en la status bar desde esos datos y lo **actualiza** cuando el plugin lo cambia (mensaje por el puente). Es una API nueva del puente para status-items serializables.
- **editorExtensions**: **NO soportado para terceros** (una `Extension` de CodeMirror es un objeto vivo que debe correr en el editor del host → rompería el aislamiento). El proxy del externo lanza un error claro en español. Solo los built-ins first-party aportan extensiones de editor. Limitación documentada.
- **Built-ins**: paneles/status-items/extensiones de built-ins siguen por el camino in-host con Component (`PluginPanels` con `<panel.Component/>`, `PluginStatusBar`), SIN cambios.

### CSP (CSP-01) — quitar unsafe-eval + endurecer el iframe (decisión del usuario: red bloqueada)
- **Renderer principal** (`src/renderer/index.html`): quitar `'unsafe-eval'` de `script-src` (los externos ya no se evalúan en el host; los built-ins son imports estáticos). Agregar lo necesario para el iframe (`frame-src`/`child-src` para el `srcdoc`). Validar que la app y los built-ins siguen funcionando sin `unsafe-eval` (React/Vite/CodeMirror no lo requieren en prod).
- **CSP del iframe** (via `<meta http-equiv>` en el `srcdoc`): `script-src 'unsafe-inline' 'unsafe-eval'` (para el runtime + el eval del plugin), `style-src 'unsafe-inline'` (UI del plugin), `img-src data:`, y **`connect-src 'none'`** (red bloqueada por defecto — la Fase 13 la abre con el permiso `network`). `default-src 'none'`.

### Claude's Discretion
- Mecánica exacta del `srcdoc` + inyección del runtime + transferencia del port; forma del `init` message; cómo se posiciona/dimensiona el iframe del panel en el dock (overlay del rectángulo `plugin-panel-body`); mapeo nombre-de-ícono→Lucide para paneles/status-items externos.
- Build config del bundle del iframe (entrada extra de Vite, IIFE, inline). Si resulta más simple, un `Blob`/`data:` URL en vez de `srcdoc` — mientras el origen sea opaco y el host recupere CSP estricto.
- Si el ejemplo `hola-mundo-async` se extiende con un panel + status-item para validar UI-01, o se crea un segundo ejemplo. Recomendado: extender el existente (o un `hola-mundo-panel`) que registre un panel React simple + un status-item.
- Manejo de errores del iframe (un plugin que falla no tumba al host; timeout de init; el iframe se puede recrear).

</decisions>

<code_context>
## Existing Code Insights

### Puente (Fase 11 — a dividir y transportar al iframe)
- `src/renderer/src/plugins/bridge.ts`: `attachHostBridge(host, port)` (lado host, allowlist explícita — queda) y `buildAsyncContext(port)` → `{ ctx, dispose }` (lado plugin — se mueve a un módulo autocontenido para el iframe); `activateExternalViaBridge(host, plugins)` (~263) arma el `MessageChannel` y hoy activa in-window → pasa a crear el iframe y transferir `port1`. El proxy ya difiere panels/statusBar/editorExtensions con `deferred()` (~196) — en esta fase panels y statusBar dejan de lanzar (se implementan), editorExtensions sigue lanzando.
- `src/renderer/src/plugins/types.ts`: `BridgeMessage` (envelope RPC), `AsyncPluginContext`. Sumar mensajes/tipos para panel (registrar/mostrar/ocultar/tamaño-tema) y status-item serializable.
- `src/renderer/src/plugins/loader.ts`: `loadExternalPlugins` lee la fuente por IPC; sigue igual (la fuente ahora se inyecta al iframe en vez de evaluarse in-window). `evalCjs`/`new Function` in-window se ELIMINA del host (migra al bootstrap del iframe).

### UI (a bifurcar host vs iframe)
- `src/renderer/src/plugins/PluginPanels.tsx`: hoy `<panel.Component/>` in-host (~28). Bifurcar: panel de built-in = Component (sin cambios); panel de externo = `<iframe>` del plugin en el `plugin-panel-body`.
- `src/renderer/src/plugins/PluginStatusBar.tsx`: hoy Components de status-items. Bifurcar: built-in = Component; externo = render desde el modelo serializable `{text, tooltip, icon}`.
- `src/renderer/src/plugins/host.ts`: registries (`registerPanel`, `addStatusItem`, `listPanels`, `isPanelOpen`, `togglePanel`). Puede necesitar distinguir paneles/status-items "externos" (iframe/serializable) de los in-host, o un registro paralelo.
- `src/renderer/src/App.tsx` (~985): el path de externos ya usa `activateExternalViaBridge`; ahora ese path crea iframes. Built-ins (~974) sin cambios.

### CSP y build
- `src/renderer/index.html` (~14): `script-src 'self' 'unsafe-eval'` → quitar `unsafe-eval` + soporte iframe.
- `electron.vite.config.ts`: agregar la entrada del runtime del iframe (renderer build). Aliases `@shared/@domain/@renderer` existentes.
- `examples/plugins/hola-mundo-async/`: ejemplo async de Fase 11 (comando+editor+eventos, sin panel) — extender o sumar uno con panel+status-item para UI-01.

### Established Patterns
- IPC `geode:*`; strings/comentarios español; Lucide; preload CommonJS; TS strict, tipos de retorno explícitos; un plugin que falla no tumba al resto.
- Patrón de referencia (industria): webviews de VS Code / plugins de Figma = iframe sandbox + runtime inline + RPC por postMessage. Es exactamente este diseño.

### Integration Points
- El puente de la Fase 11 no cambia su API para el plugin: solo se **mueve un endpoint del port al iframe** (de-risk cumplido). El plugin async sigue igual salvo que ahora puede registrar panel/status-item.
- Tras quitar `unsafe-eval`, validar built-ins + app + el externo aislado en un build relanzado.

</code_context>

<specifics>
## Specific Ideas

- El eval del plugin se mueve al iframe aislado (origen opaco, sin `window.geode`): recién ahí el puente es un boundary de verdad (cierra IN-03 de Fase 11).
- Red del iframe **default-deny** (`connect-src 'none'`) hasta que la Fase 13 agregue el permiso `network` — coherente con el modelo de amenazas de `docs/PLUGINS.md`.
- Status-items de terceros = datos serializables, NO Components (un Component no cruza el sandbox).

</specifics>

<deferred>
## Deferred Ideas

- Permisos / consentimiento / enforcement en el borde → Fase 13 (PERM-01/02); la red se abre ahí.
- Hot-reload sin reiniciar, instalación desde zip/URL, firma/marketplace, allowlist de hosts en `network` → Future.
- editorExtensions para terceros → no soportado (incompatible con el aislamiento); solo built-ins.
- UI declarativa (host renderiza la UI del plugin) → se eligió UI dentro del iframe.
</deferred>
