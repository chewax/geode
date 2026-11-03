import type { FC, ReactNode } from 'react'
import type { Extension } from '@codemirror/state'
import type { GitGraph, TreeNode } from '@shared/ipc'

/** Algo que se puede deshacer (des-registrar un comando, panel, listener…). */
export interface Disposable {
  dispose(): void
}

/** Un comando ejecutable, visible en la paleta (Ctrl+P). */
export interface Command {
  id: string
  title: string
  /** Agrupa en la paleta (p. ej. "Núcleo", "Editor"). */
  category?: string
  /** Atajo informativo que se muestra en la paleta (no crea el binding). */
  shortcut?: string
  run(): void | Promise<void>
  /** Si devuelve false, el comando se muestra deshabilitado en la paleta. */
  isEnabled?(): boolean
}

/** Un panel lateral que aporta un plugin (se muestra/oculta con toggle). */
export interface PanelDef {
  id: string
  title: string
  icon?: ReactNode
  /** Componente React; puede usar useGeode() para leer el workspace. */
  Component: FC
}

/** Un ítem en la barra de estado aportado por un plugin. */
export interface StatusItemDef {
  id: string
  Component: FC
}

/**
 * ── Modelos SERIALIZABLES para plugins EXTERNOS (Fase 12 / UI-01) ────────────
 *
 * Cruzan el `MessagePort` como DATOS puros (solo strings): NO llevan Componentes
 * ni Extensions (no serializan). El host dibuja el header del panel (título +
 * ícono Lucide por nombre + cerrar) y el status-item a partir de estos datos; el
 * CUERPO del panel se renderiza DENTRO del iframe del plugin.
 */

/** Parte serializable de un panel externo. `icon` = NOMBRE de un ícono Lucide. */
export interface ExternalPanelDef {
  id: string
  title: string
  /** Nombre de un ícono Lucide (p. ej. 'Puzzle'); el host lo mapea a componente. */
  icon?: string
}

/**
 * Lo que el plugin externo pasa a `panels.register`: los datos serializables del
 * panel + su Component React. El Component se monta DENTRO del iframe del plugin
 * (react-dom del bundle del runtime) y NUNCA cruza el puente; solo `{id,title,icon}`
 * viaja al host para dibujar el header.
 */
export interface ExternalPanelInput extends ExternalPanelDef {
  Component: FC
}

/** Ítem de barra de estado de un plugin externo: 100% serializable. */
export interface ExternalStatusItem {
  id: string
  text: string
  tooltip?: string
  /** Nombre de un ícono Lucide; el host lo mapea a componente. */
  icon?: string
}

/** Handle de un status-item externo: se actualiza (manda statusBar.update) o se quita. */
export interface ExternalStatusHandle extends Disposable {
  update(patch: Partial<Omit<ExternalStatusItem, 'id'>>): void
}

/** Eventos de ciclo de vida (bus tipado). Payload por evento. */
export interface GeodeEvents {
  'note:open': { path: string; content: string }
  'note:change': { path: string; content: string }
  'note:beforeSave': { path: string | null }
  'note:afterSave': { path: string | null }
  'sync:after': { branch: string; oid: string }
  'vault:switch': { root: string; name: string }
}
export type GeodeEventName = keyof GeodeEvents

/**
 * API de solo lectura del workspace, disponible para los componentes de plugins
 * en runtime (vía useGeode()) y también incluida en el PluginContext de activate.
 */
export interface Workspace {
  /** Nota activa (ruta + contenido) o null si no hay ninguna abierta. */
  activeNote(): { path: string; content: string } | null
  vault: {
    readNote(path: string): Promise<string>
    tree(): Promise<TreeNode[]>
    /** true si existe una nota/archivo en esa ruta relativa. */
    exists(path: string): Promise<boolean>
    /** Crea una nota nueva (lanza "Ya existe" si la ruta está ocupada; nunca pisa). */
    createNote(path: string, content: string): Promise<void>
  }
  /** Abre una nota en el panel activo (como tab fija) y refresca el árbol. */
  openNote(path: string): Promise<void>
  ui: {
    /** Selector rápido (estilo paleta). Resuelve con el valor elegido o null si se cancela. */
    pick<T>(items: PickItem<T>[], placeholder?: string): Promise<T | null>
  }
  git: {
    graph(): Promise<GitGraph>
  }
  editor: {
    /** Inserta texto en el cursor (o reemplaza la selección). */
    insertAtCursor(text: string): void
    /** Texto seleccionado actualmente ('' si no hay). */
    getSelection(): string
    /** Selecciona y hace scroll a un rango del documento activo. */
    revealRange(from: number, to: number): void
  }
  events: {
    on<E extends GeodeEventName>(event: E, handler: (payload: GeodeEvents[E]) => void): Disposable
  }
  /** Ejecuta un comando registrado por su id. */
  runCommand(id: string): void
  /** Aviso breve (toast) al usuario. */
  notify(message: string): void
}

