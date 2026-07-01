import type { AiModel } from '@shared/ipc'

/**
 * Generación de mensajes de commit por IA (ver ARCHITECTURE.md §3).
 *
 * Interfaz de proveedor para poder sumar motores (local/Ollama, Anthropic
 * directo) sin tocar el resto. Hoy: OpenRouter (gateway a muchos modelos).
 */
export interface AiMessageProvider {
  listModels(): Promise<AiModel[]>
  generateMessage(diff: string): Promise<string>
}

const OPENROUTER = 'https://openrouter.ai/api/v1'

const SYSTEM_PROMPT = `Sos un asistente que escribe mensajes de commit en español para una app de notas.
A partir del diff que te paso, devolvé SOLO el mensaje de commit, sin comillas ni bloques de código:
- Primera línea: resumen imperativo y conciso (máx. ~70 caracteres) de lo que cambió.
- Si aporta, dejá una línea en blanco y 1-3 viñetas ("- ...") con los cambios clave.
No inventes cambios que no estén en el diff. Enfocate en el "qué" y el "por qué" aparente, no en detalles triviales.`

export class OpenRouterProvider implements AiMessageProvider {
  constructor(
    private readonly key: string,
    private readonly model: string
  ) {}

  async listModels(): Promise<AiModel[]> {
    const res = await fetch(`${OPENROUTER}/models`, {
      headers: this.key ? { Authorization: `Bearer ${this.key}` } : {}
    })
    if (!res.ok) throw new Error(`OpenRouter /models devolvió ${res.status}`)
    const json = (await res.json()) as { data?: { id: string; name?: string }[] }
    return (json.data ?? []).map((m) => ({ id: m.id, name: m.name ?? m.id }))
  }

  async generateMessage(diff: string): Promise<string> {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        // OpenRouter usa estos para atribución/ranking; no son obligatorios.
        'X-Title': 'Geode',
        'HTTP-Referer': 'https://github.com/chewax/geode'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 300,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: diff }
        ]
      })
    })
    if (!res.ok) {
      throw new Error(`OpenRouter /chat devolvió ${res.status}: ${await res.text()}`)
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const msg = json.choices?.[0]?.message?.content?.trim()
    if (!msg) throw new Error('El modelo devolvió una respuesta vacía')
    return msg
  }
}

/** Lista de modelos sin necesitar un modelo elegido todavía (para los ajustes). */
export async function listOpenRouterModels(key: string): Promise<AiModel[]> {
  return new OpenRouterProvider(key, '').listModels()
}
