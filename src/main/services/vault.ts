import { dialog } from 'electron'
import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type { TreeNode, VaultInfo } from '@shared/ipc'
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
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
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

  private async exists(relPath: string): Promise<boolean> {
    try {
      await stat(this.resolveInside(relPath))
      return true
    } catch {
      return false
    }
  }
}
