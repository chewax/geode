import type { PluginHost } from './host'
import type {
  BridgeMessage,
  Disposable,
  ExternalPanelDef,
  ExternalStatusItem,
  GeodeEventName,
  PluginEntry
} from './types'
import { createPluginIframe } from './iframeHost'

/**
 * ── Puente async del PluginContext para plugins EXTERNOS (Fase 11 → Fase 12) ──
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
 * En Fase 11 ambos endpoints del canal vivían en el renderer (el plugin se
 * evaluaba in-window). En Fase 12 el lado plugin (buildAsyncContext + el eval)
 * MIGRA al iframe sandbox de origen opaco: el host solo conserva `attachHostBridge`
 * y le transfiere `port1` al iframe; la API async del plugin no cambia.
 */

/**
 * Lado HOST del puente: escucha el `MessagePort`, despacha cada `call` por una
 * allowlist explícita de métodos y responde `result`/`error`. Un método fuera de
 * la lista responde `error` (nunca ejecuta nada arbitrario). Devuelve un
 * Disposable que limpia el listener y todas las suscripciones/comandos vivos.
 */
export function attachHostBridge(
  host: PluginHost,
  port: MessagePort,
  getIframe: () => HTMLIFrameElement | null
): Disposable {
  // Suscripciones a eventos abiertas por el plugin, indexadas por su `sub`.
  const subs = new Map<number, Disposable>()
  // Comandos registrados por el plugin, indexados por commandId, para limpiarlos.
  const cmds = new Map<string, Disposable>()
  // Paneles y status-items externos registrados por el plugin, para limpiarlos.
  const panels = new Map<string, Disposable>()
  const statusItems = new Map<string, Disposable>()
  // Bloques de código registrados por el plugin (lang → registro en el host).
  const codeBlocks = new Map<string, Disposable>()
  // Renders pedidos al iframe que esperan su `rendered`, por id.
  let nextRenderId = 0
  const pendingRenders = new Map<number, { resolve: (html: string) => void; reject: (e: Error) => void }>()
  /** Tope de espera de un render del plugin: un plugin colgado no traba la vista previa. */
  const RENDER_TIMEOUT_MS = 10_000

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
      case 'vault.exists': {
        const target = String(args[0] ?? '').toLowerCase()
        const walk = (nodes: Awaited<ReturnType<typeof window.geode.vault.tree>>): boolean =>
          nodes.some((n) => n.path.toLowerCase() === target || (!!n.children && walk(n.children)))
        return walk(await window.geode.vault.tree())
      }
      case 'vault.createNote':
        await window.geode.vault.createNoteAt(String(args[0]), String(args[1] ?? ''))
        return undefined
      case 'openNote':
        await host.openNote(String(args[0]))
        return undefined
      case 'ui.pick':
        return host.pick(args[0] as { label: string; detail?: string; value: unknown }[], args[1] as string | undefined)
      case 'markdown.registerCodeBlock': {
        // El renderizador real vive en el iframe: el host registra un proxy que le
        // pide el render por el port y espera el `rendered` (con tope de tiempo).
        const lang = String(args[0] ?? '')
        codeBlocks.get(lang)?.dispose()
        const d = host.registerCodeBlock(lang, (source) => {
          const id = nextRenderId++
          return new Promise<string>((resolve, reject) => {
            const timer = window.setTimeout(() => {
              pendingRenders.delete(id)
              reject(new Error('el plugin tardó demasiado en dibujar el bloque'))
            }, RENDER_TIMEOUT_MS)
            pendingRenders.set(id, {
              resolve: (html) => {
                window.clearTimeout(timer)
                resolve(html)
              },
              reject: (e) => {
                window.clearTimeout(timer)
                reject(e)
              }
            })
            port.postMessage({ type: 'render', id, lang, source } satisfies BridgeMessage)
          })
        })
        codeBlocks.set(lang, d)
        return undefined
      }
      case 'markdown.disposeCodeBlock': {
        const lang = String(args[0] ?? '')
        codeBlocks.get(lang)?.dispose()
        codeBlocks.delete(lang)
        return undefined
      }
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
      case 'panels.register': {
        // Solo llega la parte serializable {id,title,icon}; el Component del panel
        // se quedó DENTRO del iframe. El host asocia el panel con SU iframe (el del
        // plugin que hizo la llamada) para superponerlo en el panel-body.
        const def = args[0] as ExternalPanelDef
        const iframe = getIframe()
        if (!iframe) return undefined // el iframe aún no existe (no debería pasar tras init)
        const d = host.registerExternalPanel(def, iframe)
        panels.set(def.id, d)
        return undefined
      }
      case 'panels.toggle': {
        host.togglePanel(args[0] as string)
        return undefined
      }
      case 'panels.dispose': {
        const id = args[0] as string
        panels.get(id)?.dispose()
        panels.delete(id)
        return undefined
      }
      case 'statusBar.addItem': {
        // El status-item cruza como datos serializables {id,text,tooltip,icon}; el
        // host lo dibuja (texto + ícono Lucide por nombre), nunca un Component.
        const item = args[0] as ExternalStatusItem
        const d = host.addExternalStatusItem(item)
        statusItems.set(item.id, d)
        return undefined
      }
      case 'statusBar.update': {
        const id = args[0] as string
        const patch = args[1] as Partial<Omit<ExternalStatusItem, 'id'>>
        host.updateExternalStatusItem(id, patch)
        return undefined
      }
      case 'statusBar.dispose': {
        const id = args[0] as string
        statusItems.get(id)?.dispose()
        statusItems.delete(id)
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
    if (!msg) return
    if (msg.type === 'rendered') {
      const p = pendingRenders.get(msg.id)
      if (!p) return
      pendingRenders.delete(msg.id)
      if (msg.error !== undefined) p.reject(new Error(msg.error))
      else p.resolve(String(msg.html ?? ''))
      return
    }
    if (msg.type !== 'call') return
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
      panels.forEach((d) => d.dispose())
      panels.clear()
      statusItems.forEach((d) => d.dispose())
      statusItems.clear()
      codeBlocks.forEach((d) => d.dispose())
      codeBlocks.clear()
      pendingRenders.forEach((p) => p.reject(new Error('puente cerrado')))
      pendingRenders.clear()
      port.close()
    }
  }
}