/** Una opción del selector rápido. */
export interface PickItem<T> {
  label: string
  detail?: string
  value: T
}

/**
 * Renderizador de un bloque de código con lenguaje propio (```mermaid, ```progreso…).
 * Recibe el texto del bloque y devuelve HTML/SVG. Geode SANEA el resultado
 * (DOMPurify: sin scripts ni handlers) antes de mostrarlo en la vista previa.
 */
export type CodeBlockRenderer = (source: string) => string | Promise<string>

/** Registro de bloques de código para la vista previa. */
export interface MarkdownApi {
  /** Registra el renderizador para ```lang. El último registrado para un lenguaje gana. */
  registerCodeBlock(lang: string, render: CodeBlockRenderer): Disposable
}

/** Contexto que recibe cada plugin en activate(): registrar + leer el workspace. */
export interface PluginContext extends Workspace {
  commands: { register(cmd: Command): Disposable }
  panels: { register(panel: PanelDef): Disposable; toggle(id: string): void }
  statusBar: { addItem(item: StatusItemDef): Disposable }
  editorExtensions: { add(ext: Extension): Disposable }
  markdown: MarkdownApi
}

/**
 * ── Envelope RPC del puente (Fase 11 / BRIDGE-01, Fase 12 / ISO-01) ───────────
 *
 * Protocolo de mensajes que viajan entre el proxy async del plugin externo (lado
 * plugin, DENTRO del iframe sandbox desde la Fase 12) y el handler host-side.
 *
 *  - `init`: host → iframe. ÚNICO mensaje que NO viaja por el `MessagePort`, sino
 *    por `contentWindow.postMessage(init, '*', [port1])`: lleva la fuente CommonJS
 *    del plugin, el `theme` ESTÁTICO ('dark') y TRANSFIERE el `port1` del canal al
 *    iframe. El resto de los mensajes (`call`/`result`/`error`/`event`/`invoke`)
 *    viaja ya por ese `MessagePort` establecido. El TEMA se pasa UNA sola vez acá
 *    (Geode es dark fijo): NO hay suscripción de cambio de tema ni un op de tema.
 *  - `panel` (op 'resize'): host → iframe, por `contentWindow.postMessage` (NO por
 *    el port). Un `ResizeObserver` sobre el `plugin-panel-body` lo emite de forma
 *    CONTINUA con el tamaño del rectángulo; el runtime del iframe aplica ese tamaño
 *    al contenedor de montaje del panel. Es el ÚNICO mensaje de panel (solo resize).
 *  - `call` / `result` / `error`: petición-respuesta plugin ↔ host (con `id`
 *    correlacionador). El plugin manda `call`; el host contesta `result` o `error`.
 *  - `event`: host → plugin. El host empuja el payload de un evento suscrito
 *    (identificado por `sub`, el número de suscripción que fijó el plugin).
 *  - `invoke`: host → plugin. El host pide correr el `run()` local de un comando
 *    registrado por el plugin (identificado por `commandId`).
 */
export type BridgeMessage =
  | { type: 'boot'; runtime: string }
  | { type: 'init'; pluginId: string; source: string; theme?: 'dark' | 'light' }
  | { type: 'call'; id: number; method: string; args: unknown[] }
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; message: string }
  | { type: 'event'; name: GeodeEventName; payload: unknown; sub: number }
  | { type: 'invoke'; commandId: string }
  | { type: 'panel'; id: string; op: 'resize'; width: number; height: number }
  | { type: 'render'; id: number; lang: string; source: string }
  | { type: 'rendered'; id: number; html?: string; error?: string }

/**
 * Entrada de un plugin externo a activar: su id + la fuente CommonJS cruda (aún
 * SIN evaluar; el eval ocurre ahora dentro del iframe sandbox, no en el host).
 * `loadExternalPlugins` devuelve estas entradas y `activateExternalViaBridge` las
 * pasa al iframe por el mensaje `init`.
 */
