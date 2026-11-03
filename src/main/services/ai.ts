import type { AiModel, AiUsage, NamedVersion } from '@shared/ipc'

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

export const SYSTEM_PROMPT = `Sos un asistente que resume, en español, qué se hizo en un conjunto de notas personales, para etiquetar una versión guardada.

Te paso un diff (formato unificado) de los cambios. Devolvé SOLO el resumen, en UNA SOLA LÍNEA (sin saltos de línea, sin viñetas, sin comillas, sin bloques de código, sin prefijos tipo "feat:"/"fix:"). Va a mostrarse en un grafo de versiones, así que tiene que ser corto: idealmente 60-80 caracteres, nunca más de ~100.

Qué queremos:
- Una síntesis clara del CONTENIDO y el TEMA de lo que se escribió o cambió (p. ej. "Reunión con Marketing: objetivos del Q3 y responsables").

Qué evitar:
- NO describas el edit de forma mecánica ni trivial ("se agregó una frase", "se modificó una línea", "cambios en nota.md").
- No inventes nada que no esté en el diff. Inferí el tema a partir del texto de las notas.
- Si el cambio es muy chico, igual describí el TEMA de lo agregado, no el tamaño.`

export const WRITER_PROMPT = `Sos un asistente de escritura integrado en un editor de notas en markdown.
El usuario te da una instrucción y (opcionalmente) un texto seleccionado o el contexto previo.

Devolvé ÚNICAMENTE el texto que hay que insertar en el documento, listo para pegar:
- En markdown cuando corresponda, pero sin envolverlo en bloques de código.
- Sin preámbulos, sin explicaciones, sin comillas alrededor.
- Escribí en el mismo idioma del contexto (por defecto, español).
- Si la instrucción es reescribir/resumir/traducir el texto seleccionado, devolvé SOLO la nueva versión de ese texto.`

export const NAMED_VERSION_PROMPT = `Sos un asistente que, en español, le pone nombre a una versión guardada de notas personales.

Te paso un diff en formato unificado. Leelo así:
- Las líneas que empiezan con "+" son lo que se AGREGÓ en este guardado.
- Las líneas que empiezan con "-" son lo que se QUITÓ en este guardado.
- Las líneas SIN "+"/"-" son CONTEXTO que NO cambió: sirven solo para ubicar el cambio, NO las describas como novedad.

Tu tarea: describir QUÉ CAMBIÓ en este guardado (lo agregado, quitado o reescrito). NO resumas la nota entera. Sólo si casi todo el diff son líneas "+" (es la primera versión de la nota) describí el tema general de la nota.

Devolvé EXACTAMENTE este formato:
- PRIMERA LÍNEA: un título MUY conciso, tipo encabezado — 3 a 6 palabras, máximo ~40 caracteres, SIN viñeta. No una frase completa ni "algo: subtítulo".
- Luego UNA LÍNEA EN BLANCO.
- Luego la descripción como un PUNTEO: una viñeta "- " por cada cosa agregada, quitada o reescrita en este guardado (1 a 4 puntos, cada uno corto y concreto). Un cambio por viñeta.

Qué evitar:
- No uses jerga de git (commit, diff, archivo, línea) ni prefijos tipo "feat:"/"fix:".
- No menciones cosas que están sólo en el contexto (líneas sin "+"/"-") como si fueran nuevas.
- No inventes nada que no esté en las líneas "+"/"-".
- No describas el edit de forma mecánica ("se agregó una frase"); explicá el CONTENIDO de lo que cambió.
- NO rotules las secciones: no escribas "Título:" ni "Descripción:" como rótulos. El título va suelto (sin viñeta); la descripción va en viñetas.
- No asumas que algo se hizo o se completó. Si lo agregado es una lista de pendientes/ideas, describilo como tal, no como trabajo ya realizado.`

/**
 * Lo que sabe hacer cualquier motor de texto (OpenRouter o un CLI con
 * suscripción). El dictado queda fuera: necesita audio y solo lo ofrece OpenRouter.
 */
export interface AiTextProvider {
  generateMessage(diff: string): Promise<string>
  generateNamedVersion(diff: string, signal?: AbortSignal): Promise<NamedVersion>
  generateText(instruction: string, selection: string, before: string): Promise<string>
}

/** Mensaje de usuario del asistente de escritura (selección o contexto previo). */
export function writerUserMessage(instruction: string, selection: string, before: string): string {
  return selection.trim()
    ? `Instrucción: ${instruction}\n\nTexto seleccionado:\n${selection}`
    : `Instrucción: ${instruction}\n\nContexto previo (tu respuesta continúa donde termina):\n${before}`
}

