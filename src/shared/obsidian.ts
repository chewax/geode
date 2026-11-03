/**
 * Compatibilidad con la sintaxis de Obsidian: frontmatter (propiedades), #tags,
 * %%comentarios%% y ==resaltado==. Módulo PURO (main + renderer), con tests.
 * La edición de propiedades usa `yaml` (Document API) para conservar el resto
 * del bloque tal como lo escribió el usuario.
 */
import { isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml'
import { maskCode } from './links'

// ── Frontmatter ─────────────────────────────────────────────────────────────

export interface Frontmatter {
  /** Texto YAML entre los `---` (sin ellos). */
  yaml: string
  /** Offset donde termina el bloque completo (incluye el `---` final y su salto). */
  end: number
}

/** Bloque de propiedades al principio de la nota (`---\n…\n---`), o null. */
export function splitFrontmatter(text: string): Frontmatter | null {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return null
  return { yaml: m[1], end: m[0].length }
}

/** Valor de una propiedad, tal como lo muestra/edita el panel. */
export type PropValue = string | number | boolean | string[] | null

export interface Property {
  key: string
  value: PropValue
}

/** Lee las propiedades del frontmatter. null si el YAML no es válido o no es un mapa. */
export function readProperties(text: string): Property[] | null {
  const fm = splitFrontmatter(text)
  if (!fm) return []
  const doc = parseDocument(fm.yaml)
  if (doc.errors.length > 0) return null
  if (doc.contents === null) return []
  if (!isMap(doc.contents)) return null
  const out: Property[] = []
  for (const item of doc.contents.items) {
    const key = isScalar(item.key) ? String(item.key.value) : String(item.key)
    const v = item.value
    let value: PropValue
    if (isSeq(v)) value = v.items.map((x) => (isScalar(x) ? String(x.value ?? '') : String(x)))
    else if (isScalar(v)) {
      const raw = v.value
      value =
        raw === null || raw === undefined
          ? null
          : typeof raw === 'number' || typeof raw === 'boolean'
            ? raw
            : raw instanceof Date
              ? raw.toISOString().slice(0, 10)
              : String(raw)
    } else value = v === null || v === undefined ? null : String(v)
    out.push({ key, value })
  }
  return out
}

function docFor(text: string): { doc: Document; fm: Frontmatter | null } {
  const fm = splitFrontmatter(text)
  return { doc: parseDocument(fm ? fm.yaml : ''), fm }
}

/** Escribe el documento YAML como bloque de frontmatter y lo pega al cuerpo. */
function withFrontmatter(text: string, fm: Frontmatter | null, doc: Document): string {
  const body = fm ? text.slice(fm.end) : text
  const isEmpty = !doc.contents || (isMap(doc.contents) && doc.contents.items.length === 0)
  if (isEmpty) return body.replace(/^\r?\n/, '')
  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n+$/, '')
  return `---\n${yaml}\n---\n${fm ? body : `\n${body}`}`
}

/** Crea o cambia una propiedad (y crea el frontmatter si no existía). */
export function setProperty(text: string, key: string, value: PropValue): string {
  const { doc, fm } = docFor(text)
  if (!doc.contents) doc.contents = doc.createNode({}) as never
  doc.set(key, value)
  return withFrontmatter(text, fm, doc)
}

/** Quita una propiedad; si no queda ninguna, elimina el bloque entero. */
export function deleteProperty(text: string, key: string): string {
  const { doc, fm } = docFor(text)
  if (!fm) return text
  doc.delete(key)
  return withFrontmatter(text, fm, doc)
}

/** Cambia el nombre de una propiedad conservando su valor y su posición. */
export function renameProperty(text: string, from: string, to: string): string {
  const props = readProperties(text)
  if (!props || from === to || props.some((p) => p.key === to)) return text
  const { doc, fm } = docFor(text)
  if (!fm || !isMap(doc.contents)) return text
  for (const item of doc.contents.items) {
    if (isScalar(item.key) && String(item.key.value) === from) item.key = doc.createNode(to) as never
  }
  return withFrontmatter(text, fm, doc)
}

// ── Tags ────────────────────────────────────────────────────────────────────

/**
 * `#tag` estilo Obsidian: letras, números, `_`, `-` y `/` (anidados), con al
 * menos un carácter que no sea número (`#2024` no es tag). Debe ir al principio
 * de línea o tras un espacio (así `[[nota#sección]]` y URLs con `#` no cuentan).
 */
export const TAG_SOURCE = String.raw`(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)`

export interface TagHit {
  tag: string
  /** Línea (0-based); -1 si viene del frontmatter. */
  line: number
}

/** Tags de una nota: los del texto (fuera de código) y los de la propiedad `tags`. */
export function extractTags(text: string): TagHit[] {
  const out: TagHit[] = []
  const props = readProperties(text) ?? []
  for (const p of props) {
    if (p.key !== 'tags' && p.key !== 'tag') continue
    const list = Array.isArray(p.value) ? p.value : typeof p.value === 'string' ? p.value.split(/[,\s]+/) : []
    for (const t of list) {
      const clean = t.replace(/^#/, '').trim()
      if (clean) out.push({ tag: clean, line: -1 })
    }
  }
  const fm = splitFrontmatter(text)
  const bodyStart = fm ? fm.end : 0
  const masked = maskCode(text)
  const lines = masked.split('\n')
  let offset = 0
  for (let ln = 0; ln < lines.length; ln++) {
    const lineText = lines[ln]
    if (offset + lineText.length >= bodyStart) {
      const re = new RegExp(TAG_SOURCE, 'gu')
      let m: RegExpExecArray | null
      while ((m = re.exec(lineText)) !== null) {
        if (offset + m.index >= bodyStart) out.push({ tag: m[2].replace(/\/+$/, ''), line: ln })
      }
    }
    offset += lineText.length + 1
  }
  return out
}

/** Compara tags como Obsidian: sin mayúsculas; `#a` incluye a `#a/b`. */
export function tagMatches(tag: string, query: string): boolean {
  const t = tag.toLowerCase()
  const q = query.toLowerCase().replace(/^#/, '')
  return t === q || t.startsWith(`${q}/`)
}

// ── Comentarios ─────────────────────────────────────────────────────────────

/** Quita los `%%comentarios%%` (de una línea o de varias), sin tocar el código. */
export function stripComments(text: string): string {
  const masked = maskCode(text)
  const re = /%%[\s\S]*?%%/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    out += text.slice(last, m.index)
    last = m.index + m[0].length
  }
  return out + text.slice(last)
}
