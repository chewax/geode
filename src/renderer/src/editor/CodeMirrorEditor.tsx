import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { JSX } from 'react'
import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { baseExtensions, themeExtension } from './extensions'
import { consumeEditorAutoFocusSuppression } from './focusControl'
import { wikilinkExtensions, type LinkEnv } from './wikilinks'
import { getTheme, subscribeTheme } from '../theme'

/**
 * Marca las transacciones de recarga programática (cambio de nota, checkout,
 * restore) para distinguirlas de las ediciones reales del usuario. Sin esto, el
 * reemplazo completo del documento dispararía `onChange` como si el usuario
 * hubiese tecleado, fijando la tab de preview en la misma carga que la creó.
 */
const programmaticReload = Annotation.define<boolean>()

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
  /** Inserta texto en el cursor (o reemplaza la selección actual). */
  insertAtCursor(text: string): void
  /** Texto seleccionado ('' si no hay selección). */
  getSelection(): string
  /** Selecciona y hace scroll a un rango del documento. */
  revealRange(from: number, to: number): void
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
  /** Extensiones inyectadas por plugins (seam de la API de plugins, §7). */
  extraExtensions?: Extension[]
  /**
   * Solo lectura: durante la preview del pasado el editor no debe editarse ni
   * mostrar cursor. Se reconfigura en caliente (Compartment) sin remontar el view.
   */
  readOnly?: boolean
  /** Enlaces `[[...]]`: archivos para autocompletar y cómo abrir un destino. */
  linkEnv?: LinkEnv
  /**
   * Imágenes pegadas o soltadas sobre el editor. Devuelve el Markdown a insertar
   * en el cursor (p. ej. `![](adjuntos/foto.png)`) o null si no se pudo.
   */
  onPasteFiles?: (files: File[]) => Promise<string | null>
}

/** Imágenes de un DataTransfer (pegar/soltar). */
function imageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return []
  return Array.from(dt.files).filter((f) => f.type.startsWith('image/'))
}

/**
 * Envoltorio React sobre un EditorView de CodeMirror 6. El view se crea una sola
 * vez; al cambiar de nota (reloadKey) se reemplaza el documento por transacción,
 * no por remontaje. Expone un handle imperativo (selección/insertar/foco).
 */
export const CodeMirrorEditor = forwardRef<EditorHandle, CodeMirrorEditorProps>(
  function CodeMirrorEditor(
    { initialDoc, reloadKey, onChange, onRequestAi, extraExtensions, readOnly, linkEnv, onPasteFiles },
    ref
  ): JSX.Element {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    // Compartimento para conmutar solo-lectura sin recrear el view.
    const readOnlyComp = useRef(new Compartment())
    // Compartimento del tema (claro/oscuro), reconfigurable en caliente.
    const themeComp = useRef(new Compartment())
    const linkEnvRef = useRef(linkEnv)
    linkEnvRef.current = linkEnv
    const onPasteFilesRef = useRef(onPasteFiles)
    onPasteFilesRef.current = onPasteFiles
    const docRef = useRef(initialDoc)
    docRef.current = initialDoc
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onRequestAiRef = useRef(onRequestAi)
    onRequestAiRef.current = onRequestAi
    // Snapshot de las extensiones de plugins al montar (el view se crea una vez).
    const extraExtensionsRef = useRef(extraExtensions)

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
      insertAtCursor(text): void {
        const view = viewRef.current
        if (!view) return
        const { from, to } = view.state.selection.main
        view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
        view.focus()
      },
      getSelection(): string {
        const view = viewRef.current
        if (!view) return ''
        const { from, to } = view.state.selection.main
        return view.state.sliceDoc(from, to)
      },
      revealRange(from, to): void {
        const view = viewRef.current
        if (!view) return
        const max = view.state.doc.length
        const a = Math.min(from, max)
        const b = Math.min(to, max)
        view.dispatch({
          selection: { anchor: a, head: b },
          effects: EditorView.scrollIntoView(a, { y: 'center' })
        })
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
            themeComp.current.of(themeExtension(getTheme())),
            // Getters sobre refs: el view se crea una vez pero ve datos frescos.
            wikilinkExtensions({
              files: () => linkEnvRef.current?.files() ?? [],
              open: (target) => linkEnvRef.current?.open(target)
            }),
            EditorView.domEventHandlers({
              paste(e, view) {
                const files = imageFiles(e.clipboardData)
                if (files.length === 0 || !onPasteFilesRef.current || view.state.readOnly) return false
                e.preventDefault()
                void insertFiles(view, files, null)
                return true
              },
              drop(e, view) {
                const files = imageFiles(e.dataTransfer)
                if (files.length === 0 || !onPasteFilesRef.current || view.state.readOnly) return false
                e.preventDefault()
                const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
                void insertFiles(view, files, pos)
                return true
              }
            }),
            readOnlyComp.current.of([
              EditorState.readOnly.of(readOnly ?? false),
              EditorView.editable.of(!(readOnly ?? false))
            ]),
            ...(extraExtensionsRef.current ?? []),
            EditorView.updateListener.of((update) => {
              // Solo las ediciones reales del usuario propagan onChange. Las
              // recargas programáticas (cambio de nota/checkout) llevan la
              // anotación y NO deben fijar la preview ni marcar la nota sucia.
              if (
                update.docChanged &&
                !update.transactions.some((tr) => tr.annotation(programmaticReload))
              ) {
                onChangeRef.current?.(update.state.doc.toString())
              }
            })
          ]
        }),
        parent: hostRef.current
      })
      viewRef.current = view

      // Guarda las imágenes vía el callback y escribe el Markdown en `pos` (o el cursor).
      async function insertFiles(v: EditorView, files: File[], pos: number | null): Promise<void> {
        const md = await onPasteFilesRef.current?.(files)
        if (!md || viewRef.current !== v) return
        const at = pos ?? v.state.selection.main.head
        const { from, to } = pos == null ? v.state.selection.main : { from: at, to: at }
        v.dispatch({ changes: { from, to, insert: md }, selection: { anchor: from + md.length } })
        v.focus()
      }

      // Tema: seguir el cambio claro/oscuro sin remontar.
      const offTheme = subscribeTheme(() => {
        view.dispatch({ effects: themeComp.current.reconfigure(themeExtension(getTheme())) })
      })

      // Al crear una nota se suprime este foco inicial para que el input de nombre
      // del árbol lo conserve (ver focusControl).
      if (!consumeEditorAutoFocusSuppression()) view.focus()

      return () => {
        offTheme()
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
        selection: { anchor: 0 },
        annotations: programmaticReload.of(true)
      })
      // Si la recarga viene de crear una nota, no robar el foco al input de nombre.
      if (!consumeEditorAutoFocusSuppression()) view.focus()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloadKey])

    // Al conmutar solo-lectura, reconfigura el compartimento en el MISMO view
    // (sin remontar): EditorState.readOnly bloquea ediciones y editable.of(false)
    // quita el cursor para que el editor del pasado se vea inerte.
    useEffect(() => {
      viewRef.current?.dispatch({
        effects: readOnlyComp.current.reconfigure([
          EditorState.readOnly.of(readOnly ?? false),
          EditorView.editable.of(!(readOnly ?? false))
        ])
      })
    }, [readOnly])

    return <div className="cm-host" ref={hostRef} />
  }
)
