import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as CMState from '@codemirror/state'
import * as CMView from '@codemirror/view'
import { buildAsyncContext } from '../src/plugins/pluginRuntime'
import type { BridgeMessage, GeodePlugin, PluginContext } from '../src/plugins/types'

/**
 * ── Bootstrap del runtime del iframe (Fase 12 / ISO-01) ──────────────────────
 *
 * Este módulo es la ENTRADA del bundle IIFE AUTOCONTENIDO que el host inyecta
 * inline en el `srcdoc` de un iframe sandbox de ORIGEN OPACO (`sandbox=
 * "allow-scripts"`, sin same-origin). Corre DENTRO del iframe, donde no existe
 * nada del host: ni la API global de Geode, ni Node, ni el DOM del host. El
 * plugin de terceros se evalúa ACÁ (no in-window) y solo se comunica con el host
 * por el `MessagePort` que llega transferido en el mensaje `init`.
 *
 * Responsabilidades:
 *  1. Esperar exactamente un mensaje `{ type: 'init', pluginId, source }` por
 *     `window.postMessage` y tomar `event.ports[0]` como el port del puente.
 *  2. Ofrecer un `require` shim con los módulos que este bundle empaqueta
 *     estáticamente (react/react-dom/react-jsx-runtime/@codemirror/state|view).
 *  3. Evaluar la fuente CommonJS del plugin con `new Function(...)` (el eval del
 *     código no confiable vive ahora aislado dentro del iframe).
 *  4. Construir el `AsyncPluginContext` con `buildAsyncContext(port)` y activar
 *     el plugin, sin que un fallo del plugin rompa el bootstrap.
 */

/** Módulos que el runtime del iframe le presta al plugin vía require(). */
const SHARED_MODULES: Record<string, unknown> = {
  react: React,
  'react-dom': ReactDOM,
  'react/jsx-runtime': ReactJsxRuntime,
  '@codemirror/state': CMState,
  '@codemirror/view': CMView
}

/** Crea el `require` acotado del plugin: solo resuelve la allowlist de módulos. */
function makeRequire(pluginId: string): (name: string) => unknown {
  return (name: string) => {
    const mod = SHARED_MODULES[name]
    if (!mod) throw new Error(`plugin "${pluginId}": módulo no disponible: "${name}"`)
    return mod
  }
}

/**
 * Evalúa la fuente CommonJS del plugin DENTRO del iframe y devuelve su export.
 * El `new Function(...)` intencional es el único eval de código de terceros de la
 * app, y ahora vive aislado en el origen opaco del iframe (Fase 12).
 */
function evalPlugin(source: string, pluginId: string): unknown {
  const module = { exports: {} as Record<string, unknown> }
  // eslint-disable-next-line no-new-func -- eval intencional del plugin, aislado en el iframe
  const fn = new Function('module', 'exports', 'require', source)
  fn(module, module.exports, makeRequire(pluginId))
  const exported = module.exports
  return (exported.default as unknown) ?? exported
}

/** Verifica que el módulo evaluado exporte la forma mínima de un plugin. */
function isPlugin(x: unknown): x is GeodePlugin {
  const p = x as GeodePlugin | null
  return !!p && typeof p.id === 'string' && typeof p.activate === 'function'
}

/**
 * Arranca el plugin: evalúa su fuente, valida el export, construye el contexto
 * async sobre el port y llama `activate(ctx)`. Un fallo se loguea y se reporta al
 * host por el port (mensaje `error`) sin colgar el iframe.
 */
function bootstrap(pluginId: string, source: string, port: MessagePort): void {
  let plugin: unknown
  try {
    plugin = evalPlugin(source, pluginId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`[iframe-runtime] fallo al evaluar "${pluginId}":`, e)
    port.postMessage({ type: 'error', id: -1, message } satisfies BridgeMessage)
    return
  }
  if (!isPlugin(plugin)) {
    const message = `el módulo no exporta un plugin válido (falta id/activate)`
    console.error(`[iframe-runtime] "${pluginId}": ${message}`)
    port.postMessage({ type: 'error', id: -1, message } satisfies BridgeMessage)
    return
  }
  // El puente async (lado plugin) queda establecido sobre el port transferido.
  const { ctx } = buildAsyncContext(port)
  try {
    // El plugin espera la forma v1; el proxy async es estructuralmente compatible
    // salvo el retorno Promise del editor (contrato v2). El eval y la activación
    // ocurren íntegramente dentro del iframe.
    plugin.activate(ctx as unknown as PluginContext)
  } catch (e) {
    // Un fallo del plugin NO rompe el bootstrap: queda logueado dentro del iframe.
    console.error(`[iframe-runtime] fallo al activar "${pluginId}":`, e)
  }
}

// Único mensaje que arranca el runtime: `init`, que además transfiere el port1
// del canal. Cualquier otra forma se ignora. Se procesa una sola vez.
let started = false
window.addEventListener('message', (event: MessageEvent): void => {
  if (started) return
  const msg = event.data as BridgeMessage | null
  if (!msg || msg.type !== 'init') return
  const port = event.ports[0]
  if (!port) return
  started = true
  bootstrap(msg.pluginId, msg.source, port)
})
