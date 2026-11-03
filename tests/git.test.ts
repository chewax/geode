import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService } from '../src/main/services/git'

/**
 * Núcleo de "nunca perdés nada": si estos tests fallan, la promesa central de
 * Geode está en riesgo. Corren contra un repo real (isomorphic-git) en /tmp.
 */
let dir: string
const git = new GitService()

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'geode-git-'))
  await git.ensureRepo(dir)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('GitService', () => {
  it('commit devuelve null si no hay cambios y un oid si los hay', async () => {
    expect(await git.commit(dir, 'vacío')).toBeNull()
    await writeFile(join(dir, 'Nota.md'), 'hola')
    expect(await git.commit(dir, 'primera')).toMatch(/^[0-9a-f]{40}$/)
    expect(await git.commit(dir, 'otra vez')).toBeNull()
  })

  it('detecta una edición del mismo tamaño en el mismo segundo (racy git)', async () => {
    await writeFile(join(dir, 'Nota.md'), 'aaaa')
    const first = await git.commit(dir, 'v1')
    // Mismo largo, escrita inmediatamente: el atajo por stat la perdería.
    await writeFile(join(dir, 'Nota.md'), 'bbbb')
    expect(await git.changes(dir)).toEqual(['Nota.md'])
    const second = await git.commit(dir, 'v2')
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
    expect(await git.readAt(dir, first!, 'Nota.md')).toBe('aaaa')
    expect(await git.readAt(dir, second!, 'Nota.md')).toBe('bbbb')
  })

  it('restoreTree trae una versión vieja SIN mover HEAD ni perder la nueva', async () => {
    await writeFile(join(dir, 'Nota.md'), 'vieja')
    const v1 = (await git.commit(dir, 'v1'))!
    await writeFile(join(dir, 'Nota.md'), 'nueva')
    await writeFile(join(dir, 'Extra.md'), 'extra')
    const v2 = (await git.commit(dir, 'v2'))!

    await git.restoreTree(dir, v1)
    expect(await readFile(join(dir, 'Nota.md'), 'utf8')).toBe('vieja')
    // HEAD sigue en v2: lo restaurado aparece como cambios sin guardar.
    const graph = await git.graph(dir)
    expect(graph.head.oid).toBe(v2)
    expect((await git.changes(dir)).sort()).toEqual(['Extra.md', 'Nota.md'])
    // Y la versión nueva sigue intacta en el historial.
    expect(await git.readAt(dir, v2, 'Nota.md')).toBe('nueva')
  })

  it('versiona imágenes binarias y las muestra en el árbol de una versión', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255])
    await writeFile(join(dir, 'foto.png'), bytes)
    await writeFile(join(dir, 'Nota.md'), '![[foto.png]]')
    const oid = (await git.commit(dir, 'con imagen'))!
    expect([...(await git.readBytesAt(dir, oid, 'foto.png'))]).toEqual([...bytes])
    const tree = await git.treeAt(dir, oid)
    expect(tree.map((n) => n.path).sort()).toEqual(['Nota.md', 'foto.png'])
  })
})
