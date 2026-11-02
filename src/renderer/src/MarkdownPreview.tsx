import { useMemo } from 'react'
import type { JSX, MouseEvent } from 'react'
import { Marked, type TokenizerAndRendererExtension } from 'marked'
import DOMPurify from 'dompurify'
import { resolveLink } from '@shared/links'
import { isImagePath, resolveRelativeSrc, vaultFileUrl } from '@shared/attachments'

/** Escapa texto para meterlo en HTML/atributos. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Extensión de marked para `[[Nota|alias]]` y `![[imagen.png]]`. Va como token
 * propio (no regex sobre el texto crudo) para respetar el código en línea y los
 * bloques de código, que marked tokeniza antes.
 */
const wikilink: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start(src: string) {
    const i = src.indexOf('[[')
    if (i < 0) return undefined
    return i > 0 && src[i - 1] === '!' ? i - 1 : i
  },
  tokenizer(src: string) {
    const m = /^(!?)\[\[([^[\]\n|#]*)(#[^[\]\n|]*)?(\|[^[\]\n]*)?\]\]/.exec(src)
    if (!m) return undefined
    return {
      type: 'wikilink',
      raw: m[0],
      embed: m[1] === '!',
      target: m[2].trim(),
      heading: m[3] ? m[3].slice(1).trim() : '',
      alias: m[4] ? m[4].slice(1) : ''
    }
  },
  renderer(token) {
    const target = String(token.target ?? '')
    const alias = String(token.alias ?? '')
    const heading = String(token.heading ?? '')
    if (token.embed && isImagePath(target)) {
      return `<img data-wikiembed="${esc(target)}" alt="${esc(alias || target)}">`
    }
    const label = alias || (heading ? `${target || ''} › ${heading}` : target)
    return `<a href="#" class="wikilink" data-wikilink="${esc(target)}">${esc(label)}</a>`
  }
}

const md = new Marked({ gfm: true, breaks: true })
md.use({ extensions: [wikilink] })

export interface MarkdownPreviewProps {
  source: string
  /** Ruta de la nota (para resolver imágenes y enlaces relativos). */
  notePath?: string | null
  /** Archivos de la bóveda, para resolver `[[...]]`. */
  files?: string[]
  /** Versión en preview (viaje en el tiempo): las imágenes se leen de ahí. */
  previewOid?: string | null
  /** Click en un enlace interno: recibe el destino tal como fue escrito. */
  onOpenLink?: (target: string) => void
}

/**
 * Vista previa del Markdown de la nota. Renderiza a HTML con `marked` y lo
 * sanea con DOMPurify antes de inyectarlo (defensa aunque el vault sea propio).
 * DESPUÉS de sanear se reescriben las imágenes al protocolo de la bóveda y se
 * marcan los enlaces rotos: así nunca se confía en un src del documento.
 */
export function MarkdownPreview({ source, notePath, files, previewOid, onOpenLink }: MarkdownPreviewProps): JSX.Element {
  const html = useMemo(() => {
    const raw = md.parse(source, { async: false }) as string
    const clean = DOMPurify.sanitize(raw)
    const tpl = document.createElement('template')
    tpl.innerHTML = clean
    const all = files ?? []
    const from = notePath ?? null

    tpl.content.querySelectorAll('img').forEach((img) => {
      const embed = img.getAttribute('data-wikiembed')
      let rel: string | null = null
      if (embed !== null) rel = resolveLink(embed, all, from)
      else {
        const src = img.getAttribute('src') ?? ''
        rel = from ? resolveRelativeSrc(from, src) : null
        // Externas (http/data): se dejan; la CSP decide qué carga.
        if (!rel) return
      }
      if (rel) img.setAttribute('src', vaultFileUrl(rel, previewOid))
      else {
        img.removeAttribute('src')
        img.classList.add('missing')
      }
    })

    tpl.content.querySelectorAll('a[data-wikilink]').forEach((a) => {
      const target = a.getAttribute('data-wikilink') ?? ''
      if (!resolveLink(target, all, from)) {
        a.classList.add('missing')
        a.setAttribute('title', `«${target}» todavía no existe — click para crearla`)
      }
    })
    return tpl.innerHTML
  }, [source, notePath, files, previewOid])

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault() // nunca navegar la ventana de la app
    const wl = a.getAttribute('data-wikilink')
    if (wl !== null) {
      onOpenLink?.(wl)
      return
    }
    const href = a.getAttribute('href') ?? ''
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
      // El main intercepta window.open y lo abre en el navegador del sistema.
      window.open(href, '_blank')
      return
    }
    // Enlace Markdown estándar a otra nota: `[texto](Otra%20nota.md)`.
    if (notePath && href && !href.startsWith('#')) {
      const rel = resolveRelativeSrc(notePath, href)
      if (rel) onOpenLink?.(rel)
    }
  }

  return <div className="md-preview" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
