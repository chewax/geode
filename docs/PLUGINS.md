# Ecosistema de plugins de Geode

Estado del ecosistema de plugins. **Fase A está implementada** (plugins locales
confiables cargados en runtime). **Fase B es el diseño pendiente** (sandbox +
permisos para terceros no confiables) — es lo que hace el producto "vendible".

> Nota de nomenclatura: "Fase A/B" se refiere **solo al ecosistema de plugins**,
> no a las fases del proyecto (Fase 0/1/2/3 en `ARCHITECTURE.md §8`).

---

## Fase A — implementada (v0.5.0)

Modelo **local confiable, estilo Obsidian**: el usuario instala plugins que corren
con acceso total; la confianza es del usuario (no hay aislamiento todavía).

### Arquitectura
- Un plugin = una **carpeta** en `<userData>/plugins/` con `plugin.json` +
  entry CommonJS.
- **El main descubre y lee** (`src/main/services/plugins.ts`), nunca ejecuta.
  IPC: `plugins:list | openDir | setEnabled | readSource`. Estado activado/
  desactivado persistido en `settings.plugins.enabled` (por id).
- **El renderer carga y activa** (`src/renderer/src/plugins/loader.ts`): pide la
  fuente por IPC y la evalúa con `new Function(...)`; un `require` shim presta la
  **misma instancia** de `react`, `react/jsx-runtime`, `@codemirror/state`,
  `@codemirror/view`. Un plugin que falla no tumba a los demás.
- **API v1** (`src/renderer/src/plugins/types.ts`): `PluginContext` con
  `commands / panels / statusBar / editorExtensions` + workspace de solo lectura
  (`activeNote`, `vault.readNote/tree`, `git.graph`, `editor`, `events`).
- **CSP relajado**: `script-src` incluía `'unsafe-eval'` (`index.html`) para
  permitir la evaluación. **Ya quitado en Fase 12 (CSP-01):** el host recupera
  `script-src 'self'` + `frame-src 'self'`; el eval de terceros vive solo en el
  iframe del sandbox.

### Reservado para Fase B (ya declarado, sin efecto hoy)
- `plugin.json → permissions: string[]` — hoy informativo; en B se hace cumplir.
- `plugin.json → minAppVersion` — control de compatibilidad.
- El plugin **solo** recibe el `PluginContext` (no toca `window.geode` ni Node),
  y el workspace ya es **async-friendly** (`readNote/tree/graph` son promesas) →
  facilita moverlo detrás de un bridge por postMessage.

### Limitaciones conocidas de Fase A
- **Sin aislamiento**: un plugin puede acceder a globals del renderer. Aceptable
  bajo el modelo confiable; inaceptable para un marketplace de terceros → Fase B.
- **Activar/desactivar requiere reiniciar** (el loader corre una vez al montar).
- Métodos de editor **síncronos** (`editorInsertAtCursor`, `getSelection`) — hay
  que volverlos async al cruzar el límite del sandbox (ver migración).

---

## Fase B — diseño pendiente (sandbox + permisos, para terceros)

Objetivo: permitir instalar plugins de **terceros no confiables** sin poner en
riesgo las notas ni la app. Es el paso que habilita un marketplace / producto
vendible.

### Modelo de amenazas
Un plugin de terceros es **código no confiable** corriendo en la máquina del
usuario. Debe asumirse hostil:
- No puede leer/escribir notas ni archivos que no declaró.
- No puede hacer red arbitraria (exfiltración) sin permiso.
- No puede acceder al token de GitHub, la API key de IA, ni a `window.geode`.
- No puede romper/colgar la app principal (aislar fallos y bucles).

### Arquitectura de aislamiento (decisión central)
Los plugins dejan de evaluarse en el renderer principal y pasan a un **contexto
aislado**. Opciones:

1. **iframe sandboxed** (`sandbox="allow-scripts"`, sin `allow-same-origin`) —
   contexto JS y DOM propios, origen opaco (no accede a cookies/almacenamiento
   del host). **Permite UI**: el plugin renderiza su panel dentro del iframe.
   Recomendado como base.
2. **Web Worker** — aísla CPU/lógica pero **no tiene DOM**; sirve para plugins
   sin UI (procesadores, comandos). Se puede ofrecer como modo liviano.

**Recomendación:** iframe por plugin (o uno compartido con realms) para los que
tienen UI; worker opcional para los headless. El renderer principal **recupera su
CSP estricto** (se quita `'unsafe-eval'`).

**El punto difícil — paneles con UI bajo sandbox:** hoy un panel es un
`FC` React que se monta en el árbol del host. Bajo aislamiento no puede montarse
en el DOM del host. Opciones a evaluar:
- (a) El panel del plugin vive **dentro del iframe**; el host solo le reserva un
  rectángulo y le pasa tamaño/tema por mensaje. UI totalmente del plugin.
- (b) **UI declarativa restringida**: el plugin describe la UI (JSON/VDOM
  serializable) y el host la renderiza con componentes propios. Más seguro y
  consistente, menos flexible.
