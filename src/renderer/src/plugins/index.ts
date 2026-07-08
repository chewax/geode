import { PluginHost } from './host'
import { buildPluginContext } from './react'
import type { Disposable, GeodePlugin } from './types'
import { insertDatePlugin } from './builtin/insertDate'
import { readingTimePlugin } from './builtin/readingTime'
import { outlinePlugin } from './builtin/outline'

export { PluginHost } from './host'
export { GeodeProvider, useGeode, usePluginRegistry } from './react'
export { CommandPalette } from './CommandPalette'
export { PluginPanels } from './PluginPanels'
export { PluginStatusItems } from './PluginStatusBar'
export { loadExternalPlugins } from './loader'
export { activateExternalViaBridge } from './bridge'
export type { LoadResult } from './loader'
export type { GeodePlugin, PluginContext, Command } from './types'

/** Plugins internos que vienen con Geode (la "prueba de fuego" de la API v1). */
export const BUILTIN_PLUGINS: GeodePlugin[] = [insertDatePlugin, readingTimePlugin, outlinePlugin]

/**
 * Activa una lista de plugins contra el host. Cada plugin recibe su PluginContext
 * y sus registros se agrupan para poder limpiarlos. Devuelve un Disposable que
 * desactiva todos (útil en HMR o al recargar el vault).
 */
export function activatePlugins(host: PluginHost, plugins: GeodePlugin[]): Disposable {
  const disposables: Disposable[] = []
  for (const plugin of plugins) {
    try {
      const ctx = buildPluginContext(host, disposables)
      const cleanup = plugin.activate(ctx)
      if (cleanup) disposables.push(cleanup)
    } catch (e) {
      console.error(`[plugins] fallo al activar "${plugin.id}":`, e)
    }
  }
  return { dispose: () => disposables.forEach((d) => d.dispose()) }
}
