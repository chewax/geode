import { EditorSelection, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { resolveShortcuts, toCodeMirrorKey, type ShortcutMap } from '@shared/shortcuts'
import {
  cellIndexAt,
  cellStartCol,
  emptyTable,
  findTableAt,
  formatTable,
  parseTable,
  type MdTable
} from '@shared/mdtable'
import { t } from '@shared/i18n'

/**
 * Comandos de formato Markdown para la barra de formato y los atajos. Cada uno
 * opera sobre el EditorView y devuelve true si actuó (convención CodeMirror).
 * Nunca hay "modo": todo es texto Markdown normal, el archivo sigue legible.
 */

export type Command = (view: EditorView) => boolean

/**
 * Envuelve (o desenvuelve) la selección con un marcador: `**`, `*`, `~~`, `` ` ``.
 * Sin selección, envuelve la palabra bajo el cursor o deja el cursor en medio.
 */
export function toggleWrap(marker: string): Command {
  return (view) => {
    if (view.state.readOnly) return false
    const m = marker.length
    const tr = view.state.changeByRange((range) => {
      const doc = view.state.doc
      let { from, to } = range
      if (from === to) {
        const word = view.state.wordAt(from)
        if (word) ({ from, to } = word)
      }
      const before = doc.sliceString(Math.max(0, from - m), from)
      const after = doc.sliceString(to, to + m)
      // Ya envuelto por fuera: quitar los marcadores.
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: from - m, to: from, insert: '' },
            { from: to, to: to + m, insert: '' }
          ],
          range: EditorSelection.range(from - m, to - m)
        }
      }
      // La selección incluye los marcadores: quitarlos.
      const inner = doc.sliceString(from, to)
      if (inner.length >= 2 * m && inner.startsWith(marker) && inner.endsWith(marker)) {
        return {
          changes: { from, to, insert: inner.slice(m, -m) },
          range: EditorSelection.range(from, to - 2 * m)
        }
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker }
        ],
        range: from === to ? EditorSelection.cursor(from + m) : EditorSelection.range(from + m, to + m)
      }
    })
    view.dispatch(tr, { scrollIntoView: true, userEvent: 'input.format' })
    view.focus()
    return true
  }
}

/** Líneas tocadas por la selección principal. */
function selectedLines(view: EditorView): { from: number; to: number }[] {
  const { doc, selection } = view.state
  const seen = new Set<number>()
  const out: { from: number; to: number }[] = []
  for (const r of selection.ranges) {
    for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) {
      if (seen.has(n)) continue
      seen.add(n)
      const l = doc.line(n)
      out.push({ from: l.from, to: l.to })
    }
  }
  return out
}

const LINE_PREFIX = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)?/

/**
 * Pone (o saca) un prefijo de bloque en cada línea seleccionada: `- `, `1. `,
 * `- [ ] `, `> `, `# `… Si todas las líneas ya lo tienen, se quita; si tienen
 * otro prefijo de bloque, se reemplaza (p. ej. lista → checklist).
 */
export function toggleLinePrefix(kind: 'bullet' | 'ordered' | 'task' | 'quote' | { heading: number }): Command {
  return (view) => {
    if (view.state.readOnly) return false
    const lines = selectedLines(view)
    const doc = view.state.doc
    const prefixFor = (i: number): string =>
      typeof kind === 'object'
        ? `${'#'.repeat(kind.heading)} `
        : kind === 'bullet'
          ? '- '
          : kind === 'ordered'
            ? `${i + 1}. `
            : kind === 'task'
              ? '- [ ] '
              : '> '
    const matches = (p: string): boolean => {
      if (typeof kind === 'object') return p.trim() === '#'.repeat(kind.heading)
      if (kind === 'bullet') return /^[-*+]\s+$/.test(p)
      if (kind === 'ordered') return /^\d+[.)]\s+$/.test(p)
      if (kind === 'task') return /^[-*+]\s+\[[ xX]\]\s+$/.test(p)
      return /^>\s?$/.test(p)
    }
    const info = lines.map((l) => {
      const text = doc.sliceString(l.from, l.to)
      const m = LINE_PREFIX.exec(text)!
      return { l, indent: m[1], prefix: m[2] ?? '' }
    })
    const allHave = info.every((x) => x.prefix && matches(x.prefix))
    const changes = info.map((x, i) => ({
      from: x.l.from + x.indent.length,
      to: x.l.from + x.indent.length + x.prefix.length,
      insert: allHave ? '' : prefixFor(i)
    }))
    view.dispatch({ changes, scrollIntoView: true, userEvent: 'input.format' })
    view.focus()
    return true
  }
}

/** Inserta un enlace Markdown: con selección la usa como texto; deja el cursor en la URL. */
export const insertLink: Command = (view) => {
  if (view.state.readOnly) return false
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to) || t('texto')
  const insert = `[${text}]()`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length - 1 },
    userEvent: 'input.format'
  })
  view.focus()
  return true
}