/**
 * Activa una lista de plugins EXTERNOS aislados en iframes sandbox. Por cada
 * entrada arma un `MessageChannel` real (port1 = lado plugin, port2 = lado host),
 * conecta el handler host-side sobre `port2` y crea un iframe de origen opaco que
 * evalúa la fuente del plugin y recibe `port1` transferido. El host YA NO evalúa
 * ni activa el plugin: eso ocurre dentro del iframe.
 *
 * @param runtimeSource texto del bundle IIFE del runtime del iframe (Task 2), que
 *   el host leyó con `?url`+`fetch` same-origin y se inyecta inline en el srcdoc.
 *
 * Un plugin que falla al crear su iframe no tumba a los demás. Devuelve un
 * Disposable que, por cada plugin, dispone PRIMERO el iframe (lado plugin: remueve
 * el `<iframe>` y cierra el port) y LUEGO el lado host (allowlist/subs/cmds),
 * respetando el orden de teardown de la Fase 11 (plugin-side → host-side).
 */
export function activateExternalViaBridge(
  host: PluginHost,
  entries: PluginEntry[],
  runtimeSource: string
): Disposable {
  const disposables: Disposable[] = []
  for (const entry of entries) {
    const ch = new MessageChannel()
    // El lado host necesita el iframe del plugin para asociar su panel externo.
    // Se le pasa un getter perezoso: el iframe se crea justo abajo y, para cuando
    // el plugin llame `panels.register` (tras el init/load), ya estará asignado.
    let frameEl: HTMLIFrameElement | null = null
    const hostSide = attachHostBridge(host, ch.port2, () => frameEl)
    try {
      const frame = createPluginIframe(
        entry.pluginId,
        entry.source,
        runtimeSource,
        ch.port1,
        // Si el iframe no arranca dentro del timeout, el lado plugin ya se dispuso
        // (removió el <iframe> y cerró su port). Acá cerramos el lado host para no
        // filtrar el listener/port del canal y avisamos al usuario con un toast,
        // sin tumbar a los demás plugins.
        () => {
          hostSide.dispose()
          host.notify(`El plugin "${entry.pluginId}" no arrancó`)
        }
      )
      frameEl = frame.iframe
      // Teardown en orden Fase 11: lado plugin (iframe: remueve el <iframe> y
      // cierra el port) ANTES que el lado host. Así, si hubiera llamadas RPC en
      // vuelo, el peer del plugin desaparece primero y el host limpia después.
      disposables.push({
        dispose: () => {
          frame.dispose()
          hostSide.dispose()
        }
      })
    } catch (e) {
      // Si la creación del iframe falla, cerramos el lado host ya creado y el
      // port sin transferir para no filtrar listeners/ports.
      hostSide.dispose()
      ch.port1.close()
      console.error(`[plugins] fallo al activar externo "${entry.pluginId}":`, e)
    }
  }
  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}
