import { app, shell } from 'electron'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { HOST_API_VERSION } from '@shared/ipc'
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
 * Compara dos versiones `x.y.z` numéricamente por segmento. Devuelve -1 si
 * `a < b`, 0 si son iguales y 1 si `a > b`. Tolera segmentos faltantes o no
 * numéricos tratándolos como 0 (dato externo no confiable del manifiesto).
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = Number.parseInt(pa[i] ?? '0', 10) || 0
    const nb = Number.parseInt(pb[i] ?? '0', 10) || 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

/**
 * Chequeo de compatibilidad del host sobre un manifiesto válido. Devuelve un
 * mensaje de error en español si el plugin es incompatible con esta versión de
 * la API o de la app, o `null` si es compatible. `apiVersion` ausente ⇒ v1.
 */
function compatibilityError(manifest: PluginManifest): string | null {
  // `plugin.json` es JSON externo no confiable: los tipos declarados no se
  // garantizan en runtime. Validamos el TIPO explícitamente antes de comparar,
  // para que un campo con tipo inválido (p. ej. `"apiVersion": "2"`) no saltee
  // el gate en silencio ni haga throw un parse-error engañoso (WR-02).
  const apiVersion = manifest.apiVersion as unknown
  if (apiVersion !== undefined) {
    if (typeof apiVersion !== 'number' || !Number.isInteger(apiVersion) || apiVersion < 1) {
      return `apiVersion inválido: se espera un entero ≥ 1 (recibido ${JSON.stringify(apiVersion)})`
    }
    if (apiVersion > HOST_API_VERSION) {
      return `Requiere API de plugins v${apiVersion}; esta versión de Geode soporta v${HOST_API_VERSION}`
    }
  }
  const minAppVersion = manifest.minAppVersion as unknown
  if (minAppVersion !== undefined) {
    if (typeof minAppVersion !== 'string') {
      return `minAppVersion inválido: se espera una cadena "x.y.z" (recibido ${JSON.stringify(minAppVersion)})`
    }
    const appVersion = app.getVersion()
    if (compareSemver(minAppVersion, appVersion) > 0) {
      return `Requiere Geode ≥ ${minAppVersion} (versión actual ${appVersion})`
    }
  }
  return null
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
      // Gate de compatibilidad: un plugin incompatible se lista con error
      // (visible en Ajustes) y el loader del renderer lo saltea, en vez de
      // descartarlo en silencio.
      const compatError = compatibilityError(manifest)
      out.push({
        manifest,
        dir: pdir,
        enabled: enabledMap[manifest.id] ?? false,
        ...(compatError ? { error: compatError } : {})
      })
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
