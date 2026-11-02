/**
 * Variables de plantilla compartidas por "Notas diarias" y "Plantillas".
 * Se aceptan en español y en inglés (compatibilidad con plantillas de Obsidian).
 */

/** Carpeta donde viven las plantillas (notas normales, versionadas como el resto). */
export const TEMPLATES_DIR = 'Plantillas'

const pad = (n: number): string => String(n).padStart(2, '0')

/** Fecha local en formato YYYY-MM-DD (no UTC: "hoy" es el día del usuario). */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Hora local HH:MM. */
export function localTime(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Reemplaza `{{fecha}}`/`{{date}}`, `{{hora}}`/`{{time}}` y `{{titulo}}`/`{{title}}`.
 * Las variables desconocidas se dejan tal cual (no se pierde texto).
 */
export function applyTemplate(text: string, vars: { title: string; now?: Date }): string {
  const now = vars.now ?? new Date()
  const values: Record<string, string> = {
    fecha: localDate(now),
    date: localDate(now),
    hora: localTime(now),
    time: localTime(now),
    titulo: vars.title,
    título: vars.title,
    title: vars.title
  }
  return text.replace(/\{\{\s*([\p{L}]+)\s*\}\}/gu, (m, name: string) => values[name.toLowerCase()] ?? m)
}
