/**
 * Tablas Markdown (GFM): leer, escribir y alinear. Módulo PURO, compartido por
 * el editor (Tab entre celdas, re-alineado) y el editor visual de tablas.
 *
 *   | Nombre | Edad |
 *   | :----- | ---: |
 *   | Ana    |   30 |
 *
 * Las celdas pueden contener `\|` (pipe escapado) y código en línea con pipes.
 */

export type Align = 'left' | 'center' | 'right' | null

export interface MdTable {
  header: string[]
  align: Align[]
  rows: string[][]
}

/** Separa una fila `| a | b |` en celdas, respetando `\|` y el código en línea. */
export function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  let inCode = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && s[i + 1] === '|') {
      cur += '\\|'
      i++
    } else if (c === '`') {
      inCode = !inCode
      cur += c
    } else if (c === '|' && !inCode) {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur.trim())
  return cells
}

/** true si la línea es el separador de encabezado (`| --- | :-: |`). */
export function isDelimiterRow(line: string): boolean {
  if (!line.includes('-')) return false
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')))
}

/** true si la línea parece una fila de tabla (tiene al menos un pipe). */
export function isRowLine(line: string): boolean {
  return line.trim().length > 0 && line.includes('|')
}

function parseAlign(cell: string): Align {
  const c = cell.replace(/\s/g, '')
  const l = c.startsWith(':')
  const r = c.endsWith(':')
  return l && r ? 'center' : r ? 'right' : l ? 'left' : null
}

/** Lee una tabla desde sus líneas (encabezado, separador, filas). null si no es tabla. */
export function parseTable(lines: string[]): MdTable | null {
  if (lines.length < 2 || !isRowLine(lines[0]) || !isDelimiterRow(lines[1])) return null
  const header = splitRow(lines[0])
  const width = header.length
  const align = splitRow(lines[1]).map(parseAlign)
  const norm = (cells: string[]): string[] =>
    Array.from({ length: width }, (_, i) => cells[i] ?? '')
  return {
    header,
    align: Array.from({ length: width }, (_, i) => align[i] ?? null),
    rows: lines.slice(2).filter(isRowLine).map((l) => norm(splitRow(l)))
  }
}

/** Ancho visible de un texto (los caracteres combinados/emojis cuentan como 1). */
function visualWidth(s: string): number {
  return [...s.normalize('NFC')].length
}

function pad(text: string, width: number, align: Align): string {
  const gap = width - visualWidth(text)
  if (gap <= 0) return text
  if (align === 'right') return ' '.repeat(gap) + text
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + text + ' '.repeat(gap - left)
  }
  return text + ' '.repeat(gap)
}

/** Escribe la tabla como Markdown con las columnas alineadas (legible en texto plano). */
export function formatTable(t: MdTable): string {
  const cols = Math.max(t.header.length, 1)
  const cell = (row: string[], i: number): string => (row[i] ?? '').replace(/\n/g, ' ')
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(3, visualWidth(cell(t.header, i)), ...t.rows.map((r) => visualWidth(cell(r, i))))
  )
  const line = (row: string[]): string =>
    `| ${widths.map((w, i) => pad(cell(row, i), w, t.align[i] ?? null)).join(' | ')} |`
  const delim = `| ${widths
    .map((w, i) => {
      const a = t.align[i] ?? null
      if (a === 'center') return `:${'-'.repeat(w - 2)}:`
      if (a === 'right') return `${'-'.repeat(w - 1)}:`
      if (a === 'left') return `:${'-'.repeat(w - 1)}`
      return '-'.repeat(w)
    })
    .join(' | ')} |`
  return [line(t.header), delim, ...t.rows.map(line)].join('\n')
}

/** Tabla vacía de `cols` columnas y `rows` filas de datos. */
export function emptyTable(cols: number, rows: number): MdTable {
  return {
    header: Array.from({ length: cols }, (_, i) => `Columna ${i + 1}`),
    align: Array.from({ length: cols }, () => null),
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''))
  }
}

/**
 * Busca la tabla que contiene la línea `lineNo` (0-based) dentro de `lines`.
 * Devuelve el rango de líneas [from, to] (inclusive) o null si no está en una tabla.
 */
export function findTableAt(lines: string[], lineNo: number): { from: number; to: number } | null {
  if (lineNo < 0 || lineNo >= lines.length || !isRowLine(lines[lineNo])) return null
  let from = lineNo
  while (from > 0 && isRowLine(lines[from - 1])) from--
  let to = lineNo
  while (to < lines.length - 1 && isRowLine(lines[to + 1])) to++
  // Puede haber texto con pipes pegado arriba: el encabezado es la línea previa
  // al primer separador del bloque.
  for (let i = from; i < to; i++) {
    if (isDelimiterRow(lines[i + 1]) && !isDelimiterRow(lines[i])) {
      if (lineNo < i) return null
      return parseTable(lines.slice(i, to + 1)) ? { from: i, to } : null
    }
  }
  return null
}

/**
 * Índice de columna (0-based) del cursor dentro de una fila, contando los pipes
 * no escapados que hay antes de `col`.
 */
export function cellIndexAt(line: string, col: number): number {
  const before = line.slice(0, col)
  const trimmedStart = line.length - line.trimStart().length
  let count = 0
  let inCode = false
  for (let i = trimmedStart; i < before.length; i++) {
    const c = before[i]
    if (c === '\\' && before[i + 1] === '|') {
      i++
      continue
    }
    if (c === '`') inCode = !inCode
    if (c === '|' && !inCode) count++
  }
  // Una fila que empieza con '|' tiene ese primer pipe antes de la celda 0.
  return line.trimStart().startsWith('|') ? Math.max(0, count - 1) : count
}

/**
 * Posición (columna en la línea formateada) del inicio del contenido de la
 * celda `index`, para ubicar el cursor tras re-alinear.
 */
export function cellStartCol(formattedLine: string, index: number): number {
  let seen = -1
  for (let i = 0; i < formattedLine.length; i++) {
    if (formattedLine[i] === '\\' && formattedLine[i + 1] === '|') {
      i++
      continue
    }
    if (formattedLine[i] === '|') {
      seen++
      if (seen === index) return Math.min(i + 2, formattedLine.length)
    }
  }
  return formattedLine.length
}
