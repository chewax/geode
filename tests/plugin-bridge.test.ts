import { describe, expect, it } from 'vitest'
import { buildAsyncContext } from '../src/renderer/src/plugins/pluginRuntime'
import type { BridgeMessage } from '../src/renderer/src/plugins/types'

/** Espera el próximo mensaje del port que cumpla `pred`. */
function next(port: MessagePort, pred: (m: BridgeMessage) => boolean): Promise<BridgeMessage> {
  return new Promise((resolve) => {
    const on = (ev: MessageEvent): void => {
      if (pred(ev.data)) {
        port.removeEventListener('message', on)
        resolve(ev.data)
      }
    }
    port.addEventListener('message', on)
    port.start()
  })
}

describe('puente de plugins (lado plugin, dentro del iframe)', () => {
  it('un bloque de código registrado se dibuja a pedido del host', async () => {
    const ch = new MessageChannel()
    const { ctx, dispose } = buildAsyncContext(ch.port1)
    const registered = next(ch.port2, (m) => m.type === 'call' && m.method === 'markdown.registerCodeBlock')
    ctx.markdown.registerCodeBlock('Progreso', (src) => `<svg data-src="${src}"></svg>`)
    const call = await registered
    expect(call.type === 'call' && call.args).toEqual(['progreso']) // en minúsculas

    const answer = next(ch.port2, (m) => m.type === 'rendered')
    ch.port2.postMessage({ type: 'render', id: 7, lang: 'progreso', source: '3/10' } satisfies BridgeMessage)
    expect(await answer).toEqual({ type: 'rendered', id: 7, html: '<svg data-src="3/10"></svg>' })

    // Un renderizador que falla devuelve el error (el host lo muestra en la nota).
    ctx.markdown.registerCodeBlock('roto', () => {
      throw new Error('sintaxis inválida')
    })
    const failed = next(ch.port2, (m) => m.type === 'rendered')
    ch.port2.postMessage({ type: 'render', id: 8, lang: 'roto', source: 'x' } satisfies BridgeMessage)
    expect(await failed).toEqual({ type: 'rendered', id: 8, error: 'sintaxis inválida' })
    dispose()
    ch.port2.close()
  })

  it('las llamadas async (v2) viajan como RPC y resuelven con la respuesta del host', async () => {
    const ch = new MessageChannel()
    const { ctx, dispose } = buildAsyncContext(ch.port1)
    ch.port2.addEventListener('message', (ev) => {
      const m = ev.data as BridgeMessage
      if (m.type === 'call' && m.method === 'vault.exists') {
        ch.port2.postMessage({ type: 'result', id: m.id, result: m.args[0] === 'Diario/hoy.md' } satisfies BridgeMessage)
      }
    })
    ch.port2.start()
    expect(await ctx.vault.exists('Diario/hoy.md')).toBe(true)
    expect(await ctx.vault.exists('otra.md')).toBe(false)
    dispose()
    ch.port2.close()
  })
})
