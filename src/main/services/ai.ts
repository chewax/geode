import type { AiModel, AiUsage } from '@shared/ipc'

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

Te paso un diff (formato unificado) de los cambios. Devolvé SOLO el resumen, en UNA SOLA LÍNEA (sin saltos de línea, sin viñetas, sin comillas, sin bloques de código, sin prefijos tipo "feat:"/"fix:"). Va a mostrarse en un grafo de versiones, así que tiene que ser corto: idealmente 60-80 caracteres, nunca más de ~100.

Qué queremos:
- Una síntesis clara del CONTENIDO y el TEMA de lo que se escribió o cambió (p. ej. "Reunión con Marketing: objetivos del Q3 y responsables").

Qué evitar:
- NO describas el edit de forma mecánica ni trivial ("se agregó una frase", "se modificó una línea", "cambios en nota.md").
- No inventes nada que no esté en el diff. Inferí el tema a partir del texto de las notas.
- Si el cambio es muy chico, igual describí el TEMA de lo agregado, no el tamaño.`

const WRITER_PROMPT = `Sos un asistente de escritura integrado en un editor de notas en markdown.
El usuario te da una instrucción y (opcionalmente) un texto seleccionado o el contexto previo.

Devolvé ÚNICAMENTE el texto que hay que insertar en el documento, listo para pegar:
- En markdown cuando corresponda, pero sin envolverlo en bloques de código.
- Sin preámbulos, sin explicaciones, sin comillas alrededor.
- Escribí en el mismo idioma del contexto (por defecto, español).
- Si la instrucción es reescribir/resumir/traducir el texto seleccionado, devolvé SOLO la nueva versión de ese texto.`

/** Fuerza a una sola línea: primera línea no vacía, sin viñeta ni comillas. */
function toOneLine(text: string): string {
  const firstLine =
    text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? text.trim()
  return firstLine
    .replace(/^[-*]\s+/, '') // viñeta inicial
    .replace(/^["'“”]+|["'“”]+$/g, '') // comillas envolventes
    .trim()
}

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
    const raw = await this.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: diff }
      ],
      300,
      0.2
    )
    return toOneLine(raw)
  }

  /**
   * Asistente de escritura dentro del editor: sigue una instrucción del usuario
   * sobre la selección (o el contexto previo si no hay selección) y devuelve el
   * texto a insertar.
   */
  async generateText(instruction: string, selection: string, before: string): Promise<string> {
    const user = selection.trim()
      ? `Instrucción: ${instruction}\n\nTexto seleccionado:\n${selection}`
      : `Instrucción: ${instruction}\n\nContexto previo (tu respuesta continúa donde termina):\n${before}`
    return this.chat(
      [
        { role: 'system', content: WRITER_PROMPT },
        { role: 'user', content: user }
      ],
      1000,
      0.7
    )
  }

  /** Llamada de chat a OpenRouter. Devuelve el contenido del mensaje. */
  private async chat(
    messages: { role: string; content: string }[],
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'X-Title': 'Geode',
        'HTTP-Referer': 'https://github.com/chewax/geode'
      },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, temperature, messages })
    })
    if (!res.ok) {
      throw new Error(`OpenRouter /chat devolvió ${res.status}: ${await res.text()}`)
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) throw new Error('El modelo devolvió una respuesta vacía')
    return raw
  }
}

/** Lista de modelos sin necesitar un modelo elegido todavía (para los ajustes). */
export async function listOpenRouterModels(key: string): Promise<AiModel[]> {
  return new OpenRouterProvider(key, '').listModels()
}

/** Uso/gasto de la API key en OpenRouter (crédito consumido y límite, en USD). */
export async function getOpenRouterUsage(key: string): Promise<AiUsage> {
  const res = await fetch(`${OPENROUTER}/auth/key`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) throw new Error(`OpenRouter /auth/key devolvió ${res.status}`)
  const j = (await res.json()) as {
    data?: { label?: string; usage?: number; limit?: number | null }
  }
  return {
    label: j.data?.label ?? null,
    usage: j.data?.usage ?? 0,
    limit: j.data?.limit ?? null
  }
}