/** Fuerza a una sola línea: primera línea no vacía, sin viñeta ni comillas. */
export function toOneLine(text: string): string {
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

/**
 * Parsea la salida del modelo en título + descripción discriminados: la primera
 * línea no vacía es el título (reutiliza `toOneLine` para sacar viñetas/comillas),
 * y todo lo que sigue, ya recortado, es la descripción. Degrada sin lanzar: si la
 * entrada está vacía devuelve ambos campos vacíos.
 */
export function parseNamedVersion(raw: string): NamedVersion {
  const lines = raw.replace(/\r/g, '').split('\n')
  const firstIdx = lines.findIndex((l) => l.trim().length > 0)
  if (firstIdx === -1) return { title: '', description: '' }
  // Algunos modelos rotulan las secciones pese al formato pedido; quitamos solo
  // el rótulo ("Título:"/"Descripción:", con o sin viñeta delante). NO tocamos
  // las viñetas legítimas: la descripción es un punteo.
  const title = toOneLine(lines[firstIdx]).replace(/^t[ií]tulo\s*:\s*/i, '').trim()
  const description = lines
    .slice(firstIdx + 1)
    .join('\n')
    .trim()
    .replace(/^[-*]?\s*(?:descripci[oó]n|resumen)\s*:\s*/i, '')
    .trim()
  return { title, description }
}

/** Instrucción del dictado: transcripción literal, en el idioma hablado. */
const TRANSCRIBE_PROMPT = `Sos un transcriptor. Transcribí EXACTAMENTE lo que se dice en el audio, en el idioma en que se habla (normalmente español rioplatense).
- Devolvé SOLO el texto transcripto, con puntuación y mayúsculas correctas.
- No resumas, no traduzcas, no agregues comentarios ni comillas.
- Si la persona dicta signos ("punto", "coma", "nuevo párrafo"), aplicalos.
- Si no hay voz entendible, devolvé exactamente: (sin voz)`

export class OpenRouterProvider implements AiMessageProvider, AiTextProvider {
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
        architecture?: { input_modalities?: string[] }
      }[]
    }
    return (json.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      // Precios en USD por token (como los da OpenRouter); la UI los pasa a $/millón.
      promptPrice: m.pricing?.prompt ?? null,
      completionPrice: m.pricing?.completion ?? null,
      contextLength: m.context_length ?? null,
      audioInput: (m.architecture?.input_modalities ?? []).includes('audio')
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
   * Genera título + descripción discriminados a partir del diff pendiente (solo
   * notas .md). El título va en la primera línea y la descripción en el cuerpo.
   * `signal` opcional: permite abortar el fetch desde afuera (p. ej. el tope de
   * 10s de los auto-snapshots), para no dejar la request colgada tras el timeout.
   */
  async generateNamedVersion(diff: string, signal?: AbortSignal): Promise<NamedVersion> {
    const raw = await this.chat(
      [
        { role: 'system', content: NAMED_VERSION_PROMPT },
        { role: 'user', content: diff }
      ],
      500,
      0.2,
      signal
    )
    return parseNamedVersion(raw)
  }

  /**
   * Asistente de escritura dentro del editor: sigue una instrucción del usuario
   * sobre la selección (o el contexto previo si no hay selección) y devuelve el
   * texto a insertar.
   */
  async generateText(instruction: string, selection: string, before: string): Promise<string> {
    return this.chat(
      [
        { role: 'system', content: WRITER_PROMPT },
        { role: 'user', content: writerUserMessage(instruction, selection, before) }
      ],
      1000,
      0.7
    )
  }

  /**
   * Dictado: transcribe un WAV (base64) con un modelo que acepte audio de
   * entrada (`input_audio` de OpenRouter). Temperatura 0: transcripción literal,
   * sin resumir ni "mejorar" lo dicho. '' si no se entendió voz.
   */
  async transcribe(wavBase64: string, signal?: AbortSignal): Promise<string> {
    const raw = await this.chat(
      [
        { role: 'system', content: TRANSCRIBE_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribí este audio.' },
            { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } }
          ]
        }
      ],
      2000,
      0,
      signal,
      true
    )
    const text = raw.trim()
    return /^\(?(sin voz|silencio|no speech|\[silencio\])\)?\.?$/i.test(text) ? '' : text
  }

  /** Llamada de chat a OpenRouter. Devuelve el contenido del mensaje. */
  private async chat(
    messages: { role: string; content: string | Record<string, unknown>[] }[],
    maxTokens: number,
    temperature: number,
    signal?: AbortSignal,
    allowEmpty = false
  ): Promise<string> {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'X-Title': 'Geode',
        'HTTP-Referer': 'https://github.com/chewax/geode'
      },
      body: JSON.stringify({ model: this.model, max_tokens: maxTokens, temperature, messages }),
      signal
    })
    if (!res.ok) {
      throw new Error(`OpenRouter /chat devolvió ${res.status}: ${await res.text()}`)
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) {
      if (allowEmpty) return ''
      throw new Error('El modelo devolvió una respuesta vacía')
    }
    return raw
  }
}

