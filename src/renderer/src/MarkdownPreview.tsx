import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX, MouseEvent } from 'react'
import { Marked, type Token, type TokenizerAndRendererExtension } from 'marked'
import markedFootnote from 'marked-footnote'
import DOMPurify from 'dompurify'
import { displayName, isNotePath, resolveLink } from '@shared/links'
import { extOf, isImagePath, resolveRelativeSrc, vaultFileUrl } from '@shared/attachments'
import { isColorLike, readProperties, splitFrontmatter, stripComments, type Property } from '@shared/obsidian'
import { usePluginHost } from './plugins'
import type { PluginHost } from './plugins'
import { useTheme } from './theme'
import { t } from '@shared/i18n'

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

/**
 * Fórmulas: `$$…$$` en su propia línea (bloque), `$$…$$` dentro de un párrafo
 * (centrada) y `$…$` en línea. Acá sólo se marcan; las dibuja el plugin que
 * registre los lenguajes `math` / `math-inline` (KaTeX, integrado). Sin plugin
 * se ven como el texto original.
 *
 * Regla del `$` en línea (como Obsidian/Pandoc): sin espacio después del `$` de
 * apertura ni antes del de cierre, y el cierre no seguido de un dígito. Así
 * "cuesta $5 y $10" sigue siendo texto.
 */
const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src: string) {
    const m = /^ {0,3}\$\$/m.exec(src)
    return m ? m.index : undefined
  },
  tokenizer(src: string) {
    const m = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/.exec(src)
    if (!m) return undefined
    return { type: 'mathBlock', raw: m[0], text: m[1].trim() }
  },
  renderer(token) {
    return `<pre><code class="language-math">${esc(String(token.text))}</code></pre>\n`
  }
}

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start(src: string) {
    const i = src.indexOf('$')
    return i < 0 ? undefined : i
  },
  tokenizer(src: string) {
    const display = /^\$\$([^$]+?)\$\$/.exec(src)
    if (display) return { type: 'mathInline', raw: display[0], text: display[1].trim(), display: true }
    const m = /^\$(?!\$)(?=\S)([^$\n]*?\S)\$(?!\d)/.exec(src)
    if (!m) return undefined
    return { type: 'mathInline', raw: m[0], text: m[1], display: false }
  },
  renderer(token) {
    const cls = token.display ? 'math-display' : 'math-inline'
    return `<code class="${cls}">${esc(String(token.text))}</code>`
  }
}

/**
 * Instancia de marked. Se arma la primera vez que se usa (no al importar el
 * módulo) para que los textos de las notas al pie salgan en el idioma elegido,
 * que se fija antes de dibujar la app.
 */
let mdInstance: Marked | null = null
/** Si no es null, cada token que marked recorre al parsear se anota acá (ver collectBlocks). */
let tokenSink: Token[] | null = null
function md(): Marked {
  if (mdInstance) return mdInstance
  const m = new Marked({ gfm: true, breaks: true })
  m.use({ extensions: [wikilink, highlight, tag, mathBlock, mathInline] })
  m.use({ walkTokens: (tok) => void tokenSink?.push(tok) })
  // Notas al pie: `texto[^1]` y `[^1]: la nota` al final (como Obsidian).
  m.use(markedFootnote({ description: t('Notas al pie'), backRefLabel: t('Volver a la referencia {0}') }))
  mdInstance = m
  return m
}

/** Tipos de callout de Obsidian → clase de color (los alias comparten estilo). */
const CALLOUT_KIND: Record<string, string> = {
  note: 'note', info: 'info', todo: 'info', abstract: 'abstract', summary: 'abstract', tldr: 'abstract',
  tip: 'tip', hint: 'tip', important: 'tip', success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question', warning: 'warning', caution: 'warning',
  attention: 'warning', failure: 'danger', fail: 'danger', missing: 'danger', danger: 'danger',
  error: 'danger', bug: 'danger', example: 'example', quote: 'quote', cite: 'quote'
}

/**
 * Nombres para los callouts sin título propio. Es una función (no una constante
 * del módulo) para que se traduzca con el idioma ya elegido.
 */
