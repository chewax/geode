import fs from 'node:fs'
import os from 'node:os'
import { mkdir, open, readdir, readFile, rm, stat, type FileHandle } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import git, { TREE, type MergeDriverCallback } from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import { createPatch, diffLines } from 'diff'
import diff3Merge from 'diff3'
import type { GitCommitNode, GitGraph, NoteVersion, TreeNode } from '@shared/ipc'
import { isAttachmentPath } from '@shared/attachments'
import { atomicWrite } from '../fs/atomic'
import { t } from '@shared/i18n'
import { withVaultLock } from '../fs/vaultLock'

/** Carpetas que nunca entran al versionado (índice derivado, metadata, etc.). */
const IGNORED_TOP = new Set(['.git', '.geode', 'node_modules', '.obsidian'])

/** Rama de "producción": es intocable, solo avanza por merge. */
const PROD = 'main'

/** Resultado de `GitService.sync`: qué se pusheó y si el working dir cambió. */
export interface SyncResult {
  branch: string
  oid: string
  /** true si se trajeron cambios de la nube al working dir (hay que recargar). */
  pulled: boolean
  /** Rutas de las copias "(versión de la nube)" creadas por conflictos. */
  cloudCopies: string[]
}

/** Misma partición por líneas que usa isomorphic-git para su merge por defecto. */
const LINEBREAKS = /^.*(\r?\n|$)/gm

/**
 * Merge 3-way por líneas (diff3). En los tramos en conflicto gana `ours`; el
 * caller decide qué hacer con `theirs` (acá: guardarlo como copia al lado).
 */
function mergeLines(
  base: string,
  ours: string,
  theirs: string
): { cleanMerge: boolean; mergedText: string } {
  const hunks = diff3Merge(
    ours.match(LINEBREAKS) ?? [],
    base.match(LINEBREAKS) ?? [],
    theirs.match(LINEBREAKS) ?? []
  )
  let mergedText = ''
  let cleanMerge = true
  for (const h of hunks) {
    if (h.ok) mergedText += h.ok.join('')
    if (h.conflict) {
      cleanMerge = false
      mergedText += h.conflict.a.join('')
    }
  }
  return { cleanMerge, mergedText }
}

/**
 * Ruta (relativa al vault) para la copia de la nube de una nota en conflicto:
 * "carpeta/nota.md" → "carpeta/nota (versión de la nube).md". Si ya existe una
 * copia anterior, numera ("… (versión de la nube 2).md") para no pisarla.
 */
function cloudCopyPath(dir: string, filepath: string): string {
  const m = /^(.*?)(\.[^./\\]+)?$/.exec(filepath)
  const stem = m?.[1] ?? filepath
  const ext = m?.[2] ?? ''
  const suffix = t('versión de la nube')
  let candidate = `${stem} (${suffix})${ext}`
  for (let n = 2; fs.existsSync(join(dir, candidate)); n++) {
    candidate = `${stem} (${suffix} ${n})${ext}`
  }
  return candidate
}

/**
 * Asigna una columna (lane) a cada commit según la topología del DAG, para
 * dibujar un grafo estilo git (ramas paralelas + merges). Procesa los commits
 * de más nuevo a más viejo manteniendo "lanes activas" que esperan a un padre.
 *
 * `seedTips` reserva lanes por adelantado para los tips de rama, en orden de
 * prioridad (main = lane 0). Así una rama que va ADELANTADA respecto de main
 * (todavía sin merge, topológicamente una línea recta) se dibuja igual en su
 * propio carril desde el tip, en vez de colapsar sobre la línea de main. El
 * caso del merge sigue saliendo solo, vía el segundo padre del commit de merge.
 */
function assignLanes(
  commits: { oid: string; parents: string[] }[],
  seedTips: string[] = []
): Map<string, number> {
  const lane = new Map<string, number>()
  const active: (string | null)[] = [] // active[i] = oid que la lane i está esperando

  // Sembrar un carril por tip de rama (main primero → lane 0).
  for (const tip of seedTips) {
    if (!active.includes(tip)) active.push(tip)
  }

  const firstFree = (): number => {
    const i = active.indexOf(null)
    return i === -1 ? active.length : i
  }

  for (const c of commits) {
    // ¿Alguna lane estaba esperando este commit?
    const claiming: number[] = []
    active.forEach((oid, i) => {
      if (oid === c.oid) claiming.push(i)
    })

    let myLane: number
    if (claiming.length > 0) {
      myLane = Math.min(...claiming)
      for (const i of claiming) if (i !== myLane) active[i] = null // merge de lanes
    } else {
      myLane = firstFree()
    }
    lane.set(c.oid, myLane)

    // El primer padre continúa en mi lane; los demás (merge) toman lanes nuevas.
    if (c.parents.length === 0) {
      active[myLane] = null
    } else {
      active[myLane] = c.parents[0]
      for (let p = 1; p < c.parents.length; p++) {
        if (!active.includes(c.parents[p])) active[firstFree()] = c.parents[p]
      }
    }
  }
  return lane
}

/**
 * Convierte un texto libre en un nombre de tag de git válido: espacios → guiones
 * y se quitan los caracteres prohibidos en un ref (~^:?*[\, control, etc.). Así
 * el usuario escribe "borrador final" y queda "borrador-final".
 */
