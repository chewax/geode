import { useEffect, useRef, useState } from 'react'
import type { JSX, DragEvent } from 'react'
import type { Extension } from '@codemirror/state'
import { X, Eye, PenLine, SplitSquareHorizontal, FileQuestion } from 'lucide-react'
import type { LeafPane, DropZone } from './paneTree'
import { CodeMirrorEditor, type EditorHandle } from './editor/CodeMirrorEditor'
import { MarkdownPreview } from './MarkdownPreview'

/** Payload del arrastre de una tab. Se guarda en módulo porque `dataTransfer`
 *  no es legible durante `dragover` (solo en `drop`). */
export interface TabDrag {
  srcPaneId: string
  path: string
}
let dragPayload: TabDrag | null = null

/** Handle imperativo que cada panel expone al App (flush, editor, preview). */
export interface PaneHandle {
  flush(): Promise<void>
  getEditor(): EditorHandle | null
  togglePreview(): void
  isPreview(): boolean
}

export interface EditorPaneProps {
  pane: LeafPane
  /** Panel enfocado: recibe el resaltado y es el objetivo de IA/timeline/stats. */
  isActive: boolean
  /** Cambia para forzar recarga del contenido desde disco (checkout/restore). */
  reloadNonce: number
  /** Extensiones inyectadas por plugins. */
  extraExtensions: Extension[]
  onFocusPane: (paneId: string) => void
  onSelectTab: (paneId: string, path: string) => void
  /** Fija la tab de preview como permanente (doble click sobre la tab). */
  onPinTab: (paneId: string, path: string) => void
  onCloseTab: (paneId: string, path: string) => void
  onReorderTab: (paneId: string, path: string, toIndex: number) => void
  onDropTab: (drag: TabDrag, dstPaneId: string, zone: DropZone) => void
  onSplit: (paneId: string, dir: 'row' | 'col') => void
  onNoteOpen: (paneId: string, path: string, content: string) => void
  onNoteChange: (paneId: string, path: string, content: string) => void
  onSaved: (paneId: string) => void
  onRequestAi: (paneId: string) => void
  registerHandle: (paneId: string, handle: PaneHandle | null) => void
  /** oid en preview; null/undefined = presente en vivo. Al fijarse, el panel
   *  carga su contenido del árbol del commit (solo lectura) en vez del disco. */
  previewOid?: string | null
}

const AUTOSAVE_MS = 600

/** Nombre visible de una tab (nota sin extensión, o solo el basename). */
function tabName(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return base.replace(/\.md$/i, '')
}

