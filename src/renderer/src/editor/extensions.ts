import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import type { Theme } from '../theme'

/**
 * Extensiones del editor, en un solo lugar para poder crecer sin tocar el
 * componente React. A futuro, la API de plugins (ver ARCHITECTURE.md §7)
 * inyectará extensiones acá.
 *
 * Nota: la `history` de CodeMirror es solo el undo/redo de la sesión de edición.
 * NO es el versionado de la app — ese vive en el journal + Git (ARCHITECTURE.md §3).
 *
 * El tema NO va acá: vive en un Compartment (ver `themeExtension`) para poder
 * alternar claro/oscuro en caliente sin perder cursor ni undo.
 */
export function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    // Undo/redo explícitos y con prioridad. En Windows/Linux el historyKeymap
    // por defecto solo trae Ctrl+Y para redo; agregamos también Ctrl+Shift+Z.
    keymap.of([
      { key: 'Mod-z', run: undo, preventDefault: true },
      { key: 'Mod-y', run: redo, preventDefault: true },
      { key: 'Mod-Shift-z', run: redo, preventDefault: true }
    ]),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    // codeLanguages: resalta bloques ```lang dentro del markdown, cargados on-demand.
    markdown({ codeLanguages: languages }),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2)
  ]
}

/** Tema claro del editor: fondo y gutter toman las variables de la app. */
const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--bg)', color: 'var(--text)' },
    '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(124, 77, 255, 0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(124, 77, 255, 0.08)' },
    '.cm-cursor': { borderLeftColor: 'var(--text)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(124, 77, 255, 0.2)'
    }
  },
  { dark: false }
)

/** Extensión de tema para el Compartment del editor. */
export function themeExtension(theme: Theme): Extension {
  return theme === 'light' ? [lightTheme, syntaxHighlighting(defaultHighlightStyle)] : oneDark
}