export interface PluginEntry {
  pluginId: string
  source: string
}

/**
 * ── API v2 async (SOLO para externos por el puente) ──────────────────────────
 *
 * `AsyncWorkspace`/`AsyncPluginContext` son el espejo ASÍNCRONO de la API v1
 * (`Workspace`/`PluginContext`). Un plugin externo activado por el puente recibe
 * esta forma: cada operación que antes era síncrona ahora cruza el `MessagePort`
 * y devuelve `Promise` (el editor imperativo es el cambio visible del contrato).
 *
 * Los built-ins NO usan esto: siguen con la `PluginContext` v1 síncrona in-host.
 * Estos tipos no alteran la v1; conviven aparte.
 */
export interface AsyncWorkspace {
  /** Nota activa (ruta + contenido) o null; ahora async porque cruza el puente. */
  activeNote(): Promise<{ path: string; content: string } | null>
  vault: {
    readNote(path: string): Promise<string>
    tree(): Promise<TreeNode[]>
    /** true si existe una nota/archivo en esa ruta. (v2) */
    exists(path: string): Promise<boolean>
    /** Crea una nota nueva; falla con "Ya existe" si la ruta está ocupada (nunca pisa). (v2) */
    createNote(path: string, content: string): Promise<void>
  }
  git: {
    graph(): Promise<GitGraph>
  }
  /** Abre una nota en el panel activo. (v2) */
  openNote(path: string): Promise<void>
  ui: {
    /** Selector rápido; resuelve con el `value` elegido o null. Los valores deben ser serializables. (v2) */
    pick<T>(items: PickItem<T>[], placeholder?: string): Promise<T | null>
  }
  editor: {
    /** Inserta texto en el cursor (o reemplaza la selección). Async (v2). */
    insertAtCursor(text: string): Promise<void>
    /** Texto seleccionado actualmente ('' si no hay). Async (v2). */
    getSelection(): Promise<string>
    /** Selecciona y hace scroll a un rango del documento activo. Async (v2). */
    revealRange(from: number, to: number): Promise<void>
  }
  events: {
    /** La suscripción se hace por debajo (fire-and-forget); el Disposable es síncrono. */
    on<E extends GeodeEventName>(event: E, handler: (payload: GeodeEvents[E]) => void): Disposable
  }
  /** Ejecuta un comando registrado por su id. Async (v2). */
  runCommand(id: string): Promise<void>
  /** Aviso breve (toast) al usuario. Async (v2). */
  notify(message: string): Promise<void>
}

/**
 * Contexto async que recibe un plugin EXTERNO en activate() cuando se activa por
 * el puente (API v2). `commands.register` manda solo la parte serializable del
 * comando; el `run()` local se dispara vía `invoke` del host.
 *
 * `panels`/`statusBar` cruzan la UI como DATOS serializables (Fase 12 / UI-01): el
 * panel monta su Component DENTRO del iframe y solo `{id,title,icon}` viaja al host;
 * el status-item cruza como `{id,text,tooltip,icon}`. `editorExtensions` sigue NO
 * soportado para externos: solo los built-ins first-party aportan extensiones de
 * editor (una Extension viva no serializa por el `MessagePort`); el proxy lanza un
 * Error en español.
 */
export interface AsyncPluginContext extends AsyncWorkspace {
  commands: { register(cmd: Command): Disposable }
  /** El panel monta su Component en el iframe; solo `{id,title,icon}` cruza el puente. */
  panels: { register(panel: ExternalPanelInput): Disposable; toggle(id: string): void }
  /** El status-item cruza como datos `{id,text,tooltip,icon}` y se puede actualizar. */
  statusBar: { addItem(item: ExternalStatusItem): ExternalStatusHandle }
  /** NO soportado para externos: solo los built-ins aportan extensiones; lanza Error. */
  editorExtensions: { add(ext: Extension): Disposable }
  /** Bloques de código propios: el render corre DENTRO del iframe; el HTML vuelve saneado. (v2) */
  markdown: MarkdownApi
}

/** Un plugin interno de Geode. */
export interface GeodePlugin {
  id: string
  name: string
  /** Descripción breve en español para la UI de Ajustes (grupo "Integrados"). */
  description?: string
  /** Se llama una vez al cargar. Puede devolver un Disposable de limpieza. */
  activate(ctx: PluginContext): void | Disposable
}
