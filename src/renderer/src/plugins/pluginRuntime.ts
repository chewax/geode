import type { GitGraph, TreeNode } from '@shared/ipc'
import type {
  AsyncPluginContext,
  BridgeMessage,
  Command,
  ExternalPanelInput
} from './types'

/**
 * Adaptador de UI que el BOOTSTRAP del iframe (iframe-runtime/index.ts) inyecta a
 * `buildAsyncContext`. Este módulo es AUTOCONTENIDO (solo importa TIPOS): no puede
 * importar react-dom. El montaje real del panel (createRoot) vive en el bootstrap,
 * que sí empaqueta react-dom; acá solo se declara el contrato y se lo llama.
 */
export interface IframePanelUi {
  /** Monta el Component del panel DENTRO del iframe (react-dom del bundle). */
  mount(def: ExternalPanelInput): void
  /** Desmonta el panel y libera su contenedor. */
  unmount(id: string): void
}

/**
 * ── Lado PLUGIN del puente async (Fase 12 / ISO-01) ──────────────────────────
 *
 * Este módulo es AUTOCONTENIDO a propósito: solo importa TIPOS (`import type`)
 * desde `./types` y `@shared/ipc`. NO importa `./host`, ni la API global del host,
 * ni ningún valor del renderer host. Es lo que se bundlea DENTRO del iframe del
 * plugin (origen opaco), donde no existe nada del host: el plugin solo habla con
 * el host a través del `MessagePort` que le llega transferido.
 *
 * `buildAsyncContext(port)` construye el `AsyncPluginContext` (API v2) que recibe
 * el plugin externo. Cada método delega en `call(...)`, que serializa un `call`
 * con id correlacionador y resuelve cuando llega su `result`/`error`. Un
 * `result`/`error` sin call pendiente (huérfano) se descarta sin colgar.
 *
 * Devuelve el `ctx` y un `dispose` que teardownea este endpoint: remueve el
 * listener del port, rechaza toda llamada en vuelo con un Error claro
 * ("puente cerrado") para que no cuelguen para siempre, limpia los mapas y
 * cierra el port.
 */
export function buildAsyncContext(
  port: MessagePort,
  ui?: IframePanelUi
): {
  ctx: AsyncPluginContext
  dispose: () => void
} {
  let nextId = 0
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  // Handlers de eventos registrados localmente, indexados por su `sub`.
  let nextSub = 0
  const handlers = new Map<number, (payload: unknown) => void>()
  // Comandos con su run()/isEnabled() reales, para dispararlos ante un `invoke`.
  const localCommands = new Map<string, Command>()

  const call = (method: string, ...args: unknown[]): Promise<unknown> => {
    const id = nextId++
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      port.postMessage({ type: 'call', id, method, args } satisfies BridgeMessage)
    })
  }

  const onMessage = (ev: MessageEvent): void => {
    const msg = ev.data as BridgeMessage | null
    if (!msg) return
    switch (msg.type) {
      case 'result': {
        const p = pending.get(msg.id)
        if (!p) return // huérfano: se descarta sin throw (T-11-03)
        pending.delete(msg.id)
        p.resolve(msg.result)
        return
      }
      case 'error': {
        const p = pending.get(msg.id)
        if (!p) return
        pending.delete(msg.id)
        p.reject(new Error(msg.message))
        return
      }
      case 'event':
        handlers.get(msg.sub)?.(msg.payload)
        return
      case 'invoke':
        void localCommands.get(msg.commandId)?.run()
        return
      default:
        return
    }
  }

  port.addEventListener('message', onMessage)
  port.start()

  // Teardown de este endpoint (WR-01): rechaza las llamadas en vuelo con un
  // Error claro para que sus promesas no cuelguen para siempre, suelta los
  // mapas y el listener, y cierra el port.
  const dispose = (): void => {
    port.removeEventListener('message', onMessage)
    pending.forEach((p) => p.reject(new Error('puente cerrado')))
    pending.clear()
    handlers.clear()
    localCommands.clear()
    port.close()
  }

  const ctx: AsyncPluginContext = {
    activeNote: () => call('activeNote') as Promise<{ path: string; content: string } | null>,
    vault: {
      readNote: (path) => call('vault.readNote', path) as Promise<string>,
      tree: () => call('vault.tree') as Promise<TreeNode[]>
    },
    git: {
      graph: () => call('git.graph') as Promise<GitGraph>
    },
    editor: {
      insertAtCursor: (text) => call('editor.insertAtCursor', text) as Promise<void>,
      getSelection: () => call('editor.getSelection') as Promise<string>,
      revealRange: (from, to) => call('editor.revealRange', from, to) as Promise<void>
    },
    events: {
      on: (event, handler) => {
        const sub = nextSub++
        handlers.set(sub, handler as (payload: unknown) => void)
        void call('events.on', event, sub)
        return {
          dispose: () => {
            handlers.delete(sub)
            void call('events.off', sub)
          }
        }
      }
    },
    runCommand: (id) => call('runCommand', id) as Promise<void>,
    notify: (message) => call('notify', message) as Promise<void>,
    commands: {
      register: (cmd) => {
        localCommands.set(cmd.id, cmd)
        // Solo cruza el subset serializable; run/isEnabled se quedan acá (T-11-06).
        void call('commands.register', {
          id: cmd.id,
          title: cmd.title,
          category: cmd.category,
          shortcut: cmd.shortcut
        })
        return {
          dispose: () => {
            localCommands.delete(cmd.id)
            void call('commands.dispose', cmd.id)
          }
        }
      }
    },
    panels: {
      register: (panel) => {
        // La UI del panel se renderiza DENTRO del iframe (react-dom del bundle del
        // runtime): el Component NO cruza el puente. Solo viaja lo serializable.
        ui?.mount(panel)
        void call('panels.register', { id: panel.id, title: panel.title, icon: panel.icon })
        return {
          dispose: () => {
            ui?.unmount(panel.id)
            void call('panels.dispose', panel.id)
          }
        }
      },
      toggle: (id) => {
        void call('panels.toggle', id)
      }
    },
    statusBar: {
      addItem: (item) => {
        // Solo cruza el modelo serializable {id,text,tooltip,icon}; el host lo dibuja.
        void call('statusBar.addItem', {
          id: item.id,
          text: item.text,
          tooltip: item.tooltip,
          icon: item.icon
        })
        return {
          update: (patch) => {
            void call('statusBar.update', item.id, patch)
          },
          dispose: () => {
            void call('statusBar.dispose', item.id)
          }
        }
      }
    },
    editorExtensions: {
      // NO soportado para plugins de terceros: una Extension viva de CodeMirror no
      // serializa por el MessagePort. Solo los built-ins first-party in-host aportan
      // extensiones de editor.
      add: (): never => {
        throw new Error(
          'editorExtensions.add: no soportado para plugins de terceros: las extensiones de editor solo las aportan los built-ins'
        )
      }
    }
  }

  return { ctx, dispose }
}
