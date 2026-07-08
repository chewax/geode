# Phase 11: Freeze API v1 + puente async del PluginContext - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Primer paso de la Fase B (aislamiento de plugins): **congelar la API v1** del `PluginContext` como contrato público (+ `apiVersion`/`minAppVersion` con chequeo de compatibilidad en el host), y convertir la API que reciben los **plugins externos** en un **proxy async por un MessagePort real** (RPC request/response), corriendo todavía **in-window (sin iframe)** para de-risquear el cambio de API async por separado del sandbox. Los **built-ins siguen intactos** (API v1 síncrona, in-host). Un plugin de ejemplo valida el puente end-to-end. NO incluye: el iframe/sandbox (Fase 12), la UI de panel bajo aislamiento (Fase 12), permisos (Fase 13), ni quitar `unsafe-eval` (Fase 12).

</domain>

<decisions>
## Implementation Decisions

### MessagePort real ya en la Fase 11 (decisión del usuario)
- El plugin **externo** se evalúa in-window (como hoy, `new Function` — `unsafe-eval` sigue hasta Fase 12) pero recibe un **PluginContext proxy async** que habla con un **bridge del host por un `MessagePort` real** (un `MessageChannel`: un port al lado-plugin, otro al lado-host, ambos en el renderer por ahora). En la Fase 12 solo se cambia el **endpoint** del port al iframe — la API del plugin no cambia. Máximo de-risk.
- Protocolo RPC async: request/response con id. Envelope a criterio, p.ej. `{type:'call', id, method, args}` → `{type:'result', id, result}` / `{type:'error', id, message}`; eventos del host → plugin como `{type:'event', name, payload}`; invocación de comando host → plugin como `{type:'invoke', commandId}`.

### Built-ins siguen síncronos (v1), sin tocarlos (decisión del usuario)
- `activatePlugins(host, BUILTIN_PLUGINS)` y `buildPluginContext` (react.tsx) quedan **sin cambios** para los built-ins: API v1 síncrona, in-host, acceso directo. Cero riesgo de romper insert-date/reading-time/outline.
- La nueva API async (proxy por el puente) es **solo para externos**. Conviven dos shapes: v1 síncrona (built-ins, in-host) y v2 async (externos, por el puente).

### API v2 async — qué se proxya en la Fase 11 vs qué se difiere
- **Proxyado ahora** (async por el port): `activeNote()`, `vault.readNote/tree`, `git.graph` (ya son Promises hoy), `editor.insertAtCursor/getSelection/revealRange` (**pasan a `Promise`** — BRIDGE-01), `events.on` (el host empuja eventos al port; el proxy del lado-plugin despacha a los handlers), `runCommand`, `notify`.
- **Comandos** (register + invoke): el plugin registra con lo serializable `{id, title, category, shortcut}` (se descartan `run`/`isEnabled` en el cruce); el host registra un comando cuyo `run()` manda `{type:'invoke', commandId}` al port → el proxy del lado-plugin corre el `cmd.run()` local. `isEnabled` se evalúa del lado-plugin bajo demanda o se omite en el MVP.
- **Diferido a Fase 12 (UI-01)**: `panels`/`statusBar`/`editorExtensions` — llevan Components React / Extensions de CodeMirror **no serializables** (structured-clone los descarta) y necesitan el modelo de UI-dentro-del-iframe. En la Fase 11 el puente NO maneja UI de panel/status/extensión; el plugin de ejemplo que valida el puente usa **comandos + editor + eventos + vault** (sin paneles).

### APIVER-01 — freeze + compatibilidad
- Agregar `apiVersion?` a `PluginManifest` (ipc.ts). Congelar el `PluginContext`/`Workspace` actual como **API v1** (contrato público; cambios futuros → v2 con capa de compat).
- **Chequeo de compatibilidad en el host** antes de cargar un externo: constante `HOST_API_VERSION = 1`. Si `apiVersion` es incompatible (mayor que el soportado) → **rechazar** con error claro (se muestra en Ajustes como los otros errores de plugin). `minAppVersion` (ya declarado) se compara contra la versión de la app → rechazar/avisar si es más nueva. `apiVersion` ausente → asumir v1 (o avisar).

