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
 * ── Contrato API v1 congelado ───────────────────────────────────────────────
 *
 * `Workspace` y `PluginContext` (abajo) constituyen el contrato público **API v1**
 * de los plugins. Está CONGELADO: cualquier cambio de forma (agregar/quitar/
 * renombrar métodos o cambiar firmas) obliga a un bump a v2 con una capa de
 * compatibilidad — nunca se rompe en silencio un plugin escrito contra v1.
 *
 * El `editor.*` síncrono de abajo es parte de v1 y se mantiene tal cual. La
 * variante async (v2) se agrega aparte, sin tocar estas firmas.
 *
 * API de solo lectura del workspace, disponible para los componentes de plugins
 * en runtime (vía useGeode()) y también incluida en el PluginContext de activate.
 */
export interface Workspace {
  /** Nota activa (ruta + contenido) o null si no hay ninguna abierta. */
  activeNote(): { path: string; content: string } | null
  vault: {
    readNote(path: string): Promise<string>
    tree(): Promise<TreeNode[]>
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

/**
 * Contexto que recibe cada plugin en activate(): registrar + leer el workspace.
 * Forma parte del contrato **API v1 congelado** (ver Workspace arriba): cambiar
 * su forma exige un bump a v2 con capa de compatibilidad.
 */
export interface PluginContext extends Workspace {
  commands: { register(cmd: Command): Disposable }
  panels: { register(panel: PanelDef): Disposable; toggle(id: string): void }
  statusBar: { addItem(item: StatusItemDef): Disposable }
  editorExtensions: { add(ext: Extension): Disposable }
}

/**
 * ── Envelope RPC del puente (Fase 11 / BRIDGE-01) ────────────────────────────
 *
 * Protocolo de mensajes que viajan por el `MessagePort` entre el proxy async del
 * plugin externo (lado plugin) y el handler host-side (lado host). Dirección:
 *  - `call` / `result` / `error`: petición-respuesta plugin ↔ host (con `id`
 *    correlacionador). El plugin manda `call`; el host contesta `result` o `error`.
 *  - `event`: host → plugin. El host empuja el payload de un evento suscrito
 *    (identificado por `sub`, el número de suscripción que fijó el plugin).
 *  - `invoke`: host → plugin. El host pide correr el `run()` local de un comando
 *    registrado por el plugin (identificado por `commandId`).
 */
export type BridgeMessage =
  | { type: 'call'; id: number; method: string; args: unknown[] }
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; message: string }
  | { type: 'event'; name: GeodeEventName; payload: unknown; sub: number }
  | { type: 'invoke'; commandId: string }

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
  }
  git: {
    graph(): Promise<GitGraph>
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
 * `panels`/`statusBar`/`editorExtensions` están DIFERIDOS a la Fase 12 (UI-01):
 * cargan Componentes/Extensions no serializables por el `MessagePort`. Se tipan
 * con la misma forma que `PluginContext` para asignabilidad estructural, pero el
 * proxy los implementa lanzando un Error en español ("no soportado en Fase 11").
 */
export interface AsyncPluginContext extends AsyncWorkspace {
  commands: { register(cmd: Command): Disposable }
  /** No soportado en Fase 11 (Fase 12 UI-01): el proxy lanza Error al usarlo. */
  panels: { register(panel: PanelDef): Disposable; toggle(id: string): void }
  /** No soportado en Fase 11 (Fase 12 UI-01): el proxy lanza Error al usarlo. */
  statusBar: { addItem(item: StatusItemDef): Disposable }
  /** No soportado en Fase 11 (Fase 12 UI-01): el proxy lanza Error al usarlo. */
  editorExtensions: { add(ext: Extension): Disposable }
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
