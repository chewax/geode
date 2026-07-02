import fs from 'node:fs'
import os from 'node:os'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import git, { TREE } from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import { createPatch } from 'diff'
import type { GitCommitNode, GitGraph } from '@shared/ipc'

/** Carpetas que nunca entran al versionado (índice derivado, metadata, etc.). */
const IGNORED_TOP = new Set(['.git', '.geode', 'node_modules', '.obsidian'])

/**
 * Capa 2 del versionado (ver ARCHITECTURE.md §3): commits Git con sentido.
 *
 * Modelo de historial: el usuario ve un ÁRBOL de todo el vault, como git. "Ir a
 * una versión" es un checkout (mueve HEAD), no genera un commit nuevo. Si el
 * usuario edita parado en un commit viejo (HEAD detached), el próximo commit
 * BIFURCA automáticamente a una rama nueva (rama-N): así nada se pisa y el árbol
 * muestra la bifurcación. La rama principal queda intacta.
 *
 * Los commits son un acto explícito del usuario ("Guardar versión"); no hay
 * auto-commit. El mensaje lo genera IA a partir de pendingDiff().
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
   * Commitea los cambios del vault. Devuelve el oid, o null si no había nada.
   * Si HEAD está detached (el usuario editó parado en una versión vieja),
   * bifurca: commitea y adjunta HEAD a una rama nueva sin tocar los archivos.
   *
   * Detección de cambios INMUNE al "racy git": no usamos el atajo por stat de
   * isomorphic-git (pierde ediciones del mismo tamaño en el mismo segundo);
   * hasheamos el contenido real de cada archivo (hashBlob) vs los blobs de HEAD.
   */
  async commit(dir: string, message: string): Promise<string | null> {
    const changes = await this.pendingChanges(dir)
    if (changes.length === 0) return null

    const wasDetached = !(await git.currentBranch({ fs, dir, fullname: false }))

    for (const change of changes) {
      if (change.deleted) {
        await git.remove({ fs, dir, filepath: change.filepath })
      } else {
        await git.add({ fs, dir, filepath: change.filepath })
      }
    }

    const oid = await git.commit({ fs, dir, message, author: this.author() })

    if (wasDetached) {
      // Bifurcación: crear rama en el commit nuevo y adjuntar HEAD sin tocar
      // el working dir (noCheckout), para no pisar lo que el usuario escribió.
      const name = await this.nextForkName(dir)
      await git.branch({ fs, dir, ref: name })
      await git.checkout({ fs, dir, ref: name, noCheckout: true })
    }

    return oid
  }

  /**
   * Mueve HEAD a un commit. Si el oid es el tip de una rama, se adjunta a esa
   * rama (editar la continúa); si es un commit interior, queda detached (editar
   * bifurca). Sobrescribe el working dir: el caller debe commitear lo pendiente
   * antes, para no perder nada.
   */
  async checkout(dir: string, oid: string): Promise<void> {
    const branches = await git.listBranches({ fs, dir })
    const ordered = ['main', ...branches.filter((b) => b !== 'main')]

    let ref = oid
    for (const name of ordered) {
      if (!branches.includes(name)) continue
      const tip = await git.resolveRef({ fs, dir, ref: name })
      if (tip === oid) {
        ref = name
        break
      }
    }
    await git.checkout({ fs, dir, ref, force: true })
  }

  /** Grafo de commits de TODO el vault (todas las ramas), para el árbol. */
  async graph(dir: string, pushed: string[] = []): Promise<GitGraph> {
    const branchNames = await git.listBranches({ fs, dir })
    const ordered = ['main', ...branchNames.filter((b) => b !== 'main')].filter((b) =>
      branchNames.includes(b)
    )

    const commitsMap = new Map<string, GitCommitNode>()
    const laneOf = new Map<string, number>()
    const branches: { name: string; tip: string }[] = []

    for (let lane = 0; lane < ordered.length; lane++) {
      const name = ordered[lane]
      const tip = await git.resolveRef({ fs, dir, ref: name })
      branches.push({ name, tip })
      let log
      try {
        log = await git.log({ fs, dir, ref: name })
      } catch {
        continue
      }
      for (const c of log) {
        // La lane de un commit es la de la rama de índice más bajo que lo
        // contiene: los ancestros compartidos caen en la columna de 'main'.
        if (!laneOf.has(c.oid)) laneOf.set(c.oid, lane)
        if (!commitsMap.has(c.oid)) {
          commitsMap.set(c.oid, {
            oid: c.oid,
            message: c.commit.message.trim(),
            timestamp: c.commit.author.timestamp * 1000,
            author: c.commit.author.name,
            parents: c.commit.parent ?? [],
            lane
          })
        }
      }
    }

    const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null)
    const headBranch = (await git.currentBranch({ fs, dir, fullname: false })) ?? null

    // Línea actual = ancestros (incluido) de HEAD; el resto se atenúa en la UI.
    const onCurrentLine: string[] = []
    if (headOid) {
      const seen = new Set<string>()
      const stack = [headOid]
      while (stack.length) {
        const oid = stack.pop() as string
        if (seen.has(oid)) continue
        seen.add(oid)
        const node = commitsMap.get(oid)
        if (node) for (const p of node.parents) stack.push(p)
      }
      onCurrentLine.push(...seen)
    }

    const commits = [...commitsMap.values()].sort((a, b) => b.timestamp - a.timestamp)
    return { commits, branches, head: { oid: headOid, branch: headBranch }, onCurrentLine, pushed }
  }

  /** Rama actual, o null si HEAD está detached. */
  async currentBranch(dir: string): Promise<string | null> {
    return (await git.currentBranch({ fs, dir, fullname: false })) ?? null
  }

  /** Configura (o reemplaza) el remoto 'origin' del vault. */
  async setRemote(dir: string, url: string): Promise<void> {
    const remotes = await git.listRemotes({ fs, dir })
    if (remotes.some((r) => r.remote === 'origin')) {
      await git.deleteRemote({ fs, dir, remote: 'origin' })
    }
    if (url) await git.addRemote({ fs, dir, remote: 'origin', url })
  }

  /**
   * Cantidad de commits de la rama actual que no se pushearon aún, contando
   * desde el último oid pusheado (que el caller persiste en settings). Si no hay
   * uno, cuenta todos los commits de la rama.
   */
  async aheadCount(dir: string, sinceOid: string | null): Promise<number> {
    const branch = await git.currentBranch({ fs, dir, fullname: false })
    if (!branch) return 0
    let log
    try {
      log = await git.log({ fs, dir, ref: branch })
    } catch {
      return 0
    }
    if (!sinceOid) return log.length
    let n = 0
    for (const c of log) {
      if (c.oid === sinceOid) break
      n++
    }
    return n
  }

  /**
   * Pushea la rama actual al remoto. Devuelve la rama y el oid pusheado (para
   * que el caller lo guarde y pueda contar pendientes). El auth va sobre HTTPS
   * con el token de OAuth (device flow); isomorphic-git no soporta SSH.
   */
  async push(dir: string, url: string, token: string): Promise<{ branch: string; oid: string }> {
    const branch = await git.currentBranch({ fs, dir, fullname: false })
    if (!branch) throw new Error('HEAD está en una versión anterior (detached): no hay rama para pushear')

    await git.push({
      fs,
      http,
      dir,
      url,
      remote: 'origin',
      ref: branch,
      onAuth: () => ({ username: 'x-access-token', password: token })
    })

    const oid = await git.resolveRef({ fs, dir, ref: branch })
    return { branch, oid }
  }

  /** Contenido de una nota tal como estaba en un commit dado. */
  async readAt(dir: string, oid: string, filepath: string): Promise<string> {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath })
    return new TextDecoder().decode(blob)
  }

  /** Rutas cuyo contenido difiere entre HEAD y el working dir (lo que se versionaría). */
  async changes(dir: string): Promise<string[]> {
    return (await this.pendingChanges(dir)).map((c) => c.filepath)
  }

  /**
   * Diff unificado de lo pendiente (working vs HEAD), para alimentar a la IA.
   * Las notas de texto van con su diff; los binarios, solo como estado. Se
   * trunca para acotar tokens.
   */
  async pendingDiff(dir: string): Promise<string> {
    const changes = await this.pendingChanges(dir)
    if (changes.length === 0) return ''
    const headOid = await this.headOid(dir)
    const MAX = 8000

    let out = ''
    for (const { filepath, deleted } of changes) {
      if (out.length > MAX) {
        out += '\n… (diff truncado)\n'
        break
      }
      const oldText = headOid ? await this.safeReadAt(dir, headOid, filepath) : ''
      const newText = deleted ? '' : await readFile(join(dir, filepath), 'utf8').catch(() => '')

      if (this.looksBinary(oldText) || this.looksBinary(newText)) {
        const verb = deleted ? 'borrado' : oldText ? 'modificado' : 'agregado'
        out += `Archivo binario ${verb}: ${filepath}\n\n`
        continue
      }
      out += createPatch(filepath, oldText, newText, '', '') + '\n'
    }
    return out.trim()
  }

  /** Heurística simple: un byte NUL sugiere contenido binario (no diffeable como texto). */
  private looksBinary(text: string): boolean {
    return text.includes(String.fromCharCode(0))
  }

  private async safeReadAt(dir: string, oid: string, filepath: string): Promise<string> {
    try {
      return await this.readAt(dir, oid, filepath)
    } catch {
      return '' // el archivo no existía en ese commit
    }
  }

  /** Oid de HEAD, o null si el repo aún no tiene commits. */
  private async headOid(dir: string): Promise<string | null> {
    return git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null)
  }

  /** Archivos creados/modificados/borrados entre HEAD y el working dir. */
  private async pendingChanges(dir: string): Promise<{ filepath: string; deleted: boolean }[]> {
    const headBlobs = await this.headBlobs(dir)
    const workBlobs = await this.workBlobs(dir)

    const changes: { filepath: string; deleted: boolean }[] = []
    for (const [filepath, oid] of workBlobs) {
      if (headBlobs.get(filepath) !== oid) changes.push({ filepath, deleted: false })
    }
    for (const filepath of headBlobs.keys()) {
      if (!workBlobs.has(filepath)) changes.push({ filepath, deleted: true })
    }
    return changes
  }

  /** Próximo nombre de rama libre: rama-1, rama-2, … */
  private async nextForkName(dir: string): Promise<string> {
    const branches = await git.listBranches({ fs, dir })
    let max = 0
    for (const b of branches) {
      const m = /^rama-(\d+)$/.exec(b)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return `rama-${max + 1}`
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
}
