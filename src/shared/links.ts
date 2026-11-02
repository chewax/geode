/**
 * Enlaces entre notas estilo wiki (`[[Nota]]`, `[[Nota|alias]]`, `[[Nota#Título]]`,
 * `![[imagen.png]]`). Módulo PURO (sin Node ni DOM): lo usan el main (backlinks,
 * actualizar enlaces al renombrar) y el renderer (autocompletado, vista previa).
 *
 * Compatibilidad: la sintaxis y la resolución por nombre siguen la convención de
 * Obsidian, para que una bóveda existente se abra en Geode sin enlaces rotos.
 */

/** Un enlace wiki encontrado en un texto, con su posición exacta. */
export interface WikiLink {
  /** Texto completo del enlace, p. ej. `![[Nota#Título|alias]]`. */
  raw: string
  /** Destino tal como fue escrito (sin `#título` ni `|alias`), recortado. */
  target: string
  /** Sección (`#Título`), sin el `#`; null si no hay. */
  heading: string | null
  /** Texto alternativo (`|alias`), sin el `|`; null si no hay. */
  alias: string | null
  /** true para incrustaciones `![[...]]` (imágenes, notas embebidas). */
  embed: boolean
  /** Offset de inicio (incluye el `!` si es embed). */
  from: number
  /** Offset de fin (exclusivo). */
  to: number
}

/** Regex de un enlace wiki. Grupo 1: `!`, 2: destino, 3: `#título`, 4: `|alias`. */
export const WIKILINK_SOURCE = String.raw`(!?)\[\[([^\[\]\n|#]*)(#[^\[\]\n|]*)?(\|[^\[\]\n]*)?\]\]`

/**
 * Reemplaza por espacios los bloques de código (``` / ~~~) y el código en línea,
 * conservando la longitud y los saltos de línea. Así un `[[x]]` dentro de código
 * no cuenta como enlace y los offsets siguen calzando con el texto original.
 */
export function maskCode(text: string): string {
  const blank = (s: string): string => s.replace(/[^\n]/g, ' ')
  // Bloques cercados: desde una línea que abre con ``` o ~~~ hasta su cierre (o EOF).
  let out = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, blank)
  // Código en línea con uno o más backticks balanceados (dentro de una línea).
  out = out.replace(/(`+)[^`\n]+?\1/g, blank)
  return out
}

/** Todos los enlaces wiki de un texto (ignora los que están dentro de código). */
export function parseWikilinks(text: string): WikiLink[] {
  const masked = maskCode(text)
  const re = new RegExp(WIKILINK_SOURCE, 'g')
  const links: WikiLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    const from = m.index
    const to = from + m[0].length
    links.push({
      raw: text.slice(from, to),
      target: m[2].trim(),
      heading: m[3] ? m[3].slice(1).trim() : null,
      alias: m[4] ? m[4].slice(1) : null,
      embed: m[1] === '!',
      from,
      to
    })
  }
  return links
}

