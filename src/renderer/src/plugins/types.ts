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

/** Un plugin interno de Geode. */
export interface GeodePlugin {
  id: string
  name: string
  /** Descripción breve en español para la UI de Ajustes (grupo "Integrados"). */
  description?: string
  /** Se llama una vez al cargar. Puede devolver un Disposable de limpieza. */
  activate(ctx: PluginContext): void | Disposable
}
