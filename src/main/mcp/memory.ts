import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { NoteVersion } from '@shared/ipc'
import { displayName, isNotePath } from '@shared/links'
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
  async listNotes(folder = ''): Promise<string[]> {
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
        else if (e.isFile() && isNotePath(e.name)) out.push(rel)
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