- Decisión abierta (ver más abajo). Probablemente (a) para empezar.

### Comunicación host ↔ sandbox (RPC por mensajes)
- Toda la API pasa a un **protocolo asíncrono por `postMessage`** con un id de
  request/response. El `PluginContext` del plugin se convierte en un **proxy**
  que serializa llamadas al host.
- El host **valida permisos** en el borde: cada llamada (`vault.readNote`,
  `editor.insertAtCursor`, red, etc.) se chequea contra los `permissions`
  declarados **antes** de ejecutarse.
- **Migración de APIs síncronas:** `editor.getSelection()` /
  `insertAtCursor()` deben volverse `Promise`. Conviene marcar la API v1 actual
  como compatible y exponer v2 async, o hacer el cambio junto con el freeze.

### Modelo de permisos
- `permissions` en el manifiesto, enum cerrado. Borrador:
  - `notes:read`, `notes:write`
  - `editor:read`, `editor:write`
  - `git:read` (grafo/historial)
  - `network` (fetch, con lista de hosts permitidos opcional)
  - `clipboard`
- **UX de consentimiento:** al activar un plugin, mostrar los permisos que pide y
  pedir confirmación. Cambios de permisos entre versiones → re-consentir.
- **Enforcement:** en el bridge del host (único lugar que ejecuta acciones
  reales). El sandbox nunca tiene acceso directo a nada.

### Estabilización y versionado de la API
- Congelar **API v1** como contrato público: `apiVersion` en el manifiesto; el
  host rechaza/avisa si `minAppVersion`/`apiVersion` no son compatibles.
- Documentar y no romper. Cambios → v2 con capa de compatibilidad.

### Ciclo de vida
- **Activar/desactivar/recargar en caliente** (sin reiniciar): instanciar/destruir
  el sandbox y correr `activate`/cleanup. Elimina la limitación de Fase A.
- **Instalación:** además de copiar la carpeta (Fase A), soportar `.zip` y/o
  descarga desde URL/registro, con verificación de integridad (hash) y, a futuro,
  **firma** para un marketplace.

### SDK para autores
- Template de proyecto (TS + JSX) que bundlea a un `main.js` CommonJS con
  `react`/`@codemirror/*` como externos.
- Tipos publicados de `PluginContext` (API v1) + docs (`examples/plugins/README.md`
  es la semilla).

---

## Migración Fase A → Fase B (orden sugerido)
1. **Congelar API v1** + `apiVersion` en el manifiesto (sin cambiar comportamiento).
2. **Bridge async por postMessage** contra el host actual (todavía sin sandbox):
   convertir el `PluginContext` en proxy; volver async las APIs síncronas.
3. **[HECHO — Fase 12]** **Meter el sandbox** (iframe) detrás de ese bridge. Los
   plugins ya hablan por mensajes → cambia el transporte, no la API del plugin.
   El plugin se evalúa DENTRO de un iframe de origen opaco
   (`sandbox="allow-scripts"`, sin `allow-same-origin`) con CSP propia
   (`default-src 'none'`; `script-src 'unsafe-inline' 'unsafe-eval'`;
   `connect-src 'none'` — red default-deny hasta Fase 13).
4. **Permisos**: declarar + prompt de consentimiento + enforcement en el bridge.
   *(Pendiente — Fase 13.)*
5. **[HECHO — Fase 12 / CSP-01]** **Quitar `'unsafe-eval'`** del CSP del renderer
   principal (los plugins ya no se evalúan ahí). El host queda con
   `script-src 'self'` + `frame-src 'self'` (soporte del iframe srcdoc).
6. **Hot reload** (activar/desactivar sin reiniciar) e **instalación desde zip/URL**.

## Decisiones abiertas
- **UI bajo sandbox:** ~~iframe con UI propia (a) vs UI declarativa (b)~~ →
  **resuelto en Fase 12: opción (a)** — el panel del plugin vive dentro del
  iframe; el host solo le reserva un rectángulo y le pasa tamaño/tema por mensaje.
- **Un iframe por plugin vs uno compartido** → **resuelto: un iframe por plugin**
  (máximo aislamiento).
- **Granularidad de permisos** (¿`network` con allowlist de hosts?).
- **Firma/confianza** para distribución (¿marketplace propio? ¿solo hash?).
- **API async v2 vs mantener v1 síncrona con shim** en el borde.

## Punteros al código (Fase A)
- Descubrimiento/IPC (main): `src/main/services/plugins.ts`, handlers en
  `src/main/index.ts`, estado en `src/main/services/settings.ts`.
- Loader + API (renderer): `src/renderer/src/plugins/loader.ts`, `host.ts`,
  `react.tsx`, `types.ts`, `index.ts`.
- UI de gestión: sección "Plugins" en `src/renderer/src/SettingsModal.tsx`.
- CSP: `src/renderer/index.html`.
- Ejemplo + guía de autor: `examples/plugins/`.