function sanitizeTagName(raw: string): string {
  let name = raw.trim().replace(/\s+/g, '-')
  name = name.replace(/[~^:?*[\]\\\x00-\x20\x7f]/g, '') // eslint-disable-line no-control-regex
  name = name.replace(/@\{/g, '')
  name = name.replace(/\.{2,}/g, '.').replace(/\/{2,}/g, '/')
  name = name.replace(/^[-./]+|[-./]+$/g, '')
  if (name.endsWith('.lock')) name = name.slice(0, -'.lock'.length)
  return name
}

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
  /**
   * Cache de oids por bóveda para acelerar `workBlobs`: `dir` → (`ruta` →
   * {size, mtimeMs, oid, hashedAt}). Es una optimización PURA para no re-leer ni
   * re-hashear el contenido COMPLETO de cada archivo en cada escaneo (switch/baja
   * de bóveda con muchos archivos). Ante CUALQUIER duda, se re-hashea: el cache
   * nunca puede hacer que se pierda un cambio (garantía anti racy-git).
   */
  private hashCache = new Map<
    string,
    Map<string, { size: number; mtimeMs: number; oid: string; hashedAt: number }>
  >()

  /** Bóvedas cuyo cache persistido (.geode/hashcache.json) ya se intentó cargar. */
  private hashCacheLoaded = new Set<string>()

  private hashCachePath(dir: string): string {
    return join(dir, '.geode', 'hashcache.json')
  }

  /**
   * Carga el cache de hashes persistido de la bóveda (una sola vez por sesión).
   * Sin él, el PRIMER escaneo de cada sesión re-lee y re-hashea el contenido
   * completo de la bóveda (con adjuntos grandes: gigabytes → decenas de segundos).
   * Con él, el escaneo frío queda en stats. Es una optimización PURA: cualquier
   * entrada inválida o ilegible se descarta y ese archivo se re-hashea (la
   * ventana racy guardada en `hashedAt` sigue aplicando tras reiniciar, porque
   * son tiempos absolutos).
   */
  private async loadHashCache(dir: string): Promise<void> {
    if (this.hashCacheLoaded.has(dir)) return
    this.hashCacheLoaded.add(dir)
    if (this.hashCache.has(dir)) return // ya hay un cache en memoria más fresco
    try {
      const raw = JSON.parse(await readFile(this.hashCachePath(dir), 'utf8')) as {
        version?: number
        entries?: Record<string, { size: number; mtimeMs: number; oid: string; hashedAt: number }>
      }
      if (raw?.version !== 1 || typeof raw.entries !== 'object' || raw.entries === null) return
      const map = new Map<string, { size: number; mtimeMs: number; oid: string; hashedAt: number }>()
      for (const [rel, e] of Object.entries(raw.entries)) {
        if (
          typeof e?.size === 'number' &&
          typeof e.mtimeMs === 'number' &&
          typeof e.oid === 'string' &&
          typeof e.hashedAt === 'number'
        ) {
          map.set(rel, e)
        }
      }
      this.hashCache.set(dir, map)
    } catch {
      // Sin cache persistido (primera vez) o JSON corrupto: se re-hashea todo.
    }
  }

  /** Persiste el cache de hashes de la bóveda. Best-effort: un fallo no rompe nada. */
  private async saveHashCache(
    dir: string,
    cache: Map<string, { size: number; mtimeMs: number; oid: string; hashedAt: number }>
  ): Promise<void> {
    try {
      await mkdir(join(dir, '.geode'), { recursive: true })
      await atomicWrite(
        this.hashCachePath(dir),
        JSON.stringify({ version: 1, entries: Object.fromEntries(cache) })
      )
    } catch {
      // Best-effort: sin cache persistido, el próximo arranque re-hashea.
    }
  }

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
   * Se commitea DIRECTO en la rama actual (incluida main): las ramas se crean a
   * mano. Única excepción: si HEAD está detached (viendo una versión vieja), se
   * bifurca a una rama nueva para no perder el commit en un estado sin rama.
   *
   * Detección de cambios INMUNE al "racy git": no usamos el atajo por stat de
   * isomorphic-git (pierde ediciones del mismo tamaño en el mismo segundo);
   * hasheamos el contenido real de cada archivo (hashBlob) vs los blobs de HEAD.
   */
  async commit(dir: string, message: string): Promise<string | null> {
    return withVaultLock(dir, () => this.commitAll(dir, message), { owner: 'geode:commit' })
  }

  private async commitAll(dir: string, message: string): Promise<string | null> {
    const changes = await this.pendingChanges(dir)
    if (changes.length === 0) return null

    // Detached (sin rama): bifurca antes de commitear para no perder el commit.
    // Estar en una rama —incluida main— commitea directo en ella.
    const head = await this.headOid(dir)
    if (head && !(await this.currentBranch(dir))) {
      await this.createBranch(dir, head, '', { noCheckout: true })
    }

    // Adds batcheados: isomorphic-git 1.38 acepta `filepath: string[]`, así que
    // agregamos TODOS los modificados/creados en UNA sola llamada en vez de una
    // por archivo. Los `git.remove` NO aceptan array: van uno por borrado.
    const toAdd = changes.filter((c) => !c.deleted).map((c) => c.filepath)
    if (toAdd.length > 0) await git.add({ fs, dir, filepath: toAdd })
    for (const change of changes) {
      if (change.deleted) await git.remove({ fs, dir, filepath: change.filepath })
    }

    return git.commit({ fs, dir, message, author: this.author() })
  }

  /**
   * Commit ACOTADO a `paths`: versiona solo esas rutas (lo demás pendiente del
   * working dir queda sin tocar, para el próximo snapshot). Lo usa el servidor MCP:
   * cuando la IA escribe una nota, su commit lleva SOLO lo que escribió la IA, con
   * su propio autor, y nunca se lleva ediciones del usuario de otras notas.
   *
   * Misma detección anti racy-git que `commit`: hash del contenido real vs el blob
   * de HEAD. Devuelve null si ninguna de las rutas cambió.
   */
  async commitPaths(
    dir: string,
    paths: string[],
    message: string,
    author?: { name: string; email: string }
  ): Promise<string | null> {
    return withVaultLock(
      dir,
      async () => {
        const headBlobs = await this.headBlobs(dir)
        const toAdd: string[] = []
        const toRemove: string[] = []
        for (const filepath of new Set(paths)) {
          const abs = this.resolveInside(dir, filepath)
          let workOid: string | null = null
          try {
            workOid = (await git.hashBlob({ object: await readFile(abs) })).oid
          } catch {
            workOid = null // no existe en disco
          }
          const headBlob = headBlobs.get(filepath) ?? null
          if (workOid === headBlob) continue
          if (workOid === null) toRemove.push(filepath)
          else toAdd.push(filepath)
        }
        if (toAdd.length === 0 && toRemove.length === 0) return null

        const head = await this.headOid(dir)
        if (head && !(await this.currentBranch(dir))) {
          await this.createBranch(dir, head, '', { noCheckout: true })
        }
        if (toAdd.length > 0) await git.add({ fs, dir, filepath: toAdd })
        for (const filepath of toRemove) await git.remove({ fs, dir, filepath })
        return git.commit({ fs, dir, message, author: author ?? this.author() })
      },
      { owner: 'geode:commit-paths' }
    )
  }

  /** Oid de blob git de un contenido (la "versión" de una nota para el MCP). */
  async blobOid(content: string | Uint8Array): Promise<string> {
    const object = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
    return (await git.hashBlob({ object })).oid
  }

  /** Oid del blob de `filepath` en HEAD, o null si no está versionado. */
  async headBlobOid(dir: string, filepath: string): Promise<string | null> {
    const head = await this.headOid(dir)
    if (!head) return null
    try {
      return (await git.readBlob({ fs, dir, oid: head, filepath })).oid
    } catch {
      return null
    }
  }

  /**
   * true si la rama actual tiene al menos una versión (HEAD resoluble). false si
   * la rama está "sin nacer" (recién `git init`, HEAD apunta a una rama sin commits
   * todavía) — típico al abrir una carpeta existente como cuaderno. Se usa antes de
   * pushear: pushear una rama sin commits falla con "Could not find <rama>".
   */
  async hasCommits(dir: string): Promise<boolean> {
    try {
      await git.resolveRef({ fs, dir, ref: 'HEAD' })
      return true
    } catch {
      return false
    }
  }

  // ── Metadata de ramas (.geode/branches.json): guarda de qué rama salió cada
  // rama, para poder integrarla "a su base". .geode está fuera del versionado.
  private branchMetaPath(dir: string): string {
    return join(dir, '.geode', 'branches.json')
  }

  private async readBranchMeta(dir: string): Promise<Record<string, { base: string }>> {
    try {
      return JSON.parse(await readFile(this.branchMetaPath(dir), 'utf8'))
    } catch {
      return {}
    }
  }

  private async writeBranchMeta(dir: string, meta: Record<string, { base: string }>): Promise<void> {
    await mkdir(join(dir, '.geode'), { recursive: true })
    await atomicWrite(this.branchMetaPath(dir), JSON.stringify(meta, null, 2))
  }

  /** Ramas cuyo historial contiene `oid` (oid es el tip o un ancestro del tip). */
  private async branchesContaining(dir: string, oid: string): Promise<string[]> {
    const out: string[] = []
    for (const name of await git.listBranches({ fs, dir })) {
      const tip = await git.resolveRef({ fs, dir, ref: name })
      if (tip === oid || (await git.isDescendent({ fs, dir, oid: tip, ancestor: oid, depth: -1 }))) {
        out.push(name)
      }
    }
    return out
  }

  /** Rama base para una rama nueva creada en `oid`: la que contiene ese commit
   * (prioriza la rama `prefer`, luego main). */
  private async resolveBase(dir: string, oid: string, prefer: string | null): Promise<string> {
    const containing = await this.branchesContaining(dir, oid)
    if (prefer && containing.includes(prefer)) return prefer
    if (containing.includes(PROD)) return PROD
    return containing[0] ?? PROD
  }

  /**
   * Crea una rama en `fromOid` (por defecto HEAD) y cambia a ella. Guarda su
   * rama de origen (base) para poder integrarla después. `noCheckout` la crea
   * sin tocar el working dir (para el caso de commit desde detached).
   */
  async createBranch(
    dir: string,
    fromOid: string,
    rawName = '',
    opts: { base?: string; noCheckout?: boolean } = {}
  ): Promise<string> {
    const name = sanitizeTagName(rawName) || (await this.nextWorkBranch(dir))
    const existing = await git.listBranches({ fs, dir })
    if (existing.includes(name)) throw new Error(t('Ya existe una rama "{name}"', { name }))

    const base = opts.base ?? (await this.resolveBase(dir, fromOid, await this.currentBranch(dir)))
    await git.writeRef({ fs, dir, ref: `refs/heads/${name}`, value: fromOid, force: false })

    const meta = await this.readBranchMeta(dir)
    meta[name] = { base }
    await this.writeBranchMeta(dir, meta)

    // Si la rama sale del commit actual, adjuntamos HEAD sin tocar el working dir
    // (preserva ediciones sin versionar). Si sale de otro commit, cambiamos a él.
    const sameAsHead = fromOid === (await this.headOid(dir))
    await git.checkout({ fs, dir, ref: name, noCheckout: opts.noCheckout ?? sameAsHead, force: true })
    return name
  }

  /**
   * Integra la rama actual a SU RAMA DE ORIGEN (base) por REBASE y cambia a la
   * base. Los commits propios de la rama pasan a la historia LINEAL de la base
   * (sin merge commit), así no queda un carril separado. Se borra la rama al
   * final: como sus commits ya están en la base, el histórico se conserva.
   *
   * Caso normal (la base es ancestro de la rama): fast-forward, commits intactos.
   * Si divergieron, se reproducen sobre el tip de la base. Single-device: "gana"
   * la rama, sin merge 3-way.
   */
  async mergeBranch(dir: string): Promise<void> {
    return withVaultLock(dir, () => this.mergeBranchLocked(dir), { owner: 'geode:merge' })
  }

  private async mergeBranchLocked(dir: string): Promise<void> {
    const branch = await this.currentBranch(dir)
    if (!branch) throw new Error(t('HEAD detached: no hay rama para integrar'))

    const meta = await this.readBranchMeta(dir)
    const base = meta[branch]?.base
    if (!base) throw new Error(t('La rama "{branch}" no tiene una base a la cual integrar', { branch }))
    if (base === branch) throw new Error(t('La rama es su propia base'))

    const baseTip = await git.resolveRef({ fs, dir, ref: base }).catch(() => null)
    if (!baseTip) throw new Error(t('La rama base "{base}" ya no existe', { base }))
    const branchTip = await git.resolveRef({ fs, dir, ref: branch })

    const [mergeBase] = await git.findMergeBase({ fs, dir, oids: [baseTip, branchTip] })
    if (mergeBase === baseTip) {
      // Fast-forward: la base avanza al tip de la rama; commits sin reescribir.
      await git.writeRef({ fs, dir, ref: `refs/heads/${base}`, value: branchTip, force: true })
    } else if (mergeBase !== branchTip) {
      // Divergieron: reproducir los commits propios de la rama sobre la base.
      const log = await git.log({ fs, dir, ref: branchTip })
      const toReplay = []
      for (const entry of log) {
        if (entry.oid === mergeBase) break
        toReplay.push(entry)
      }
      toReplay.reverse() // más viejo primero
      let parent = baseTip
      for (const entry of toReplay) {
        parent = await git.commit({
          fs,
          dir,
          ref: `refs/heads/${base}`,
          tree: entry.commit.tree,
          parent: [parent],
          message: entry.commit.message,
          author: entry.commit.author,
          committer: entry.commit.author
        })
      }
    }
    // mergeBase === branchTip: la rama no aportaba nada nuevo; la base queda igual.

    await git.checkout({ fs, dir, ref: base, force: true })
    await git.deleteBranch({ fs, dir, ref: branch })
    delete meta[branch]
    await this.writeBranchMeta(dir, meta)
  }

  /**
   * Mueve HEAD a un commit. Si el oid es el tip de una rama, se adjunta a esa
   * rama (editar la continúa); si es un commit interior, queda detached (editar
   * bifurca). Sobrescribe el working dir: el caller debe commitear lo pendiente
   * antes, para no perder nada.
   */
  async checkout(dir: string, oid: string): Promise<void> {
    return withVaultLock(dir, () => this.checkoutLocked(dir, oid), { owner: 'geode:checkout' })
  }

  private async checkoutLocked(dir: string, oid: string): Promise<void> {
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
    const branchMeta = await this.readBranchMeta(dir)
    const commitsMap = new Map<string, GitCommitNode>()
    const branches: { name: string; tip: string; base?: string }[] = []

    for (const name of branchNames) {
      const tip = await git.resolveRef({ fs, dir, ref: name })
      branches.push({ name, tip, base: branchMeta[name]?.base })
      let log
      try {
        log = await git.log({ fs, dir, ref: name })
      } catch {
        continue
      }
      for (const c of log) {
        if (!commitsMap.has(c.oid)) {
          commitsMap.set(c.oid, {
            oid: c.oid,
            message: c.commit.message.trim(),
            timestamp: c.commit.author.timestamp * 1000,
            author: c.commit.author.name,
            parents: c.commit.parent ?? [],
            lane: 0
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

    // Orden de visualización (más nuevo primero) y asignación de columnas por
    // topología del DAG, para que ramas y merges se vean aunque la rama de
    // trabajo ya se haya cerrado tras el merge.
    const commits = [...commitsMap.values()].sort((a, b) => b.timestamp - a.timestamp)

    // Tips que sembramos como carriles: solo los "hoja" (los que NO son ancestros
    // de otro tip). Así una rama que apunta a un commit INTERIOR de otra no
    // reserva un carril fantasma ni le roba el carril a la otra: queda como una
    // marca sobre la misma línea hasta que tenga commits propios (ahí bifurca).
    // main siempre se siembra (carril 0), aunque esté por detrás de una rama.
    const allTips = branches.map((b) => b.tip)
    const leafTips: string[] = []
    for (const b of branches) {
      if (b.name === PROD) continue
      let isAncestorOfAnother = false
      for (const other of allTips) {
        if (other === b.tip) continue
        if (await git.isDescendent({ fs, dir, oid: other, ancestor: b.tip, depth: -1 })) {
          isAncestorOfAnother = true
          break
        }
      }
      if (!isAncestorOfAnother) leafTips.push(b.tip)
    }
    leafTips.sort(
      (a, b) => (commitsMap.get(b)?.timestamp ?? 0) - (commitsMap.get(a)?.timestamp ?? 0)
    )
    const prodTip = branches.find((b) => b.name === PROD)?.tip
    const seedTips = prodTip ? [prodTip, ...leafTips] : leafTips

    const lanes = assignLanes(commits, seedTips)
    for (const c of commits) c.lane = lanes.get(c.oid) ?? 0

    // Etiquetas: cada tag apunta a un commit. Los tags anotados se "pelan" hasta
    // el commit destino; los livianos (los que crea la app) ya lo son.
    const tags: { name: string; oid: string }[] = []
    for (const name of await git.listTags({ fs, dir })) {
      let oid = await git.resolveRef({ fs, dir, ref: name }).catch(() => null)
      if (!oid) continue
      try {
        let obj = await git.readObject({ fs, dir, oid })
        while (obj.type === 'tag') {
          oid = (obj.object as { object: string }).object
          obj = await git.readObject({ fs, dir, oid })
        }
      } catch {
        /* si no se puede leer, dejamos el oid ya resuelto */
      }
      tags.push({ name, oid })
    }

    return { commits, branches, tags, head: { oid: headOid, branch: headBranch }, onCurrentLine, pushed }
  }

  /**
   * Etiqueta un commit con un tag liviano. Sanea el nombre a un ref de git
   * válido (espacios → guiones). Devuelve el nombre final. Lanza si ya existe.
   */
  async addTag(dir: string, oid: string, rawName: string): Promise<string> {
    const name = sanitizeTagName(rawName)
    if (!name) throw new Error(t('Nombre de etiqueta inválido'))
    const existing = await git.listTags({ fs, dir })
    if (existing.includes(name)) throw new Error(t('Ya existe una etiqueta "{name}"', { name }))
    await git.tag({ fs, dir, ref: name, object: oid })
    return name
  }

  /** Borra una etiqueta por su nombre. */
  async removeTag(dir: string, name: string): Promise<void> {
    await git.deleteTag({ fs, dir, ref: name })
  }

  /**
   * Borra/descarta una rama. No permite borrar prod (main). Si es la rama ACTUAL
   * (p. ej. la creaste por error), primero cambia a su base (o main) y luego la
   * borra — así se puede descartar sin tener que mergearla.
   */
  async deleteBranch(dir: string, name: string): Promise<void> {
    if (name === PROD) throw new Error(t('No se puede borrar la rama principal (main)'))
    const meta = await this.readBranchMeta(dir)

    if (name === (await git.currentBranch({ fs, dir, fullname: false }))) {
      const base = meta[name]?.base ?? PROD
      const target = (await git.resolveRef({ fs, dir, ref: base }).catch(() => null)) ? base : PROD
      await git.checkout({ fs, dir, ref: target, force: true })
    }

    await git.deleteBranch({ fs, dir, ref: name })
    if (meta[name]) {
      delete meta[name]
      await this.writeBranchMeta(dir, meta)
    }
  }

  /** Rama actual, o null si HEAD está detached. */
  async currentBranch(dir: string): Promise<string | null> {
    return (await git.currentBranch({ fs, dir, fullname: false })) ?? null
  }

  /**
   * URL del remoto 'origin' de ESTA bóveda (leída de su `.git/config`), o null si
   * la bóveda no tiene origin configurado. Es la ÚNICA fuente de verdad del destino
   * de push (CR-01): nunca se pushea a un remoto global compartido entre bóvedas.
   */
  async getRemote(dir: string): Promise<string | null> {
    try {
      const remotes = await git.listRemotes({ fs, dir })
      return remotes.find((r) => r.remote === 'origin')?.url ?? null
    } catch {
      return null
    }
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
    if (!branch) throw new Error(t('HEAD está en una versión anterior (detached): no hay rama para pushear'))

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

  /**
   * Sincroniza la rama actual con la nube: primero TRAE lo que haya en el remoto
   * y lo integra en la rama local, y recién después pushea. Un `push` a secas
   * fallaba (non-fast-forward) apenas otro dispositivo había subido algo.
   *
   * Integración según cómo esté la nube respecto de lo local:
   *   - la rama no existe en la nube, o está igual/atrás: solo push;
   *   - la nube está adelante (lo local es ancestro): fast-forward, sin commit extra;
   *   - divergieron: merge 3-way por líneas (diff3) con un commit "Integrar cambios
   *     de la nube". Si una nota cambió en los dos lados en el MISMO lugar, en la
   *     nota queda la versión local (más lo que la nube cambió en otras partes) y
   *     la versión completa de la nube se guarda al lado como
   *     "<nota> (versión de la nube).md": nunca se pierde ninguna de las dos.
   *
   * Edición no destructiva: antes de tocar el working dir se commitea lo pendiente,
   * así el checkout que materializa la integración no pisa nada sin versionar.
   * Devuelve `pulled=true` si el working dir cambió (el renderer debe recargar).
   */
  async sync(dir: string, url: string, token: string): Promise<SyncResult> {
    // Single-flight por bóveda: el auto-respaldo, el botón y la sincronización al
    // volver a la ventana pueden coincidir. Dos integraciones a la vez sobre el
    // mismo .git podrían pisarse; la segunda espera y reusa el resultado.
    const key = resolve(dir)
    const running = this.syncsInFlight.get(key)
    if (running) return running
    const p = this.syncOnce(dir, url, token).finally(() => this.syncsInFlight.delete(key))
    this.syncsInFlight.set(key, p)
    return p
  }

  private syncsInFlight = new Map<string, Promise<SyncResult>>()

  private async syncOnce(dir: string, url: string, token: string): Promise<SyncResult> {
    const branch = await git.currentBranch({ fs, dir, fullname: false })
    if (!branch) throw new Error(t('HEAD está en una versión anterior (detached): no hay rama para pushear'))
    const onAuth = (): { username: string; password: string } => ({
      username: 'x-access-token',
      password: token
    })

    // 1. Traer SOLO esta rama desde la nube (sin tags ni otras ramas).
    const remoteTip = await this.fetchBranchTip(dir, url, branch, onAuth)

    // 2. Integrar lo traído, si la nube tiene algo que acá no está.
    //    Solo esta parte toca refs/index/working dir: va bajo el candado de la
    //    bóveda (el fetch y el push no, para no trabar al MCP mientras hay red).
    const { pulled, cloudCopies } = remoteTip
      ? await withVaultLock(dir, () => this.integrateRemote(dir, branch, remoteTip), {
          owner: 'geode:sync'
        })
      : { pulled: false, cloudCopies: [] as string[] }

    // 3. Pushear: ahora la rama contiene todo lo de la nube, así que es fast-forward.
    await git.push({ fs, http, dir, url, remote: 'origin', ref: branch, onAuth })
    const oid = await git.resolveRef({ fs, dir, ref: branch })
    return { branch, oid, pulled, cloudCopies }
  }

  /**
   * Integra en la rama local `branch` el commit `remoteTip` (ya presente en la
   * base de objetos local, p. ej. recién traído por fetch). Separado del fetch
   * para poder testearlo sin red. Ver `sync` para la estrategia.
   */
  async integrateRemote(
    dir: string,
    branch: string,
    remoteTip: string
  ): Promise<{ pulled: boolean; cloudCopies: string[] }> {
    const cloudCopies: string[] = []
    let localTip = await git.resolveRef({ fs, dir, ref: branch })
    // findMergeBase devuelve [] si las historias no se tocan (base undefined).
    const [base] = (await git.findMergeBase({ fs, dir, oids: [localTip, remoteTip] })) as (
      | string
      | undefined
    )[]
    if (remoteTip === localTip || base === remoteTip) return { pulled: false, cloudCopies }

    // Lo pendiente se versiona ANTES de mover el working dir (nada sin commit
    // puede perderse en el checkout). Si había algo, la rama ya no es
    // ancestro de la nube: pasa de fast-forward a merge 3-way, que es lo correcto.
    if (await this.commit(dir, t('Cambios antes de sincronizar'))) {
      localTip = await git.resolveRef({ fs, dir, ref: branch })
    }
    let binaryConflicts: string[] = []
    if (base === localTip) {
      // Fast-forward: la rama avanza al tip de la nube, sin reescribir nada.
      await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: remoteTip, force: true })
    } else {
      binaryConflicts = await this.mergeRemote(dir, branch, localTip, remoteTip, cloudCopies)
    }
    // Materializar el nuevo tip en disco (merge/writeRef no tocan el working dir).
    await git.checkout({ fs, dir, ref: branch, force: true })

    // Imágenes cambiadas en los dos lados: el merge por líneas no sirve para
    // binarios. Se restauran los bytes LOCALES y la versión de la nube va al lado.
    for (const filepath of binaryConflicts) {
      const ours = await this.readBytesAt(dir, localTip, filepath)
      const theirs = await this.readBytesAt(dir, remoteTip, filepath)
      await atomicWrite(this.resolveInside(dir, filepath), ours)
      const copyPath = cloudCopyPath(dir, filepath)
      await atomicWrite(this.resolveInside(dir, copyPath), theirs)
      cloudCopies.push(copyPath)
    }

    if (cloudCopies.length > 0) {
      await this.commit(
        dir,
        cloudCopies.length === 1
          ? t('Versión de la nube de una nota en conflicto')
          : t('Versiones de la nube de {n} notas en conflicto', { n: cloudCopies.length })
      )
    }
    return { pulled: true, cloudCopies }
  }

  /**
   * Trae la rama `branch` del remoto y devuelve su oid, o null si la rama todavía
   * no existe en la nube (repo vacío recién creado, o primera subida de una rama
   * nueva). Cualquier otro fallo (red, auth) se propaga.
   */
  private async fetchBranchTip(
    dir: string,
    url: string,
    branch: string,
    onAuth: () => { username: string; password: string }
  ): Promise<string | null> {
    try {
      const res = await git.fetch({
        fs,
        http,
        dir,
        url,
        remote: 'origin',
        ref: branch,
        singleBranch: true,
        tags: false,
        onAuth
      })
      return res.fetchHead
    } catch (e) {
      // isomorphic-git lanza NotFoundError cuando el remoto tiene refs pero no
      // esta rama; un remoto vacío no lanza (fetchHead null).
      if ((e as { code?: string })?.code === 'NotFoundError') return null
      throw e
    }
  }

  /**
   * Merge 3-way de la nube (`remoteTip`) sobre la rama local. Los conflictos por
   * línea se resuelven a favor de lo local y la versión completa de la nube de
   * cada nota en conflicto se escribe al lado ("<nota> (versión de la nube).md");
   * sus rutas se agregan a `cloudCopies` (el caller las commitea).
   *
   * Si isomorphic-git no puede hacer el merge (historias entrecruzadas con varias
   * bases, o una nota borrada de un lado y editada del otro), cae a un merge
   * conservador: el árbol local queda tal cual y los commits de la nube pasan a
   * ser ancestros del merge. Nada se pierde (todo sigue en el historial) y el
   * push deja de rechazarse.
   */
  private async mergeRemote(
    dir: string,
    branch: string,
    localTip: string,
    remoteTip: string,
    cloudCopies: string[]
  ): Promise<string[]> {
    const author = this.author()
    // Binarios (imágenes) cambiados en ambos lados: el driver solo ve texto, así
    // que se marcan y el caller restaura los bytes reales tras el checkout.
    const binaryConflicts: string[] = []
    const message = t('Integrar cambios de la nube')
    const conflicts = new Map<string, string>() // ruta → contenido completo de la nube

    const mergeDriver: MergeDriverCallback = ({ contents, path }) => {
      const [base, ours, theirs] = contents
      if (isAttachmentPath(path) || /\u0000/.test(ours + theirs)) {
        binaryConflicts.push(path)
        return { cleanMerge: true, mergedText: ours }
      }
      const r = mergeLines(base, ours, theirs)
      if (!r.cleanMerge) conflicts.set(path, theirs)
      return { cleanMerge: true, mergedText: r.mergedText }
    }

    try {
      await git.merge({
        fs,
        dir,
        ours: branch,
        theirs: remoteTip,
        author,
        committer: author,
        message,
        mergeDriver,
        allowUnrelatedHistories: true
      })
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code !== 'MergeNotSupportedError' && code !== 'MergeConflictError') throw e
      console.warn(`[sync] merge automático no posible (${code}); se integra conservando lo local`)
      const { commit } = await git.readCommit({ fs, dir, oid: localTip })
      await git.commit({
        fs,
        dir,
        ref: `refs/heads/${branch}`,
        tree: commit.tree,
        parent: [localTip, remoteTip],
        message,
        author,
        committer: author
      })
    }

    for (const [filepath, content] of conflicts) {
      const copyPath = cloudCopyPath(dir, filepath)
      await atomicWrite(this.resolveInside(dir, copyPath), content)
      cloudCopies.push(copyPath)
    }
    return binaryConflicts
  }

  /**
   * Clona un repo en `dir` (que debe estar vacío). Trae todas las ramas para que
   * el árbol de versiones quede completo. El auth va por HTTPS con el token de
   * OAuth, igual que push.
   */
  async clone(dir: string, url: string, token: string): Promise<void> {
    await git.clone({
      fs,
      http,
      dir,
      url,
      singleBranch: false, // todas las ramas: el árbol de versiones las usa
      onAuth: () => ({ username: 'x-access-token', password: token })
    })
  }

  /** Contenido de una nota tal como estaba en un commit dado. */
  async readAt(dir: string, oid: string, filepath: string): Promise<string> {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath })
    return new TextDecoder().decode(blob)
  }

  /**
   * Como readAt, pero devuelve null si la nota no existía en ese commit (caso
   * normal al viajar en el tiempo con notas abiertas que se crearon después).
   * Cualquier otro error se propaga.
   */
  async readAtOrNull(dir: string, oid: string, filepath: string): Promise<string | null> {
    try {
      return await this.readAt(dir, oid, filepath)
    } catch (e) {
      if ((e as { code?: string })?.code === 'NotFoundError') return null
      throw e
    }
  }

  /** Bytes crudos de un archivo tal como estaba en un commit (imágenes del pasado). */
  async readBytesAt(dir: string, oid: string, filepath: string): Promise<Uint8Array> {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath })
    return blob
  }

  /**
   * Árbol de notas (.md) e imágenes tal como estaba en un commit, con la MISMA forma que
   * `vault.tree()` (carpetas primero, luego archivos, alfabético). `treeBlobs`
   * no filtra, así que acá excluimos las carpetas no versionadas
   * (.git/.geode/…) y todo lo que no sea .md. Es la fuente de la vista previa
   * al "volver en el tiempo".
   */
  async treeAt(dir: string, oid: string): Promise<TreeNode[]> {
    const blobs = await this.treeBlobs(dir, oid)
    const paths: string[] = []
    for (const filepath of blobs.keys()) {
      if (IGNORED_TOP.has(filepath.split('/')[0])) continue
      // Mismo criterio que vault.tree(): notas e imágenes.
      if (!filepath.toLowerCase().endsWith('.md') && !isAttachmentPath(filepath)) continue
      paths.push(filepath)
    }
    return this.buildTree(paths)
  }

  /**
   * Reconstruye un `TreeNode[]` a partir de una lista plana de rutas .md, en la
   * misma forma/orden que `VaultService.tree()`: carpetas primero, luego
   * archivos, alfabético dentro de cada grupo. Es pura (sin I/O): solo arma el
   * árbol para que `treeAt` calce con `vault.tree()` sin tocar `FileTree`.
   */
  private buildTree(paths: string[]): TreeNode[] {
    const root: TreeNode[] = []
    const dirs = new Map<string, TreeNode[]>() // ruta de carpeta → sus hijos
    dirs.set('', root)

    // Crea (si no existe) la carpeta `relDir` y sus ancestros; devuelve sus hijos.
    const ensureDir = (relDir: string): TreeNode[] => {
      const existing = dirs.get(relDir)
      if (existing) return existing
      const slash = relDir.lastIndexOf('/')
      const parentRel = slash === -1 ? '' : relDir.slice(0, slash)
      const name = slash === -1 ? relDir : relDir.slice(slash + 1)
      const children: TreeNode[] = []
      ensureDir(parentRel).push({ name, path: relDir, isDir: true, children })
      dirs.set(relDir, children)
      return children
    }

    for (const filepath of paths) {
      const slash = filepath.lastIndexOf('/')
      const parentRel = slash === -1 ? '' : filepath.slice(0, slash)
      const name = slash === -1 ? filepath : filepath.slice(slash + 1)
      ensureDir(parentRel).push({ name, path: filepath, isDir: false })
    }

    // Carpetas primero, luego archivos; alfabético dentro de cada grupo (igual que vault).
    const sortRec = (nodes: TreeNode[]): void => {
      nodes.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
      for (const n of nodes) if (n.children) sortRec(n.children)
    }
    sortRec(root)
    return root
  }

  /**
   * Basenames (sin carpeta ni .md) de las notas que cambiaron en un commit
   * respecto de su PRIMER padre. Una nota cuenta si su blob difiere del padre o
   * no existía en él; en un commit raíz (sin padre) cuenta todo lo agregado.
   * Ignora carpetas no versionadas y lo que no sea .md. OJO: es commit-vs-padre,
   * NO reutiliza `commitDiff` (que es árbol-vs-HEAD, otra pregunta).
   */
  async changedFiles(dir: string, oid: string): Promise<string[]> {
    const { commit } = await git.readCommit({ fs, dir, oid })
    const parent = commit.parent?.[0] ?? null
    const trees = parent ? [TREE({ ref: oid }), TREE({ ref: parent })] : [TREE({ ref: oid })]

    const changed: string[] = []
    await git.walk({
      fs,
      dir,
      trees,
      map: async (filepath, entries) => {
        if (filepath === '.') return undefined
        if (IGNORED_TOP.has(filepath.split('/')[0])) return null // no descender a carpetas ignoradas
        if (!filepath.toLowerCase().endsWith('.md')) return undefined
        const [child, base] = entries
        if (!child || (await child.type()) !== 'blob') return undefined
        const childOid = await child.oid()
        const baseOid = base && (await base.type()) === 'blob' ? await base.oid() : null
        if (childOid !== baseOid) {
          const name = filepath.slice(filepath.lastIndexOf('/') + 1)
          changed.push(name.replace(/\.md$/i, ''))
        }
        return undefined
      }
    })
    return changed
  }

  /**
   * Materializa el árbol de un commit en el working dir: escribe/borra archivos
   * para dejarlo idéntico a esa versión, SIN mover HEAD, sin crear rama ni
   * detached-HEAD, sin tocar el index ni las refs. NO usa `git.checkout()`.
   *
   * El set de BORRADOS sale de `workBlobs` (que ya filtra .git/.geode/…): esas
   * carpetas son estructuralmente inalcanzables, nunca se enumeran por readdir
   * crudo ni se basan en `treeBlobs`. Las escrituras son atómicas (temp+rename)
   * y binario-safe; se saltan los archivos que ya coinciden para no ensuciar.
   */
  async restoreTree(dir: string, oid: string): Promise<void> {
    return withVaultLock(dir, () => this.restoreTreeLocked(dir, oid), { owner: 'geode:restore' })
  }

  private async restoreTreeLocked(dir: string, oid: string): Promise<void> {
    const target = await this.treeBlobs(dir, oid) // ruta→blobOid del commit pasado
    const current = await this.workBlobs(dir) // ruta→hash del working dir (IGNORE-filtrado, racy-safe)

    // Escribir: por cada archivo del árbol destino que difiera del actual.
    for (const [filepath, blobOid] of target) {
      if (current.get(filepath) === blobOid) continue // igual: no ensuciar
      const { blob } = await git.readBlob({ fs, dir, oid, filepath })
      await atomicWrite(this.resolveInside(dir, filepath), Buffer.from(blob))
    }

    // Borrar: lo que está en el working dir pero no en el árbol destino. El set
    // sale de `workBlobs` (IGNORE-filtrado): .git/.geode nunca entran.
    for (const filepath of current.keys()) {
      if (!target.has(filepath)) await rm(this.resolveInside(dir, filepath), { force: true })
    }
  }

  /**
   * Resuelve `filepath` (relativo al vault) a ruta absoluta y verifica que quede
   * DENTRO de `dir`. Defensa en profundidad para `restoreTree`, que escribe Y
   * borra archivos: un commit malicioso traído por clone/pull con una entrada
   * `..` no debe poder salir del vault. Lanza si la ruta escapa.
   */
  private resolveInside(dir: string, filepath: string): string {
    const root = resolve(dir)
    const full = resolve(root, filepath)
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error(t('Ruta fuera del vault: {path}', { path: filepath }))
    }
    return full
  }

  /**
   * Historial de UNA nota: los commits (de todas las ramas) donde su contenido
   * cambió, del más viejo al más nuevo. Un commit cuenta como versión si el blob
   * de la nota difiere de TODOS sus padres (o es su primera aparición); así los
   * merges que no cambian la nota no ensucian la línea de tiempo.
   */
  async noteHistory(dir: string, filepath: string): Promise<NoteVersion[]> {
    const branchNames = await git.listBranches({ fs, dir })
    const commits = new Map<
      string,
      { oid: string; message: string; timestamp: number; author: string; parents: string[] }
    >()
    for (const name of branchNames) {
      let log
      try {
        log = await git.log({ fs, dir, ref: name })
      } catch {
        continue
      }
      for (const c of log) {
        if (!commits.has(c.oid)) {
          commits.set(c.oid, {
            oid: c.oid,
            message: c.commit.message.trim(),
            timestamp: c.commit.author.timestamp * 1000,
            author: c.commit.author.name,
            parents: c.commit.parent ?? []
          })
        }
      }
    }

    // Oid del blob de la nota en un commit (null si no existe ahí).
    const blobAt = async (commitOid: string): Promise<string | null> => {
      try {
        return (await git.readBlob({ fs, dir, oid: commitOid, filepath })).oid
      } catch {
        return null
      }
    }

    // Orden topológico (ancestros primero). NO se puede ordenar por timestamp:
    // los commits de git tienen granularidad de 1 segundo, así que dos versiones
    // guardadas en el mismo segundo empatan y el orden queda indefinido. La
    // ancestría es la única fuente confiable de "más viejo → más nuevo".
    const topoIndex = new Map<string, number>()
    let n = 0
    for (const start of commits.keys()) {
      if (topoIndex.has(start)) continue
      const stack = [start]
      while (stack.length) {
        const oid = stack[stack.length - 1]
        if (topoIndex.has(oid)) {
          stack.pop()
          continue
        }
        const parents = (commits.get(oid)?.parents ?? []).filter(
          (p) => commits.has(p) && !topoIndex.has(p)
        )
        if (parents.length > 0) stack.push(...parents) // procesar ancestros primero
        else topoIndex.set(oid, n++) // sin ancestros pendientes: le toca su índice
      }
    }

    const versions: { v: NoteVersion; order: number }[] = []
    for (const c of commits.values()) {
      const here = await blobAt(c.oid)
      if (here === null) continue // la nota no existe en este commit
      const parentBlobs = await Promise.all(c.parents.map(blobAt))
      const isNew = c.parents.length === 0 || parentBlobs.every((b) => b !== here)
      if (isNew) {
        versions.push({
          v: { oid: c.oid, message: c.message, timestamp: c.timestamp, author: c.author },
          order: topoIndex.get(c.oid) ?? 0
        })
      }
    }
    versions.sort((a, b) => a.order - b.order) // ancestros primero = viejo → nuevo
    return versions.map((x) => x.v)
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
    // Solo notas .md — el commit sí versiona adjuntos; acá acotamos lo que ve la IA.
    const changes = (await this.pendingChanges(dir)).filter((c) =>
      c.filepath.toLowerCase().endsWith('.md')
    )
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
      // context: 2 — menos líneas sin cambios alrededor, para que la IA se
      // enfoque en lo agregado/quitado y no resuma la nota entera.
      out += createPatch(filepath, oldText, newText, '', '', { context: 2 }) + '\n'
    }
    return out.trim()
  }

  /**
   * Recuento de líneas sin commitear de TODO el vault: cuántas líneas se
   * agregaron y cuántas se quitaron respecto de HEAD. A diferencia de
   * `pendingDiff` (que acota a `.md` para la IA), acá se suman TODOS los
   * pendientes — adjuntos incluidos — porque el contador refleja la magnitud
   * real del trabajo sin versionar. La detección de cambios es siempre por
   * content-hash vs blobs de HEAD (vía `pendingChanges`/`headBlobs`/`workBlobs`);
   * NUNCA statusMatrix (regla racy-git). Los binarios no aportan líneas.
   */
  async pendingLineStat(dir: string): Promise<{ added: number; removed: number }> {
    const changes = await this.pendingChanges(dir) // todos los pendientes, sin filtrar por .md
    if (changes.length === 0) return { added: 0, removed: 0 }
    const headOid = await this.headOid(dir)

    // Cap de lectura: un adjunto grande (video, PDF, descarga a medias) no puede
    // ser una nota de texto; leerlo ENTERO solo para que `looksBinary` lo descarte
    // costaba gigabytes de I/O por refresh del contador. Por encima del cap se
    // trata como binario (que ya no aporta líneas) SIN leerlo. Por debajo, se
    // huele el primer bloque (como git): si ya parece binario, ni se lee entero
    // ni se toca el blob de HEAD (leer HEAD es un walk del tree POR archivo).
    const MAX_TEXT_BYTES = 5 * 1024 * 1024

    let added = 0
    let removed = 0
    for (const { filepath, deleted } of changes) {
      if (!deleted) {
        const st = await stat(join(dir, filepath)).catch(() => null)
        if (!st || st.size > MAX_TEXT_BYTES) continue
        if (await this.sniffsBinary(join(dir, filepath))) continue
      }
      const newText = deleted ? '' : await readFile(join(dir, filepath), 'utf8').catch(() => '')
      if (this.looksBinary(newText)) continue
      const oldText = headOid ? await this.safeReadAt(dir, headOid, filepath) : ''

      // Los binarios no se diffean por líneas; se saltan del recuento.
      if (this.looksBinary(oldText)) continue

      for (const part of diffLines(oldText, newText)) {
        if (part.added) added += part.count ?? 0
        else if (part.removed) removed += part.count ?? 0
      }
    }
    return { added, removed }
  }

  /** Blobs (ruta→oid) del árbol de un commit. Solo archivos, no carpetas. */
  private async treeBlobs(dir: string, ref: string): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    await git.walk({
      fs,
      dir,
      trees: [TREE({ ref })],
      map: async (filepath, [entry]) => {
        if (!entry || filepath === '.') return
        if ((await entry.type()) === 'blob') map.set(filepath, await entry.oid())
      }
    })
    return map
  }

  /**
   * Diff de una versión contra HEAD (el commit en el que estás parado): en qué
   * difiere esa versión de la actual. `added` = está en la versión pero no en
   * HEAD; `deleted` = está en HEAD pero no en la versión. Si es la versión
   * actual, no hay diferencias. Texto con patch unificado (jsdiff); binarios
   * solo como estado.
   */
  async commitDiff(dir: string, oid: string): Promise<{ path: string; status: 'added' | 'modified' | 'deleted'; patch: string }[]> {
    const head = await this.headOid(dir)
    if (!head || head === oid) return [] // es la versión actual: sin diferencias

    const target = await this.treeBlobs(dir, oid) // la versión elegida
    const current = await this.treeBlobs(dir, head) // HEAD (referencia)
    const paths = [...new Set([...target.keys(), ...current.keys()])].sort((a, b) => a.localeCompare(b))

    const out: { path: string; status: 'added' | 'modified' | 'deleted'; patch: string }[] = []
    for (const path of paths) {
      const t = target.get(path)
      const h = current.get(path)
      if (t && h && t === h) continue // sin cambios

      const status: 'added' | 'modified' | 'deleted' = !h ? 'added' : !t ? 'deleted' : 'modified'
      const oldText = h ? await this.safeReadAt(dir, head, path) : '' // contenido en HEAD
      const newText = t ? await this.safeReadAt(dir, oid, path) : '' // contenido en la versión

      const patch =
        this.looksBinary(oldText) || this.looksBinary(newText)
          ? `Archivo binario (${status})`
          : createPatch(path, oldText, newText, '', '')
      out.push({ path, status, patch })
    }
    return out
  }

  /** Heurística simple: un byte NUL sugiere contenido binario (no diffeable como texto). */
  private looksBinary(text: string): boolean {
    return text.includes(String.fromCharCode(0))
  }

  /**
   * Huele si un archivo es binario leyendo SOLO su primer bloque (8 KB, como
   * git): un byte NUL ⇒ binario. Evita cargar jpg/epub/pdf enteros a memoria
   * solo para descartarlos. Ante error de lectura, true (se salta: conservador).
   */
  private async sniffsBinary(absPath: string): Promise<boolean> {
    let fh: FileHandle | null = null
    try {
      fh = await open(absPath, 'r')
      const buf = Buffer.alloc(8192)
      const { bytesRead } = await fh.read(buf, 0, 8192, 0)
      return buf.subarray(0, bytesRead).includes(0)
    } catch {
      return true
    } finally {
      await fh?.close().catch(() => {})
    }
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

  /** Próximo nombre de rama de trabajo libre: trabajo-1, trabajo-2, … */
  private async nextWorkBranch(dir: string): Promise<string> {
    const branches = await git.listBranches({ fs, dir })
    let max = 0
    for (const b of branches) {
      const m = /^trabajo-(\d+)$/.exec(b)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return `trabajo-${max + 1}`
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
   *
   * Optimización (bóvedas grandes): en vez de leer+hashear el contenido COMPLETO
   * de cada archivo EN SERIE, primero se recorren los directorios (barato) para
   * juntar la lista de rutas, luego se hace `stat` de cada una y se REUTILIZA el
   * oid cacheado cuando (size, mtimeMs) coinciden con la corrida anterior y la
   * entrada quedó FUERA de la ventana racy. Los que sí hay que re-hashear corren
   * con concurrencia acotada.
   *
   * CRÍTICO (landmine de CLAUDE.md — racy git): el cache es una optimización pura.
   * Una entrada solo se reutiliza si `prev.hashedAt - prev.mtimeMs > RACY_MARGIN_MS`,
   * es decir, si el archivo fue escrito con MÁS de un segundo de anticipación al
   * hasheo que lo cacheó. Así, una edición del mismo tamaño en el mismo segundo del
   * escaneo que pobló el cache SIEMPRE se re-hashea → el cambio nunca se pierde. NO
   * se vuelve a statusMatrix ni se confía ciegamente en los stats.
   */
  private async workBlobs(dir: string): Promise<Map<string, string>> {
    // Margen racy: git considera "racily clean" un archivo con mtime dentro del
    // mismo segundo del escaneo. Espejamos ese comportamiento a 1s de resolución.
    const RACY_MARGIN_MS = 1000
    // Concurrencia máxima de stats+hash en vuelo: acota memoria y descriptores.
    const CONCURRENCY = 16

    // 1) Recorrer solo la estructura de directorios (sin leer contenido) para
    // juntar la lista de rutas de archivo, saltando las carpetas no versionadas.
    const paths: string[] = []
    const collect = async (relDir: string): Promise<void> => {
      const entries = await readdir(join(dir, relDir), { withFileTypes: true })
      for (const entry of entries) {
        if (IGNORED_TOP.has(entry.name)) continue
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          await collect(rel)
        } else if (entry.isFile()) {
          paths.push(rel)
        }
      }
    }
    await collect('')

    // Cache persistido: convierte el escaneo frío de cada sesión (re-hashear
    // TODO el contenido) en un escaneo por stats. No-op si ya se cargó.
    await this.loadHashCache(dir)
    const prevCache = this.hashCache.get(dir)
    // Cache nuevo: solo las entradas observadas en ESTA corrida (así no crece con
    // archivos borrados). Las reusadas conservan su hashedAt/mtimeMs/oid.
    const nextCache = new Map<
      string,
      { size: number; mtimeMs: number; oid: string; hashedAt: number }
    >()
    const map = new Map<string, string>()
    // true si esta corrida hasheó al menos un archivo (⇒ el cache cambió).
    let rehashed = false

    // 2+3) Resolver el oid de una ruta: reutiliza el cache cuando es seguro, o
    // re-lee+re-hashea. Registra la entrada resultante en `nextCache`.
    const resolveOne = async (rel: string): Promise<void> => {
      let size: number
      let mtimeMs: number
      try {
        const st = await stat(join(dir, rel))
        size = st.size
        mtimeMs = st.mtimeMs
      } catch {
        // El archivo desapareció entre el readdir y el stat: lo omitimos (queda
        // como "borrado" frente a HEAD, que es lo correcto).
        return
      }

      const prev = prevCache?.get(rel)
      const outsideRacyWindow = prev ? prev.hashedAt - prev.mtimeMs > RACY_MARGIN_MS : false
      if (prev && prev.size === size && prev.mtimeMs === mtimeMs && outsideRacyWindow) {
        // Reutilizar: mismo tamaño, mismo mtime y fuera de la ventana racy.
        map.set(rel, prev.oid)
        nextCache.set(rel, prev)
        return
      }

      // Re-hashear: cualquier duda (sin entrada previa, cambió size/mtime, o cae
      // en la ventana racy) fuerza leer el contenido real y hashearlo.
      const content = await readFile(join(dir, rel))
      const { oid } = await git.hashBlob({ object: content })
      rehashed = true
      map.set(rel, oid)
      nextCache.set(rel, { size, mtimeMs, oid, hashedAt: Date.now() })
    }

    // 4) Pool inline con índice compartido: N workers consumiendo la lista de rutas.
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < paths.length) {
        const i = cursor++
        await resolveOne(paths[i])
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, paths.length) }, () => worker())
    )

    // 5) Reemplazar el cache de este dir por las entradas de esta corrida y
    // persistirlo si cambió (algo se hasheó, o aparecieron/desaparecieron rutas).
    // Fire-and-forget: guardar el JSON nunca bloquea ni rompe el escaneo.
    const dirty = rehashed || nextCache.size !== (prevCache?.size ?? -1)
    this.hashCache.set(dir, nextCache)
    if (dirty) void this.saveHashCache(dir, nextCache)
    return map
  }
}
