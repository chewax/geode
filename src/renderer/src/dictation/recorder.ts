import { DICTATION_SAMPLE_RATE, encodeWav, rms, toBase64 } from './wav'
import { t } from '@shared/i18n'

/** Grabación en curso: `stop` devuelve el audio como WAV base64 (o null si no hubo voz). */
export interface Recording {
  stop(): Promise<{ wavBase64: string; seconds: number } | null>
  cancel(): void
}

/** Debajo de este nivel se considera silencio (no se gasta una llamada a la IA). */
const SILENCE_RMS = 0.004

/**
 * Empieza a grabar el micrófono. Lanza con un mensaje humano si no hay micrófono
 * o se negó el permiso. El audio nunca sale de la app hasta transcribirlo.
 */
export async function startRecording(): Promise<Recording> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
  } catch (e) {
    const name = (e as { name?: string })?.name
    throw new Error(
      name === 'NotFoundError'
        ? t('No se encontró ningún micrófono.')
        : name === 'NotAllowedError'
          ? t('Geode no tiene permiso para usar el micrófono.')
          : t('No se pudo abrir el micrófono.')
    )
  }
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data)
  }
  recorder.start(250)
  const startedAt = Date.now()
  const release = (): void => stream.getTracks().forEach((t) => t.stop())

  return {
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          release()
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
            const samples = await decodeToMono(blob)
            if (samples.length === 0 || rms(samples) < SILENCE_RMS) return resolve(null)
            resolve({
              wavBase64: toBase64(encodeWav(samples, DICTATION_SAMPLE_RATE)),
              seconds: (Date.now() - startedAt) / 1000
            })
          } catch {
            reject(new Error(t('No se pudo procesar el audio grabado.')))
          }
        }
        if (recorder.state !== 'inactive') recorder.stop()
        else recorder.onstop?.(new Event('stop'))
      })
  }
}

/** Decodifica el audio grabado y lo re-muestrea a mono 16 kHz. */
async function decodeToMono(blob: Blob): Promise<Float32Array> {
  const data = await blob.arrayBuffer()
  if (data.byteLength === 0) return new Float32Array(0)
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(data)
    const length = Math.max(1, Math.ceil(decoded.duration * DICTATION_SAMPLE_RATE))
    const offline = new OfflineAudioContext(1, length, DICTATION_SAMPLE_RATE)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  } finally {
    void ctx.close()
  }
}
