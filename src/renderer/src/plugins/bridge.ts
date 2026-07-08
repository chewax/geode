import type { GitGraph, TreeNode } from '@shared/ipc'
import type { PluginHost } from './host'
import type {
  AsyncPluginContext,
  BridgeMessage,
  Command,
  Disposable,
  GeodeEventName,
  GeodePlugin,
  PluginContext
} from './types'

/**
 * ── Puente async del PluginContext para plugins EXTERNOS (Fase 11 / BRIDGE-01) ──
 *
 * Un plugin externo ya no recibe la `PluginContext` v1 síncrona in-host: recibe
 * un proxy async (API v2) construido sobre un `MessageChannel` real. Cada llamada
 * del plugin viaja como mensaje RPC (`call`) por el `MessagePort`; el lado host
 * la traduce a la llamada real del `PluginHost`/`window.geode` y responde
 * (`result`/`error`). Los eventos y las invocaciones de comando van host → plugin
 * (`event`/`invoke`). Ver `BridgeMessage` en types.ts.
 *
 * Los built-ins NO pasan por acá: se activan con `buildPluginContext`/
 * `activatePlugins` sobre la API v1 síncrona, sin cambios.
 *
 * En Fase 11 ambos endpoints del canal viven en el renderer (unsafe-eval sigue,
 * el plugin se evalúa in-window). La Fase 12 solo moverá un endpoint al iframe
 * sandbox sin cambiar la API async del plugin.
 */

/**
 * Lado HOST del puente: escucha el `MessagePort`, despacha cada `call` por una
 * allowlist explícita de métodos y responde `result`/`error`. Un método fuera de
 * la lista responde `error` (nunca ejecuta nada arbitrario). Devuelve un
 * Disposable que limpia el listener y todas las suscripciones/comandos vivos.
 */
export function attachHostBridge(host: PluginHost, port: MessagePort): Disposable {
  // Suscripciones a eventos abiertas por el plugin, indexadas por su `sub`.
  const subs = new Map<number, Disposable>()
  // Comandos registrados por el plugin, indexados por commandId, para limpiarlos.
  const cmds = new Map<string, Disposable>()

  // Resuelve el método (string con puntos) contra la implementación real. Solo
  // los métodos de esta allowlist se ejecutan; cualquier otro lanza y se
  // convierte en un `error` de respuesta.
  const route = async (method: string, args: unknown[]): Promise<unknown> => {
    switch (method) {
      case 'activeNote':
        return host.activeNote()
      case 'vault.readNote':
        return window.geode.vault.readNote(args[0] as string)
      case 'vault.tree':
        return window.geode.vault.tree()
      case 'git.graph':
        return window.geode.git.graph()
      case 'editor.insertAtCursor':
        host.editorInsertAtCursor(args[0] as string)
        return undefined
      case 'editor.getSelection':
        return host.editorGetSelection()
      case 'editor.revealRange':
        host.editorRevealRange(args[0] as number, args[1] as number)
        return undefined
      case 'runCommand':
        host.runCommand(args[0] as string)
        return undefined
      case 'notify':
        host.notify(args[0] as string)
        return undefined
      case 'events.on': {
        const eventName = args[0] as GeodeEventName
        const sub = args[1] as number
        const d = host.on(eventName, (payload) => {
          port.postMessage({ type: 'event', name: eventName, payload, sub } satisfies BridgeMessage)
        })
        subs.set(sub, d)
        return undefined
      }
      case 'events.off': {
        const sub = args[0] as number
        subs.get(sub)?.dispose()
        subs.delete(sub)
        return undefined
      }
      case 'commands.register': {
        // Solo llega el subset serializable {id,title,category,shortcut}; el
        // run()/isEnabled() del plugin se quedaron del otro lado. El host
        // registra un run() que pide invocar el comando de vuelta (`invoke`).
        const cmd = args[0] as { id: string; title: string; category?: string; shortcut?: string }
        const d = host.registerCommand({
          ...cmd,
          run: () => port.postMessage({ type: 'invoke', commandId: cmd.id } satisfies BridgeMessage)
        })
        cmds.set(cmd.id, d)
        return undefined
      }
      case 'commands.dispose': {
        const commandId = args[0] as string
        cmds.get(commandId)?.dispose()
        cmds.delete(commandId)
        return undefined
      }
      default:
        throw new Error(`método no soportado por el puente: "${method}"`)
    }
  }

  const handleCall = async (id: number, method: string, args: unknown[]): Promise<void> => {
    try {
      const result = await route(method, args)
      port.postMessage({ type: 'result', id, result } satisfies BridgeMessage)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      port.postMessage({ type: 'error', id, message } satisfies BridgeMessage)
    }
  }

  const onMessage = (ev: MessageEvent): void => {
    const msg = ev.data as BridgeMessage | null
    if (!msg || msg.type !== 'call') return
    void handleCall(msg.id, msg.method, msg.args)
  }

  port.addEventListener('message', onMessage)
  port.start()

  return {
    dispose: () => {
      port.removeEventListener('message', onMessage)
      subs.forEach((d) => d.dispose())
      subs.clear()
      cmds.forEach((d) => d.dispose())
      cmds.clear()
      port.close()
    }
  }
}

