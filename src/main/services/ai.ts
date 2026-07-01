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

const SYSTEM_PROMPT = `Sos un asistente que resume, en español, qué se hizo en un conjunto de notas personales, para etiquetar una versión guardada.

Te paso un diff (formato unificado) de los cambios. Devolvé SOLO el resumen, sin comillas ni bloques de código, sin prefijos tipo "feat:"/"fix:".

Qué queremos:
- Un resumen del CONTENIDO y el TEMA de lo que se escribió o cambió, no de la mecánica de edición.
- Primera línea: una síntesis clara de qué trata el cambio (p. ej. "Notas de la reunión con Marketing: objetivos del Q3 y responsables").
- Si aporta, una línea en blanco y 1-3 viñetas ("- ...") con los puntos concretos que se agregaron o cambiaron.

Qué evitar:
- NO describas el edit de forma mecánica ni trivial ("se agregó una frase", "se modificó una línea", "cambios en nota.md").
- No inventes nada que no esté en el diff. Inferí el tema a partir del texto de las notas.
- Si el cambio es muy chico, igual describí el TEMA de lo agregado, no el tamaño.`

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
    const json = (await res.json()) as {
      data?: {
        id: string
        name?: string
        context_length?: number
        pricing?: { prompt?: string; completion?: string }
      }[]
    }
    return (json.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      // Precios en USD por token (como los da OpenRouter); la UI los pasa a $/millón.
      promptPrice: m.pricing?.prompt ?? null,
      completionPrice: m.pricing?.completion ?? null,
      contextLength: m.context_length ?? null
    }))
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
