import { useSyncExternalStore } from 'react'

/**
 * Tema visual (claro/oscuro). Preferencia por dispositivo: se guarda en
 * localStorage como el ancho del sidebar. 'sistema' sigue al SO en vivo.
 * El tema efectivo se aplica como `data-theme` en <html>; el CSS redefine las
 * variables de color y el editor reconfigura su resaltado sin remontarse.
 */
export type ThemePref = 'sistema' | 'claro' | 'oscuro'
export type Theme = 'light' | 'dark'

const KEY = 'geode.theme'
const listeners = new Set<() => void>()
const media = window.matchMedia('(prefers-color-scheme: light)')

function readPref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'claro' || v === 'oscuro' || v === 'sistema' ? v : 'sistema'
}

let pref: ThemePref = readPref()

function resolve(p: ThemePref): Theme {
  if (p === 'claro') return 'light'
  if (p === 'oscuro') return 'dark'
  return media.matches ? 'light' : 'dark'
}

let current: Theme = resolve(pref)

function apply(): void {
  current = resolve(pref)
  document.documentElement.dataset.theme = current
  listeners.forEach((l) => l())
}

media.addEventListener('change', () => {
  if (pref === 'sistema') apply()
})
apply()

/** Preferencia guardada (sistema/claro/oscuro). */
export function getThemePref(): ThemePref {
  return pref
}

/** Cambia y persiste la preferencia de tema; aplica al instante. */
export function setThemePref(next: ThemePref): void {
  pref = next
  localStorage.setItem(KEY, next)
  apply()
}

/** Tema efectivo actual. */
export function getTheme(): Theme {
  return current
}

/** Suscripción a cambios del tema efectivo (para CodeMirror y React). */
export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Hook: tema efectivo, re-renderiza al cambiar. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme)
}
