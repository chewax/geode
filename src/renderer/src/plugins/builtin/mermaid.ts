import type { GeodePlugin } from '../types'
import { getTheme } from '../../theme'

/**
 * Plugin interno: diagramas Mermaid en la vista previa (```mermaid).
 *
 * Usa EXACTAMENTE la misma API pública que tiene un plugin de la comunidad
 * (`ctx.markdown.registerCodeBlock`), así sirve de ejemplo y de prueba de esa API.
 * La librería (pesada) se carga recién la primera vez que aparece un diagrama,
 * en su propio chunk: no le cuesta nada al arranque de la app.
 *
 * Seguridad: `securityLevel: 'strict'` (sin HTML ni clicks dentro del diagrama)
 * y etiquetas en SVG puro (`htmlLabels: false`); además Geode sanea el SVG
 * resultante antes de mostrarlo, como con cualquier plugin.
 */
type MermaidApi = typeof import('mermaid')['default']

let loading: Promise<MermaidApi> | null = null
let initializedTheme: string | null = null
let counter = 0

async function mermaid(): Promise<MermaidApi> {
  loading ??= import('mermaid').then((m) => m.default)
  const api = await loading
  const theme = getTheme() === 'light' ? 'default' : 'dark'
  if (initializedTheme !== theme) {
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    })
    initializedTheme = theme
  }
  return api
}

export const mermaidPlugin: GeodePlugin = {
  id: 'mermaid',
  name: 'Diagramas Mermaid',
  description: 'Dibuja bloques ```mermaid (flujos, secuencias, Gantt…) en la vista previa',
  activate(ctx) {
    ctx.markdown.registerCodeBlock('mermaid', async (source) => {
      const api = await mermaid()
      try {
        const { svg } = await api.render(`geode-mermaid-${++counter}`, source)
        return svg
      } catch (e) {
        // Mermaid deja nodos de error sueltos en el body al fallar: se limpian.
        document.querySelectorAll(`[id^="dgeode-mermaid-"]`).forEach((n) => n.remove())
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`el diagrama tiene un error de sintaxis (${msg.split('\n')[0]})`)
      }
    })
  }
}
