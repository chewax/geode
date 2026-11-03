/**
 * Búsqueda de texto completo, PURA (sin Node): la usa el main sobre cada nota y
 * se testea aislada. Ignora mayúsculas y tildes ("cancion" encuentra "Canción"),
 * algo natural en español, pero devuelve las posiciones del texto ORIGINAL.
 */

/** Una coincidencia dentro de una nota, lista para mostrar resaltada. */
export interface SearchMatch {
  /** Línea (0-based). */
  line: number
  /** Columna (0-based) del inicio de la coincidencia dentro de la línea. */
  col: number
  /** Largo de la coincidencia en el texto original. */
  length: number
  /** Contexto previo (recortado), la coincidencia y el contexto posterior. */
  before: string
  text: string
  after: string
}

/** Pliega un carácter: sin tildes/diacríticos y en minúsculas. */
function foldChar(ch: string): string {
  return ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Pliega un texto y devuelve, para cada posición del plegado, el índice del
 * carácter original del que salió (así se mapean las coincidencias de vuelta).
 */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    // Pares sustitutos (emojis, etc.): se copian tal cual, sin plegar.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      folded += text[i] + text[i + 1]
      map.push(i, i + 1)
      i++
      continue
    }
    const f = foldChar(text[i])
    for (let k = 0; k < f.length; k++) {
      folded += f[k]
      map.push(i)
    }
  }
  return { folded, map }
}

/** Pliega una consulta del usuario igual que el texto. */
export function foldQuery(query: string): string {
  return foldWithMap(query.trim()).folded
}

const CONTEXT = 40

/**
 * Busca `query` (ya plegada con foldQuery) en `content`, línea por línea.
 * Devuelve hasta `limit` coincidencias.
 */
export function searchText(content: string, foldedQuery: string, limit = 20): SearchMatch[] {
  if (!foldedQuery) return []
  const matches: SearchMatch[] = []
  const lines = content.split('\n')
  for (let ln = 0; ln < lines.length && matches.length < limit; ln++) {
    const line = lines[ln]
    const { folded, map } = foldWithMap(line)
    let idx = folded.indexOf(foldedQuery)
    while (idx !== -1 && matches.length < limit) {
      const start = map[idx]
      const endFolded = idx + foldedQuery.length - 1
      const end = (map[endFolded] ?? line.length - 1) + 1
      const ctxStart = Math.max(0, start - CONTEXT)
      matches.push({
        line: ln,
        col: start,
        length: end - start,
        before: (ctxStart > 0 ? '…' : '') + line.slice(ctxStart, start).trimStart(),
        text: line.slice(start, end),
        after: line.slice(end, end + CONTEXT * 2) + (end + CONTEXT * 2 < line.length ? '…' : '')
      })
      idx = folded.indexOf(foldedQuery, idx + Math.max(1, foldedQuery.length))
    }
  }
  return matches
}
