import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// VaultService importa `dialog` de Electron (sólo para los selectores de carpeta).
vi.mock('electron', () => ({ dialog: {} }))
const { VaultService } = await import('../src/main/services/vault')

let dir: string
let vault: InstanceType<typeof VaultService>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'geode-vault-'))
  vault = new VaultService()
  await vault.setRoot(dir)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('VaultService', () => {
  it('bloquea rutas fuera de la bóveda (path traversal)', async () => {
    await expect(vault.readNote('../fuera.md')).rejects.toThrow(/fuera del vault/)
    await expect(vault.writeNote('../../x.md', 'x')).rejects.toThrow(/fuera del vault/)
  })

  it('el árbol muestra notas e imágenes y oculta .git/.geode/.obsidian y otros archivos', async () => {
    await mkdir(join(dir, '.git'))
    await mkdir(join(dir, '.obsidian'))
    await writeFile(join(dir, '.obsidian', 'a.md'), 'x')
    await writeFile(join(dir, 'Nota.md'), 'x')
    await writeFile(join(dir, 'foto.png'), 'x')
    await writeFile(join(dir, 'datos.csv'), 'x')
    expect((await vault.listFiles()).sort()).toEqual(['Nota.md', 'foto.png'])
  })

  it('createNoteAt crea carpetas intermedias y nunca pisa una nota existente', async () => {
    await vault.createNoteAt('Diario/2026-01-05.md', '# hoy')
    expect(await vault.readNote('Diario/2026-01-05.md')).toBe('# hoy')
    await expect(vault.createNoteAt('Diario/2026-01-05', 'otro')).rejects.toThrow(/Ya existe/)
    expect(await vault.readNote('Diario/2026-01-05.md')).toBe('# hoy')
  })

  it('saveAttachment guarda en adjuntos/, renombra los genéricos y no pisa', async () => {
    const a = await vault.saveAttachment('Diagrama.png', new Uint8Array([1, 2, 3]))
    const b = await vault.saveAttachment('Diagrama.png', new Uint8Array([4]))
    expect(a).toBe('adjuntos/Diagrama.png')
    expect(b).toBe('adjuntos/Diagrama 2.png')
    expect([...(await readFile(join(dir, a)))]).toEqual([1, 2, 3])
    const pasted = await vault.saveAttachment('image.png', new Uint8Array([9]))
    expect(pasted).toMatch(/^adjuntos\/Pegado \d{4}-\d{2}-\d{2} \d{6}\.png$/)
    await expect(vault.saveAttachment('script.js', new Uint8Array([1]))).rejects.toThrow(/imágenes/)
  })

  it('search ignora tildes y ordena primero las coincidencias por nombre', async () => {
    await writeFile(join(dir, 'Canción.md'), 'letra')
    await writeFile(join(dir, 'Otra.md'), 'habla de una cancion\ny otra CANCIÓN')
    const res = await vault.search('cancion')
    expect(res.map((r) => r.path)).toEqual(['Canción.md', 'Otra.md'])
    expect(res[1].matches).toHaveLength(2)
  })

  it('backlinks lista las notas que enlazan a una nota', async () => {
    await writeFile(join(dir, 'Idea.md'), '# Idea')
    await writeFile(join(dir, 'A.md'), 'intro\nver [[Idea]] y [[idea|otra vez]]')
    await writeFile(join(dir, 'B.md'), 'nada que ver')
    expect(await vault.backlinks('Idea.md')).toEqual([{ path: 'A.md', line: 1, context: 'ver [[Idea]] y [[idea|otra vez]]' }])
  })

  it('al renombrar una nota se actualizan los enlaces que apuntaban a ella', async () => {
    await writeFile(join(dir, 'Idea.md'), '# Idea')
    await writeFile(join(dir, 'A.md'), 'ver [[Idea#Intro|esto]] y ![[foto.png]]')
    await vault.rename('Idea.md', 'Gran idea.md')
    const plan = await vault.planLinkUpdates('Idea.md', 'Gran idea.md')
    expect([...plan.keys()]).toEqual(['A.md'])
    await vault.applyLinkUpdates(plan)
    expect(await vault.readNote('A.md')).toBe('ver [[Gran idea#Intro|esto]] y ![[foto.png]]')
  })

  it('al mover una carpeta se actualizan los enlaces con ruta a sus notas', async () => {
    await mkdir(join(dir, 'Viejo'))
    await writeFile(join(dir, 'Viejo', 'Plan.md'), 'x')
    await writeFile(join(dir, 'Índice.md'), '[[Viejo/Plan]] y [[Plan]]')
    await vault.rename('Viejo', 'Nuevo')
    await vault.applyLinkUpdates(await vault.planLinkUpdates('Viejo', 'Nuevo'))
    // El enlace por nombre sigue resolviendo; el de ruta se reescribe.
    expect(await vault.readNote('Índice.md')).toBe('[[Nuevo/Plan]] y [[Plan]]')
  })
})