/** Inserta un enlace a nota `[[...]]` y abre el autocompletado. */
export const insertWikilink: Command = (view) => {
  if (view.state.readOnly) return false
  const { from, to } = view.state.selection.main
  const text = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: `[[${text}]]` },
    selection: { anchor: from + 2 + text.length },
    userEvent: 'input.format'
  })
  view.focus()
  return true
}

/** Inserta una línea horizontal. */
export const insertRule: Command = (view) => {
  if (view.state.readOnly) return false
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const insert = `${line.length ? '\n' : ''}\n---\n\n`
  view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length }, userEvent: 'input.format' })
  view.focus()
  return true
}

/** Inserta un bloque de código y deja el cursor adentro. */
export const insertCodeBlock: Command = (view) => {
  if (view.state.readOnly) return false
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  const line = view.state.doc.lineAt(from)
  const lead = from === line.from ? '' : '\n'
  const insert = `${lead}\`\`\`\n${sel}\n\`\`\`\n`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + lead.length + 4 + sel.length },
    userEvent: 'input.format'
  })
  view.focus()
  return true
}

/**
 * Bloque de fórmula LaTeX (`$$…$$`, centrado en la vista previa). La selección,
 * si hay, queda adentro; si no, se inserta una fórmula de ejemplo seleccionada
 * para escribir encima.
 */
export const insertMathBlock: Command = (view) => {
  if (view.state.readOnly) return false
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  const body = sel || 'x^2'
  const line = view.state.doc.lineAt(from)
  const lead = from === line.from ? '' : '\n'
  const start = from + lead.length + 3
  view.dispatch({
    changes: { from, to, insert: `${lead}$$\n${body}\n$$\n` },
    selection: EditorSelection.range(start, start + body.length),
    userEvent: 'input.format'
  })
  view.focus()
  return true
}

/**
 * Fórmula LaTeX dentro del texto (`$…$`). Con selección (o palabra bajo el
 * cursor) la envuelve o desenvuelve; sin nada, inserta `$x$` con la `x`
 * seleccionada. Una selección de varias líneas pasa a bloque `$$…$$`.
 */
export const insertInlineMath: Command = (view) => {
  if (view.state.readOnly) return false
  const { from, to, empty } = view.state.selection.main
  const doc = view.state.doc
  if (doc.lineAt(from).number !== doc.lineAt(to).number) return insertMathBlock(view)
  if (empty && !view.state.wordAt(from)) {
    view.dispatch({
      changes: { from, insert: '$x$' },
      selection: EditorSelection.range(from + 1, from + 2),
      userEvent: 'input.format'
    })
    view.focus()
    return true
  }
  return toggleWrap('$')(view)
}

// ── Tablas ───────────────────────────────────────────────────────────────────

/** Tabla bajo el cursor: rango en el documento + su contenido leído. */
export interface TableAtCursor {
  from: number
  to: number
  table: MdTable
  /** Fila del cursor: -1 = encabezado, 0.. = filas de datos. */
  row: number
  col: number
}

/** Tabla que contiene el cursor principal, o null. */
export function tableAtCursor(view: EditorView): TableAtCursor | null {
  const { doc } = view.state
  const head = view.state.selection.main.head
  const lineNo = doc.lineAt(head).number - 1
  // Sólo se mira una ventana alrededor del cursor (las tablas no son enormes).
  const start = Math.max(0, lineNo - 500)
  const end = Math.min(doc.lines - 1, lineNo + 500)
  const lines: string[] = []
  for (let n = start; n <= end; n++) lines.push(doc.line(n + 1).text)
  const range = findTableAt(lines, lineNo - start)
  if (!range) return null
  const table = parseTable(lines.slice(range.from, range.to + 1))
  if (!table) return null
  const fromLine = doc.line(start + range.from + 1)
  const toLine = doc.line(start + range.to + 1)
  const cursorLine = doc.lineAt(head)
  const idxInTable = lineNo - start - range.from
  return {
    from: fromLine.from,
    to: toLine.to,
    table,
    row: idxInTable === 0 ? -1 : idxInTable - 2,
    col: Math.min(cellIndexAt(cursorLine.text, head - cursorLine.from), table.header.length - 1)
  }
}

