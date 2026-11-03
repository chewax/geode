import { foldQuery, foldWithMap } from './search'
import { baseName, displayName } from './links'

/**
 * Búsqueda difusa de notas por nombre (Ctrl+O). Módulo PURO.
 *
 * Una consulta coincide si sus letras aparecen EN ORDEN en el nombre o la ruta
 * (sin tildes ni mayúsculas): "lgeo" encuentra "Lanzamiento de Geode". El
 * puntaje premia, en ese orden: coincidir en el nombre (no sólo en la carpeta),
 * letras seguidas, letras al inicio de una palabra y nombres cortos.
 */
export interface FuzzyHit {
  path: string
  score: number
  /** Posiciones (en `displayName(path)`) de las letras que coincidieron, para resaltarlas. */
  nameHits: number[]
}

/** Puntaje de `query` (plegada) dentro de `text`; null si no coincide. */
function scoreIn(text: string, query: string): { score: number; hits: number[] } | null {
  const { folded, map } = foldWithMap(text)
  let score = 0
  let qi = 0
  let prev = -2
  const hits: number[] = []
  for (let i = 0; i < folded.length && qi < query.length; i++) {
    if (folded[i] !== query[qi]) continue
    const wordStart = i === 0 || /[\s\-_/.()[\]]/.test(folded[i - 1])
    score += 1
    if (i === prev + 1) score += 3 // letras seguidas
    if (wordStart) score += 4 // inicio de palabra
    if (i === 0) score += 2 // inicio del texto
    hits.push(map[i])
    prev = i
    qi++
  }
  if (qi < query.length) return null
  return { score, hits }
}

/** Ordena `paths` por cuánto se parecen a `query`. Sin consulta, devuelve [] (el que llama decide). */
export function fuzzyNotes(paths: string[], query: string, limit = 50): FuzzyHit[] {
  const q = foldQuery(query).replace(/\s+/g, ' ')
  if (!q) return []
  const out: FuzzyHit[] = []
  for (const path of paths) {
    const name = displayName(path)
    const inName = scoreIn(name, q)
    if (inName) {
      // Bonus por coincidir en el nombre, y por nombre exacto o que empieza igual.
      const foldedName = foldQuery(name)
      let score = inName.score + 20 - Math.min(name.length, 40) * 0.1
      if (foldedName === q) score += 50
      else if (foldedName.startsWith(q)) score += 15
      out.push({ path, score, nameHits: inName.hits })
      continue
    }
    const inPath = scoreIn(path, q)
    if (inPath) out.push({ path, score: inPath.score - Math.min(path.length, 80) * 0.1, nameHits: [] })
  }
  out.sort((a, b) => b.score - a.score || baseName(a.path).length - baseName(b.path).length || a.path.localeCompare(b.path))
  return out.slice(0, limit)
}