/**
 * Lado PLUGIN del puente: construye el `AsyncPluginContext` (API v2) que recibe
 * el plugin externo. Cada método delega en `call(...)`, que serializa un `call`
 * con id correlacionador y resuelve cuando llega su `result`/`error`. Un
 * `result`/`error` sin call pendiente (huérfano) se descarta sin colgar.
 *
 * Devuelve el `ctx` y un `dispose` que teardownea este endpoint: remueve el
 * listener del port, rechaza toda llamada en vuelo con un Error claro
 * ("puente cerrado") para que no cuelguen para siempre, limpia los mapas y
 * cierra el port. `activateExternalViaBridge` lo dispara ANTES de cerrar el
 * lado host, para que las llamadas pendientes rechacen limpio en vez de
 * quedar huérfanas contra un peer ya cerrado.
 */
export function buildAsyncContext(port: MessagePort): {
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

  // Las superficies de UI llevan Componentes/Extensions no serializables por el
  // MessagePort; se difieren a Fase 12 (UI-01). Acá el proxy lanza en español.
  const deferred = (feature: string): never => {
    throw new Error(`${feature}: no soportado en Fase 11 (llega en Fase 12 UI-01)`)
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
      register: () => deferred('panels.register'),
      toggle: () => deferred('panels.toggle')
    },
    statusBar: { addItem: () => deferred('statusBar.addItem') },
    editorExtensions: { add: () => deferred('editorExtensions.add') }
  }

  return { ctx, dispose }
}

/**
 * Activa una lista de plugins EXTERNOS por el puente. Por cada plugin arma un
 * `MessageChannel` real (port1 = lado plugin, port2 = lado host), conecta el
 * handler host-side y le pasa al plugin el `AsyncPluginContext` async. Un plugin
 * que falla al activar no tumba a los demás. Devuelve un Disposable que libera
 * todos los puentes y limpiezas.
 */
export function activateExternalViaBridge(host: PluginHost, plugins: GeodePlugin[]): Disposable {
  const disposables: Disposable[] = []
  for (const plugin of plugins) {
    const ch = new MessageChannel()
    const hostSide = attachHostBridge(host, ch.port2)
    const { ctx, dispose: pluginSide } = buildAsyncContext(ch.port1)
    try {
      // El plugin espera la forma v1; el proxy async es estructuralmente
      // compatible salvo el retorno Promise del editor (contrato v2).
      const cleanup = plugin.activate(ctx as unknown as PluginContext)
      // Orden de teardown: limpieza del plugin → lado plugin del puente → lado
      // host. El lado plugin cierra ANTES que el host para que las llamadas RPC
      // en vuelo rechacen limpio ("puente cerrado") en vez de colgarse contra
      // un peer ya cerrado (WR-01).
      if (cleanup) disposables.push(cleanup)
      disposables.push({ dispose: pluginSide }, hostSide)
    } catch (e) {
      // Si activate falla, cerramos ambos lados del puente ya creado para no
      // filtrar listeners/ports.
      pluginSide()
      hostSide.dispose()
      console.error(`[plugins] fallo al activar externo "${plugin.id}":`, e)
    }
  }
  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}