/** Preferidos para dictado (si están disponibles y aceptan audio), en orden. */
const DICTATION_PREFERRED = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o-mini-audio-preview',
  'openai/gpt-4o-audio-preview'
]

/**
 * Elige el modelo del dictado: el configurado si sigue existiendo y acepta audio;
 * si no, el primero de la lista de preferidos disponible; si no, el más barato que
 * acepte audio. null si OpenRouter no ofrece ninguno.
 */
export function pickDictationModel(models: AiModel[], configured: string | null): string | null {
  const audio = models.filter((m) => m.audioInput)
  if (configured && audio.some((m) => m.id === configured)) return configured
  for (const id of DICTATION_PREFERRED) if (audio.some((m) => m.id === id)) return id
  const price = (m: AiModel): number => Number(m.promptPrice ?? Infinity)
  return [...audio].sort((a, b) => price(a) - price(b))[0]?.id ?? null
}

/** Lista de modelos sin necesitar un modelo elegido todavía (para los ajustes). */
export async function listOpenRouterModels(key: string): Promise<AiModel[]> {
  return new OpenRouterProvider(key, '').listModels()
}

/**
 * Boundary de traducción de fallos de IA a español humano. Los errores crudos
 * del proveedor los generamos nosotros en `chat()`/`listModels()` con el status
 * HTTP y el body de OpenRouter (p. ej. `OpenRouter /chat devolvió 404: {"error":
 * {"message":"No endpoints found for allenai/olmo-3-32b-think"}}`). Nada de eso
 * puede cruzar al usuario: `mapAiError` clasifica y devuelve SIEMPRE un Error
 * nuevo con copy amigable, sin relanzar el crudo. Imita el precedente de
 * `mapBackupError` (v1.2). La IA es opcional: el mensaje deja claro que se puede
 * seguir a mano.
 */
export function mapAiError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  const lower = msg.toLowerCase()

  // Modelo inexistente / dado de baja en el proveedor (caso real: 404 con
  // "No endpoints found"). Es el motivo más común de este boundary.
  if (lower.includes('404') || lower.includes('no endpoints found')) {
    return new Error(
      'La sugerencia de IA no está disponible: el modelo configurado ya no existe en OpenRouter. Revisá el modelo en Ajustes → IA.'
    )
  }

  // Credencial rechazada (key inválida o sin permisos).
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('auth')
  ) {
    return new Error(
      'La sugerencia de IA no está disponible: la API key de OpenRouter fue rechazada. Revisá la API key en Ajustes → IA.'
    )
  }

  // Timeout / abort / fallo de red: no se pudo contactar al proveedor.
  if (
    lower.includes('aborted') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return new Error(
      'La sugerencia de IA no está disponible: no se pudo contactar a OpenRouter. Probá de nuevo en un momento.'
    )
  }

  // Cualquier otro fallo: genérico, sin filtrar el crudo del proveedor.
  return new Error(
    'La sugerencia de IA no está disponible en este momento. Podés escribir el nombre y la descripción a mano.'
  )
}

/** Uso/gasto de la API key en OpenRouter (crédito consumido y límite, en USD). */
export async function getOpenRouterUsage(key: string): Promise<AiUsage> {
  // Timeout: sin esto un problema de red deja el fetch (y el indicador) colgado.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  let res: Response
  try {
    res = await fetch(`${OPENROUTER}/auth/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal
    })
  } catch (e) {
    throw new Error(
      ctrl.signal.aborted
        ? 'OpenRouter no respondió (timeout de 10s)'
        : `No se pudo contactar OpenRouter: ${(e as Error).message}`
    )
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    throw new Error(`OpenRouter /auth/key devolvió ${res.status}: ${await res.text()}`)
  }
  const j = (await res.json()) as {
    data?: { label?: string; usage?: number; limit?: number | null }
  }
  return {
    label: j.data?.label ?? null,
    usage: j.data?.usage ?? 0,
    limit: j.data?.limit ?? null
  }
}
