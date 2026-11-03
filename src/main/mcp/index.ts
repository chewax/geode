import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MemoryStore } from './memory'
import { McpServer } from './server'

/**
 * Punto de entrada del servidor MCP de Geode (proceso aparte, por stdio).
 *
 * Lo lanza el cliente MCP (Claude Code, Claude Desktop, Cursor…), no la app:
 *
 *   ELECTRON_RUN_AS_NODE=1 <Geode> <app>/out/main/mcp.js --vault <carpeta>
 *   node out/main/mcp.js --vault <carpeta>
 *
 * La configuración lista para copiar está en Ajustes → Memoria para IA.
 */

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i !== -1) return process.argv[i + 1]
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`))
  return eq?.slice(flag.length + 1)
}

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'))
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

async function main(): Promise<void> {
  const vault = argValue('--vault') ?? process.env.GEODE_VAULT
  if (!vault) {
    console.error('[mcp] falta --vault <carpeta de la bóveda>')
    process.exit(2)
  }
  const store = new MemoryStore(vault)
  await store.init()
  console.error(`[mcp] Geode sirviendo la bóveda ${store.root}`)
  await new McpServer(store, appVersion()).runStdio()
}

main().catch((e) => {
  console.error('[mcp] no se pudo iniciar:', e instanceof Error ? e.message : e)
  process.exit(1)
})
