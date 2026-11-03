import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import isogit from 'isomorphic-git'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService } from '../src/main/services/git'

/**
 * Sync entre dos computadoras (A y B) sin red: B es una copia de A; para
 * "traer" lo de B en A se copian los objetos de B a A (lo que haría el fetch)
 * y se llama a integrateRemote con el tip de B. Es la promesa central del
 * multi-dispositivo: nada de ninguna de las dos computadoras se pierde.
 */
const git = new GitService()
let root: string
let A: string
let B: string

async function tipOf(dir: string): Promise<string> {
  return isogit.resolveRef({ fs, dir, ref: 'main' })
}
/** "fetch" local: copia los objetos de `from` a `to` y devuelve el tip de `from`. */
async function fetchInto(to: string, from: string): Promise<string> {
  await cp(join(from, '.git', 'objects'), join(to, '.git', 'objects'), { recursive: true, force: false })
  return tipOf(from)
}
const read = (dir: string, f: string): Promise<string> => readFile(join(dir, f), 'utf8')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'geode-sync-'))
  A = join(root, 'A')
  B = join(root, 'B')
  await fs.promises.mkdir(A)
  await git.ensureRepo(A)
  await writeFile(join(A, 'Nota.md'), 'uno\ndos\ntres\n')
  await writeFile(join(A, 'Otra.md'), 'otra\n')
  await git.commit(A, 'inicio')
  await cp(A, B, { recursive: true }) // "clonar" en la otra computadora
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('sync entre computadoras', () => {
  it('si solo cambió la otra computadora, avanza sin commit extra (fast-forward)', async () => {
    await writeFile(join(B, 'Nota.md'), 'uno\ndos (B)\ntres\n')
    await git.commit(B, 'edición en B')
    const res = await git.integrateRemote(A, 'main', await fetchInto(A, B))
    expect(res).toEqual({ pulled: true, cloudCopies: [] })
    expect(await read(A, 'Nota.md')).toBe('uno\ndos (B)\ntres\n')
    expect(await tipOf(A)).toBe(await tipOf(B))
  })

  it('si la nube no tiene nada nuevo, no toca nada', async () => {
    await writeFile(join(A, 'Nota.md'), 'local\n')
    await git.commit(A, 'solo local')
    const res = await git.integrateRemote(A, 'main', await fetchInto(A, B))
    expect(res.pulled).toBe(false)
    expect(await read(A, 'Nota.md')).toBe('local\n')
  })

  it('combina cambios en notas distintas de cada computadora', async () => {
    await writeFile(join(A, 'Otra.md'), 'otra (A)\n')
    await git.commit(A, 'A edita Otra')
    await writeFile(join(B, 'Nota.md'), 'uno (B)\ndos\ntres\n')
    await git.commit(B, 'B edita Nota')
    const res = await git.integrateRemote(A, 'main', await fetchInto(A, B))
    expect(res.cloudCopies).toEqual([])
    expect(await read(A, 'Otra.md')).toBe('otra (A)\n')
    expect(await read(A, 'Nota.md')).toBe('uno (B)\ndos\ntres\n')
  })

  it('combina cambios en partes distintas de la MISMA nota', async () => {
    await writeFile(join(A, 'Nota.md'), 'uno (A)\ndos\ntres\n')
    await git.commit(A, 'A')
    await writeFile(join(B, 'Nota.md'), 'uno\ndos\ntres (B)\n')
    await git.commit(B, 'B')
    const res = await git.integrateRemote(A, 'main', await fetchInto(A, B))
    expect(res.cloudCopies).toEqual([])
    expect(await read(A, 'Nota.md')).toBe('uno (A)\ndos\ntres (B)\n')
  })

  it('conflicto en la misma línea: queda lo local y la versión de la nube va al lado', async () => {
    await writeFile(join(A, 'Nota.md'), 'uno\ndos (A)\ntres\n')
    await git.commit(A, 'A')
    await writeFile(join(B, 'Nota.md'), 'uno\ndos (B)\ntres\n')
    await git.commit(B, 'B')
    const res = await git.integrateRemote(A, 'main', await fetchInto(A, B))
    expect(res.cloudCopies).toEqual(['Nota (versión de la nube).md'])
    expect(await read(A, 'Nota.md')).toBe('uno\ndos (A)\ntres\n')
    expect(await read(A, 'Nota (versión de la nube).md')).toBe('uno\ndos (B)\ntres\n')
    expect(await git.changes(A)).toEqual([]) // todo quedó versionado
  })

  it('lo escrito sin guardar como versión se conserva (se versiona antes de traer)', async () => {
    await writeFile(join(B, 'Nota.md'), 'uno (B)\ndos\ntres\n')
    await git.commit(B, 'B')
    await writeFile(join(A, 'Nueva.md'), 'sin versionar todavía\n') // pendiente en A
    const res = await git.integrateRemote(A, 'main', await fetchInto(A, B))
    expect(res.pulled).toBe(true)
    expect(await read(A, 'Nueva.md')).toBe('sin versionar todavía\n')
    expect(await read(A, 'Nota.md')).toBe('uno (B)\ndos\ntres\n')
    const graph = await git.graph(A)
    expect(graph.commits.some((c) => c.message.startsWith('Cambios antes de sincronizar'))).toBe(true)
  })

  it('una imagen cambiada en las dos computadoras conserva los bytes de ambas', async () => {
    await writeFile(join(A, 'foto.png'), Buffer.from([0x89, 0x50, 0, 1]))
    await git.commit(A, 'img base')
    await cp(join(A, '.git'), join(B, '.git'), { recursive: true, force: true })
    await writeFile(join(B, 'foto.png'), Buffer.from([0x89, 0x50, 0, 1]))
    const local = Buffer.from([0x89, 0x50, 0, 0xaa, 0xff])
    const cloud = Buffer.from([0x89, 0x50, 0, 0xbb, 0xfe, 0x00])
    await writeFile(join(A, 'foto.png'), local)
    await git.commit(A, 'img A')
    await writeFile(join(B, 'foto.png'), cloud)
    await git.commit(B, 'img B')
    const res = await git.integrateRemote(A, 'main', await fetchInto(A, B))
    expect(res.cloudCopies).toEqual(['foto (versión de la nube).png'])
    expect([...(await readFile(join(A, 'foto.png')))]).toEqual([...local])
    expect([...(await readFile(join(A, 'foto (versión de la nube).png')))]).toEqual([...cloud])
    expect((await readdir(A)).sort()).toContain('Nota.md')
  })
})
