/**
 * Codificación WAV (PCM 16 bits, mono) y base64, PURA (sin DOM): se testea en
 * Node. El dictado graba con MediaRecorder (webm/opus), lo decodifica a muestras
 * y lo manda como WAV de 16 kHz: liviano y aceptado por los modelos de audio.
 */

/** Frecuencia de muestreo del dictado: suficiente para voz y 3× más chico que 48 kHz. */
export const DICTATION_SAMPLE_RATE = 16_000

/** Muestras float [-1, 1] → archivo WAV PCM16 mono. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const str = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true) // tamaño del bloque fmt
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * bytesPerSample, true) // bytes por segundo
  v.setUint16(32, bytesPerSample, true) // block align
  v.setUint16(34, 16, true) // bits por muestra
  str(36, 'data')
  v.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buf)
}

/** Bytes → base64, en tandas (un audio de minutos no entra en un solo String.fromCharCode). */
export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/** Nivel RMS de un audio (0..1): sirve para detectar que no se dijo nada. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}
