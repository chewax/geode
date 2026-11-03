import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, DragEvent } from 'react'
import type { Extension } from '@codemirror/state'
import { X, Eye, PenLine, SplitSquareHorizontal, Columns2, FileQuestion, ImageOff, ExternalLink, File as FileIcon } from 'lucide-react'
import { extOf, isAttachmentPath, isImagePath, relativeFrom, vaultFileUrl } from '@shared/attachments'
import { PropertiesPanel } from './PropertiesPanel'
import { displayName, isNotePath } from '@shared/links'
import type { LeafPane, DropZone } from './paneTree'
import { CodeMirrorEditor, type EditorHandle } from './editor/CodeMirrorEditor'
import { MarkdownPreview } from './MarkdownPreview'
import { FormatToolbar } from './FormatToolbar'
import { TableEditor } from './TableEditor'
import { writeTable, type TableAtCursor } from './editor/formatting'
import { PREF_FORMAT_TOOLBAR, useBoolPref } from './prefs'
import { t } from '@shared/i18n'
import { labelOf, useShortcuts } from './shortcuts'

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
  /** Otro panel editó `path`: si este panel la muestra, se actualiza en vivo. */
  syncFromOtherPane(path: string, doc: string): void
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
  /** Divide el panel con la vista previa en vivo de la misma nota a la derecha. */
  onPreviewBeside: (paneId: string) => void
  onNoteOpen: (paneId: string, path: string, content: string) => void
  onNoteChange: (paneId: string, path: string, content: string) => void
  onSaved: (paneId: string) => void
  onRequestAi: (paneId: string) => void
  registerHandle: (paneId: string, handle: PaneHandle | null) => void
  /** oid en preview; null/undefined = presente en vivo. Al fijarse, el panel
   *  carga su contenido del árbol del commit (solo lectura) en vez del disco. */
  previewOid?: string | null
  /** Archivos de la bóveda (notas + imágenes) para resolver/autocompletar enlaces. */
  files: string[]
  /** Abre (o crea) el destino de un enlace `[[...]]` escrito en `fromPath`. */
  onOpenLink: (target: string, fromPath: string) => void
  /** Aviso breve al usuario (errores al pegar imágenes). */
  onNotify: (message: string) => void
  /** Click/Ctrl+click en una etiqueta `#tag`: buscar notas con esa etiqueta. */
  onOpenTag: (tag: string) => void
  /** Bóveda de Obsidian con wikilinks: las imágenes pegadas se insertan como `![[x]]`. */
  useWikilinks: boolean
}

const AUTOSAVE_MS = 600

/** Nombre visible de una tab (nota sin extensión, o el archivo con su extensión). */
function tabName(path: string): string {
  return displayName(path)
}

