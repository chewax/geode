import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let userData = ''
vi.mock('electron', () => ({
  app: { getPath: () => userData, getVersion: () => '0.8.1' },
  shell: {}
}))
const { listPlugins } = await import('../src/main/services/plugins')

async function plugin(id: string, manifest: Record<string, unknown>): Promise<void> {
  const dir = join(userData, 'plugins', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'plugin.json'), JSON.stringify({ id, name: id, version: '1.0.0', main: 'main.js', ...manifest }))
  await writeFile(join(dir, 'main.js'), 'module.exports = { id: "' + id + '", activate() {} }')
}

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'geode-plugins-'))
  await plugin('v1', {})
  await plugin('v2', { apiVersion: 2 })
  await plugin('futuro', { apiVersion: 99 })
  await plugin('app-nueva', { minAppVersion: '9.0.0' })
  await plugin('raro', { apiVersion: '2' })
})
afterAll(async () => {
  await rm(userData, { recursive: true, force: true })
})

describe('compatibilidad de plugins', () => {
  it('acepta v1 y v2, y rechaza con un motivo claro lo que esta versión no soporta', async () => {
    const list = await listPlugins({ v2: true })
    const byId = Object.fromEntries(list.map((p) => [p.manifest.id, p]))
    expect(byId.v1.error).toBeUndefined()
    expect(byId.v2.error).toBeUndefined()
    expect(byId.v2.enabled).toBe(true)
    expect(byId.v1.enabled).toBe(false) // los externos son opt-in
    expect(byId.futuro.error).toMatch(/API de plugins v99/)
    expect(byId['app-nueva'].error).toMatch(/Requiere Geode ≥ 9\.0\.0/)
    expect(byId.raro.error).toMatch(/apiVersion inválido/)
  })
})
