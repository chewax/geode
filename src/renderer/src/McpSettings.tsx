import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Brain, Check, Copy } from 'lucide-react'
import type { McpInfo } from '@shared/ipc'

/** Comillas dobles para la terminal (rutas con espacios). */
function q(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`
}

/** Comando de Claude Code para registrar el servidor MCP de esta bóveda. */
function claudeCodeCommand(info: McpInfo): string {
  const env = Object.entries(info.env)
    .map(([k, v]) => `-e ${k}=${v}`)
    .join(' ')
  return `claude mcp add geode --scope user ${env} -- ${q(info.command)} ${info.args.map(q).join(' ')}`
}

/** Bloque JSON para Claude Desktop, Cursor y otros clientes con `mcpServers`. */
function mcpServersJson(info: McpInfo): string {
  return JSON.stringify(
    { mcpServers: { geode: { command: info.command, args: info.args, env: info.env } } },
    null,
    2
  )
}

function Snippet({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="mcp-snippet">
      <pre>{text}</pre>
      <button className="icon-btn" title="Copiar" onClick={() => void copy()}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  )
}

/** Ajustes → Memoria para IA: cómo conectar un LLM a esta bóveda por MCP. */
export function McpSettings(): JSX.Element {
  const [info, setInfo] = useState<McpInfo | null | undefined>(undefined)
  useEffect(() => {
    window.geode.mcp.info().then(setInfo).catch(() => setInfo(null))
  }, [])

  return (
    <section className="settings-section">
      <h2>
        <Brain size={18} /> Memoria para IA
      </h2>
      <p className="modal-sub">
        Conectá Claude, Cursor u otro asistente compatible con MCP a esta bóveda para que la use como su
        memoria de largo plazo: puede buscar y leer tus notas, y guardar lo que valga la pena recordar.
      </p>
      <p className="hint">
        Todo lo que escribe la IA queda como una versión más en la línea de tiempo, con su nombre como
        autor: lo ves y lo deshacés como cualquier otro cambio. Si el respaldo en la nube está activo, se
        sube solo a GitHub y llega a tus otras computadoras. No usa tu API key de IA: no tiene costo.
      </p>

      {info === undefined && <p className="hint">Cargando…</p>}
      {info === null && <p className="hint">Abrí una bóveda para ver cómo conectarla.</p>}
      {info && (
        <>
          <label className="field-label">Claude Code (terminal)</label>
          <Snippet text={claudeCodeCommand(info)} />

          <label className="field-label">Claude Desktop, Cursor y otros (JSON de configuración)</label>
          <Snippet text={mcpServersJson(info)} />
          <p className="hint">
            En Claude Desktop: Ajustes → Desarrollador → Editar configuración, y pegá el bloque{' '}
            <b>geode</b> dentro de <code>mcpServers</code>. Reiniciá el asistente después.
          </p>
          <p className="hint">
            Sirve la bóveda <b>{info.vault}</b>. Para otra bóveda, abrila y volvé a copiar.
          </p>
        </>
      )}
    </section>
  )
}
