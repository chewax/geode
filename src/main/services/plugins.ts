import { app, shell } from 'electron'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { InstalledPlugin, PluginManifest } from '@shared/ipc'

/**
 * Plugins externos (Fase A del ecosistema, ver ARCHITECTURE.md §plugins).
 *
 * Modelo "local confiable": cada plugin es una subcarpeta de `<userData>/plugins/`
 * con un `plugin.json` (manifiesto) y su entry CommonJS. El main solo DESCUBRE y
 * LEE (nunca ejecuta); el renderer los carga y activa. El sandbox/permisos llega
 * en Fase B sobre el mismo manifiesto (campo `permissions` ya reservado).
 */

/** Carpeta donde el usuario deja sus plugins. A nivel de app, fuera del vault. */
export function pluginsDir(): string {
  return join(app.getPath('userData'), 'plugins')
}

/** Manifiesto mínimo para entradas rotas, usando el nombre de carpeta como id. */
function fallbackManifest(folder: string): PluginManifest {
  return { id: folder, name: folder, version: '0.0.0', main: 'main.js' }
}

/**
 * Escanea la carpeta de plugins: una subcarpeta por plugin, cada una con su
 * `plugin.json`. Las entradas con manifiesto ausente/inválido se devuelven con
 * `error` (para mostrarlas en Ajustes) en vez de descartarlas en silencio.
 */
export async function listPlugins(
  enabledMap: Record<string, boolean>
): Promise<InstalledPlugin[]> {
  const dir = pluginsDir()
  await mkdir(dir, { recursive: true }) // idempotente: crea la carpeta si no existe

  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

  const out: InstalledPlugin[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pdir = join(dir, entry.name)
    try {
      const manifest = JSON.parse(
        await readFile(join(pdir, 'plugin.json'), 'utf8')
      ) as PluginManifest
      if (!manifest.id || !manifest.name || !manifest.main) {
        out.push({
          manifest: { ...fallbackManifest(entry.name), ...manifest },
          dir: pdir,
          enabled: false,
          error: 'Manifiesto incompleto: faltan id, name o main'
        })
        continue
      }
      out.push({ manifest, dir: pdir, enabled: enabledMap[manifest.id] ?? false })
    } catch (e) {
      out.push({
        manifest: fallbackManifest(entry.name),
        dir: pdir,
        enabled: false,
        error: `No se pudo leer plugin.json: ${(e as Error).message}`
      })
    }
  }
  return out
}

/** Abre la carpeta de plugins en el explorador del SO (creándola si falta). */
export async function openPluginsDir(): Promise<void> {
  const dir = pluginsDir()
  await mkdir(dir, { recursive: true })
  await shell.openPath(dir)
}

/**
 * Código fuente del entry de un plugin, para que el renderer lo evalúe. Se
 * valida que `main` no escape de la carpeta del plugin (path traversal).
 */
export async function readPluginSource(
  id: string,
  enabledMap: Record<string, boolean>
): Promise<string> {
  const plugin = (await listPlugins(enabledMap)).find((p) => p.manifest.id === id)
  if (!plugin) throw new Error(`Plugin no encontrado: ${id}`)

  // El entry no puede salir de la carpeta del plugin (path traversal).
  const main = plugin.manifest.main
  if (isAbsolute(main) || main.split(/[\\/]/).includes('..')) {
    throw new Error('El campo "main" del manifiesto no puede ser absoluto ni salir de la carpeta')
  }
  return readFile(join(plugin.dir, main), 'utf8')
}