/** Un panel del área de edición: barra de tabs + editor (o vista previa). */
export function EditorPane(props: EditorPaneProps): JSX.Element {
  const { pane, isActive, reloadNonce, extraExtensions } = props
  const { bindings: shortcutBindings } = useShortcuts()
  const [content, setContent] = useState('')
  const [epoch, setEpoch] = useState(0)
  const [preview, setPreview] = useState(false)
  // La nota activa no existía en el commit en preview → tab fantasma (SOFT-03).
  const [ghost, setGhost] = useState(false)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const [dragOverTab, setDragOverTab] = useState<number | null>(null)
  /** Tabla abierta en el editor visual (null = cerrado). */
  const [editingTable, setEditingTable] = useState<TableAtCursor | null>(null)
  const [showToolbar] = useBoolPref(PREF_FORMAT_TOOLBAR, true)
  /** Ver el YAML de propiedades como texto en el editor (por defecto oculto). */
  const [showRawYaml, setShowRawYaml] = useState(false)
  /** Pedido de "agregar propiedad" desde la barra de formato. */
  const [addPropNonce, setAddPropNonce] = useState(0)

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
      isPreview: () => previewRef.current,
      syncFromOtherPane: (path, doc) => {
        if (propsRef.current.pane.active !== path) return
        // Lo que tipeó el otro panel es lo más nuevo: este panel no debe volver a
        // escribir su copia vieja al disco (se pisarían entre sí).
        if (pendingRef.current?.path === path) {
          pendingRef.current = null
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current)
            timerRef.current = null
          }
        }
        setContent(doc)
        editorRef.current?.syncDoc(doc)
      }
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
      // Los adjuntos no se leen como texto: se muestran por el protocolo de la bóveda.
      if (isAttachmentPath(pane.active)) {
        if (!cancelled) {
          setGhost(false)
          setContent('')
        }
        return
      }
      try {
        // En preview leemos del árbol del commit; si no, del disco.
        const text = previewOid
          ? await window.geode.git.readNoteAt(previewOid, pane.active)
          : await window.geode.vault.readNote(pane.active)
        if (cancelled) return
        if (text === null) {
          // La nota no existía en ese momento del pasado → fantasma.
          setGhost(true)
          return
        }
        setGhost(false)
        setContent(text)
        setEpoch((e) => e + 1)
        propsRef.current.onNoteOpen(pane.id, pane.active, text)
      } catch {
        // Error real de lectura (no "no existía"): también se muestra como fantasma.
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

  /** Lee otra nota para `![[nota]]` (del pasado si se está viajando en el tiempo). */
  const loadNote = useCallback((path: string): Promise<string> => {
    const oid = propsRef.current.previewOid
    if (!oid) return window.geode.vault.readNote(path)
    return window.geode.git.readNoteAt(oid, path).then((text) => {
      if (text === null) throw new Error(t('La nota no existía en ese momento'))
      return text
    })
  }, [])

  /**
   * Reemplaza el texto de la nota por `next` tocando sólo lo que cambió al
   * principio (el bloque de propiedades): cursor, scroll y Ctrl+Z se conservan.
   */
  const applyWholeText = (next: string): void => {
    editorRef.current?.run((view) => {
      const cur = view.state.doc.toString()
      if (cur === next) return true
      let end = 0
      // Sufijo común: el cuerpo de la nota no cambia al editar propiedades.
      while (end < cur.length && end < next.length && cur[cur.length - 1 - end] === next[next.length - 1 - end]) end++
      view.dispatch({
        changes: { from: 0, to: cur.length - end, insert: next.slice(0, next.length - end) },
        userEvent: 'input.properties'
      })
      return true
    })
  }

  /** Guarda imágenes pegadas/soltadas como adjuntos y arma su Markdown. */
  const pasteFiles = async (files: File[]): Promise<string | null> => {
    const notePath = propsRef.current.pane.active
    if (!notePath || propsRef.current.previewOid != null) return null
    const parts: string[] = []
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const rel = await window.geode.vault.saveAttachment(file.name || 'image.png', bytes, notePath)
        const alt = displayName(rel).replace(/\.[^.]+$/, '')
        // En bóvedas de Obsidian se respeta su estilo de enlace (por defecto `![[x]]`).
        parts.push(
          propsRef.current.useWikilinks
            ? `![[${displayName(rel)}]]`
            : `![${alt}](${relativeFrom(notePath, rel)})`
        )
      } catch (e) {
        propsRef.current.onNotify(e instanceof Error ? e.message : t('No se pudo guardar la imagen'))
      }
    }
    return parts.length ? parts.join('\n') : null
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
              title={t('Cerrar')}
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
          {pane.active && !isImagePath(pane.active) && (
            <button
              className={`icon-btn${preview ? ' active' : ''}`}
              title={preview ? t('Editar') : t('Vista previa')}
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? <PenLine size={14} /> : <Eye size={14} />}
            </button>
          )}
          {pane.active && isNotePath(pane.active) && !preview && (
            <button
              className="icon-btn"
              title={t('Vista previa al lado (se actualiza mientras escribís)')}
              aria-label={t('Vista previa al lado')}
              onClick={() => props.onPreviewBeside(pane.id)}
            >
              <Columns2 size={14} />
            </button>
          )}
          <button
            className="icon-btn"
            title={
              pane.active
                ? t('Dividir a la derecha ({key})', { key: labelOf('splitRight', shortcutBindings) })
                : t('Abrí una nota para dividir el panel')
            }
            disabled={!pane.active}
            onClick={() => props.onSplit(pane.id, 'row')}
          >
            <SplitSquareHorizontal size={14} />
          </button>
        </div>
      </div>

      {showToolbar && pane.active && !ghost && !preview && !isAttachmentPath(pane.active) && props.previewOid == null && (
        <FormatToolbar
          getEditor={() => editorRef.current}
          onAddProperty={() => setAddPropNonce((n) => n + 1)}
          onEditTable={setEditingTable}
          onPickImages={(files) => {
            void pasteFiles(files).then((md) => {
              if (md) editorRef.current?.insertAtCursor(md)
            })
          }}
        />
      )}

      {editingTable && (
        <TableEditor
          table={editingTable.table}
          onClose={() => {
            setEditingTable(null)
            editorRef.current?.focus()
          }}
          onSave={(table) => {
            const { from, to } = editingTable
            setEditingTable(null)
            editorRef.current?.run((view) => {
              writeTable(view, from, to, table, -1, 0)
              view.focus()
              return true
            })
          }}
        />
      )}

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
              <p className="ghost-note-title">{t('Esta nota no existía todavía')}</p>
              <p className="ghost-note-body">
                {t('En el momento que estás viendo, «{name}» aún no había sido creada.', { name: tabName(pane.active) })}
              </p>
            </div>
          ) : isImagePath(pane.active) ? (
            <ImageView path={pane.active} previewOid={props.previewOid ?? null} />
          ) : isAttachmentPath(pane.active) ? (
            <AttachmentView path={pane.active} previewOid={props.previewOid ?? null} onNotify={props.onNotify} />
          ) : preview ? (
            <MarkdownPreview
              source={content}
              notePath={pane.active}
              files={props.files}
              previewOid={props.previewOid ?? null}
              onOpenLink={(target) => pane.active && props.onOpenLink(target, pane.active)}
              onOpenTag={props.onOpenTag}
              loadNote={loadNote}
            />
          ) : (
            <div className="editor-stack">
            {props.previewOid == null && (
              <PropertiesPanel
                content={content}
                showRaw={showRawYaml}
                onToggleRaw={() => setShowRawYaml((v) => !v)}
                addNonce={addPropNonce}
                onOpenTag={props.onOpenTag}
                onChange={(next) => applyWholeText(next)}
              />
            )}
            <CodeMirrorEditor
              ref={editorRef}
              reloadKey={`${pane.id}#${epoch}`}
              initialDoc={content}
              onChange={handleChange}
              onRequestAi={() => props.onRequestAi(pane.id)}
              extraExtensions={extraExtensions}
              readOnly={props.previewOid != null}
              linkEnv={{
                files: () => propsRef.current.files,
                open: (target) => {
                  const from = propsRef.current.pane.active
                  if (from) propsRef.current.onOpenLink(target, from)
                },
                openTag: (tag) => propsRef.current.onOpenTag(tag)
              }}
              onPasteFiles={pasteFiles}
              hideFrontmatter={!showRawYaml}
            />
            </div>
          )
        ) : (
          <div className="placeholder">{t('Panel vacío. Arrastrá una nota o cerralo.')}</div>
        )}
        {dropZone && dropZone !== 'center' && <div className={`drop-hint ${dropZone}`} />}
        {dropZone === 'center' && <div className="drop-hint center" />}
      </div>
    </div>
  )
}

