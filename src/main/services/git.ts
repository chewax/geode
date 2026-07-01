import fs from 'node:fs'
import os from 'node:os'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import git, { TREE } from 'isomorphic-git'
import type { GitVersion } from '@shared/ipc'

/** Carpetas que nunca entran al versionado (índice derivado, metadata, etc.). */
const IGNORED_TOP = new Set(['.git', '.geode', 'node_modules', '.obsidian'])

/**
 * Capa 2 del versionado (ver ARCHITECTURE.md §3): commits Git con sentido.
 * Envuelve isomorphic-git y habla el idioma de la app. No es un commit por
 * tecla: los commits se agrupan (los dispara el renderer por inactividad o a
 * mano). Restaurar nunca reescribe historia: escribe contenido viejo como
 * estado nuevo, que el próximo commit registra.
 *
 * La identidad de autor es un default local por ahora; la identidad por
 * dispositivo (branch device/<slug>) llega en Fase 2.
 */
export class GitService {
  private author(): { name: string; email: string } {
    let name = 'geode'
    try {
      name = os.userInfo().username || name
    } catch {
      // userInfo puede fallar en entornos sin usuario; usamos el default.
    }
    return { name, email: `${name}@localhost` }
  }

  /** Inicializa el repo si el vault todavía no es uno. Idempotente. */
  async ensureRepo(dir: string): Promise<void> {
    try {
      await stat(join(dir, '.git'))
      return
    } catch {
      // no es repo todavía
    }
    await git.init({ fs, dir, defaultBranch: 'main' })
  }

  /**
   * Commitea todos los cambios del vault. Devuelve el oid, o null si no había
   * nada que commitear (así el auto-commit no genera commits vacíos).
   *
   * IMPORTANTE — el "racy git": isomorphic-git cachea el oid del working dir
   * contra la stat guardada en el index (tamaño + mtime, 1s de granularidad),
   * así que tanto statusMatrix como el walker WORKDIR pueden reportar "sin
   * cambios" ante una edición del mismo tamaño en el mismo segundo → se perdería
   * un commit. Para evadirlo por completo NO le pedimos a isomorphic-git que lea
   * el working dir: leemos cada archivo nosotros y lo hasheamos con hashBlob
   * (contenido puro, sin stat), y comparamos contra los blobs de HEAD.
   */
  async commit(dir: string, message: string): Promise<string | null> {
    const headBlobs = await this.headBlobs(dir)
    const workBlobs = await this.workBlobs(dir)

    const changes: { filepath: string; deleted: boolean }[] = []
    for (const [filepath, oid] of workBlobs) {
      if (headBlobs.get(filepath) !== oid) changes.push({ filepath, deleted: false })
    }
    for (const filepath of headBlobs.keys()) {
      if (!workBlobs.has(filepath)) changes.push({ filepath, deleted: true })
    }
    if (changes.length === 0) return null

    for (const change of changes) {
      if (change.deleted) {
        await git.remove({ fs, dir, filepath: change.filepath })
      } else {
        await git.add({ fs, dir, filepath: change.filepath })
      }
    }

    return git.commit({ fs, dir, message, author: this.author() })
  }

  /** Mapa ruta→oid de los blobs de HEAD. Vacío si el repo aún no tiene commits. */
  private async headBlobs(dir: string): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    try {
      await git.resolveRef({ fs, dir, ref: 'HEAD' })
    } catch {
      return map
    }
    await git.walk({
      fs,
      dir,
      trees: [TREE({ ref: 'HEAD' })],
      map: async (filepath, [entry]) => {
        if (filepath === '.' || !entry) return undefined
        if (IGNORED_TOP.has(filepath.split('/')[0])) return null
        if ((await entry.type()) === 'blob') map.set(filepath, await entry.oid())
        return undefined
      }
    })
    return map
  }

  /**
   * Mapa ruta→oid del working dir, hasheando el contenido real de cada archivo.
   * No pasa por el index de isomorphic-git, así que es inmune al racy git.
   */
  private async workBlobs(dir: string): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const walk = async (relDir: string): Promise<void> => {
      const entries = await readdir(join(dir, relDir), { withFileTypes: true })
      for (const entry of entries) {
        if (IGNORED_TOP.has(entry.name)) continue
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          await walk(rel)
        } else if (entry.isFile()) {
          const content = await readFile(join(dir, rel))
          const { oid } = await git.hashBlob({ object: content })
          map.set(rel, oid)
        }
      }
    }
    await walk('')
    return map
  }

  /** Versiones que tocaron una nota, de la más nueva a la más vieja. */
  async history(dir: string, filepath: string): Promise<GitVersion[]> {
    let commits
    try {
      commits = await git.log({ fs, dir, filepath, force: true })
    } catch {
      // Repo sin commits todavía.
      return []
    }
    return commits.map((c) => ({
      oid: c.oid,
      message: c.commit.message.trim(),
      timestamp: c.commit.author.timestamp * 1000,
      author: c.commit.author.name
    }))
  }

  /** Contenido de una nota tal como estaba en un commit dado. */
  async readAt(dir: string, oid: string, filepath: string): Promise<string> {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath })
    return new TextDecoder().decode(blob)
  }
}
