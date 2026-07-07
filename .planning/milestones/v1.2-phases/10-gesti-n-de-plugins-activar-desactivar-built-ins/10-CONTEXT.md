# Phase 10: Gestión de plugins — activar/desactivar built-ins - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Permitir activar/desactivar los plugins internos (built-in: `insert-date`, `reading-time`, `outline`) desde Ajustes → Plugins, igual que los externos, con el estado persistido en `settings.plugins.enabled`. Desactivar un built-in lo excluye de comandos/paneles/status bar/extensiones de editor (al reiniciar, como los externos hoy); reactivarlo lo restaura. NO incluye hot enable/disable sin reiniciar, ni tocar el sandbox/permisos (eso es Fase 11 / PLUG-02).

</domain>

<decisions>
## Implementation Decisions

### Aplicación al reiniciar (paridad con externos) — decisión del usuario
- El toggle de un built-in persiste en `settings.plugins.enabled` y el cambio **se aplica al reiniciar la app**, exactamente como los externos hoy ("Los cambios de activación se aplican al reiniciar la app").
- Al arrancar, `App.tsx` activa **solo los built-ins habilitados**: filtra `BUILTIN_PLUGINS` por el mapa de habilitados antes de `activatePlugins`. Un built-in desactivado simplemente no se activa → no registra comando/panel/status/extensión (teardown "gratis", sin dispose en vivo).
- NO se implementa activación/desactivación en vivo (descartado por el usuario a favor de la paridad/simplicidad).

### Default ON para built-ins (semántica distinta a externos)
- Los externos resuelven `enabled = map[id] ?? false` (opt-in). Los built-ins deben resolver `enabled = map[id] ?? true` (**default ON**): en una instalación nueva no hay entradas para ellos y deben seguir activos (comportamiento actual intacto).
- Ambos comparten el mismo `settings.plugins.enabled` (Record<id, boolean>) sin conflicto: se resuelven en caminos distintos (built-ins en el renderer con `?? true`; externos en `plugins.ts` `listPlugins` con `?? false`). Los ids de built-in (`insert-date`/`reading-time`/`outline`) no colisionan con carpetas de externos.

### Grupo aparte "Integrados" en Ajustes → Plugins — decisión del usuario
- Nueva lista propia (encabezado "Integrados" / "Incluidos con Geode") **encima** de "Instalados", con los mismos toggles `.ps-toggle`. Deja claro que vienen con la app, no se desinstalan y están ON por defecto.
- Cada fila muestra nombre (y descripción si se agrega) + el toggle; sin acciones de carpeta (no aplican). Copy que aclare que el cambio se aplica al reiniciar (igual que abajo).

### Claude's Discretion
- **Cómo lee el renderer el estado de los built-ins**: agregar un IPC de solo-lectura del mapa, p.ej. `plugins.getEnabled(): Promise<Record<string, boolean>>` (canal `geode:plugins-get-enabled`) que devuelve `settings.plugins.enabled` crudo; el renderer resuelve `map[id] ?? true` para cada built-in. Reusar el `plugins.setEnabled(id, enabled)` YA existente para togglear built-ins (escribe el mismo mapa). Alternativa: un método dedicado que reciba los ids y devuelva el estado resuelto — a criterio, pero mantené la resolución default-ON del lado del que conoce que es built-in.
- **Metadata de UI de los built-ins**: `GeodePlugin` hoy tiene solo `id` + `name` (sin `description`). Para la lista "Integrados" alcanza `name`; opcionalmente agregar `description?: string` a `GeodePlugin` y poblarla (en español) en los 3 built-ins, o mantener una pequeña tabla de metadata en el renderer. A criterio.
- **Activación async en `App.tsx`**: hoy los built-ins se activan síncronos (`activatePlugins(host, BUILTIN_PLUGINS)` ~952) y los externos async en el mismo effect. Al filtrar por el mapa, la activación de built-ins pasa a depender de un `await` del IPC. Integrarlo con el patrón existente (flag `cancelled`, cleanup en unmount) sin condiciones de carrera. A criterio si se activan built-ins+externos tras un solo `await` del mapa o por separado.
- Dónde vive el estado/render de la lista "Integrados": `SettingsModal.tsx` (ahí ya viven `extPlugins`/`togglePlugin`/`refreshPlugins` de la sección Plugins).

</decisions>

