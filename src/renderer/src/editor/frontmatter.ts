import { StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { readProperties, splitFrontmatter } from '@shared/obsidian'
import { t } from '@shared/i18n'

/**
 * Oculta el bloque de propiedades (frontmatter YAML) en el editor y lo reemplaza
 * por una línea discreta: las propiedades se editan desde el panel de arriba,
 * sin ver YAML. El texto sigue intacto en el archivo (y se puede mostrar crudo).
 */
class FrontmatterWidget extends WidgetType {
  constructor(private readonly count: number) {
    super()
  }
  eq(other: FrontmatterWidget): boolean {
    return other.count === this.count
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-frontmatter-chip'
    el.textContent =
      this.count === 1
        ? t('{n} propiedad · editala en el panel de arriba', { n: 1 })
        : t('{n} propiedades · editalas en el panel de arriba', { n: this.count })
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

function build(state: EditorState): DecorationSet {
  const text = state.doc.toString()
  const fm = splitFrontmatter(text)
  // YAML inválido: se muestra crudo para que se pueda arreglar a mano.
  const props = fm ? readProperties(text) : null
  if (!fm || props === null) return Decoration.none
  const endLine = state.doc.lineAt(Math.max(0, fm.end - 1))
  const to = fm.end > 0 && text[fm.end - 1] === '\n' ? Math.max(0, fm.end - 1) : endLine.to
  return Decoration.set([
    Decoration.replace({ widget: new FrontmatterWidget(props.length), block: true }).range(0, to)
  ])
}

const field = StateField.define<DecorationSet>({
  create: build,
  update: (deco, tr) => (tr.docChanged ? build(tr.state) : deco),
  provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((v) => v.state.field(f))]
})

/** Extensión: ocultar el frontmatter (o nada, si `hidden` es false). */
export function frontmatterExtension(hidden: boolean): Extension {
  return hidden
    ? [
        field,
        EditorView.theme({
          '.cm-frontmatter-chip': {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11.5px',
            color: 'var(--muted)',
            padding: '2px 6px 6px',
            borderBottom: '1px dashed var(--border)',
            marginBottom: '6px'
          }
        })
      ]
    : []
}
