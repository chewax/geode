import { createContext, useContext, useSyncExternalStore } from 'react'
import type { JSX, ReactNode } from 'react'
import type { PluginHost } from './host'
import type { TreeNode } from '@shared/ipc'
import type { Disposable, PluginContext, Workspace } from './types'

/** true si `path` existe en el árbol (nota, imagen o carpeta). Sin distinguir mayúsculas. */
function pathInTree(nodes: TreeNode[], path: string): boolean {
  const target = path.toLowerCase()
  for (const n of nodes) {
    if (n.path.toLowerCase() === target) return true
    if (n.children && pathInTree(n.children, path)) return true
  }
  return false
}

const HostContext = createContext<PluginHost | null>(null)

export function GeodeProvider({
  host,
  children
}: {
  host: PluginHost
  children: ReactNode
}): JSX.Element {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>
}

function useHost(): PluginHost {
  const host = useContext(HostContext)
  if (!host) throw new Error('useGeode() fuera de <GeodeProvider>')
  return host
}

/**
 * Suscribe un componente a los cambios de REGISTRO del host (comandos, paneles,
 * ítems de status, paneles abiertos). Devuelve la versión; usalo para re-leer las
 * listas del host tras el render.
 */
export function usePluginRegistry(): number {
  const host = useHost()
  return useSyncExternalStore(host.subscribe, host.getVersion)
}

/** El host de plugins (para la vista previa: renderizadores de bloques de código). */
export function usePluginHost(): PluginHost | null {
  return useContext(HostContext)
}

/** API de workspace para componentes de plugins (leer nota activa, editor, eventos…). */
export function useGeode(): Workspace {
  const host = useHost()
  return workspaceFor(host)
}

/** Construye la vista de solo lectura del workspace sobre el host. */
function workspaceFor(host: PluginHost): Workspace {
  return {
    activeNote: () => host.activeNote(),
    vault: {
      readNote: (path) => window.geode.vault.readNote(path),
      tree: () => window.geode.vault.tree(),
      exists: async (path) => pathInTree(await window.geode.vault.tree(), path),
      createNote: async (path, content) => {
        await window.geode.vault.createNoteAt(path, content)
      }
    },
    openNote: (path) => host.openNote(path),
    ui: {
      pick: (items, placeholder) => host.pick(items, placeholder)
    },
    git: {
      graph: () => window.geode.git.graph()
    },
    editor: {
      insertAtCursor: (text) => host.editorInsertAtCursor(text),
      getSelection: () => host.editorGetSelection(),
      revealRange: (from, to) => host.editorRevealRange(from, to)
    },
    events: {
      on: (event, handler) => host.on(event, handler)
    },
    runCommand: (id) => host.runCommand(id),
    notify: (msg) => host.notify(msg)
  }
}

/**
 * Construye el PluginContext que recibe un plugin en activate(): las funciones de
 * registro devuelven Disposable y se combinan con la API de workspace. Cada
 * registro se agrupa en un Disposable para poder limpiar el plugin entero.
 */
export function buildPluginContext(host: PluginHost, disposables: Disposable[]): PluginContext {
  const track = (d: Disposable): Disposable => {
    disposables.push(d)
    return d
  }
  return {
    ...workspaceFor(host),
    commands: { register: (cmd) => track(host.registerCommand(cmd)) },
    panels: {
      register: (panel) => track(host.registerPanel(panel)),
      toggle: (id) => host.togglePanel(id)
    },
    statusBar: { addItem: (item) => track(host.addStatusItem(item)) },
    editorExtensions: { add: (ext) => track(host.addExtension(cryptoId(), ext)) },
    markdown: { registerCodeBlock: (lang, render) => track(host.registerCodeBlock(lang, render)) }
  }
}

let extCounter = 0
function cryptoId(): string {
  extCounter += 1
  return `ext-${extCounter}`
}