function calloutTitle(type: string): string | undefined {
  const titles: Record<string, string> = {
    note: t('Nota'), info: t('Info'), todo: t('Pendiente'), abstract: t('Resumen'), summary: t('Resumen'), tldr: t('Resumen'),
    tip: t('Consejo'), hint: t('Consejo'), important: t('Importante'), success: t('Listo'), check: t('Listo'), done: t('Listo'),
    question: t('Pregunta'), help: t('Ayuda'), faq: t('Preguntas'), warning: t('Atención'), caution: t('Cuidado'),
    attention: t('Atención'), failure: t('Falló'), fail: t('Falló'), missing: t('Falta'), danger: t('Peligro'),
    error: t('Error'), bug: t('Error'), example: t('Ejemplo'), quote: t('Cita'), cite: t('Cita')
  }
  return titles[type]
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
    const title = m[3].trim() || calloutTitle(type) || m[1]
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

/** Cuerpo que se dibuja: sin frontmatter ni comentarios `%%…%%`. */
function previewBody(source: string): string {
  const fm = splitFrontmatter(source)
  return stripComments(fm ? source.slice(fm.end) : source)
}

/** Markdown (sin frontmatter ni comentarios) → HTML saneado. */
function toHtml(source: string): string {
  return DOMPurify.sanitize(md().parse(previewBody(source), { async: false }) as string)
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
          a.setAttribute('title', t('«{target}» todavía no existe — click para crearla', { target }))
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
    // Anclas internas (notas al pie): scroll dentro de esta vista previa.
    if (href.startsWith('#') && href.length > 1) {
      const id = decodeURIComponent(href.slice(1))
      const target = Array.from(e.currentTarget.querySelectorAll('[id]')).find((el) => el.id === id)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

/**
 * Bloques con renderizador de plugin: ```lang, `$$…$$` (lenguaje `math`) y
 * `$…$` (`math-inline`). Usa el mismo lexer que la vista previa, así lo que se
 * pide dibujar coincide exactamente con lo que aparece en la página.
 */
function collectBlocks(source: string, host: PluginHost): { lang: string; source: string; key: string }[] {
  const out: { lang: string; source: string; key: string }[] = []
  const seen = new Set<string>()
  const add = (lang: string, text: string): void => {
    if (!host.codeBlockRenderer(lang)) return
    const key = `${lang}\n${text}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ lang, source: text, key })
  }
  // Se recorre con el MISMO parse que dibuja (incluye notas al pie): llamar al
  // lexer por separado rompe la extensión de notas al pie, que guarda estado.
  const tokens: Token[] = []
  tokenSink = tokens
  try {
    md().parse(previewBody(source), { async: false })
  } finally {
    tokenSink = null
  }
  tokens.forEach((tok) => {
    const t = tok as Token & { lang?: string; text?: string; display?: boolean }
    if (t.type === 'code' && t.lang) add(t.lang.split(/\s/)[0].toLowerCase(), String(t.text ?? '').replace(/\n$/, ''))
    else if (t.type === 'mathBlock') add('math', String(t.text ?? ''))
    else if (t.type === 'mathInline') add(t.display ? 'math' : 'math-inline', String(t.text ?? ''))
  })
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
  const asText = (code: Element): string => {
    const text = code.textContent ?? ''
    return code.classList.contains('math-display') ? `$$${text}$$` : `$${text}$`
  }
  if (!host) {
    root.querySelectorAll('code.math-inline, code.math-display').forEach((code) => {
      code.replaceWith(code.ownerDocument.createTextNode(asText(code)))
    })
    return
  }
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
      box.textContent = t('No se pudo dibujar el bloque «{lang}»: {error}', { lang, error: state.error })
    } else {
      box.classList.add('plugin-block-pending')
      box.textContent = t('Dibujando…')
    }
    code.parentElement?.replaceWith(box)
  })
  // Fórmulas dentro del texto: se dibujan en línea; sin plugin, vuelven a ser texto.
  root.querySelectorAll('code.math-inline, code.math-display').forEach((code) => {
    const display = code.classList.contains('math-display')
    const lang = display ? 'math' : 'math-inline'
    const doc = code.ownerDocument
    if (!host.codeBlockRenderer(lang)) {
      code.replaceWith(doc.createTextNode(asText(code)))
      return
    }
    const state = rendered[`${lang}\n${code.textContent ?? ''}`]
    const span = doc.createElement('span')
    span.className = display ? 'math-display' : 'math-inline'
    if (state?.html !== undefined) span.innerHTML = state.html
    else {
      if (state?.error !== undefined) {
        span.classList.add('plugin-block-error')
        span.title = state.error
      }
      span.textContent = asText(code)
    }
    code.replaceWith(span)
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
