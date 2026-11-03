import { useEffect, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Link,
  Link2,
  Image as ImageIcon,
  Table,
  TableProperties,
  Minus,
  SquareCode
} from 'lucide-react'
import type { EditorHandle } from './editor/CodeMirrorEditor'
import {
  insertCodeBlock,
  insertLink,
  insertRule,
  insertTable,
  insertWikilink,
  tableAtCursor,
  toggleLinePrefix,
  toggleWrap,
  type Command,
  type TableAtCursor
} from './editor/formatting'

export interface FormatToolbarProps {
  /** Editor sobre el que actúan los botones (el del panel). */
  getEditor: () => EditorHandle | null
  /** Abre el editor visual sobre la tabla bajo el cursor. */
  onEditTable: (t: TableAtCursor) => void
  /** Imágenes elegidas con el botón de imagen (mismo flujo que pegar). */
  onPickImages: (files: File[]) => void
}

/** Filas × columnas máximas del selector de tabla nueva. */
const GRID = 8

/**
 * Barra de formato estilo procesador de texto, que escribe Markdown normal
 * (el archivo sigue siendo texto plano legible). Los botones usan onMouseDown
 * con preventDefault para NO robarle el foco ni la selección al editor.
 */
export function FormatToolbar({ getEditor, onEditTable, onPickImages }: FormatToolbarProps): JSX.Element {
  const [tableOpen, setTableOpen] = useState(false)
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [current, setCurrent] = useState<TableAtCursor | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLSpanElement>(null)

  // El menú de tabla se cierra al hacer click afuera o con Escape.
  useEffect(() => {
    if (!tableOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!tableRef.current?.contains(e.target as Node)) setTableOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setTableOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [tableOpen])

  const run = (cmd: Command): void => {
    getEditor()?.run(cmd)
  }

  const btn = (title: string, icon: ReactNode, cmd: Command): JSX.Element => (
    <button
      className="icon-btn fmt-btn"
      title={title}
      aria-label={title}
      onMouseDown={(e) => {
        e.preventDefault()
        run(cmd)
      }}
    >
      {icon}
    </button>
  )

  const openTableMenu = (): void => {
    // Al abrir, se mira si el cursor está dentro de una tabla (para "Editar").
    let found: TableAtCursor | null = null
    getEditor()?.run((view) => {
      found = tableAtCursor(view)
      return true
    })
    setCurrent(found)
    setHover({ r: 0, c: 0 })
    setTableOpen((v) => !v)
  }

  return (
    <div className="fmt-toolbar" role="toolbar" aria-label="Formato">
      {btn('Negrita (Ctrl+B)', <Bold size={15} />, toggleWrap('**'))}
      {btn('Cursiva (Ctrl+I)', <Italic size={15} />, toggleWrap('*'))}
      {btn('Tachado (Ctrl+Shift+X)', <Strikethrough size={15} />, toggleWrap('~~'))}
      {btn('Código (Ctrl+E)', <Code size={15} />, toggleWrap('`'))}
      <span className="fmt-sep" />
      {btn('Título 1', <Heading1 size={15} />, toggleLinePrefix({ heading: 1 }))}
      {btn('Título 2', <Heading2 size={15} />, toggleLinePrefix({ heading: 2 }))}
      {btn('Título 3', <Heading3 size={15} />, toggleLinePrefix({ heading: 3 }))}
      <span className="fmt-sep" />
      {btn('Lista', <List size={15} />, toggleLinePrefix('bullet'))}
      {btn('Lista numerada', <ListOrdered size={15} />, toggleLinePrefix('ordered'))}
      {btn('Lista de tareas', <ListTodo size={15} />, toggleLinePrefix('task'))}
      {btn('Cita', <Quote size={15} />, toggleLinePrefix('quote'))}
      <span className="fmt-sep" />
      {btn('Enlace web', <Link size={15} />, insertLink)}
      {btn('Enlace a otra nota ([[ ]])', <Link2 size={15} />, insertWikilink)}
      <button
        className="icon-btn fmt-btn"
        title="Imagen"
        aria-label="Insertar imagen"
        onMouseDown={(e) => {
          e.preventDefault()
          fileRef.current?.click()
        }}
      >
        <ImageIcon size={15} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onPickImages(files)
        }}
      />
      <span className="fmt-table" ref={tableRef}>
        <button
          className={`icon-btn fmt-btn${tableOpen ? ' active' : ''}`}
          title="Tabla"
          aria-label="Tabla"
          aria-expanded={tableOpen}
          onMouseDown={(e) => {
            e.preventDefault()
            openTableMenu()
          }}
        >
          <Table size={15} />
        </button>
        {tableOpen && (
          <div className="fmt-table-pop" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
            {current && (
              <button
                className="fmt-table-edit"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setTableOpen(false)
                  onEditTable(current)
                }}
              >
                <TableProperties size={14} /> Editar esta tabla…
              </button>
            )}
            <div className="fmt-grid-label">
              {hover.r > 0 ? `${hover.c} × ${hover.r}` : 'Insertar tabla (columnas × filas)'}
            </div>
            <div className="fmt-grid" style={{ gridTemplateColumns: `repeat(${GRID}, 16px)` }}>
              {Array.from({ length: GRID * GRID }, (_, i) => {
                const r = Math.floor(i / GRID) + 1
                const c = (i % GRID) + 1
                const on = r <= hover.r && c <= hover.c
                return (
                  <span
                    key={i}
                    className={`fmt-cell${on ? ' on' : ''}`}
                    onMouseEnter={() => setHover({ r, c })}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setTableOpen(false)
                      run(insertTable(c, r))
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}
      </span>
      <span className="fmt-sep" />
      {btn('Bloque de código', <SquareCode size={15} />, insertCodeBlock)}
      {btn('Línea separadora', <Minus size={15} />, insertRule)}
    </div>
  )
}
