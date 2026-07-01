import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'

/**
 * Extensiones del editor, en un solo lugar para poder crecer sin tocar el
 * componente React. A futuro, la API de plugins (ver ARCHITECTURE.md §7)
 * inyectará extensiones acá.
 *
 * Nota: la `history` de CodeMirror es solo el undo/redo de la sesión de edición.
 * NO es el versionado de la app — ese vive en el journal + Git (ARCHITECTURE.md §3).
 */
export function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    // codeLanguages: resalta bloques ```lang dentro del markdown, cargados on-demand.
    markdown({ codeLanguages: languages }),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
    oneDark
  ]
}
