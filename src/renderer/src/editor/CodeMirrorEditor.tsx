import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { baseExtensions } from './extensions'

interface CodeMirrorEditorProps {
  /** Documento inicial. Los cambios posteriores del usuario viven dentro del editor. */
  initialDoc: string
  /** Se llama en cada cambio del documento. */
  onChange?: (doc: string) => void
}

/**
 * Envoltorio React fino sobre un EditorView de CodeMirror 6.
 *
 * El EditorView se crea una sola vez (montaje) y se destruye en el desmontaje;
 * React no re-renderiza el contenido del editor. Esta separación es a propósito:
 * CodeMirror maneja su propio estado y DOM, y nosotros solo lo escuchamos.
 */
export function CodeMirrorEditor({ initialDoc, onChange }: CodeMirrorEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Ref al callback para no recrear el editor cuando cambia la identidad de onChange.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          ...baseExtensions(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString())
            }
          })
        ]
      }),
      parent: hostRef.current
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Solo al montar: el documento inicial es el punto de partida; a partir de
    // ahí el estado vive en el editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className="cm-host" ref={hostRef} />
}
