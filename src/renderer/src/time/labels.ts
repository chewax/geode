import type { GitCommitNode, GitTagRef } from '@shared/ipc'

/**
 * Helpers puros para etiquetar entradas de la timeline en lenguaje humano.
 * Sin acceso a DOM/IPC: sólo transforman datos, por lo que son testeables.
 */

/**
 * TIME-03: etiqueta humana de una entrada de la timeline. Cadena de fallback:
 * nombre humano (tag) → mensaje (AI) del commit → fecha relativa. NUNCA un hash.
 */
export function entryLabel(c: GitCommitNode, tags: GitTagRef[], now = Date.now()): string {
  const tag = tags.find((t) => t.oid === c.oid)
  if (tag) return tag.name
  // Solo el título (primera línea no vacía), no el cuerpo/descripción del mensaje.
  const firstLine = c.message
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (firstLine) return firstLine
  return relativeDate(c.timestamp, now)
}

/**
 * Fecha relativa en español con singular/plural correcto. Los tiempos negativos
 * (relojes desincronizados) se acotan a 0 → "ahora mismo".
 */
export function relativeDate(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'ahora mismo'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`
  const d = Math.round(h / 24)
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`
  const w = Math.round(d / 7)
  return `hace ${w} ${w === 1 ? 'semana' : 'semanas'}`
}

/**
 * TIME-04: resumen humano de cuántas notas cambiaron en una entrada.
 * "1 nota cambiada" / "N notas cambiadas" (lenguaje humano, no "archivo").
 */
export function changedSummary(names: string[]): string {
  const n = names.length
  return `${n} ${n === 1 ? 'nota cambiada' : 'notas cambiadas'}`
}