/** Basename de una ruta relativa con '/'. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Carpeta padre de una ruta relativa ('' = raíz). */
export function dirName(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/** true si la ruta es una nota Markdown. */
export function isNotePath(path: string): boolean {
  return path.toLowerCase().endsWith('.md')
}

/** Nombre visible de un archivo: las notas sin `.md`, el resto con su extensión. */
export function displayName(path: string): string {
  const base = baseName(path)
  return isNotePath(base) ? base.slice(0, -3) : base
}

/** true si el destino escrito trae extensión explícita (`foto.png`, `nota.md`). */
function hasExtension(target: string): boolean {
  return /\.[^/.\s]+$/.test(baseName(target))
}

/** Normaliza un destino escrito a la ruta/nombre de archivo que debería existir. */
function targetKey(target: string): string {
  const t = target.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  return hasExtension(t) ? t : `${t}.md`
}

/**
 * Resuelve el destino de un enlace contra la lista de archivos de la bóveda.
 *
 * - Con `/` (p. ej. `Proyectos/Idea`): ruta exacta desde la raíz o relativa a la
 *   carpeta de la nota que enlaza; si no, cualquier archivo cuya ruta termine así.
 * - Sin `/`: por nombre de archivo. Si hay varios con el mismo nombre se prefiere
 *   el de la misma carpeta que la nota de origen, luego el de ruta más corta.
 *
 * La comparación ignora mayúsculas (como Obsidian). Devuelve null si no existe.
 */
export function resolveLink(target: string, paths: string[], fromPath: string | null = null): string | null {
  if (!target.trim()) return null
  const key = targetKey(target).toLowerCase()
  const lower = new Map<string, string>()
  for (const p of paths) lower.set(p.toLowerCase(), p)

  if (key.includes('/')) {
    const exact = lower.get(key)
    if (exact) return exact
    const fromDir = fromPath ? dirName(fromPath) : ''
    if (fromDir) {
      const rel = lower.get(normalizePath(`${fromDir}/${key}`))
      if (rel) return rel
    }
    const suffix = paths.filter((p) => p.toLowerCase().endsWith(`/${key}`))
    return pickBest(suffix, fromPath)
  }

  const byName = paths.filter((p) => baseName(p).toLowerCase() === key)
  return pickBest(byName, fromPath)
}

/** Resuelve `..` y `.` de una ruta relativa (en minúsculas o no, sin tocar el case). */
function normalizePath(path: string): string {
  const out: string[] = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/').toLowerCase()
}

/** Elige entre candidatos con el mismo nombre: misma carpeta, luego el más corto. */
function pickBest(candidates: string[], fromPath: string | null): string | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  const fromDir = fromPath ? dirName(fromPath) : null
  if (fromDir !== null) {
    const sameDir = candidates.find((c) => dirName(c) === fromDir)
    if (sameDir) return sameDir
  }
  return [...candidates].sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
}

/**
 * Texto más corto con el que enlazar a `path`: su nombre (sin `.md` para notas)
 * si es único en la bóveda; si hay otro archivo con el mismo nombre, la ruta
 * completa (también sin `.md`). Es lo que inserta el autocompletado.
 */
export function linkTextFor(path: string, paths: string[]): string {
  const name = baseName(path).toLowerCase()
  const clashes = paths.filter((p) => baseName(p).toLowerCase() === name).length
  const full = clashes > 1 ? path : baseName(path)
  return isNotePath(full) ? full.slice(0, -3) : full
}

/**
 * Reescribe los enlaces de `text` (contenido de la nota `notePath`) cuyos destinos
 * fueron renombrados/movidos. `renames` mapea ruta vieja → ruta nueva; `oldPaths`
 * y `newPaths` son la lista de archivos de la bóveda antes y después del cambio
 * (para resolver con la misma regla que usa la app). Conserva `#título`, `|alias`
 * y el `!` de las incrustaciones. Devuelve el texto y cuántos enlaces cambiaron.
 */
export function rewriteLinks(
  text: string,
  notePath: string,
  renames: Map<string, string>,
  oldPaths: string[],
  newPaths: string[]
): { text: string; changed: number } {
  const links = parseWikilinks(text)
  if (links.length === 0) return { text, changed: 0 }
  let out = ''
  let last = 0
  let changed = 0
  for (const link of links) {
    const resolved = resolveLink(link.target, oldPaths, notePath)
    const dest = resolved ? renames.get(resolved) : undefined
    if (!dest) continue
    // Si el enlace usaba ruta, se mantiene el estilo con ruta; si no, el nombre
    // más corto que siga siendo inequívoco tras el cambio.
    let newTarget = link.target.includes('/') ? dest : linkTextFor(dest, newPaths)
    if (link.target.includes('/') && isNotePath(newTarget) && !isNotePath(link.target)) {
      newTarget = newTarget.slice(0, -3)
    }
    if (newTarget === link.target) continue
    const rebuilt =
      `${link.embed ? '!' : ''}[[${newTarget}` +
      `${link.heading !== null ? `#${link.heading}` : ''}` +
      `${link.alias !== null ? `|${link.alias}` : ''}]]`
    out += text.slice(last, link.from) + rebuilt
    last = link.to
    changed++
  }
  if (changed === 0) return { text, changed: 0 }
  return { text: out + text.slice(last), changed }
}

/** Número de línea (0-based) de un offset dentro de un texto. */
export function lineOf(text: string, offset: number): number {
  let line = 0
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++
  return line
}
