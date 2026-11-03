import { describe, expect, it } from 'vitest'
import { encodeWav, rms, toBase64 } from '../src/renderer/src/dictation/wav'

describe('WAV del dictado', () => {
  it('arma una cabecera RIFF/WAVE PCM16 mono válida', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000)
    const v = new DataView(wav.buffer)
    const tag = (o: number): string => String.fromCharCode(...wav.subarray(o, o + 4))
    expect(tag(0)).toBe('RIFF')
    expect(tag(8)).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(1) // mono
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint32(40, true)).toBe(8) // 4 muestras × 2 bytes
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([0, 32767, -32768])
  })

  it('base64 en tandas coincide con Buffer y RMS detecta silencio', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251)
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
    expect(rms(new Float32Array(1000))).toBe(0)
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5)
  })
})
