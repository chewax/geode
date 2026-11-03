import { dialog } from 'electron'
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type { Backlink, SearchResult, TreeNode, VaultInfo } from '@shared/ipc'
import { ATTACHMENTS_DIR, MAX_ATTACHMENT_BYTES, extOf, isAttachmentPath, isImagePath } from '@shared/attachments'
import { extractTags, tagMatches } from '@shared/obsidian'
import { baseName, displayName, isNotePath, parseWikilinks, resolveLink, rewriteLinks, lineOf } from '@shared/links'
import { foldQuery, searchText } from '@shared/search'
import { matchesFilters, parseQuery, propertyLine } from '@shared/query'
import { atomicWrite } from '../fs/atomic'
import { sanitizeVaultName, SEED_BIENVENIDA } from '../fs/vaultName'

/** Carpetas que nunca se muestran en el árbol. */
const IGNORED_DIRS = new Set(['.git', '.geode', 'node_modules', '.obsidian'])

/**
 * Estado y operaciones de un vault (una carpeta = un repo, ver ARCHITECTURE.md §5).
 * Es la implementación concreta, en el main, sobre la que después se apoyarán
 * Git/Sync. El markdown en disco es la fuente de verdad.
 */
export class VaultService {
  private root: string | null = null

  getInfo(): VaultInfo | null {
    return this.root ? { root: this.root, name: basename(this.root) } : null
  }

  /** Fija el vault activo. Lanza si la carpeta no existe. */
  async setRoot(root: string): Promise<VaultInfo> {
    const abs = resolve(root)
    const st = await stat(abs)
    if (!st.isDirectory()) throw new Error(`No es una carpeta: ${abs}`)
    this.root = abs
    return this.getInfo()!
  }

  /** Deja la app sin bóveda activa — usado al dar de baja la última bóveda. */
  clearRoot(): void {
    this.root = null
  }

