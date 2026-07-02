import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { JSX } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { baseExtensions } from './extensions'

export interface EditorContext {
  selection: string
  from: number
  to: number
  /** Texto anterior al cursor (para "continuar"), acotado. */
  before: string
}

export interface EditorHandle {
  getContext(): EditorContext | null
  replaceRange(from: number, to: number, text: string): void
  focus(): void
}

interface CodeMirrorEditorProps {
  initialDoc: string
  /**
   * Identidad del documento cargado (p. ej. `ruta#epoch`). Cuando cambia, se
   * reemplaza el contenido del editor SIN remontarlo (preserva foco/cursor y
   * evita el freeze al renombrar/crear notas).
   */
  reloadKey: string
  onChange?: (doc: string) => void
  /** Se invoca con Ctrl/Cmd+K para pedir asistencia de IA. */
  onRequestAi?: () => void
}

/**
 * Envoltorio React sobre un EditorView de CodeMirror 6. El view se crea una sola
 * vez; al cambiar de nota (reloadKey) se reemplaza el documento por transacción,
 * no por remontaje. Expone un handle imperativo (selección/insertar/foco).
 */
export const CodeMirrorEditor = forwardRef<EditorHandle, CodeMirrorEditorProps>(
  function CodeMirrorEditor({ initialDoc, reloadKey, onChange, onRequestAi }, ref): JSX.Element {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const docRef = useRef(initialDoc)
    docRef.current = initialDoc
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onRequestAiRef = useRef(onRequestAi)
    onRequestAiRef.current = onRequestAi

    useImperativeHandle(ref, () => ({
      getContext(): EditorContext | null {
        const view = viewRef.current
        if (!view) return null
        const { from, to } = view.state.selection.main
        return {
          selection: view.state.sliceDoc(from, to),
          from,
          to,
          before: view.state.sliceDoc(Math.max(0, from - 2000), from)
        }
      },
      replaceRange(from, to, text): void {
        const view = viewRef.current
        if (!view) return
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
        view.focus()
      },
      focus(): void {
        viewRef.current?.focus()
      }
    }), [])

    useEffect(() => {
      if (!hostRef.current) return

      const view = new EditorView({
        state: EditorState.create({
          doc: initialDoc,
          extensions: [
            // Ctrl/Cmd+K: pedir IA. Primero, para tener prioridad.
            keymap.of([
              {
                key: 'Mod-k',
                preventDefault: true,
                run: () => {
                  onRequestAiRef.current?.()
                  return true
                }
              }
            ]),
            ...baseExtensions(),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
            })
          ]
        }),
        parent: hostRef.current
      })
      viewRef.current = view
      view.focus()

      return () => {
        view.destroy()
        viewRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Al cambiar de nota (o recargarla tras checkout/merge), reemplaza el doc en
    // el MISMO view (sin remontar) y enfoca. No depende de `initialDoc` para no
    // dispararse en cada tecla (initialDoc cambia con el contenido).
    const firstReload = useRef(true)
    useEffect(() => {
      if (firstReload.current) {
        firstReload.current = false
        return
      }
      const view = viewRef.current
      if (!view) return
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: docRef.current },
        selection: { anchor: 0 }
      })
      view.focus()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloadKey])

    return <div className="cm-host" ref={hostRef} />
  }
)