/** Visor de una imagen de la bóveda (con fallback si no existe en esa versión). */
function ImageView({ path, previewOid }: { path: string; previewOid: string | null }): JSX.Element {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [path, previewOid])
  if (broken) {
    return (
      <div className="placeholder ghost-note">
        <ImageOff size={32} />
        <p className="ghost-note-title">{t('No se pudo mostrar la imagen')}</p>
        <p className="ghost-note-body">{t('«{name}» no existe en este momento o no es una imagen válida.', { name: displayName(path) })}</p>
      </div>
    )
  }
  return (
    <div className="image-view">
      <img src={vaultFileUrl(path, previewOid)} alt={displayName(path)} onError={() => setBroken(true)} />
    </div>
  )
}

/** Visor de otros adjuntos: PDF embebido, audio/video con reproductor, o abrir afuera. */
function AttachmentView({
  path,
  previewOid,
  onNotify
}: {
  path: string
  previewOid: string | null
  onNotify: (m: string) => void
}): JSX.Element {
  const ext = extOf(path)
  const url = vaultFileUrl(path, previewOid)
  const openOutside = (): void => {
    window.geode.vault.openExternal(path).catch((e) => onNotify(e instanceof Error ? e.message : t('No se pudo abrir')))
  }
  return (
    <div className="attachment-view">
      {ext === 'pdf' ? (
        <iframe className="attachment-pdf" src={url} title={displayName(path)} />
      ) : ['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext) ? (
        <audio controls src={url} />
      ) : ['mp4', 'webm', 'mov'].includes(ext) ? (
        <video controls src={url} className="attachment-video" />
      ) : (
        <div className="placeholder ghost-note">
          <FileIcon size={32} />
          <p className="ghost-note-title">{displayName(path)}</p>
        </div>
      )}
      <button className="attachment-open" onClick={openOutside}>
        <ExternalLink size={14} /> {t('Abrir con la aplicación del sistema')}
      </button>
    </div>
  )
}
