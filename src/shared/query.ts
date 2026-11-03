import { extractTags, readProperties, tagMatches, type PropValue, type Property } from './obsidian'
import { foldQuery } from './search'

/**
 * Consultas de búsqueda con filtros (módulo PURO).
 *
 *   estado:pendiente          la propiedad `estado` contiene "pendiente"
 *   cliente:"Acme Corp"       valores con espacios, entre comillas
 *   fecha:>2026-01-01         comparaciones >, >=, <, <= (números y fechas AAAA-MM-DD)
 *   prioridad:                la nota tiene la propiedad `prioridad` (con cualquier valor)
 *   #trabajo                  tiene la etiqueta (o una hija: #trabajo/urgente)
 *   -estado:hecho  -#archivo  negación: excluye las que cumplen
 *
 * Lo que no es filtro se busca como texto, igual que antes. Las mayúsculas y
 * tildes no importan. Las URLs (`https://…`) nunca se toman como filtro.
 */
export type CompareOp = 'contains' | '>' | '>=' | '<' | '<=' | 'exists'

export interface PropFilter {
  kind: 'prop'
  key: string
  op: CompareOp
  value: string
  negate: boolean
}

export interface TagFilter {
  kind: 'tag'
  tag: string
  negate: boolean
}

export type QueryFilter = PropFilter | TagFilter

export interface ParsedQuery {
  /** Texto libre a buscar (sin los filtros). */
  text: string
  filters: QueryFilter[]
}

const TOKEN = /(-?)(?:#([^\s#"]+)|([\p{L}\p{N}_-]+):(?!\/\/)(>=|<=|>|<)?("([^"]*)"?|[^\s"]*))|"([^"]*)"?|(\S+)/gu

/** Separa una consulta en texto libre y filtros. */
export function parseQuery(query: string): ParsedQuery {
  const filters: QueryFilter[] = []
  const words: string[] = []
  for (const m of query.matchAll(TOKEN)) {
    const negate = m[1] === '-'
    if (m[2] !== undefined) {
      filters.push({ kind: 'tag', tag: `#${m[2]}`, negate })
    } else if (m[3] !== undefined) {
      const value = m[6] ?? m[5] ?? ''
      const op: CompareOp = (m[4] as CompareOp | undefined) ?? (value === '' && m[6] === undefined ? 'exists' : 'contains')
      filters.push({ kind: 'prop', key: m[3], op, value, negate })
    } else if (m[7] !== undefined) {
      words.push(m[7])
    } else if (m[8] !== undefined) {
      words.push(m[8])
    }
  }
  return { text: words.join(' ').trim(), filters }
}

/** Valor de propiedad como lista de textos comparables. */
function asTexts(value: PropValue): string[] {
  if (value === null) return []
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'boolean') return value ? ['true', 'sí', 'si', 'yes'] : ['false', 'no']
  return [String(value)]
}

function compare(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (a.trim() !== '' && b.trim() !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a.localeCompare(b)
}

function propMatches(props: Property[], f: PropFilter): boolean {
  const key = foldQuery(f.key)
  const prop = props.find((p) => foldQuery(p.key) === key)
  if (!prop) return false
  if (f.op === 'exists') return true
  const want = foldQuery(f.value)
  const values = asTexts(prop.value)
  if (f.op === 'contains') return want === '' || values.some((v) => foldQuery(v).includes(want))
  return values.some((v) => {
    const c = compare(foldQuery(v), want)
    return f.op === '>' ? c > 0 : f.op === '>=' ? c >= 0 : f.op === '<' ? c < 0 : c <= 0
  })
}

/** true si la nota (su texto completo) cumple todos los filtros. */
export function matchesFilters(text: string, filters: QueryFilter[]): boolean {
  if (filters.length === 0) return true
  const props = filters.some((f) => f.kind === 'prop') ? (readProperties(text) ?? []) : []
  const tags = filters.some((f) => f.kind === 'tag') ? extractTags(text).map((h) => h.tag) : []
  return filters.every((f) => {
    const ok = f.kind === 'prop' ? propMatches(props, f) : tags.some((t) => tagMatches(t, f.tag))
    return f.negate ? !ok : ok
  })
}

/** Línea (0-based) donde está declarada la propiedad `key` en el frontmatter, o -1. */
export function propertyLine(text: string, key: string): number {
  const lines = text.split('\n')
  if (!/^---[ \t]*\r?$/.test(lines[0] ?? '')) return -1
  const k = foldQuery(key)
  for (let i = 1; i < lines.length; i++) {
    if (/^(---|\.\.\.)[ \t]*\r?$/.test(lines[i])) return -1
    const m = /^["']?([^:"']+)["']?\s*:/.exec(lines[i])
    if (m && foldQuery(m[1]) === k) return i
  }
  return -1
}
