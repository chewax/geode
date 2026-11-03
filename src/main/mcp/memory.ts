import { mkdir, readdir, readFile, rename, rmdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { NoteVersion } from '@shared/ipc'
import { isAttachmentPath } from '@shared/attachments'
import { displayName, isNotePath, lineOf, parseWikilinks, resolveLink, rewriteLinks } from '@shared/links'
import { extractTags, tagMatches } from '@shared/obsidian'
import { foldQuery, searchText } from '@shared/search'
import { atomicWrite } from '../fs/atomic'
import { withVaultLock } from '../fs/vaultLock'
import { GitService } from '../services/git'

/**
 * Lógica del servidor MCP: la bóveda vista como MEMORIA de un LLM.
 *
 * NO depende de Electron (corre en un proceso aparte, lanzado por el cliente MCP),
 * por eso no reusa VaultService (que importa `dialog`). Solo Node + GitService.
 *
 * Reglas de concurrencia (ver docs/mcp.md):
 *   1. UN escritor a la vez: cada escritura corre bajo `withVaultLock`, el mismo
 *      candado entre procesos que usan la app y los commits.
 *   2. Concurrencia OPTIMISTA para sobrescribir: `write_note` sobre una nota que
 *      existe exige `expected_version` (el oid que devolvió `read_note`). Si la
 *      nota cambió desde que la IA la leyó (la editó el usuario u otra IA), se
 *      rechaza con la versión actual: la IA nunca pisa algo que no vio.
 *   3. Nada se pierde: si la nota tiene cambios del usuario SIN versionar, se
 *      versionan primero (con el autor del usuario) y recién después se aplica el
 *      cambio de la IA en un commit propio. Las dos versiones quedan en la historia.
 *   4. Commits acotados: el commit de la IA lleva SOLO la nota que tocó.
 *   5. Aviso a la app: tras cada commit se escribe `.geode/external-change.json`;
 *      la app abierta lo detecta, recarga la nota y respalda en GitHub.
 */

/** Carpetas que la IA nunca ve ni toca. */
const HIDDEN_DIRS = new Set(['.git', '.geode', 'node_modules', '.obsidian'])

/** Tope de bytes que se devuelven de una nota (protege el contexto del LLM). */
const MAX_READ_CHARS = 200_000

export interface AiAuthor {
  name: string
  email: string
}

export interface ReadResult {
  path: string
  content: string
  /** Oid del blob: lo que hay que pasar como `expected_version` para sobrescribir. */
  version: string
  truncated: boolean
}

export interface WriteResult {
  path: string
  version: string
  /** Oid del commit de la IA (null si el contenido no cambió). */
  commit: string | null
  created: boolean
}

export interface SearchHit {
  path: string
  title: string
  matches: { line: number; text: string }[]
}

export interface MoveResult {
  from: string
  to: string
  /** Archivos movidos (1 para una nota; los que contenga, para una carpeta). */
  moved: number
  /** Notas cuyos enlaces se actualizaron (rutas nuevas). */
  linksUpdatedIn: string[]
  commit: string | null
}

/** Carpeta donde `archive_note` deja lo que la IA saca del medio. */
const ARCHIVE_DIR = 'Archivo'

/** Error "esperado" que se devuelve al LLM como resultado de herramienta con isError. */
export class MemoryError extends Error {}

export class MemoryStore {
  readonly root: string
  private readonly git = new GitService()
  private aiAuthor: AiAuthor = { name: 'IA (MCP)', email: 'ia@geode.local' }

  constructor(root: string) {
    this.root = resolve(root)
  }

  /** El autor de los commits de la IA (se ajusta con el nombre del cliente MCP). */
  setAiAuthor(author: AiAuthor): void {
    this.aiAuthor = author
  }

  /** Verifica que la carpeta exista y sea un repo (lo inicializa si no). */
  async init(): Promise<void> {
    const st = await stat(this.root).catch(() => null)
    if (!st?.isDirectory()) throw new Error(`No existe la bóveda: ${this.root}`)
    await this.git.ensureRepo(this.root)
  }

  /**
   * Normaliza y valida una ruta relativa de nota: dentro de la bóveda, sin
   * carpetas ocultas y con extensión .md (se agrega si falta).
   */
  normalizePath(raw: string, { requireNote = true } = {}): string {
    if (typeof raw !== 'string' || raw.trim() === '') throw new MemoryError('Falta la ruta de la nota')
    let rel = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '')
    if (requireNote && !isNotePath(rel)) rel = `${rel}.md`
    const abs = resolve(this.root, rel)
    const back = relative(this.root, abs)
    if (back === '' || back === '..' || back.startsWith(`..${sep}`) || isAbsolute(back)) {
      throw new MemoryError(`Ruta fuera de la bóveda: ${raw}`)
    }
    const parts = back.split(sep)
    if (parts.some((p) => p.startsWith('.') || HIDDEN_DIRS.has(p))) {
      throw new MemoryError(`Ruta no permitida: ${raw}`)
    }
    return parts.join('/')
  }

  private abs(rel: string): string {
    return join(this.root, ...rel.split('/'))
  }

  private async readIfExists(rel: string): Promise<string | null> {
    try {
      return await readFile(this.abs(rel), 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw e
    }
  }

  /** Todas las notas .md (rutas relativas), opcionalmente bajo `folder`. */
  listNotes(folder = ''): Promise<string[]> {
    return this.walkFiles(folder, isNotePath)
  }

  /** Notas + adjuntos (lo que puede ser destino de un enlace). */
  private listLinkable(): Promise<string[]> {
    return this.walkFiles('', (n) => isNotePath(n) || isAttachmentPath(n))
  }

  private async walkFiles(folder: string, keep: (name: string) => boolean): Promise<string[]> {
    const base = folder ? this.normalizePath(folder, { requireNote: false }) : ''
    const out: string[] = []
    const walk = async (relDir: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(relDir ? this.abs(relDir) : this.root, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (e.name.startsWith('.') || HIDDEN_DIRS.has(e.name)) continue
        const rel = relDir ? `${relDir}/${e.name}` : e.name
        if (e.isDirectory()) await walk(rel)
        else if (e.isFile() && keep(e.name)) out.push(rel)
      }
    }
    await walk(base)
    return out.sort((a, b) => a.localeCompare(b))
  }

  async readNote(path: string): Promise<ReadResult> {
    const rel = this.normalizePath(path)
    const content = await this.readIfExists(rel)
    if (content === null) throw new MemoryError(`No existe la nota: ${rel}`)
    const version = await this.git.blobOid(content)
    const truncated = content.length > MAX_READ_CHARS
    return { path: rel, content: truncated ? content.slice(0, MAX_READ_CHARS) : content, version, truncated }
  }

  /**
   * Búsqueda por palabras (ignora mayúsculas y tildes): una nota coincide si
   * contiene TODAS las palabras, en el nombre o en el texto. Las que coinciden
   * por nombre y las de más coincidencias van primero.
   */
  async search(query: string, limit = 20): Promise<SearchHit[]> {
    if (/^#[^\s#]+$/.test(query.trim())) return this.searchTag(query.trim(), limit)
    const terms = foldQuery(query).split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []
    const hits: { hit: SearchHit; score: number }[] = []
    for (const path of await this.listNotes()) {
      const text = await this.readIfExists(path)
      if (text === null) continue
      const name = foldQuery(path)
      const folded = foldQuery(text)
      if (!terms.every((t) => name.includes(t) || folded.includes(t))) continue
      const seen = new Set<number>()
      const matches: SearchHit['matches'] = []
      for (const t of terms) {
        for (const m of searchText(text, t, 5)) {
          if (seen.has(m.line)) continue
          seen.add(m.line)
          matches.push({ line: m.line + 1, text: `${m.before}${m.text}${m.after}`.trim() })
        }
      }
      matches.sort((a, b) => a.line - b.line)
      const nameScore = terms.filter((t) => name.includes(t)).length * 100
      hits.push({ hit: { path, title: displayName(path), matches: matches.slice(0, 8) }, score: nameScore + matches.length })
    }
    hits.sort((a, b) => b.score - a.score || a.hit.path.localeCompare(b.hit.path))
    return hits.slice(0, Math.max(1, Math.min(limit, 100))).map((h) => h.hit)
  }

  /** Notas con la etiqueta `#tag` (o una hija: `#a` incluye `#a/b`). */
  private async searchTag(query: string, limit: number): Promise<SearchHit[]> {
    const hits: SearchHit[] = []
    for (const path of await this.listNotes()) {
      const text = await this.readIfExists(path)
      if (text === null) continue
      const found = extractTags(text).filter((h) => tagMatches(h.tag, query))
      if (found.length === 0) continue
      const lines = text.split('\n')
      const seen = new Set<number>()
      const matches: SearchHit['matches'] = []
      for (const h of found) {
        // Los tags del frontmatter vienen con línea -1: se señala la propiedad `tags`.
        const ln = h.line >= 0 ? h.line : Math.max(0, lines.findIndex((l) => /^tags?\s*:/.test(l)))
        if (seen.has(ln)) continue
        seen.add(ln)
        matches.push({ line: ln + 1, text: (lines[ln] ?? '').trim().slice(0, 200) })
      }
      hits.push({ path, title: displayName(path), matches })
    }
    hits.sort((a, b) => b.matches.length - a.matches.length || a.path.localeCompare(b.path))
    return hits.slice(0, Math.max(1, Math.min(limit, 100)))
  }

  /** Todas las etiquetas con cuántas notas las usan, de más a menos usadas. */
  async tags(): Promise<{ tag: string; notes: number }[]> {
    const counts = new Map<string, { tag: string; notes: number }>()
    for (const path of await this.listNotes()) {
      const text = await this.readIfExists(path)
      if (text === null) continue
      for (const tag of new Set(extractTags(text).map((h) => h.tag))) {
        const key = tag.toLowerCase()
        const e = counts.get(key)
        if (e) e.notes++
        else counts.set(key, { tag, notes: 1 })
      }
    }
    return [...counts.values()].sort((a, b) => b.notes - a.notes || a.tag.localeCompare(b.tag))
  }

  /** Notas que enlazan a `path` con `[[...]]`, con la línea de cada enlace. */
  async backlinks(path: string): Promise<{ path: string; line: number; context: string }[]> {
    const target = this.normalizePath(path)
    if ((await this.readIfExists(target)) === null) throw new MemoryError(`No existe la nota: ${target}`)
    const paths = await this.listLinkable()
    const out: { path: string; line: number; context: string }[] = []
    for (const p of paths.filter(isNotePath)) {
      if (p === target) continue
      const text = await this.readIfExists(p)
      if (text === null) continue
      const seen = new Set<number>()
      for (const link of parseWikilinks(text)) {
        if (resolveLink(link.target, paths, p) !== target) continue
        const line = lineOf(text, link.from)
        if (seen.has(line)) continue
        seen.add(line)
        out.push({ path: p, line: line + 1, context: (text.split('\n')[line] ?? '').trim().slice(0, 200) })
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
  }

  /**
   * Mueve o renombra una nota o una carpeta entera y actualiza los `[[enlaces]]`
   * de toda la bóveda, en UNA sola versión de la IA. Nunca pisa: si el destino
   * existe, falla. Los cambios sin versionar del usuario en las notas que se van
   * a tocar se versionan antes (regla 3).
   */
  async move(fromRaw: string, toRaw: string, summary?: string, verb = 'Movió'): Promise<MoveResult> {
    return withVaultLock(
      this.root,
      async () => {
        // ¿Nota o carpeta? Una carpeta no lleva .md.
        const asDir = this.normalizePath(fromRaw, { requireNote: false })
        const dirStat = await stat(this.abs(asDir)).catch(() => null)
        const isDir = !!dirStat?.isDirectory()
        const from = isDir ? asDir : this.normalizePath(fromRaw)
        const to = this.normalizePath(toRaw, { requireNote: !isDir })
        if (from === to) throw new MemoryError('El origen y el destino son la misma ruta')
        if (isDir && (to + '/').startsWith(from + '/')) {
          throw new MemoryError('No se puede mover una carpeta dentro de sí misma')
        }
        if (!isDir && (await this.readIfExists(from)) === null) throw new MemoryError(`No existe: ${from}`)
        if (await stat(this.abs(to)).catch(() => null)) {
          throw new MemoryError(`Ya existe: ${to}. Elegí otro nombre; nunca se pisa nada.`)
        }

        // Mapa viejo → nuevo de cada archivo que se mueve.
        const oldPaths = await this.listLinkable()
        const renames = new Map<string, string>()
        if (isDir) {
          for (const p of oldPaths) if (p.startsWith(`${from}/`)) renames.set(p, to + p.slice(from.length))
        } else {
          renames.set(from, to)
        }
        const newPaths = oldPaths.map((p) => renames.get(p) ?? p)

        // Plan de enlaces a reescribir (se calcula ANTES de tocar el disco).
        const plan = new Map<string, string>() // ruta NUEVA → texto nuevo
        const touchedOld: string[] = [] // las mismas notas, por su ruta VIEJA
        for (const oldPath of oldPaths.filter(isNotePath)) {
          const text = await this.readIfExists(oldPath)
          if (text === null) continue
          const res = rewriteLinks(text, oldPath, renames, oldPaths, newPaths)
          if (res.changed > 0) {
            plan.set(renames.get(oldPath) ?? oldPath, res.text)
            touchedOld.push(oldPath)
          }
        }

        // Regla 3: lo del usuario sin versionar en esas notas va primero a la historia.
        const before = [...new Set([...renames.keys(), ...touchedOld])]
        await this.git.commitPaths(this.root, before, 'Cambios sin guardar antes de la reorganización de la IA')

        await mkdir(dirname(this.abs(to)), { recursive: true })
        await rename(this.abs(from), this.abs(to))
        for (const [path, text] of plan) await atomicWrite(this.abs(path), text)
        if (!isDir) await this.removeEmptyParents(from)

        const changed = [...new Set([...renames.keys(), ...renames.values(), ...plan.keys()])]
        const title = summary?.trim() || `${verb} ${displayName(from)} a ${to}`
        const commit = await this.git.commitPaths(this.root, changed, `IA: ${title}`, this.aiAuthor)
        if (commit) await this.notifyApp([...renames.values(), ...plan.keys()], commit)
        return { from, to, moved: renames.size, linksUpdatedIn: [...plan.keys()], commit }
      },
      { owner: 'geode:mcp' }
    )
  }

  /**
   * Archiva una nota o carpeta: la mueve a `Archivo/` conservando su ruta (y
   * actualizando enlaces). Es la forma "humana" de sacar algo del medio: queda a
   * la vista, en la bóveda, y además en la historia.
   */
  async archive(path: string, summary?: string): Promise<MoveResult> {
    const asDir = this.normalizePath(path, { requireNote: false })
    const isDir = !!(await stat(this.abs(asDir)).catch(() => null))?.isDirectory()
    const rel = isDir ? asDir : this.normalizePath(path)
    if (rel === ARCHIVE_DIR || rel.startsWith(`${ARCHIVE_DIR}/`)) throw new MemoryError('Ya está archivada')
    // Si ya hay algo archivado con ese nombre, se numera: nunca se pisa.
    const ext = isDir ? '' : '.md'
    const stem = isDir ? rel : rel.slice(0, -ext.length)
    let target = `${ARCHIVE_DIR}/${stem}${ext}`
    for (let n = 2; await stat(this.abs(target)).catch(() => null); n++) target = `${ARCHIVE_DIR}/${stem} ${n}${ext}`
    return this.move(rel, target, summary, 'Archivó')
  }

  /** Tras mover una nota, borra las carpetas que quedaron vacías (nunca la raíz). */
  private async removeEmptyParents(rel: string): Promise<void> {
    let dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    while (dir) {
      try {
        await rmdir(this.abs(dir)) // falla si no está vacía: ahí se corta
      } catch {
        return
      }
      dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''
    }
  }

  /**
   * Núcleo de toda escritura de la IA. Bajo el candado de la bóveda:
   *   1. lee el contenido actual y deja que `transform` decida el nuevo
   *      (ahí se validan `expected_version`, el texto a reemplazar, etc.);
   *   2. si la nota tiene cambios del usuario sin versionar, los versiona primero;
   *   3. escribe atómico y commitea SOLO esa nota con el autor de la IA;
   *   4. avisa a la app.
   */
  private async mutate(
    path: string,
    summary: string | undefined,
    transform: (current: string | null, currentVersion: string | null) => string,
    verb: string
  ): Promise<WriteResult> {
    const rel = this.normalizePath(path)
    return withVaultLock(
      this.root,
      async () => {
        const current = await this.readIfExists(rel)
        const currentVersion = current === null ? null : await this.git.blobOid(current)
        const next = transform(current, currentVersion)
        const nextVersion = await this.git.blobOid(next)
        if (next === current) return { path: rel, version: nextVersion, commit: null, created: false }

        // Cambios del usuario sin versionar en ESTA nota: a la historia primero.
        if (current !== null && currentVersion !== (await this.git.headBlobOid(this.root, rel))) {
          await this.git.commitPaths(this.root, [rel], 'Cambios sin guardar antes de la edición de la IA')
        }

        await atomicWrite(this.abs(rel), next)
        const title = summary?.trim() || `${verb} ${displayName(rel)}`
        const commit = await this.git.commitPaths(this.root, [rel], `IA: ${title}`, this.aiAuthor)
        if (commit) await this.notifyApp([rel], commit)
        return { path: rel, version: nextVersion, commit, created: current === null }
      },
      { owner: 'geode:mcp' }
    )
  }

  /**
   * Crea o sobrescribe una nota completa. Para sobrescribir una existente hace
   * falta `expectedVersion` (de `readNote`): si no coincide con la actual, falla.
   */
  writeNote(path: string, content: string, expectedVersion?: string, summary?: string): Promise<WriteResult> {
    if (typeof content !== 'string') throw new MemoryError('Falta el contenido')
    return this.mutate(
      path,
      summary,
      (current, currentVersion) => {
        if (current !== null) {
          if (!expectedVersion) {
            throw new MemoryError(
              `La nota ya existe (versión ${currentVersion}). Leela con read_note y pasá su "version" como expected_version para sobrescribirla, o usá edit_note / append_note.`
            )
          }
          if (expectedVersion !== currentVersion) {
            throw new MemoryError(
              `La nota cambió desde que la leíste (versión actual ${currentVersion}). Volvé a leerla con read_note y reintentá sobre el contenido nuevo.`
            )
          }
        } else if (expectedVersion) {
          throw new MemoryError('La nota ya no existe (fue movida o borrada). Volvé a buscarla.')
        }
        return content
      },
      'Actualizó'
    )
  }

  /** Reemplaza un fragmento EXACTO y único de la nota (falla si no aparece o aparece varias veces). */
  editNote(path: string, oldText: string, newText: string, summary?: string): Promise<WriteResult> {
    if (typeof oldText !== 'string' || oldText === '') throw new MemoryError('Falta old_text')
    if (typeof newText !== 'string') throw new MemoryError('Falta new_text')
    return this.mutate(
      path,
      summary,
      (current) => {
        if (current === null) throw new MemoryError('No existe la nota; creala con write_note')
        const first = current.indexOf(oldText)
        if (first === -1) {
          throw new MemoryError('old_text no aparece en la nota (¿cambió?). Leela de nuevo con read_note.')
        }
        if (current.indexOf(oldText, first + 1) !== -1) {
          throw new MemoryError('old_text aparece más de una vez; incluí más contexto para que sea único.')
        }
        return current.slice(0, first) + newText + current.slice(first + oldText.length)
      },
      'Editó'
    )
  }

  /** Agrega texto al final de la nota (la crea si no existe). Seguro sin leer antes. */
  appendNote(path: string, text: string, summary?: string): Promise<WriteResult> {
    if (typeof text !== 'string' || text.trim() === '') throw new MemoryError('Falta el texto a agregar')
    return this.mutate(
      path,
      summary,
      (current) => {
        if (current === null || current.trim() === '') return `${text.replace(/\s*$/, '')}\n`
        return `${current.replace(/\s*$/, '')}\n\n${text.replace(/\s*$/, '')}\n`
      },
      'Agregó a'
    )
  }

  /** Versiones de una nota, de la más nueva a la más vieja. */
  async history(path: string, limit = 20): Promise<NoteVersion[]> {
    const rel = this.normalizePath(path)
    const versions = await this.git.noteHistory(this.root, rel)
    return versions.reverse().slice(0, Math.max(1, Math.min(limit, 200)))
  }

  /** Contenido de una nota en una versión (commit) pasada. */
  async readAt(path: string, commit: string): Promise<string> {
    const rel = this.normalizePath(path)
    if (!/^[0-9a-f]{40}$/i.test(commit ?? '')) throw new MemoryError('commit inválido')
    try {
      return await this.git.readAt(this.root, commit, rel)
    } catch {
      throw new MemoryError(`La nota ${rel} no existe en la versión ${commit}`)
    }
  }

  /**
   * Avisa a la app (si está abierta) que la bóveda cambió desde afuera. Es un
   * archivo en `.geode/` (fuera del versionado) que la app sondea: sin sockets,
   * funciona igual con la app cerrada (no hay nadie escuchando y no pasa nada).
   */
  private async notifyApp(paths: string[], commit: string): Promise<void> {
    try {
      await atomicWrite(
        join(this.root, '.geode', 'external-change.json'),
        JSON.stringify({ at: Date.now(), paths, commit, author: this.aiAuthor.name })
      )
    } catch {
      // Best-effort: sin aviso, la app igual ve el cambio al recargar.
    }
  }
}
