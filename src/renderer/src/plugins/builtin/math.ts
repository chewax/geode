import type { GeodePlugin } from '../types'
import { t } from '@shared/i18n'

/**
 * Plugin interno: fórmulas matemáticas con KaTeX en la vista previa.
 *
 * Igual que Mermaid, usa la API pública de bloques (`ctx.markdown.registerCodeBlock`)
 * con dos lenguajes que la vista previa reserva para fórmulas:
 *   - `math`: bloques `$$…$$` y ```math (fórmula centrada, en su propia línea).
 *   - `math-inline`: `$…$` dentro del texto.
 * Un plugin de la comunidad podría reemplazarlo (por ejemplo con MathJax)
 * registrando esos mismos lenguajes. Si se desactiva, las fórmulas se ven como
 * texto, sin perder nada.
 *
 * KaTeX (con su CSS y fuentes) se carga recién la primera vez que aparece una
 * fórmula. Salida sólo HTML (`output: 'html'`), sin `\href` ni comandos de
 * confianza (`trust: false`); Geode sanea el resultado como con cualquier plugin.
 */
type Katex = typeof import('katex')['default']

let loading: Promise<Katex> | null = null

function katex(): Promise<Katex> {
  loading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default)
  return loading
}

async function render(source: string, displayMode: boolean): Promise<string> {
  const api = await katex()
  try {
    return api.renderToString(source, { displayMode, output: 'html', throwOnError: true, trust: false, strict: 'ignore' })
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^KaTeX parse error:\s*/, '') : String(e)
    throw new Error(t('la fórmula tiene un error ({msg})', { msg }))
  }
}

export const mathPlugin: GeodePlugin = {
  id: 'math',
  get name() {
    return t('Fórmulas matemáticas')
  },
  get description() {
    return t('Dibuja fórmulas LaTeX ($…$ y $$…$$) con KaTeX en la vista previa')
  },
  activate(ctx) {
    const block = ctx.markdown.registerCodeBlock('math', (s) => render(s, true))
    const inline = ctx.markdown.registerCodeBlock('math-inline', (s) => render(s, false))
    return {
      dispose: () => {
        block.dispose()
        inline.dispose()
      }
    }
  }
}
