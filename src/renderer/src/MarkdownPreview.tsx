import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX, MouseEvent } from 'react'
import { Marked, type TokenizerAndRendererExtension } from 'marked'
import DOMPurify from 'dompurify'
import { displayName, isNotePath, resolveLink } from '@shared/links'
import { extOf, isImagePath, resolveRelativeSrc, vaultFileUrl } from '@shared/attachments'
import { isColorLike, readProperties, splitFrontmatter, stripComments, type Property } from '@shared/obsidian'
import { usePluginHost } from './plugins'
import type { PluginHost } from './plugins'
import { useTheme } from './theme'

/** Escapa texto para meterlo en HTML/atributos. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Extensión de marked para `[[Nota|alias]]` y `![[archivo]]`. Va como token
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
    if (token.embed) {
      // Las incrustaciones se resuelven después de sanear (ver MarkdownPreview).
      return `<span class="embed" data-embed="${esc(target)}" data-heading="${esc(heading)}" data-alias="${esc(alias)}"></span>`
    }
    const label = alias || (heading ? `${target || ''} › ${heading}` : target)
    return `<a href="#" class="wikilink" data-wikilink="${esc(target)}">${esc(label)}</a>`
  }
}

/** `==resaltado==` → <mark>. */
const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start: (src: string) => {
    const i = src.indexOf('==')
    return i < 0 ? undefined : i
  },
  tokenizer(src: string) {
    const m = /^==(?=\S)([^=\n]*?\S)==/.exec(src)
    if (!m) return undefined
    return { type: 'highlight', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) }
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`
  }
}

/** `#tag` → enlace de etiqueta (click = buscar notas con esa etiqueta). */
const tag: TokenizerAndRendererExtension = {
  name: 'tag',
  level: 'inline',
  start(src: string) {
    const m = /(^|[\s(])#[\p{L}\p{N}_\-/]*[\p{L}_\-/]/u.exec(src)
    return m ? m.index + m[1].length : undefined
  },
  tokenizer(src: string) {
    const m = /^#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/u.exec(src)
    // Colores (#1e1e1e, #ff0000) no son etiquetas: quedan como texto.
    if (!m || isColorLike(m[1])) return undefined
    return { type: 'tag', raw: m[0], tag: m[1].replace(/\/+$/, '') }
  },
  renderer(token) {
    return `<a href="#" class="tag" data-tag="${esc(String(token.tag))}">#${esc(String(token.tag))}</a>`
  }
}

const md = new Marked({ gfm: true, breaks: true })
md.use({ extensions: [wikilink, highlight, tag] })

/** Tipos de callout de Obsidian → clase de color (los alias comparten estilo). */
const CALLOUT_KIND: Record<string, string> = {
  note: 'note', info: 'info', todo: 'info', abstract: 'abstract', summary: 'abstract', tldr: 'abstract',
  tip: 'tip', hint: 'tip', important: 'tip', success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question', warning: 'warning', caution: 'warning',
  attention: 'warning', failure: 'danger', fail: 'danger', missing: 'danger', danger: 'danger',
  error: 'danger', bug: 'danger', example: 'example', quote: 'quote', cite: 'quote'
}

/** Nombres en español para los callouts sin título propio. */
const CALLOUT_TITLE: Record<string, string> = {
  note: 'Nota', info: 'Info', todo: 'Pendiente', abstract: 'Resumen', summary: 'Resumen', tldr: 'Resumen',
  tip: 'Consejo', hint: 'Consejo', important: 'Importante', success: 'Listo', check: 'Listo', done: 'Listo',
  question: 'Pregunta', help: 'Ayuda', faq: 'Preguntas', warning: 'Atención', caution: 'Cuidado',
  attention: 'Atención', failure: 'Falló', fail: 'Falló', missing: 'Falta', danger: 'Peligro',
  error: 'Error', bug: 'Error', example: 'Ejemplo', quote: 'Cita', cite: 'Cita'
}

/**
 * Convierte `> [!tipo] Título` en cajas de callout (estilo Obsidian). `[!tipo]-`
 * arranca plegado y `[!tipo]+` desplegado (ambos plegables).
 */
function renderCallouts(root: DocumentFragment): void {
  root.querySelectorAll('blockquote').forEach((bq) => {
    const first = bq.firstElementChild
    if (!first || first.tagName !== 'P') return
    // La primera línea (hasta el primer <br>) es `[!tipo] Título`; el resto, contenido.
    const html = first.innerHTML
    const br = html.search(/<br\s*\/?>/i)
    const headHtml = br >= 0 ? html.slice(0, br) : html
    const rest = br >= 0 ? html.slice(html.indexOf('>', br) + 1).trim() : ''
    const tmp = bq.ownerDocument.createElement('span')
    tmp.innerHTML = headHtml
    const m = /^\s*\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/s.exec(tmp.textContent ?? '')
    if (!m) return
    const type = m[1].toLowerCase()
    const kind = CALLOUT_KIND[type] ?? 'note'
    const title = m[3].trim() || CALLOUT_TITLE[type] || m[1]
    const doc = bq.ownerDocument
    const box = doc.createElement(m[2] ? 'details' : 'div')
    box.className = `callout callout-${kind}`
    if (m[2] === '+') box.setAttribute('open', '')
    const head = doc.createElement(m[2] ? 'summary' : 'div')
    head.className = 'callout-title'
    head.textContent = title
    box.appendChild(head)
    const body = doc.createElement('div')
    body.className = 'callout-body'
    if (rest) {
      const p = doc.createElement('p')
      p.innerHTML = rest
      body.appendChild(p)
    }
    first.remove()
    while (bq.firstChild) body.appendChild(bq.firstChild)
    if (body.childNodes.length) box.appendChild(body)
    bq.replaceWith(box)
  })
}

/** Sección de una nota desde un título hasta el siguiente del mismo nivel o superior. */
function sectionOf(text: string, heading: string): string {
  const lines = text.split('\n')
  const want = heading.trim().toLowerCase()
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, '').trim().toLowerCase() === want)
  if (start < 0) return text
  const level = /^#+/.exec(lines[start])![0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i])
    if (m && m[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/** Markdown (sin frontmatter ni comentarios) → HTML saneado. */
function toHtml(source: string): string {
  const fm = splitFrontmatter(source)
  const body = stripComments(fm ? source.slice(fm.end) : source)
  return DOMPurify.sanitize(md.parse(body, { async: false }) as string)
}

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
  /** Click en una etiqueta `#tag`. */
  onOpenTag?: (tag: string) => void
  /** Lee otra nota (para `![[nota]]`). Sin esto, las notas incrustadas quedan como enlace. */
  loadNote?: (path: string) => Promise<string>
}

/**
 * Vista previa del Markdown de la nota. Renderiza a HTML con `marked` y lo
 * sanea con DOMPurify antes de inyectarlo (defensa aunque el vault sea propio).
 * DESPUÉS de sanear se reescriben las imágenes al protocolo de la bóveda, se
 * resuelven las incrustaciones y se arman los callouts: nunca se confía en un
 * src del documento. Las propiedades (frontmatter) se muestran como tabla.
 */
export function MarkdownPreview({
  source,
  notePath,
  files,
  previewOid,
  onOpenLink,
  onOpenTag,
  loadNote
}: MarkdownPreviewProps): JSX.Element {
  /** Contenido de las notas incrustadas (ruta → texto), cargado a demanda. */
  const [embedded, setEmbedded] = useState<Record<string, string>>({})
  /** HTML ya dibujado de bloques de plugins (```mermaid…), por lenguaje+texto. */
  const [blocks, setBlocks] = useState<Record<string, { html?: string; error?: string }>>({})
  const host = usePluginHost()
  // Cambio de tema: los diagramas se vuelven a dibujar con los colores nuevos.
  const theme = useTheme()
  useEffect(() => setBlocks({}), [theme])
  /** Bloques con un render en curso (para no pedirlo dos veces). */
  const inflight = useRef(new Set<string>())
  // Re-dibujar cuando un plugin registra/quita un renderizador de bloques.
  const registryVersion = useSyncExternalStore(host?.subscribe ?? noopSubscribe, host?.getVersion ?? zero)
  const props: Property[] | null = useMemo(() => readProperties(source), [source])

  const all = files ?? []
  const from = notePath ?? null

  // Notas incrustadas que hay que leer (un solo nivel: dentro de una nota
  // incrustada, sus propias incrustaciones quedan como enlace — evita ciclos).
  const wanted = useMemo(() => {
    const out = new Set<string>()
    const re = /!\[\[([^[\]\n|#]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(source)) !== null) {
      const path = resolveLink(m[1].trim(), all, from)
      if (path && isNotePath(path) && path !== from) out.add(path)
    }
    return [...out]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, files, notePath])

  useEffect(() => {
    if (!loadNote) return
    let cancelled = false
    void Promise.all(
      wanted.map(async (p) => [p, await loadNote(p).catch(() => null)] as const)
    ).then((pairs) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [p, t] of pairs) if (t !== null) next[p] = t
      setEmbedded(next)
    })
    return () => {
      cancelled = true
    }
  }, [wanted, loadNote])

  const html = useMemo(() => {
    const tpl = document.createElement('template')
    tpl.innerHTML = toHtml(source)

    const fix = (root: DocumentFragment | Element, depth: number): void => {
      root.querySelectorAll('span.embed[data-embed]').forEach((span) => {
        const target = span.getAttribute('data-embed') ?? ''
        const heading = span.getAttribute('data-heading') ?? ''
        const alias = span.getAttribute('data-alias') ?? ''
        const rel = resolveLink(target, all, from)
        const doc = span.ownerDocument
        if (!rel) {
          const a = doc.createElement('a')
          a.href = '#'
          a.className = 'wikilink missing'
          a.setAttribute('data-wikilink', target)
          a.textContent = alias || target
          span.replaceWith(a)
          return
        }
        const url = vaultFileUrl(rel, previewOid)
        const ext = extOf(rel)
        if (isImagePath(rel)) {
          const img = doc.createElement('img')
          img.src = url
          img.alt = alias || displayName(rel)
          // `![[foto.png|300]]`: ancho en píxeles, como en Obsidian.
          if (/^\d+$/.test(alias)) img.width = Number(alias)
          span.replaceWith(img)
        } else if (ext === 'pdf') {
          const frame = doc.createElement('iframe')
          frame.className = 'embed-pdf'
          frame.src = url
          frame.title = displayName(rel)
          span.replaceWith(frame)
        } else if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) {
          const audio = doc.createElement('audio')
          audio.controls = true
          audio.src = url
          span.replaceWith(audio)
        } else if (['mp4', 'webm', 'mov'].includes(ext)) {
          const video = doc.createElement('video')
          video.controls = true
          video.src = url
          span.replaceWith(video)
        } else if (isNotePath(rel) && depth === 0 && embedded[rel] !== undefined && rel !== from) {
          const box = doc.createElement('div')
          box.className = 'embed-note'
          const head = doc.createElement('a')
          head.href = '#'
          head.className = 'wikilink embed-note-title'
          head.setAttribute('data-wikilink', rel)
          head.textContent = displayName(rel) + (heading ? ` › ${heading}` : '')
          const body = doc.createElement('div')
          body.innerHTML = toHtml(heading ? sectionOf(embedded[rel], heading) : embedded[rel])
          fix(body, depth + 1)
          box.append(head, body)
          span.replaceWith(box)
        } else {
          const a = doc.createElement('a')
          a.href = '#'
          a.className = 'wikilink'
          a.setAttribute('data-wikilink', rel)
          a.textContent = alias || displayName(rel)
          span.replaceWith(a)
        }
      })

      root.querySelectorAll('img:not([src^="geode-vault:"])').forEach((img) => {
        const src = img.getAttribute('src') ?? ''
        const rel = from ? resolveRelativeSrc(from, src) : null
        // Externas (http/data): se dejan; la CSP decide qué carga.
        if (!rel) return
        const exists = all.includes(rel) || all.some((p) => p.toLowerCase() === rel.toLowerCase())
        if (exists) img.setAttribute('src', vaultFileUrl(rel, previewOid))
        else {
          img.removeAttribute('src')
          img.classList.add('missing')
        }
      })

      // `color: #fff`: un hex de sólo letras después de `:` es un color, no etiqueta.
      root.querySelectorAll('a.tag[data-tag]').forEach((a) => {
        const prev = a.previousSibling
        const before = prev && prev.nodeType === Node.TEXT_NODE ? prev.textContent ?? '' : ''
        if (isColorLike(a.getAttribute('data-tag') ?? '', before)) a.replaceWith(a.textContent ?? '')
      })

      root.querySelectorAll('a[data-wikilink]').forEach((a) => {
        const target = a.getAttribute('data-wikilink') ?? ''
        if (!resolveLink(target, all, from)) {
          a.classList.add('missing')
          a.setAttribute('title', `«${target}» todavía no existe — click para crearla`)
        }
      })

      renderCallouts(root instanceof Element ? (root as unknown as DocumentFragment) : root)
    }

    fix(tpl.content, 0)
    replaceCodeBlocks(tpl.content, host, blocks)
    return tpl.innerHTML
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, notePath, files, previewOid, embedded, blocks, registryVersion])

  // Dibuja (async) los bloques con renderizador de plugin que todavía no estén.
  useEffect(() => {
    if (!host) return
    const wantedBlocks = collectBlocks(source, host).filter((b) => !(b.key in blocks) && !inflight.current.has(b.key))
    for (const b of wantedBlocks) {
      const render = host.codeBlockRenderer(b.lang)
      if (!render) continue
      inflight.current.add(b.key)
      const done = (state: { html?: string; error?: string }): void => {
        inflight.current.delete(b.key)
        setBlocks((prev) => ({ ...prev, [b.key]: state }))
      }
      Promise.resolve()
        .then(() => render(b.source))
        .then(
          (out) => done({ html: sanitizeBlock(String(out ?? '')) }),
          (e) => done({ error: e instanceof Error ? e.message : String(e) })
        )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, registryVersion, blocks])

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    e.preventDefault() // nunca navegar la ventana de la app
    const t = a.getAttribute('data-tag')
    if (t !== null) {
      onOpenTag?.(t)
      return
    }
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

  return (
    <div className="md-preview" onClick={onClick}>
      {props && props.length > 0 && <PropertiesView props={props} onOpenTag={onOpenTag} />}
      {props === null && <p className="props-error">Las propiedades de esta nota tienen un formato inválido.</p>}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

const noopSubscribe = (): (() => void) => () => {}
const zero = (): number => 0

/** Bloques ```lang del texto que tienen renderizador registrado por un plugin. */
function collectBlocks(source: string, host: PluginHost): { lang: string; source: string; key: string }[] {
  const out: { lang: string; source: string; key: string }[] = []
  const re = /^(```|~~~)[ \t]*([\w-]+)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const lang = m[2].toLowerCase()
    if (!host.codeBlockRenderer(lang)) continue
    const text = m[3].replace(/\n$/, '')
    out.push({ lang, source: text, key: `${lang}\n${text}` })
  }
  return out
}

/** HTML/SVG devuelto por un plugin, saneado (sin scripts, handlers ni URLs peligrosas). */
function sanitizeBlock(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button']
  })
}

/**
 * Reemplaza los `<pre><code class="language-x">` con renderizador de plugin por
 * su dibujo (ya saneado), o por un aviso mientras se dibuja / si falló.
 */
function replaceCodeBlocks(
  root: DocumentFragment,
  host: PluginHost | null,
  rendered: Record<string, { html?: string; error?: string }>
): void {
  if (!host) return
  root.querySelectorAll('pre > code[class*="language-"]').forEach((code) => {
    const lang = /language-([\w-]+)/.exec(code.className)?.[1]?.toLowerCase()
    if (!lang || !host.codeBlockRenderer(lang)) return
    const text = (code.textContent ?? '').replace(/\n$/, '')
    const state = rendered[`${lang}\n${text}`]
    const doc = code.ownerDocument
    const box = doc.createElement('div')
    box.className = `plugin-block plugin-block-${lang}`
    if (state?.html !== undefined) box.innerHTML = state.html
    else if (state?.error !== undefined) {
      box.classList.add('plugin-block-error')
      box.textContent = `No se pudo dibujar el bloque «${lang}»: ${state.error}`
    } else {
      box.classList.add('plugin-block-pending')
      box.textContent = 'Dibujando…'
    }
    code.parentElement?.replaceWith(box)
  })
}

/** Propiedades de la nota (frontmatter) como tabla de solo lectura. */
function PropertiesView({ props, onOpenTag }: { props: Property[]; onOpenTag?: (t: string) => void }): JSX.Element {
  return (
    <dl className="props-view">
      {props.map((p) => (
        <div className="props-row" key={p.key}>
          <dt>{p.key}</dt>
          <dd>
            {Array.isArray(p.value) ? (
              p.value.map((v) =>
                p.key === 'tags' || p.key === 'tag' ? (
                  <a
                    key={v}
                    href="#"
                    className="tag"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onOpenTag?.(v.replace(/^#/, ''))
                    }}
                  >
                    #{v.replace(/^#/, '')}
                  </a>
                ) : (
                  <span key={v} className="props-chip">
                    {v}
                  </span>
                )
              )
            ) : typeof p.value === 'boolean' ? (
              <input type="checkbox" checked={p.value} readOnly disabled />
            ) : (
              <span>{p.value === null ? '' : String(p.value)}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