/** Reemplaza la tabla en [from,to] por `table` (alineada) y ubica el cursor en (row,col). */
export function writeTable(view: EditorView, from: number, to: number, table: MdTable, row: number, col: number): void {
  const text = formatTable(table)
  const lines = text.split('\n')
  const lineIdx = row < 0 ? 0 : row + 2
  let offset = 0
  for (let i = 0; i < lineIdx && i < lines.length; i++) offset += lines[i].length + 1
  // Se SELECCIONA el contenido de la celda destino (como en una planilla): tipear
  // lo reemplaza, y en una celda vacía queda el cursor listo para escribir.
  const line = lines[Math.min(lineIdx, lines.length - 1)]
  const start = cellStartCol(line, Math.max(0, col))
  let end = start
  while (end < line.length && !(line[end] === '|' && line[end - 1] !== '\\')) end++
  const segment = line.slice(start, end)
  // Celda vacía: cursor al principio (no al final del relleno).
  const contentStart = segment.trim() ? start + (segment.length - segment.trimStart().length) : start
  const contentEnd = contentStart + segment.trim().length
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + offset + contentStart, head: from + offset + contentEnd },
    scrollIntoView: true,
    userEvent: 'input.format'
  })
}

/**
 * Inserta una tabla nueva de cols×rows en su propio párrafo: con línea en blanco
 * antes y después (si no, Markdown puede pegarla al párrafo o lista anterior y no
 * reconocerla como tabla). Deja seleccionado el primer encabezado para escribirlo.
 */
export function insertTable(cols: number, rows: number): Command {
  return (view) => {
    if (view.state.readOnly) return false
    const doc = view.state.doc
    const line = doc.lineAt(view.state.selection.main.head)
    const empty = line.text.trim() === ''
    const at = empty ? line.from : line.to
    const prevNonEmpty = empty && line.number > 1 && doc.line(line.number - 1).text.trim() !== ''
    const lead = empty ? (prevNonEmpty ? '\n' : '') : '\n\n'
    const nextNonEmpty = line.number < doc.lines && doc.line(line.number + 1).text.trim() !== ''
    const trail = empty ? (nextNonEmpty ? '\n' : '') : '\n'
    const table = emptyTable(cols, rows)
    // Los encabezados de ejemplo los reemplaza el usuario: van en su idioma.
    table.header = table.header.map((_, i) => t('Columna {n}', { n: i + 1 }))
    const text = formatTable(table)
    const insert = `${lead}${text}${trail}`
    view.dispatch({
      changes: { from: at, to: empty ? line.to : at, insert },
      userEvent: 'input.format'
    })
    // Seleccionar el primer encabezado con la misma lógica que Tab.
    const tableFrom = at + lead.length
    writeTable(view, tableFrom, tableFrom + text.length, table, -1, 0)
    view.focus()
    return true
  }
}

/** Tab / Shift+Tab dentro de una tabla: re-alinea y salta a la celda siguiente/anterior. */
function moveCell(dir: 1 | -1): Command {
  return (view) => {
    if (view.state.readOnly) return false
    const cur = tableAtCursor(view)
    if (!cur) return false
    const cols = cur.table.header.length
    let { row, col } = cur
    col += dir
    if (col >= cols) {
      col = 0
      row++
    } else if (col < 0) {
      col = cols - 1
      row--
    }
    if (row < -1) return true // ya en la primera celda
    // Pasarse de la última celda agrega una fila (como en las planillas).
    if (row >= cur.table.rows.length) cur.table.rows.push(Array.from({ length: cols }, () => ''))
    writeTable(view, cur.from, cur.to, cur.table, row, col)
    return true
  }
}

/** Enter dentro de una tabla: nueva fila debajo, cursor en su primera celda. */
const tableEnter: Command = (view) => {
  if (view.state.readOnly) return false
  const cur = tableAtCursor(view)
  if (!cur || !view.state.selection.main.empty) return false
  const cols = cur.table.header.length
  const at = cur.row < 0 ? 0 : cur.row + 1
  cur.table.rows.splice(at, 0, Array.from({ length: cols }, () => ''))
  writeTable(view, cur.from, cur.to, cur.table, at, 0)
  return true
}

/**
 * Atajos de formato y de tablas (Ctrl/Cmd+B, I, Tab, Enter…). Los de formato
 * son reasignables: llegan como accelerators desde Ajustes → Atajos.
 */
export function formattingKeymap(bindings: ShortcutMap = resolveShortcuts(null)): Extension {
  return keymap.of([
    { key: toCodeMirrorKey(bindings.bold), run: toggleWrap('**'), preventDefault: true },
    { key: toCodeMirrorKey(bindings.italic), run: toggleWrap('*'), preventDefault: true },
    { key: toCodeMirrorKey(bindings.strikethrough), run: toggleWrap('~~'), preventDefault: true },
    { key: toCodeMirrorKey(bindings.inlineCode), run: toggleWrap('`'), preventDefault: true },
    // Tab/Enter sólo actúan dentro de tablas; si no, siguen su curso normal.
    { key: 'Tab', run: moveCell(1) },
    { key: 'Shift-Tab', run: moveCell(-1) },
    { key: 'Enter', run: tableEnter }
  ])
}