### Claude's Discretion
- Envelope RPC exacto + esquema de ids; módulo nuevo del bridge del host (p.ej. `plugins/bridge.ts`) y refactor del camino de carga de externos (`loader.ts` sigue leyendo la fuente; un nuevo `activateExternalViaBridge` arma el `MessageChannel` + proxy + eval con el ctx proxy).
- Dónde viven los chequeos de compat: recomendado en `main/services/plugins.ts` `listPlugins` (marca `error` en `InstalledPlugin` para los incompatibles → se ven en Ajustes) para `minAppVersion` (necesita `app.getVersion()`); `apiVersion` puede chequearse ahí o en el loader del renderer. A criterio.
- Tipo de `apiVersion` (número mayor vs semver) y regla de compat (recomendado: número; host soporta v1; rechazar si `apiVersion > 1`).
- Contenido del plugin de ejemplo (en `examples/plugins/`): declara `apiVersion` + `permissions` (informativos aún), registra un comando que lee la selección/nota activa e inserta texto por la API async, y escucha un evento — valida BRIDGE-01 + APIVER-01.
- Si el `editor.*` async del built-in path debe también exponerse async: NO — los built-ins quedan síncronos; solo el proxy de externos es async.

</decisions>

<code_context>
## Existing Code Insights

### API y contexto (a congelar + a proxyar para externos)
- `src/renderer/src/plugins/types.ts`: `PluginContext extends Workspace` (~81) + `Workspace` (~53). `editor.insertAtCursor/getSelection/revealRange` son **síncronos** hoy (~63-70) — la versión async (v2/proxy) los vuelve `Promise`. `vault.readNote/tree` y `git.graph` ya son Promises. Este es el contrato **API v1** a congelar.
- `src/renderer/src/plugins/react.tsx`: `buildPluginContext(host, disposables)` (~69) arma el ctx in-host; `workspaceFor(host)` (~41) rutea vault/git a `window.geode.*` (async) y editor a `host.editor*` (sync). **Built-ins siguen usando esto sin cambios.**
- `src/renderer/src/plugins/host.ts`: registry (registerCommand/Panel, addStatusItem, addExtension) + event bus (`on`/emisión) + `editorInsertAtCursor/getSelection/revealRange`/`runCommand`/`notify`/`activeNote`. El bridge del host traduce mensajes del port a estas llamadas reales.

### Carga de externos (a bifurcar hacia el puente)
- `src/renderer/src/plugins/loader.ts`: `loadExternalPlugins()` (~58) lee la fuente por IPC y `evalCjs` (~34, `new Function`) devuelve el plugin; `activatePlugins` (index.ts ~25) llama `plugin.activate(ctx)`. **Cambio**: para externos, en vez del ctx in-host, armar el `MessageChannel` + proxy async y activar con el ctx proxy (sigue eval in-window; `unsafe-eval` presente hasta Fase 12).
- `src/renderer/src/App.tsx` (~952-964): activa built-ins (sin cambios) y externos (async). El camino de externos pasa a usar el puente.

### Manifiesto y compat (a extender)
- `src/shared/ipc.ts` `PluginManifest` (~399): tiene `minAppVersion?` (~408) y `permissions?` (~410, reservado). **Agregar `apiVersion?`**. `InstalledPlugin.error` (~414) ya se usa para mostrar plugins rotos en Ajustes → reusar para incompatibles.
- `src/main/services/plugins.ts` `listPlugins` (~30): valida manifiesto y setea `error`. Buen lugar para el chequeo `minAppVersion`/`apiVersion` (necesita `app.getVersion()`).

### Established Patterns
- IPC `geode:plugins-*`; strings/comentarios en español; iconos Lucide; TS strict, tipos de retorno explícitos; preload CommonJS.
- Un plugin que falla no tumba a los demás (se acumula en `errors`/`error`).

### Integration Points
- Built-ins (in-host, v1) y externos (por el puente, v2 async) coexisten en el mismo `PluginHost`/registries → los comandos/eventos de un externo aparecen en la paleta/bus igual que hoy, solo que su ejecución cruza el port.
- El plugin de ejemplo se instala en la carpeta de plugins del usuario (o se documenta en `examples/plugins/`) para el UAT.

</code_context>

<specifics>
## Specific Ideas

- El de-risk central: el transporte de mensajes (MessagePort + RPC async) se ejercita YA en la Fase 11 con el plugin in-window; la Fase 12 solo mueve un endpoint del port al iframe. Así "meter el sandbox" cambia el transporte, no la API del plugin (docs/PLUGINS.md paso 2 antes del 3).
- Los built-ins quedan como prueba viva de que la API v1 síncrona in-host sigue funcionando durante toda la Fase B.

</specifics>

<deferred>
## Deferred Ideas

- iframe/sandbox real + quitar `unsafe-eval` → Fase 12 (ISO-01/CSP-01).
- UI de panel/status/editor-extension bajo aislamiento (Components/Extensions no serializables) → Fase 12 (UI-01).
- Permisos (declarar/consentir/enforcement) → Fase 13 (PERM-01/02).
- Migrar built-ins a async, hot-reload, instalación desde zip/URL, allowlist de hosts → Future.

</deferred>
