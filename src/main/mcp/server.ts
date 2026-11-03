import { createInterface } from 'node:readline'
import { MemoryError, type MemoryStore } from './memory'

/**
 * Servidor MCP (Model Context Protocol) mínimo sobre stdio: JSON-RPC 2.0, un
 * mensaje por línea. Implementado a mano a propósito (cero dependencias): solo
 * hace falta `initialize`, `ping`, `tools/list` y `tools/call`.
 *
 * REGLA DE ORO: stdout es SOLO del protocolo. Cualquier log va a stderr; un
 * console.log suelto rompería al cliente.
 */

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS = `Esta es la memoria de largo plazo del usuario: una bóveda de notas Markdown de Geode.
Cada escritura queda versionada (git) y se respalda sola en GitHub si el usuario lo activó, así que nada se pierde y el usuario puede ver y deshacer lo que escribas.

Cómo usarla:
- Antes de responder sobre algo que el usuario pudo haber guardado, buscá con search_notes y leé con read_note.
- Guardá lo que valga la pena recordar (decisiones, preferencias, datos de proyectos) en notas cortas y temáticas. Si no hay una convención en la bóveda, usá la carpeta "memoria/".
- Para agregar algo sin pisar nada, usá append_note. Para cambiar un fragmento, edit_note. Para reescribir una nota entera, read_note primero y pasá su "version" como expected_version a write_note.
- Si una escritura falla porque la nota cambió, volvé a leerla: el usuario puede estar editándola en este momento.
- Pasá siempre un "summary" breve en español: es el título de la versión que el usuario ve en su historial.`

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
  run: (args: Record<string, unknown>) => Promise<unknown>
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

const SUMMARY = {
  type: 'string',
  description: 'Resumen breve en español de lo que cambiaste (título de la versión en el historial).'
}

function tools(store: MemoryStore): ToolDef[] {
  return [
    {
      name: 'list_notes',
      title: 'Listar notas',
      description: 'Lista las rutas de todas las notas de la bóveda (o de una carpeta).',
      inputSchema: {
        type: 'object',
        properties: { folder: { type: 'string', description: 'Carpeta relativa (opcional), p. ej. "memoria".' } }
      },
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const notes = await store.listNotes(str(a.folder) ?? '')
        return { count: notes.length, notes }
      }
    },
    {
      name: 'search_notes',
      title: 'Buscar notas',
      description:
        'Busca notas que contengan TODAS las palabras (ignora mayúsculas y tildes) en el nombre o el texto. Devuelve rutas y líneas que coinciden.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Palabras a buscar.' },
          limit: { type: 'number', description: 'Máximo de notas (default 20).' }
        },
        required: ['query']
      },
      annotations: { readOnlyHint: true },
      run: async (a) => ({ results: await store.search(str(a.query) ?? '', num(a.limit) ?? 20) })
    },
    {
      name: 'read_note',
      title: 'Leer nota',
      description:
        'Lee una nota completa. Devuelve su contenido y su "version" (necesaria para sobrescribirla con write_note).',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Ruta relativa, p. ej. "memoria/proyectos.md".' } },
        required: ['path']
      },
      annotations: { readOnlyHint: true },
      run: async (a) => store.readNote(str(a.path) ?? '')
    },
    {
      name: 'write_note',
      title: 'Escribir nota',
      description:
        'Crea una nota nueva o reescribe una existente completa. Para reescribir una que ya existe, pasá expected_version (la "version" de read_note): si la nota cambió desde que la leíste, falla y no pisa nada.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ruta relativa (se agrega .md si falta).' },
          content: { type: 'string', description: 'Contenido Markdown completo.' },
          expected_version: { type: 'string', description: 'Obligatoria si la nota ya existe.' },
          summary: SUMMARY
        },
        required: ['path', 'content']
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      run: async (a) =>
        store.writeNote(str(a.path) ?? '', str(a.content) as string, str(a.expected_version), str(a.summary))
    },
    {
      name: 'edit_note',
      title: 'Editar nota',
      description:
        'Reemplaza un fragmento EXACTO de una nota por otro. old_text debe aparecer una sola vez (agregá contexto si no).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_text: { type: 'string', description: 'Texto exacto a reemplazar.' },
          new_text: { type: 'string', description: 'Texto nuevo.' },
          summary: SUMMARY
        },
        required: ['path', 'old_text', 'new_text']
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      run: async (a) =>
        store.editNote(str(a.path) ?? '', str(a.old_text) as string, str(a.new_text) as string, str(a.summary))
    },
    {
      name: 'append_note',
      title: 'Agregar a nota',
      description: 'Agrega texto al final de una nota (la crea si no existe). Nunca pisa contenido.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          text: { type: 'string', description: 'Markdown a agregar.' },
          summary: SUMMARY
        },
        required: ['path', 'text']
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
      run: async (a) => store.appendNote(str(a.path) ?? '', str(a.text) as string, str(a.summary))
    },
    {
      name: 'note_history',
      title: 'Historial de una nota',
      description: 'Versiones de una nota (más nueva primero): commit, mensaje, autor y fecha.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, limit: { type: 'number', description: 'Default 20.' } },
        required: ['path']
      },
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const versions = await store.history(str(a.path) ?? '', num(a.limit) ?? 20)
        return {
          versions: versions.map((v) => ({
            commit: v.oid,
            message: v.message,
            author: v.author,
            date: new Date(v.timestamp).toISOString()
          }))
        }
      }
    },
    {
      name: 'read_note_version',
      title: 'Leer versión pasada',
      description: 'Lee el contenido de una nota en una versión pasada (commit de note_history).',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, commit: { type: 'string' } },
        required: ['path', 'commit']
      },
      annotations: { readOnlyHint: true },
      run: async (a) => ({ content: await store.readAt(str(a.path) ?? '', str(a.commit) ?? '') })
    }
  ]
}