<code_context>
## Existing Code Insights

### Activación de built-ins (a gatear)
- `src/renderer/src/plugins/index.ts`: `BUILTIN_PLUGINS = [insertDatePlugin, readingTimePlugin, outlinePlugin]` (~18); `activatePlugins(host, plugins)` (~25) devuelve un Disposable que limpia todos.
- `src/renderer/src/App.tsx` (~952): `const offPlugins = activatePlugins(host, BUILTIN_PLUGINS)` — HOY sin filtro. Externos async ~959-961 (`loadExternalPlugins` → `activatePlugins`), con flag `cancelled` y cleanup. **Punto de cambio**: filtrar `BUILTIN_PLUGINS` por el mapa de habilitados (default ON) antes de activar.
- `src/renderer/src/plugins/types.ts`: `GeodePlugin` = `{ id, name, activate }` (~89) — sin `description`.

### Estado persistido (a reusar/extender)
- `src/main/services/settings.ts`: `settings.plugins?.enabled` (Record<id, boolean>, ~35); `getEnabledMap()` → `plugins?.enabled ?? {}` (~170); `setPluginEnabled(id, enabled)` merge (~178). Reusar; NO cambian su semántica.
- `src/main/services/plugins.ts`: `listPlugins(enabledMap)` resuelve externos con `enabledMap[id] ?? false` (~55) — NO tocar (es la semántica opt-in de externos).

### IPC / preload (a extender con solo-lectura del mapa)
- `src/shared/ipc.ts`: canales `pluginsList`/`pluginsOpenDir`/`pluginsSetEnabled`/`pluginsReadSource` (~72-75); `PluginsApi` (~412+). Agregar `pluginsGetEnabled: 'geode:plugins-get-enabled'` + método `getEnabled(): Promise<Record<string, boolean>>`.
- `src/preload/index.ts` (~91): objeto `plugins` con list/openDir/setEnabled/readSource. Agregar `getEnabled`.
- `src/main/index.ts`: handlers de plugins (buscar `pluginsList`/`pluginsSetEnabled`). Agregar handler `pluginsGetEnabled` → `getEnabledMap()`.

### UI de Ajustes (a extender con el grupo "Integrados")
- `src/renderer/src/SettingsModal.tsx` sección `section === 'plugins'` (~368): encabezado "Instalados" + `extPlugins.map` con filas `.plugin-settings-row` y toggle `.ps-toggle` (~406-413). Agregar ARRIBA un grupo "Integrados" que liste los built-ins (desde `BUILTIN_PLUGINS` + el mapa `getEnabled`), con el mismo toggle cableado a `plugins.setEnabled`. `extPlugins`/`togglePlugin`/`refreshPlugins` viven acá.

### Established Patterns
- Toggle `.ps-toggle` (checkbox + label activado/desactivado); iconos Lucide; strings/comentarios en español.
- IPC de plugins con prefijo `plugins:`... **corrección**: los canales de plugins usan prefijo `geode:` en `ipc.ts` (`geode:plugins-*`); mantener ese prefijo (la nota de STATE sobre prefijo `plugins:` se refiere a otra convención — seguir lo que ya está en el código: `geode:plugins-*`).
- "Los cambios de activación se aplican al reiniciar la app" (copy ya existente ~385).

### Integration Points
- El toggle "Integrados" escribe `settings.plugins.enabled[id]` vía `plugins.setEnabled`; al reiniciar, `App.tsx` activa solo los habilitados (default ON).
- Verificación (SC-2/SC-4): desactivar `outline` (panel + comando) o `reading-time` (status bar) o `insert-date` (comando) y, tras reiniciar, confirmar que desaparecen; reactivar y confirmar que vuelven.

</code_context>

<specifics>
## Specific Ideas

- La diferencia semántica crítica: built-ins **default ON** (`?? true`), externos **default OFF** (`?? false`). No romper el arranque actual (los 3 built-ins activos en instalación nueva).
- El usuario eligió paridad con externos (reinicio) y grupo visual aparte ("Integrados").

</specifics>

<deferred>
## Deferred Ideas

- Hot enable/disable sin reiniciar — descartado (fuera de alcance; mejora aparte).
- Sandbox/permisos de plugins (Fase B) — Fase 11 / PLUG-02.
- Desinstalar/gestionar built-ins como archivos — no aplica (vienen embebidos en la app).

</deferred>