  async openDialog(): Promise<VaultInfo | null> {
    const res = await dialog.showOpenDialog({
      title: 'Elegí una carpeta como vault',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return this.setRoot(res.filePaths[0])
  }

  /** Diálogo para elegir una carpeta (sin fijarla como vault). null si se cancela. */
  async pickFolder(title: string): Promise<string | null> {
    const res = await dialog.showOpenDialog({
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  }

  /** true si la carpeta no existe o está vacía (para clonar/crear sin pisar nada). */
  async isEmptyDir(dir: string): Promise<boolean> {
    try {
      return (await readdir(dir)).length === 0
    } catch {
      return true // no existe todavía
    }
  }

  /**
   * Resuelve una ruta relativa a absoluta garantizando que quede DENTRO del
   * vault. Bloquea path traversal (`../`) — clave para no leer/escribir fuera.
   */
  private resolveInside(relPath: string): string {
    if (!this.root) throw new Error('No hay vault abierto')
    const abs = resolve(this.root, relPath)
    const rel = relative(this.root, abs)
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new Error(`Ruta fuera del vault: ${relPath}`)
    }
    return abs
  }

  async tree(): Promise<TreeNode[]> {
    if (!this.root) return []
    return this.readDir(this.root, '')
  }

  private async readDir(absDir: string, relDir: string): Promise<TreeNode[]> {
    const entries = await readdir(absDir, { withFileTypes: true })
    const nodes: TreeNode[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: rel,
          isDir: true,
          children: await this.readDir(join(absDir, entry.name), rel)
        })
      } else if (entry.isFile() && (isNotePath(entry.name) || isAttachmentPath(entry.name))) {
        // Notas e imágenes: las imágenes se muestran para poder abrirlas,
        // renombrarlas o moverlas (y sus enlaces se actualizan).
        nodes.push({ name: entry.name, path: rel, isDir: false })
      }
    }

    // Carpetas primero, luego archivos; alfabético dentro de cada grupo.
    nodes.sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1
    )
    return nodes
  }

  async readNote(relPath: string): Promise<string> {
    return readFile(this.resolveInside(relPath), 'utf8')
  }

  async writeNote(relPath: string, content: string): Promise<void> {
    await atomicWrite(this.resolveInside(relPath), content)
  }

  /** Crea una nota nueva con nombre libre en `relDir` ('' = raíz). */
  async createNote(relDir = ''): Promise<TreeNode> {
    if (!this.root) throw new Error('No hay vault abierto')
    const base = 'Nueva nota'

    let name = `${base}.md`
    let n = 1
    while (await this.exists(join(relDir, name))) {
      name = `${base} ${n++}.md`
    }

    const rel = relDir ? `${relDir}/${name}` : name
    await atomicWrite(this.resolveInside(rel), `# ${base}\n\n`)
    return { name, path: rel, isDir: false }
  }

  /** Crea una carpeta con nombre libre en `relDir` ('' = raíz). */
  async createFolder(relDir = ''): Promise<TreeNode> {
    if (!this.root) throw new Error('No hay vault abierto')
    const base = 'Nueva carpeta'

    let name = base
    let n = 1
    while (await this.exists(join(relDir, name))) {
      name = `${base} ${n++}`
    }

    const rel = relDir ? `${relDir}/${name}` : name
    await mkdir(this.resolveInside(rel), { recursive: true })
    return { name, path: rel, isDir: true, children: [] }
  }

  /**
   * Crea un cuaderno LOCAL nuevo bajo `baseDir` (p.ej. `~/Documents/Geode`) y
   * siembra `Bienvenida.md` (ONB-02/03/04). Este método hace SOLO el lado de
   * filesystem: NO fija el cuaderno como activo — el handler llama a `setRoot`
   * recién DESPUÉS de que `git init` + primer commit del seed hayan tenido éxito,
   * igual que `vaultCreateWithRepo`/`vaultCloneFromGithub`. Así una falla parcial
   * (disco lleno, `.git` bloqueado, etc.) no deja el main apuntando a una carpeta
   * huérfana sin repo mientras el renderer cree que la creación falló.
   *
   * La resolución de colisión con sufijo ` (2)`, ` (3)`… se hace creando la carpeta
   * hoja de forma NO recursiva (`EEXIST` si ya existe): es la garantía dura del core
   * value "nada se pisa" — el chequeo-y-creación es atómico, así una carrera con otro
   * proceso reintenta el sufijo en vez de sembrar sobre una carpeta ajena.
   */
  async createLocal(name: string, baseDir: string): Promise<{ root: string }> {
    const safe = sanitizeVaultName(name)

    // baseDir (p.ej. ~/Documents/Geode) puede no existir todavía: se crea recursivo.
    // Solo la carpeta HOJA se crea de forma no recursiva para detectar colisiones.
    await mkdir(baseDir, { recursive: true })

    // Crear la carpeta hoja con `recursive: false`: `mkdir` lanza EEXIST si ya
    // existe, lo que hace el chequeo-de-colisión atómico con la creación. Sufijo
    // con paréntesis y espacio exactos: " (2)", " (3)"… Se ancla en baseDir (NO vía
    // this.exists, que se ancla al vault ACTUAL — base equivocada para una fresca).
    let candidate = safe
    let n = 2
    let dir: string
    for (;;) {
      const target = join(baseDir, candidate)
      try {
        await mkdir(target, { recursive: false })
        dir = target
        break
      } catch (e) {
        if ((e as NodeJS.ErrnoException)?.code !== 'EEXIST') throw e
        candidate = `${safe} (${n++})`
      }
    }

    // Siembra atómica del seed (temp + fsync + rename): nunca una nota corrupta.
    // Si la siembra falla (p.ej. disco lleno), se limpia la carpeta recién creada
    // para no dejar un directorio vacío que fuerce el sufijo " (2)" en el reintento.
    try {
      await atomicWrite(join(dir, 'Bienvenida.md'), SEED_BIENVENIDA)
    } catch (e) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      throw e
    }

    return { root: dir }
  }

  /**
   * Descarta (borra recursivo) una carpeta de cuaderno recién creada por
   * `createLocal` cuando un paso posterior —`git init`/primer commit— falla ANTES
   * de fijarla como activa. Evita dejar cuadernos huérfanos sin repo en disco que,
   * por la resolución de colisión atómica de `createLocal`, forzarían el sufijo
   * " (2)" en cada reintento (WR-04). A diferencia de `deletePath`, opera sobre la
   * ruta ABSOLUTA devuelta por `createLocal` (la carpeta todavía no es el vault
   * activo, así que no hay `resolveInside` posible).
   */
  async discard(root: string): Promise<void> {
    await rm(root, { recursive: true, force: true })
  }

  /** Renombra/mueve una nota o carpeta. Ambas rutas quedan validadas dentro del vault. */
  async rename(fromRel: string, toRel: string): Promise<void> {
    const from = this.resolveInside(fromRel)
    const to = this.resolveInside(toRel)
    // Mismo path exacto: nada que hacer (renombrar al mismo nombre no es un error).
    if (from === to) return
    // En Windows/macOS el FS suele ser case-insensitive: renombrar solo cambiando
    // mayúsculas/minúsculas apunta al MISMO archivo. En ese caso no es una colisión
    // ("Ya existe" sería falso positivo) — se hace el rename para aplicar el nuevo case.
    const sameFileDifferentCase = from.toLowerCase() === to.toLowerCase()
    if (!sameFileDifferentCase && (await this.exists(toRel))) {
      throw new Error(`Ya existe: ${toRel}`)
    }
    await rename(from, to)
  }

  /** Borra una nota o una carpeta (recursivo). */
  async deletePath(relPath: string): Promise<void> {
    await rm(this.resolveInside(relPath), { recursive: true, force: true })
  }

  /**
   * Ruta absoluta de una nota/carpeta, YA validada dentro del vault. La expone
   * para que el handler pueda pasarla al shell del SO (revelar en el explorador)
   * sin que el renderer maneje rutas absolutas ni se salte la validación.
   */
  absPath(relPath: string): string {
    return this.resolveInside(relPath)
  }

  /**
   * Duplica una nota o carpeta con un nombre libre estilo "copia" ("X copia",
   * "X copia 2"…). Las notas se copian por atomicWrite (consistencia con el resto
   * del código); las carpetas por cp recursivo. Origen y destino quedan validados
   * dentro del vault. Devuelve el nodo nuevo.
   */
  async duplicate(relPath: string): Promise<TreeNode> {
    const src = this.resolveInside(relPath)
    const st = await stat(src)
    const isDir = st.isDirectory()

    // Directorio padre relativo ('' = raíz) y basename del origen.
    const parent = dirname(relPath)
    const relDir = parent === '.' || parent === '' ? '' : parent.replace(/\\/g, '/')
    const name = basename(relPath)

    // Para notas se preserva la extensión .md al armar el nombre "copia".
    const ext = isDir ? '' : extname(name)
    const stem = isDir ? name : name.slice(0, name.length - ext.length)

    let candidate = `${stem} copia${ext}`
    let n = 2
    while (await this.exists(relDir ? `${relDir}/${candidate}` : candidate)) {
      candidate = `${stem} copia ${n++}${ext}`
    }

    const relDest = relDir ? `${relDir}/${candidate}` : candidate
    const dest = this.resolveInside(relDest)

    if (isDir) {
      await cp(src, dest, { recursive: true })
      return { name: candidate, path: relDest, isDir: true, children: [] }
    }
    const content = await readFile(src, 'utf8')
    await atomicWrite(dest, content)
    return { name: candidate, path: relDest, isDir: false }
  }

  /** Rutas relativas de todos los archivos visibles del árbol (notas + imágenes). */
  async listFiles(): Promise<string[]> {
    const out: string[] = []
    const walk = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        if (n.isDir) walk(n.children ?? [])
        else out.push(n.path)
      }
    }
    walk(await this.tree())
    return out
  }

  /** Contenido de todas las notas .md (ruta → texto). Las ilegibles se saltean. */
  private async readAllNotes(paths: string[]): Promise<Map<string, string>> {
    const notes = paths.filter(isNotePath)
    const texts = new Map<string, string>()
    // Lectura en tandas para no abrir cientos de descriptores a la vez.
    const BATCH = 32
    for (let i = 0; i < notes.length; i += BATCH) {
      const slice = notes.slice(i, i + BATCH)
      const read = await Promise.all(slice.map((p) => this.readNote(p).catch(() => null)))
      slice.forEach((p, k) => {
        const t = read[k]
        if (t !== null) texts.set(p, t)
      })
    }
    return texts
  }

  /**
   * Búsqueda de texto completo: recorre todas las notas e ignora mayúsculas y
   * tildes. Las notas cuyo nombre coincide van primero. Acotada para que una
   * consulta de una letra en una bóveda grande no congele la UI.
   */
  async search(query: string, maxFiles = 200): Promise<SearchResult[]> {
    // `#tag` busca por etiqueta (como Obsidian), no como texto.
    if (/^#[^\s#]+$/.test(query.trim())) return this.searchTag(query.trim(), maxFiles)
    // Filtros (`estado:pendiente`, `-#archivo`, `fecha:>2026-01-01`) + texto libre.
    const { text: freeText, filters } = parseQuery(query)
    const q = foldQuery(freeText)
    if (!q && filters.length === 0) return []
    const paths = await this.listFiles()
    const texts = await this.readAllNotes(paths)
    const results: SearchResult[] = []
    const propKeys = filters.filter((f) => f.kind === 'prop' && !f.negate).map((f) => (f as { key: string }).key)
    for (const [path, text] of texts) {
      if (!matchesFilters(text, filters)) continue
      if (q) {
        const nameMatch = foldQuery(displayName(path)).includes(q)
        const matches = searchText(text, q)
        if (nameMatch || matches.length > 0) results.push({ path, nameMatch, matches })
        continue
      }
      // Sólo filtros: se muestran las líneas de las propiedades que coincidieron.
      results.push({ path, nameMatch: false, matches: propertyMatches(text, propKeys) })
    }
    results.sort(
      (a, b) =>
        Number(b.nameMatch) - Number(a.nameMatch) ||
        b.matches.length - a.matches.length ||
        a.path.localeCompare(b.path)
    )
    return results.slice(0, maxFiles)
  }

  /** Notas con la etiqueta `#tag` (o una hija: `#a` incluye `#a/b`), con sus líneas. */
  private async searchTag(query: string, maxFiles: number): Promise<SearchResult[]> {
    const paths = await this.listFiles()
    const texts = await this.readAllNotes(paths)
    const results: SearchResult[] = []
    for (const [path, text] of texts) {
      const hits = extractTags(text).filter((h) => tagMatches(h.tag, query))
      if (hits.length === 0) continue
      const lines = text.split('\n')
      const seen = new Set<number>()
      const matches: SearchResult['matches'] = []
      for (const h of hits) {
        // Los tags del frontmatter se señalan en la línea de la propiedad `tags`.
        const ln = h.line >= 0 ? h.line : Math.max(0, lines.findIndex((l) => /^tags?\s*:/.test(l)))
        if (seen.has(ln)) continue
        seen.add(ln)
        const line = lines[ln] ?? ''
        const idx = line.toLowerCase().indexOf(h.tag.toLowerCase())
        const col = Math.max(0, idx - (line[idx - 1] === '#' ? 1 : 0))
        const len = idx >= 0 ? h.tag.length + (line[idx - 1] === '#' ? 1 : 0) : 0
        matches.push({
          line: ln,
          col,
          length: len,
          before: line.slice(Math.max(0, col - 40), col).trimStart(),
          text: line.slice(col, col + len),
          after: line.slice(col + len, col + len + 80)
        })
      }
      results.push({ path, nameMatch: false, matches })
    }
    results.sort((a, b) => b.matches.length - a.matches.length || a.path.localeCompare(b.path))
    return results.slice(0, maxFiles)
  }

  /** Todas las etiquetas de la bóveda con cuántas notas las usan, de más a menos usadas. */
  async tags(): Promise<{ tag: string; count: number }[]> {
    const texts = await this.readAllNotes(await this.listFiles())
    const counts = new Map<string, { tag: string; count: number }>()
    for (const text of texts.values()) {
      const unique = new Set(extractTags(text).map((h) => h.tag))
      for (const tag of unique) {
        const key = tag.toLowerCase()
        const e = counts.get(key)
        if (e) e.count++
        else counts.set(key, { tag, count: 1 })
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }

  /**
   * Configuración de Obsidian relevante (de `.obsidian/app.json`), si la carpeta
   * es una bóveda de Obsidian: dónde guardar adjuntos y qué estilo de enlace usar.
   */
  /**
   * Favoritas de la bóveda. Viven en `.geode/marcadores.json`: dentro de la
   * carpeta (se mudan con ella) pero fuera del historial, como el resto de `.geode`.
   */
  async getBookmarks(): Promise<string[]> {
    if (!this.root) return []
    try {
      const data = JSON.parse(await readFile(join(this.root, '.geode', 'marcadores.json'), 'utf8')) as unknown
      return Array.isArray(data) ? data.filter((p): p is string => typeof p === 'string') : []
    } catch {
      return []
    }
  }

  async setBookmarks(paths: unknown): Promise<void> {
    if (!this.root) throw new Error('No hay vault abierto')
    if (!Array.isArray(paths) || !paths.every((p) => typeof p === 'string')) throw new Error('Lista de marcadores inválida')
    // Sólo rutas dentro de la bóveda (resolveInside lanza si alguna sale).
    for (const p of paths) this.resolveInside(p)
    const unique = [...new Set(paths as string[])].slice(0, 500)
    await mkdir(join(this.root, '.geode'), { recursive: true })
    await atomicWrite(join(this.root, '.geode', 'marcadores.json'), JSON.stringify(unique, null, 2))
  }

  async obsidianConfig(): Promise<{ isObsidian: boolean; attachmentFolder: string | null; useWikilinks: boolean }> {
    if (!this.root) return { isObsidian: false, attachmentFolder: null, useWikilinks: false }
    let isObsidian = false
    try {
      isObsidian = (await stat(join(this.root, '.obsidian'))).isDirectory()
    } catch {
      isObsidian = false
    }
    if (!isObsidian) return { isObsidian, attachmentFolder: null, useWikilinks: false }
    let app: { attachmentFolderPath?: unknown; useMarkdownLinks?: unknown } = {}
    try {
      app = JSON.parse(await readFile(join(this.root, '.obsidian', 'app.json'), 'utf8'))
    } catch {
      app = {}
    }
    return {
      isObsidian,
      attachmentFolder: typeof app.attachmentFolderPath === 'string' ? app.attachmentFolderPath : null,
      // Obsidian usa [[wikilinks]] salvo que se haya activado "Use [[Wikilinks]]" = off.
      useWikilinks: app.useMarkdownLinks !== true
    }
  }

  /**
   * Carpeta donde guardar un adjunto pegado en `notePath`, respetando la
   * convención de Obsidian (`attachmentFolderPath`): "/" = raíz, "./" = misma
   * carpeta de la nota, "./x" = subcarpeta de la nota, "x" = carpeta fija.
   * Sin Obsidian: `adjuntos/`.
   */
  private async attachmentDirFor(notePath: string | null): Promise<string> {
    const { attachmentFolder } = await this.obsidianConfig()
    if (attachmentFolder === null) return ATTACHMENTS_DIR
    const noteDir = notePath ? dirname(notePath).replace(/\\/g, '/').replace(/^\.$/, '') : ''
    const f = attachmentFolder.trim()
    if (f === '' || f === '/') return ''
    if (f === './' || f === '.') return noteDir
    if (f.startsWith('./')) return [noteDir, f.slice(2)].filter(Boolean).join('/')
    return f.replace(/^\/+|\/+$/g, '')
  }

  /** Notas que enlazan a `targetPath` con `[[...]]`, con la línea de cada enlace. */
  async backlinks(targetPath: string): Promise<Backlink[]> {
    const paths = await this.listFiles()
    const texts = await this.readAllNotes(paths)
    const out: Backlink[] = []
    for (const [path, text] of texts) {
      if (path === targetPath) continue
      const seen = new Set<number>()
      for (const link of parseWikilinks(text)) {
        if (resolveLink(link.target, paths, path) !== targetPath) continue
        const line = lineOf(text, link.from)
        if (seen.has(line)) continue // varios enlaces en la misma línea: una sola fila
        seen.add(line)
        const raw = text.split('\n')[line] ?? ''
        out.push({ path, line, context: raw.trim().slice(0, 200) })
      }
    }
    out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
    return out
  }

  /**
   * Calcula (sin escribir) qué notas hay que reescribir porque `from` se renombró
   * o movió a `to`. Se llama DESPUÉS del rename en disco: la lista "vieja" se
   * reconstruye desde la actual. Si `to` es una carpeta, se mapea cada archivo
   * que contiene. Devuelve ruta → texto nuevo.
   */
  async planLinkUpdates(from: string, to: string): Promise<Map<string, string>> {
    const newPaths = await this.listFiles()
    const renames = new Map<string, string>()
    const st = await stat(this.resolveInside(to))
    if (st.isDirectory()) {
      for (const p of newPaths) {
        if (p.startsWith(`${to}/`)) renames.set(from + p.slice(to.length), p)
      }
    } else {
      renames.set(from, to)
    }
    if (renames.size === 0) return new Map()
    const reverse = new Map([...renames].map(([o, n]) => [n, o]))
    const oldPaths = newPaths.map((p) => reverse.get(p) ?? p)

    const texts = await this.readAllNotes(newPaths)
    const plan = new Map<string, string>()
    for (const [path, text] of texts) {
      // Los enlaces relativos se resuelven desde donde estaba la nota ANTES.
      const oldNotePath = reverse.get(path) ?? path
      const res = rewriteLinks(text, oldNotePath, renames, oldPaths, newPaths)
      if (res.changed > 0) plan.set(path, res.text)
    }
    return plan
  }

  /** Escribe (atómico) las notas de un plan de `planLinkUpdates`. */
  async applyLinkUpdates(plan: Map<string, string>): Promise<void> {
    for (const [path, text] of plan) await this.writeNote(path, text)
  }

  /** Crea una nota en una ruta exacta; lanza si ya existe (nunca pisa). */
  async createNoteAt(relPath: string, content: string): Promise<TreeNode> {
    const clean = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
    const rel = isNotePath(clean) ? clean : `${clean}.md`
    if (await this.exists(rel)) throw new Error(`Ya existe: ${rel}`)
    await atomicWrite(this.resolveInside(rel), content)
    return { name: baseName(rel), path: rel, isDir: false }
  }

  /**
   * Guarda una imagen en la carpeta de adjuntos. Los nombres genéricos de
   * portapapeles ("image.png") se reemplazan por "Pegado <fecha>.png"; los
   * caracteres ilegales se quitan y una colisión agrega sufijo (nunca pisa).
   */
  async saveAttachment(name: string, data: Uint8Array, notePath: string | null = null): Promise<string> {
    if (!this.root) throw new Error('No hay vault abierto')
    if (!isImagePath(name)) throw new Error('Solo se pueden adjuntar imágenes')
    if (data.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('La imagen es demasiado grande (máximo 25 MB)')
    const ext = extOf(name)
    let stem = baseName(name).slice(0, -(ext.length + 1))
    stem = stem.replace(/[<>:"/\\|?*\u0000-\u001f#^[\]]/g, '').trim()
    if (!stem || /^(image|imagen|clipboard|pasted|screenshot)$/i.test(stem)) {
      const d = new Date()
      const pad = (n: number): string => String(n).padStart(2, '0')
      stem = `Pegado ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    }
    const dir = await this.attachmentDirFor(notePath)
    const at = (file: string): string => (dir ? `${dir}/${file}` : file)
    let candidate = at(`${stem}.${ext}`)
    let n = 2
    while (await this.exists(candidate)) candidate = at(`${stem} ${n++}.${ext}`)
    await atomicWrite(this.resolveInside(candidate), data)
    return candidate
  }

  /** Bytes de un archivo de la bóveda (para el protocolo de imágenes). */
  async readFileBytes(relPath: string): Promise<Uint8Array> {
    return readFile(this.resolveInside(relPath))
  }

  private async exists(relPath: string): Promise<boolean> {
    try {
      await stat(this.resolveInside(relPath))
      return true
    } catch {
      return false
    }
  }
}

/** Coincidencias "sintéticas" en las líneas de las propiedades `keys` (búsqueda sólo por filtros). */
function propertyMatches(text: string, keys: string[]): SearchResult['matches'] {
  const lines = text.split('\n')
  const out: SearchResult['matches'] = []
  for (const key of new Set(keys)) {
    const ln = propertyLine(text, key)
    if (ln < 0) continue
    const line = lines[ln].replace(/\r$/, '')
    const len = line.indexOf(':') + 1
    out.push({ line: ln, col: 0, length: len, before: '', text: line.slice(0, len), after: line.slice(len, len + 80) })
  }
  return out
}