export class McpServer {
  private readonly tools: Map<string, ToolDef>

  constructor(
    private readonly store: MemoryStore,
    private readonly version: string
  ) {
    this.tools = new Map(tools(store).map((t) => [t.name, t]))
  }

  /** Procesa un mensaje JSON-RPC. Devuelve null para notificaciones (sin id). */
  async handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const isNotification = msg.id === undefined
    const id = msg.id ?? null
    try {
      const result = await this.dispatch(msg.method, msg.params ?? {})
      return isNotification ? null : { jsonrpc: '2.0', id, result }
    } catch (e) {
      if (isNotification) return null
      const code = e instanceof RpcError ? e.code : -32603
      return { jsonrpc: '2.0', id, error: { code, message: e instanceof Error ? e.message : String(e) } }
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'initialize': {
        const requested = str(params.protocolVersion)
        const clientName = str((params.clientInfo as { name?: unknown } | undefined)?.name)
        if (clientName) this.store.setAiAuthor({ name: `${prettyClient(clientName)} (IA)`, email: 'ia@geode.local' })
        return {
          protocolVersion: requested && PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'geode', title: 'Geode', version: this.version },
          instructions: INSTRUCTIONS
        }
      }
      case 'ping':
        return {}
      case 'tools/list':
        return {
          tools: [...this.tools.values()].map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations
          }))
        }
      case 'tools/call':
        return this.callTool(str(params.name) ?? '', (params.arguments as Record<string, unknown>) ?? {})
      default:
        if (method.startsWith('notifications/')) return {}
        throw new RpcError(-32601, `Método no soportado: ${method}`)
    }
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name)
    if (!tool) throw new RpcError(-32602, `Herramienta desconocida: ${name}`)
    try {
      const out = await tool.run(args)
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false }
    } catch (e) {
      // Errores de uso (versión vieja, ruta inválida…) vuelven al LLM para que se
      // corrija; los inesperados también, pero quedan en stderr.
      if (!(e instanceof MemoryError)) console.error('[mcp] error en', name, e)
      const message = e instanceof Error ? e.message : String(e)
      return { content: [{ type: 'text', text: message }], isError: true }
    }
  }

  /** Atiende el protocolo por stdin/stdout hasta que se cierre stdin. */
  runStdio(): Promise<void> {
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
    const send = (res: JsonRpcResponse): void => {
      process.stdout.write(`${JSON.stringify(res)}\n`)
    }
    rl.on('line', (line) => {
      if (!line.trim()) return
      let msg: JsonRpcRequest
      try {
        msg = JSON.parse(line) as JsonRpcRequest
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } })
        return
      }
      void this.handle(msg).then((res) => {
        if (res) send(res)
      })
    })
    return new Promise((resolveDone) => rl.on('close', () => resolveDone()))
  }
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
  }
}

/** "claude-code" → "Claude Code", "cursor-vscode" → "Cursor Vscode". */
function prettyClient(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 40)
}
