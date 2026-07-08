import type { PluginEntry } from './types'

/**
 * Loader de plugins externos (Fase 12 / ISO-01). El main lee la fuente CommonJS
 * del plugin (por IPC) y acá SOLO se recolecta la fuente + id de los plugins
 * habilitados: el eval ya NO ocurre in-window. La fuente cruda se pasa al iframe
 * sandbox de origen opaco (ver `activateExternalViaBridge`), donde se evalúa
 * aislada del host. Por eso este módulo ya no importa React/CodeMirror ni evalúa
 * código: el eval migró íntegramente al bootstrap del iframe.
 */

export interface LoadResult {
  /** Entradas (id + fuente cruda) de los plugins habilitados, sin evaluar. */
  entries: PluginEntry[]
  /** Plugins cuya fuente no se pudo leer (id + motivo), para avisar sin romper el resto. */
  errors: { id: string; message: string }[]
}

/**
 * Recolecta los plugins externos HABILITADOS: pide la fuente al main y devuelve
 * `{ pluginId, source }` por cada uno, SIN evaluarla (el iframe lo hará). Un
 * plugin cuya fuente falle no tumba a los demás: se acumula en `errors`.
 */
export async function loadExternalPlugins(): Promise<LoadResult> {
  const installed = await window.geode.plugins.list()
  const entries: PluginEntry[] = []
  const errors: { id: string; message: string }[] = []

  for (const p of installed) {
    if (!p.enabled || p.error) continue
    const id = p.manifest.id
    try {
      const source = await window.geode.plugins.readSource(id)
      entries.push({ pluginId: id, source })
    } catch (e) {
      errors.push({ id, message: (e as Error).message })
      console.error(`[plugins] no se pudo leer la fuente de "${id}":`, e)
    }
  }
  return { entries, errors }
}
