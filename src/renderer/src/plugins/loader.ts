import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as CMState from '@codemirror/state'
import * as CMView from '@codemirror/view'
import type { GeodePlugin } from './types'

/**
 * Loader de plugins externos (Fase A: locales confiables). El main lee la fuente
 * CommonJS del plugin (por IPC) y acá se EVALÚA en el renderer, para que el
 * plugin comparta la misma instancia de React/CodeMirror que la app e integre
 * paneles/comandos. Requiere 'unsafe-eval' en el CSP (ver index.html); en Fase B
 * los plugins pasan a un sandbox aislado y se quita esa relajación.
 */

/** Módulos que el host le presta a los plugins vía require(). */
const SHARED_MODULES: Record<string, unknown> = {
  react: React,
  'react/jsx-runtime': ReactJsxRuntime,
  '@codemirror/state': CMState,
  '@codemirror/view': CMView,
  // Reservado para helpers de runtime; la API real llega por activate(ctx).
  geode: {}
}

function makeRequire(id: string): (name: string) => unknown {
  return (name: string) => {
    const mod = SHARED_MODULES[name]
    if (!mod) throw new Error(`plugin "${id}": módulo no disponible: "${name}"`)
    return mod
  }
}

/** Evalúa un módulo CommonJS y devuelve su export (default, o el propio exports). */
function evalCjs(source: string, id: string): unknown {
  const module = { exports: {} as Record<string, unknown> }
  // eslint-disable-next-line no-new-func -- eval intencional: loader de plugins confiables
  const fn = new Function('module', 'exports', 'require', source)
  fn(module, module.exports, makeRequire(id))
  const exported = module.exports
  return (exported.default as unknown) ?? exported
}

function isPlugin(x: unknown): x is GeodePlugin {
  const p = x as GeodePlugin | null
  return !!p && typeof p.id === 'string' && typeof p.activate === 'function'
}

export interface LoadResult {
  plugins: GeodePlugin[]
  /** Plugins que fallaron al cargar (id + motivo), para avisar sin romper el resto. */
  errors: { id: string; message: string }[]
}

/**
 * Carga los plugins externos HABILITADOS: pide la fuente al main y la evalúa.
 * Un plugin que falla no tumba a los demás: se acumula en `errors`.
 */
export async function loadExternalPlugins(): Promise<LoadResult> {
  const installed = await window.geode.plugins.list()
  const plugins: GeodePlugin[] = []
  const errors: { id: string; message: string }[] = []

  for (const p of installed) {
    if (!p.enabled || p.error) continue
    const id = p.manifest.id
    try {
      const source = await window.geode.plugins.readSource(id)
      const plugin = evalCjs(source, id)
      if (!isPlugin(plugin)) {
        throw new Error('el módulo no exporta un plugin válido (falta id/activate)')
      }
      plugins.push(plugin)
    } catch (e) {
      errors.push({ id, message: (e as Error).message })
      console.error(`[plugins] no se pudo cargar "${id}":`, e)
    }
  }
  return { plugins, errors }
}
