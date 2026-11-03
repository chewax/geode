/**
 * Internacionalización mínima, compartida por main y renderer (módulo PURO).
 *
 * El español es el idioma fuente: el texto en español ES la clave
 * (`t('Guardar versión')`). Los demás idiomas son diccionarios español → idioma.
 * Si falta una traducción se muestra el español: nunca una clave cruda.
 *
 * Interpolación con llaves: `t('Ya existe una rama «{name}»', { name })`.
 * Plurales: el código elige la variante (`n === 1 ? t('… {n} nota') : t('… {n} notas')`).
 *
 * El test `tests/i18n.test.ts` recorre el código y falla si un `t('…')` no tiene
 * traducción al inglés o si las variables `{x}` no coinciden.
 */
import { en } from './en'

export type Locale = 'es' | 'en'
/** Preferencia guardada en ajustes: un idioma fijo o el del sistema. */
export type LocalePref = Locale | 'system'

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' }
]

const DICTS: Record<Exclude<Locale, 'es'>, Record<string, string>> = { en }

let current: Locale = 'es'

/** Idioma efectivo a partir de la preferencia y el idioma del sistema (`es-UY`, `en-US`…). */
export function resolveLocale(pref: LocalePref | undefined, systemLocale: string): Locale {
  if (pref === 'es' || pref === 'en') return pref
  const base = systemLocale.toLowerCase().split(/[-_]/)[0]
  // Geode nació en español: cualquier idioma que no tengamos cae en inglés,
  // salvo el español mismo.
  return base === 'es' ? 'es' : 'en'
}

export function setLocale(locale: Locale): void {
  current = locale
}

export function getLocale(): Locale {
  return current
}

/** Etiqueta BCP 47 para Intl/fechas (`es`, `en`). */
export function intlLocale(): string {
  return current
}

/** Traduce un texto fuente en español al idioma actual e interpola `{variables}`. */
export function t(text: string, params?: Record<string, string | number>): string {
  const out = current === 'es' ? text : (DICTS[current][text] ?? text)
  if (!params) return out
  return out.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}
