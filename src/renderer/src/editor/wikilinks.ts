import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { WIKILINK_SOURCE, dirName, linkTextFor, maskCode } from '@shared/links'
import { findTags } from '@shared/obsidian'

/**
 * Entorno que el editor necesita para los enlaces: la lista de archivos de la
 * bóveda (para autocompletar) y cómo abrir un destino. Se lee vía getters para
 * que el editor (creado una sola vez) vea siempre los datos frescos.
 */
export interface LinkEnv {
  files(): string[]
  open(target: string): void
  /** Ctrl+click sobre un `#tag`: buscar las notas con esa etiqueta. */
  openTag?(tag: string): void
  /** Crea (sin abrirla) la nota de un enlace recién hecho desde el menú contextual. */
  create?(target: string): void
}

/** Autocompletado al tipear `[[`: lista notas (e imágenes) por nombre. */
function linkCompletions(env: LinkEnv) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[[^[\]\n|#]*$/)
    if (!m) return null
    const files = env.files()
    return {
      from: m.from + 2,
      validFor: /^[^[\]\n|#]*$/,
      options: files.map((path) => {
        const label = linkTextFor(path, files)
        return {
          label,
          detail: dirName(path) || undefined,
          type: path.toLowerCase().endsWith('.md') ? 'text' : 'variable',
          // Cierra con `]]` salvo que ya estén (p. ej. al editar un enlace existente).
          apply: (view: EditorView, _c: unknown, from: number, to: number) => {
            const hasClose = view.state.sliceDoc(to, to + 2) === ']]'
            const insert = hasClose ? label : `${label}]]`
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + label.length + 2 }
            })
          }
        }
      })
    }
  }
}

const linkMark = Decoration.mark({ class: 'cm-wikilink' })
const tagMark = Decoration.mark({ class: 'cm-tag' })

/** Resalta los `[[...]]` visibles (fuera de bloques de código). */
const linkHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view)
    }
    build(view: EditorView): DecorationSet {
      const marks: Range<Decoration>[] = []
      // Se enmascara el documento completo para que los bloques de código que
      // empiezan fuera del viewport también se excluyan.
      const doc = view.state.doc.toString()
      const masked = maskCode(doc)
      for (const { from, to } of view.visibleRanges) {
        const re = new RegExp(WIKILINK_SOURCE, 'g')
        const slice = masked.slice(from, to)
        let m: RegExpExecArray | null
        while ((m = re.exec(slice)) !== null) {
          marks.push(linkMark.range(from + m.index, from + m.index + m[0].length))
        }
        // Etiquetas línea por línea (misma regla que el resto de la app).
        let lineStart = 0
        for (const lineText of slice.split('\n')) {
          for (const t of findTags(lineText)) {
            marks.push(tagMark.range(from + lineStart + t.from, from + lineStart + t.to))
          }
          lineStart += lineText.length + 1
        }
      }
      return Decoration.set(marks, true)
    }
  },
  { decorations: (v) => v.decorations }
)

/** Destino del enlace bajo una posición del documento, o null. */
function linkAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos)
  const re = new RegExp(WIKILINK_SOURCE, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(line.text)) !== null) {
    const from = line.from + m.index
    if (pos >= from && pos <= from + m[0].length) return m[2].trim()
  }
  return null
}

/** Tag bajo una posición del documento, o null. */
function tagAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos)
  for (const t of findTags(line.text)) {
    if (pos >= line.from + t.from && pos <= line.from + t.to) return t.tag
  }
  return null
}

/**
 * Extensiones de enlaces wiki: autocompletado, resaltado y Ctrl/Cmd+click para
 * abrir (o crear, si no existe) la nota enlazada.
 */
export function wikilinkExtensions(env: LinkEnv): Extension[] {
  return [
    autocompletion({ override: [linkCompletions(env)], icons: false }),
    linkHighlighter,
    EditorView.domEventHandlers({
      mousedown(e, view) {
        if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos == null) return false
        const target = linkAt(view, pos)
        if (target) {
          e.preventDefault()
          env.open(target)
          return true
        }
        const tag = tagAt(view, pos)
        if (tag && env.openTag) {
          e.preventDefault()
          env.openTag(tag)
          return true
        }
        return false
      }
    }),
    EditorView.theme({
      '.cm-wikilink': { color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '3px' },
      '.cm-tag': {
        color: 'var(--accent)',
        backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
        borderRadius: '4px',
        padding: '0 2px'
      }
    })
  ]
}

