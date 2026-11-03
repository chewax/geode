import { useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Rows3,
  Table,
  Trash2
} from 'lucide-react'
import type { Align, MdTable } from '@shared/mdtable'
import { t } from '@shared/i18n'

export interface TableEditorProps {
  table: MdTable
  onSave: (table: MdTable) => void
  onClose: () => void
}

const ALIGN_NEXT: Record<string, Align> = { null: 'left', left: 'center', center: 'right', right: null }

/** Copia profunda (el editor trabaja sobre su propia copia hasta "Aplicar"). */
function clone(t: MdTable): MdTable {
  return { header: [...t.header], align: [...t.align], rows: t.rows.map((r) => [...r]) }
}

/**
 * Editor visual de tablas, tipo planilla: editar celdas, agregar/quitar/mover
 * filas y columnas y alinear. Al aplicar, la tabla se escribe como Markdown
 * alineado en el mismo lugar de la nota (Ctrl+Z en el editor lo deshace).
 */
export function TableEditor({ table, onSave, onClose }: TableEditorProps): JSX.Element {
  const [tbl, setTbl] = useState<MdTable>(() => clone(table))
  const gridRef = useRef<HTMLDivElement>(null)
  const cols = tbl.header.length

  useEffect(() => {
    gridRef.current?.querySelector<HTMLInputElement>('input')?.focus()
  }, [])

  const update = (fn: (draft: MdTable) => void): void =>
    setTbl((prev) => {
      const next = clone(prev)
      fn(next)
      return next
    })

  const setCell = (row: number, col: number, value: string): void =>
    update((d) => {
      // `|` y saltos de línea romperían la tabla: se escapan / aplanan.
      const v = value.replace(/\n/g, ' ').replace(/(?<!\\)\|/g, '\\|')
      if (row < 0) d.header[col] = v
      else d.rows[row][col] = v
    })

  const addRow = (at: number): void => update((d) => d.rows.splice(at, 0, Array.from({ length: cols }, () => '')))
  const delRow = (at: number): void => update((d) => d.rows.splice(at, 1))
  const moveRow = (at: number, dir: -1 | 1): void =>
    update((d) => {
      const to = at + dir
      if (to < 0 || to >= d.rows.length) return
      ;[d.rows[at], d.rows[to]] = [d.rows[to], d.rows[at]]
    })
  const addCol = (at: number): void =>
    update((d) => {
      d.header.splice(at, 0, t('Columna {n}', { n: d.header.length + 1 }))
      d.align.splice(at, 0, null)
      d.rows.forEach((r) => r.splice(at, 0, ''))
    })
  const delCol = (at: number): void =>
    update((d) => {
      if (d.header.length <= 1) return
      d.header.splice(at, 1)
      d.align.splice(at, 1)
      d.rows.forEach((r) => r.splice(at, 1))
    })
  const moveCol = (at: number, dir: -1 | 1): void =>
    update((d) => {
      const to = at + dir
      if (to < 0 || to >= d.header.length) return
      const swap = <T,>(a: T[]): void => {
        ;[a[at], a[to]] = [a[to], a[at]]
      }
      swap(d.header)
      swap(d.align)
      d.rows.forEach(swap)
    })
  const cycleAlign = (at: number): void => update((d) => (d.align[at] = ALIGN_NEXT[String(d.align[at])]))

  /** Enter baja a la celda de abajo (agrega fila al final), como en una planilla. */
  const onCellKey = (e: KeyboardEvent<HTMLInputElement>, row: number, col: number): void => {
    if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (row + 1 >= tbl.rows.length) addRow(tbl.rows.length)
      window.setTimeout(() => {
        gridRef.current?.querySelector<HTMLInputElement>(`input[data-cell="${row + 1}:${col}"]`)?.focus()
      }, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSave(tbl)
    }
  }

  const unescape = (s: string): string => s.replace(/\\\|/g, '|')
  const AlignIcon = (a: Align): JSX.Element =>
    a === 'center' ? <AlignCenter size={13} /> : a === 'right' ? <AlignRight size={13} /> : <AlignLeft size={13} />

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal table-editor"
        role="dialog"
        aria-modal="true"
        aria-label={t('Editar tabla')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <h2>
          <Table size={18} /> {t('Editar tabla')}
        </h2>
        <p className="modal-sub">
          {t('Enter baja a la celda de abajo · Ctrl+Enter aplica · los cambios se pueden deshacer con Ctrl+Z en la nota.')}
        </p>

        <div className="te-scroll">
          <div className="te-grid" ref={gridRef} style={{ gridTemplateColumns: `28px repeat(${cols}, minmax(120px, 1fr))` }}>
            {/* Fila de controles de columna */}
            <span />
            {tbl.header.map((_, c) => (
              <div key={`ctl-${c}`} className="te-colctl">
                <button className="icon-btn" title={t('Alineación')} onClick={() => cycleAlign(c)}>
                  {AlignIcon(tbl.align[c])}
                </button>
                <button className="icon-btn" title={t('Mover a la izquierda')} disabled={c === 0} onClick={() => moveCol(c, -1)}>
                  <ArrowLeft size={13} />
                </button>
                <button className="icon-btn" title={t('Mover a la derecha')} disabled={c === cols - 1} onClick={() => moveCol(c, 1)}>
                  <ArrowRight size={13} />
                </button>
                <button className="icon-btn" title={t('Agregar columna a la derecha')} onClick={() => addCol(c + 1)}>
                  <Columns3 size={13} />
                </button>
                <button className="icon-btn danger-ghost" title={t('Quitar columna')} disabled={cols <= 1} onClick={() => delCol(c)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {/* Encabezado */}
            <span className="te-rowno">#</span>
            {tbl.header.map((h, c) => (
              <input
                key={`h-${c}`}
                className={`te-cell te-head align-${tbl.align[c] ?? 'left'}`}
                data-cell={`-1:${c}`}
                value={unescape(h)}
                aria-label={t('Encabezado de la columna {n}', { n: c + 1 })}
                onChange={(e) => setCell(-1, c, e.target.value)}
                onKeyDown={(e) => onCellKey(e, -1, c)}
              />
            ))}

            {/* Filas */}
            {tbl.rows.map((row, r) => (
              <RowCells
                key={`r-${r}`}
                row={row}
                r={r}
                total={tbl.rows.length}
                align={tbl.align}
                unescape={unescape}
                onChange={setCell}
                onKey={onCellKey}
                onMove={moveRow}
                onDelete={delRow}
                onAdd={addRow}
              />
            ))}
          </div>
        </div>

        <div className="te-actions">
          <button onClick={() => addRow(tbl.rows.length)}>
            <Rows3 size={14} /> {t('Agregar fila')}
          </button>
          <button onClick={() => addCol(cols)}>
            <Columns3 size={14} /> {t('Agregar columna')}
          </button>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>{t('Cancelar')}</button>
          <button className="primary" onClick={() => onSave(tbl)}>
            {t('Aplicar')}
          </button>
        </div>
      </div>
    </div>
  )
}

function RowCells(props: {
  row: string[]
  r: number
  total: number
  align: Align[]
  unescape: (s: string) => string
  onChange: (r: number, c: number, v: string) => void
  onKey: (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => void
  onMove: (r: number, dir: -1 | 1) => void
  onDelete: (r: number) => void
  onAdd: (at: number) => void
}): JSX.Element {
  const { row, r, total, align, unescape, onChange, onKey, onMove, onDelete, onAdd } = props
  return (
    <>
      <div className="te-rowctl">
        <span className="te-rowno">{r + 1}</span>
        <div className="te-rowmenu">
          <button className="icon-btn" title={t('Subir fila')} disabled={r === 0} onClick={() => onMove(r, -1)}>
            <ArrowUp size={12} />
          </button>
          <button className="icon-btn" title={t('Bajar fila')} disabled={r === total - 1} onClick={() => onMove(r, 1)}>
            <ArrowDown size={12} />
          </button>
          <button className="icon-btn" title={t('Agregar fila debajo')} onClick={() => onAdd(r + 1)}>
            <Rows3 size={12} />
          </button>
          <button className="icon-btn danger-ghost" title={t('Quitar fila')} onClick={() => onDelete(r)}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {row.map((cell, c) => (
        <input
          key={`c-${r}-${c}`}
          className={`te-cell align-${align[c] ?? 'left'}`}
          data-cell={`${r}:${c}`}
          value={unescape(cell)}
          aria-label={t('Fila {row}, columna {col}', { row: r + 1, col: c + 1 })}
          onChange={(e) => onChange(r, c, e.target.value)}
          onKeyDown={(e) => onKey(e, r, c)}
        />
      ))}
    </>
  )
}
