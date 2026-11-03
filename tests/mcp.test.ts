import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitService } from '../src/main/services/git'
import { MemoryError, MemoryStore } from '../src/main/mcp/memory'
import { McpServer } from '../src/main/mcp/server'
import { withVaultLock } from '../src/main/fs/vaultLock'

/**
 * La IA como escritora de la bóveda (servidor MCP). Lo que se protege acá es la
 * promesa central: la IA nunca pisa algo que no vio y nada del usuario se pierde.
 */
let dir: string
let store: MemoryStore
const git = new GitService()

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'geode-mcp-'))
  await git.ensureRepo(dir)
  await writeFile(join(dir, 'Nota.md'), 'original\n')
  await git.commit(dir, 'inicio')
  store = new MemoryStore(dir)
  await store.init()
  store.setAiAuthor({ name: 'Test (IA)', email: 'ia@geode.local' })
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('MemoryStore', () => {
  it('sobrescribir exige expected_version y rechaza una versión vieja', async () => {
    await expect(store.writeNote('Nota.md', 'pisado')).rejects.toBeInstanceOf(MemoryError)

    const { version } = await store.readNote('Nota.md')
    // El usuario edita después de que la IA leyó.
    await writeFile(join(dir, 'Nota.md'), 'el usuario escribió esto\n')
    await expect(store.writeNote('Nota.md', 'pisado', version)).rejects.toThrow(/cambió/)
    expect(await readFile(join(dir, 'Nota.md'), 'utf8')).toBe('el usuario escribió esto\n')

    const fresh = await store.readNote('Nota.md')
    const res = await store.writeNote('Nota.md', 'nuevo\n', fresh.version, 'Reescribe')
    expect(res.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(await readFile(join(dir, 'Nota.md'), 'utf8')).toBe('nuevo\n')
  })

  it('versiona los cambios sin guardar del usuario ANTES de aplicar los de la IA', async () => {
    await writeFile(join(dir, 'Nota.md'), 'original\nlínea del usuario\n')
    await store.appendNote('Nota.md', 'línea de la IA', 'Agrega')

    const history = await store.history('Nota.md')
    expect(history[0].message).toBe('IA: Agrega')
    expect(history[0].author).toBe('Test (IA)')
    expect(history[1].message).toMatch(/antes de la edición de la IA/)
    expect(await git.readAt(dir, history[1].oid, 'Nota.md')).toBe('original\nlínea del usuario\n')
    expect(await readFile(join(dir, 'Nota.md'), 'utf8')).toBe('original\nlínea del usuario\n\nlínea de la IA\n')
  })

  it('el commit de la IA lleva SOLO su nota, no las ediciones del usuario en otras', async () => {
    await writeFile(join(dir, 'Otra.md'), 'borrador del usuario')
    const res = await store.appendNote('memoria/datos.md', 'dato')
    expect(await git.readAt(dir, res.commit!, 'memoria/datos.md')).toBe('dato\n')
    await expect(git.readAt(dir, res.commit!, 'Otra.md')).rejects.toThrow()
    expect(await git.changes(dir)).toEqual(['Otra.md']) // sigue pendiente para el snapshot
  })

  it('edit_note exige un fragmento exacto y único', async () => {
    await writeFile(join(dir, 'Rep.md'), 'a b a')
    await expect(store.editNote('Rep.md', 'a', 'z')).rejects.toThrow(/más de una vez/)
    await expect(store.editNote('Rep.md', 'q', 'z')).rejects.toThrow(/no aparece/)
    await store.editNote('Rep.md', 'b', 'B')
    expect(await readFile(join(dir, 'Rep.md'), 'utf8')).toBe('a B a')
  })

  it('bloquea rutas fuera de la bóveda y carpetas ocultas', async () => {
    await expect(store.readNote('../afuera.md')).rejects.toThrow(/fuera/)
    await expect(store.appendNote('.git/config', 'x')).rejects.toThrow(/no permitida/)
    await expect(store.appendNote('.geode/x.md', 'x')).rejects.toThrow(/no permitida/)
  })

  it('escrituras concurrentes se serializan sin perder ninguna', async () => {
    await Promise.all(Array.from({ length: 6 }, (_, i) => store.appendNote('log.md', `entrada ${i}`)))
    const text = await readFile(join(dir, 'log.md'), 'utf8')
    for (let i = 0; i < 6; i++) expect(text).toContain(`entrada ${i}`)
    expect(await store.history('log.md')).toHaveLength(6)
  })

  it('avisa a la app con .geode/external-change.json', async () => {
    const res = await store.appendNote('memoria/x.md', 'hola')
    const info = JSON.parse(await readFile(join(dir, '.geode', 'external-change.json'), 'utf8'))
    expect(info).toMatchObject({ paths: ['memoria/x.md'], commit: res.commit, author: 'Test (IA)' })
  })
})

describe('withVaultLock', () => {
  it('excluye a dos operaciones independientes y es reentrante en el mismo flujo', async () => {
    const order: string[] = []
    const slow = withVaultLock(dir, async () => {
      order.push('a:start')
      // Reentrante: no se bloquea a sí misma.
      await withVaultLock(dir, async () => order.push('a:nested'))
      await new Promise((r) => setTimeout(r, 80))
      order.push('a:end')
    })
    await new Promise((r) => setTimeout(r, 10))
    const other = withVaultLock(dir, async () => order.push('b'))
    await Promise.all([slow, other])
    expect(order).toEqual(['a:start', 'a:nested', 'a:end', 'b'])
  })

  it('rompe un candado huérfano de un proceso muerto', async () => {
    await mkdir(join(dir, '.geode'), { recursive: true })
    await writeFile(join(dir, '.geode', 'write.lock'), JSON.stringify({ pid: 2 ** 22 + 12345, at: Date.now() }))
    expect(await withVaultLock(dir, async () => 'ok', { timeoutMs: 1000 })).toBe('ok')
  })

  it("con onTimeout 'proceed' corre igual si el candado sigue tomado", async () => {
    await mkdir(join(dir, '.geode'), { recursive: true })
    await writeFile(join(dir, '.geode', 'write.lock'), JSON.stringify({ pid: process.pid, at: Date.now() }))
    await expect(withVaultLock(dir, async () => 'x', { timeoutMs: 50 })).rejects.toThrow(/ocupada/)
    expect(await withVaultLock(dir, async () => 'x', { timeoutMs: 50, onTimeout: 'proceed' })).toBe('x')
  })
})

describe('McpServer', () => {
  it('habla el protocolo: initialize, tools/list, tools/call y errores', async () => {
    const server = new McpServer(store, '1.0.0')
    const init = await server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', clientInfo: { name: 'claude-code' } }
    })
    expect(init?.result).toMatchObject({ protocolVersion: '2025-03-26', serverInfo: { name: 'geode' } })
    expect(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()

    const list = (await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))?.result as {
      tools: { name: string }[]
    }
    expect(list.tools.map((t) => t.name)).toContain('append_note')

    const call = (await server.handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'append_note', arguments: { path: 'memoria/a', text: 'hola' } }
    }))?.result as { isError: boolean }
    expect(call.isError).toBe(false)
    const history = await store.history('memoria/a.md')
    expect(history[0].author).toBe('Claude Code (IA)')

    const bad = (await server.handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'read_note', arguments: { path: 'no-existe' } }
    }))?.result as { isError: boolean }
    expect(bad.isError).toBe(true)

    const unknown = await server.handle({ jsonrpc: '2.0', id: 5, method: 'resources/list' })
    expect(unknown?.error?.code).toBe(-32601)
  })
})