/** Un panel del área de edición: barra de tabs + editor (o vista previa). */
export function EditorPane(props: EditorPaneProps): JSX.Element {
  const { pane, isActive, reloadNonce, extraExtensions } = props
  const [content, setContent] = useState('')
  const [epoch, setEpoch] = useState(0)
  const [preview, setPreview] = useState(false)
  // La nota activa no existía en el commit en preview → tab fantasma (SOFT-03).
  const [ghost, setGhost] = useState(false)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const [dragOverTab, setDragOverTab] = useState<number | null>(null)

  const editorRef = useRef<EditorHandle>(null)
  const pendingRef = useRef<{ path: string; content: string } | null>(null)
  const timerRef = useRef<number | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const previewRef = useRef(preview)
  previewRef.current = preview

  const flush = async (): Promise<void> => {
    // Nunca escribir a disco durante la preview del pasado (Pitfall 1, SOFT-05).
    if (propsRef.current.previewOid != null) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    await window.geode.vault.writeNote(pending.path, pending.content)
    propsRef.current.onSaved(pane.id)
  }

  // Registrar el handle imperativo una vez por panel; al desmontar, flush para no
  // perder cambios. Usa refs para leer el estado fresco sin re-registrar.
  useEffect(() => {
    const handle: PaneHandle = {
      flush,
      getEditor: () => editorRef.current,
      togglePreview: () => setPreview((p) => !p),
      isPreview: () => previewRef.current
    }
    propsRef.current.registerHandle(pane.id, handle)
    return () => {
      void flush()
      propsRef.current.registerHandle(pane.id, null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id])

  // Cargar el contenido de la nota activa desde disco (al cambiar de nota o al
  // pedir recarga por checkout/restore).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Persistir lo pendiente antes de cambiar de nota, para no perderlo.
      await flush()
      if (!pane.active) {
        if (!cancelled) {
          setGhost(false)
          setContent('')
        }
        return
      }
      const previewOid = propsRef.current.previewOid
      try {
        // En preview leemos del árbol del commit; si no, del disco.
        const text = previewOid
          ? await window.geode.git.readNoteAt(previewOid, pane.active)
          : await window.geode.vault.readNote(pane.active)
        if (cancelled) return
        setGhost(false)
        setContent(text)
        setEpoch((e) => e + 1)
        propsRef.current.onNoteOpen(pane.id, pane.active, text)
      } catch {
        // readNoteAt lanza cuando el blob no existía en ese commit → fantasma.
        if (cancelled) return
        setGhost(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.active, reloadNonce, props.previewOid])

  const handleChange = (doc: string): void => {
    if (!pane.active) return
    // Durante la preview del pasado el editor es de solo lectura: los únicos
    // `docChanged` que llegan acá son las recargas programáticas del texto
    // pasado (EditorState.readOnly no las suprime). NO deben marcar la nota como
    // sucia ni encolar escritura: de lo contrario, al salir de la preview el
    // flush escribiría ese texto pasado sobre el archivo presente en disco,
    // perdiendo cambios sin guardar (viola la edición no-destructiva, SOFT-01/02).
    if (propsRef.current.previewOid != null) return
    setContent(doc)
    pendingRef.current = { path: pane.active, content: doc }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    propsRef.current.onNoteChange(pane.id, pane.active, doc)
  }

  // ── Drag & drop de tabs ────────────────────────────────────────────────────

  const onTabDragStart = (e: DragEvent, path: string): void => {
    dragPayload = { srcPaneId: pane.id, path }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', path)
  }

  const onTabBarDragOver = (e: DragEvent): void => {
    if (!dragPayload) return
    e.preventDefault()
    // Índice de inserción según la posición del mouse sobre las tabs.
    const strip = e.currentTarget as HTMLElement
    const tabsEls = Array.from(strip.querySelectorAll<HTMLElement>('.tab'))
    let idx = tabsEls.length
    for (let i = 0; i < tabsEls.length; i++) {
      const r = tabsEls[i].getBoundingClientRect()
      if (e.clientX < r.left + r.width / 2) {
        idx = i
        break
      }
    }
    setDragOverTab(idx)
  }

  const onTabBarDrop = (e: DragEvent): void => {
    e.preventDefault()
    const drag = dragPayload
    dragPayload = null
    const idx = dragOverTab
    setDragOverTab(null)
    if (!drag) return
    if (drag.srcPaneId === pane.id) {
      propsRef.current.onReorderTab(pane.id, drag.path, idx ?? pane.tabs.length)
    } else {
      // Mover la tab a este panel (equivale a soltar en el centro).
      propsRef.current.onDropTab(drag, pane.id, 'center')
    }
  }

  // ── Zonas de drop sobre el cuerpo del editor (split por borde) ──────────────

  const computeZone = (e: DragEvent): DropZone => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    const edge = 0.22
    const dl = x, dr = 1 - x, dt = y, db = 1 - y
    const min = Math.min(dl, dr, dt, db)
    if (min > edge) return 'center'
    if (min === dl) return 'left'
    if (min === dr) return 'right'
    if (min === dt) return 'top'
    return 'bottom'
  }

  const onBodyDragOver = (e: DragEvent): void => {
    if (!dragPayload) return
    e.preventDefault()
    setDropZone(computeZone(e))
  }

  const onBodyDrop = (e: DragEvent): void => {
    e.preventDefault()
    const drag = dragPayload
    dragPayload = null
    const zone = dropZone
    setDropZone(null)
    if (!drag || !zone) return
    propsRef.current.onDropTab(drag, pane.id, zone)
  }

  return (
    <div
      className={`epane${isActive ? ' active' : ''}`}
      onMouseDown={() => props.onFocusPane(pane.id)}
    >
      <div
        className="epane-tabbar"
        onDragOver={onTabBarDragOver}
        onDragLeave={() => setDragOverTab(null)}
        onDrop={onTabBarDrop}
      >
        {pane.tabs.map((path, i) => (
          <div
            key={path}
            className={`tab${path === pane.active ? ' active' : ''}${path === pane.preview ? ' preview' : ''}${path === pane.active && ghost ? ' ghost' : ''}${dragOverTab === i ? ' drop-before' : ''}`}
            title={path}
            draggable
            onDragStart={(e) => onTabDragStart(e, path)}
            onDragEnd={() => {
              dragPayload = null
              setDragOverTab(null)
            }}
            onClick={() => props.onSelectTab(pane.id, path)}
            onDoubleClick={() => props.onPinTab(pane.id, path)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                props.onCloseTab(pane.id, path)
              }
            }}
          >
            <span className="tab-label">{tabName(path)}</span>
            <button
              className="tab-close icon-btn"
              title="Cerrar"
              onClick={(e) => {
                e.stopPropagation()
                props.onCloseTab(pane.id, path)
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {dragOverTab === pane.tabs.length && <span className="tab-drop-end" />}
        <div className="epane-tabbar-actions">
          {pane.active && (
            <button
              className={`icon-btn${preview ? ' active' : ''}`}
              title={preview ? 'Editar' : 'Vista previa'}
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? <PenLine size={14} /> : <Eye size={14} />}
            </button>
          )}
          <button
            className="icon-btn"
            title={
              pane.active
                ? 'Dividir a la derecha (Ctrl+\\)'
                : 'Abrí una nota para dividir el panel'
            }
            disabled={!pane.active}
            onClick={() => props.onSplit(pane.id, 'row')}
          >
            <SplitSquareHorizontal size={14} />
          </button>
        </div>
      </div>

      <div
        className="epane-body"
        onDragOver={onBodyDragOver}
        onDragLeave={() => setDropZone(null)}
        onDrop={onBodyDrop}
      >
        {pane.active ? (
          ghost ? (
            <div className="placeholder ghost-note">
              <FileQuestion size={32} />
              <p className="ghost-note-title">Esta nota no existía todavía</p>
              <p className="ghost-note-body">
                En el momento que estás viendo, «{tabName(pane.active)}» aún no había sido creada.
              </p>
            </div>
          ) : preview ? (
            <MarkdownPreview source={content} />
          ) : (
            <CodeMirrorEditor
              ref={editorRef}
              reloadKey={`${pane.id}#${epoch}`}
              initialDoc={content}
              onChange={handleChange}
              onRequestAi={() => props.onRequestAi(pane.id)}
              extraExtensions={extraExtensions}
              readOnly={props.previewOid != null}
            />
          )
        ) : (
          <div className="placeholder">Panel vacío. Arrastrá una nota o cerralo.</div>
        )}
        {dropZone && dropZone !== 'center' && <div className={`drop-hint ${dropZone}`} />}
        {dropZone === 'center' && <div className="drop-hint center" />}
      </div>
    </div>
  )
}