describe('VaultService — bóvedas de Obsidian', () => {
  async function obsidian(app: Record<string, unknown>): Promise<void> {
    await mkdir(join(dir, '.obsidian'), { recursive: true })
    await writeFile(join(dir, '.obsidian', 'app.json'), JSON.stringify(app))
  }

  it('detecta la bóveda y su estilo de enlaces', async () => {
    expect((await vault.obsidianConfig()).isObsidian).toBe(false)
    await obsidian({})
    expect(await vault.obsidianConfig()).toEqual({ isObsidian: true, attachmentFolder: null, useWikilinks: true })
    await obsidian({ useMarkdownLinks: true, attachmentFolderPath: 'Archivos' })
    expect(await vault.obsidianConfig()).toEqual({ isObsidian: true, attachmentFolder: 'Archivos', useWikilinks: false })
  })

  it('guarda los adjuntos donde lo configuró Obsidian', async () => {
    const png = new Uint8Array([1])
    await obsidian({ attachmentFolderPath: '/' })
    expect(await vault.saveAttachment('a.png', png, 'Proyectos/Nota.md')).toBe('a.png')
    await obsidian({ attachmentFolderPath: './' })
    expect(await vault.saveAttachment('b.png', png, 'Proyectos/Nota.md')).toBe('Proyectos/b.png')
    await obsidian({ attachmentFolderPath: './img' })
    expect(await vault.saveAttachment('c.png', png, 'Proyectos/Nota.md')).toBe('Proyectos/img/c.png')
    await obsidian({ attachmentFolderPath: 'Archivos/Adjuntos' })
    expect(await vault.saveAttachment('d.png', png, 'Proyectos/Nota.md')).toBe('Archivos/Adjuntos/d.png')
  })

  it('muestra PDFs/audio en el árbol y busca por #etiqueta (incluye anidadas y frontmatter)', async () => {
    await writeFile(join(dir, 'doc.pdf'), 'x')
    await writeFile(join(dir, 'A.md'), 'Hoy #trabajo/urgente y `#nocode`')
    await writeFile(join(dir, 'B.md'), '---\ntags: [trabajo]\n---\n# B')
    await writeFile(join(dir, 'C.md'), 'nada de trabajo')
    expect(await vault.listFiles()).toContain('doc.pdf')
    const res = await vault.search('#trabajo')
    expect(res.map((r) => r.path).sort()).toEqual(['A.md', 'B.md'])
    expect(res.find((r) => r.path === 'B.md')!.matches[0].line).toBe(1) // línea de `tags:`
    expect(await vault.tags()).toEqual([
      { tag: 'trabajo', count: 1 },
      { tag: 'trabajo/urgente', count: 1 }
    ])
  })

  it('search filtra por propiedades y combina con texto', async () => {
    await writeFile(join(dir, 'P1.md'), '---\nestado: pendiente\nprioridad: 3\n---\nLlamar al cliente')
    await writeFile(join(dir, 'P2.md'), '---\nestado: hecho\nprioridad: 1\n---\nLlamar al proveedor')
    await writeFile(join(dir, 'P3.md'), 'Sin propiedades, pero dice estado pendiente')
    const solo = await vault.search('estado:pendiente')
    expect(solo.map((r) => r.path)).toEqual(['P1.md'])
    expect(solo[0].matches[0]).toMatchObject({ line: 1, text: 'estado:' })
    expect((await vault.search('llamar -estado:pendiente')).map((r) => r.path)).toEqual(['P2.md'])
    expect((await vault.search('prioridad:>2 cliente')).map((r) => r.path)).toEqual(['P1.md'])
  })
})
