import { useCallback, useSyncExternalStore } from 'react'

/**
 * Preferencias de interfaz por dispositivo (localStorage), con aviso entre
 * componentes: cambiar una en Ajustes actualiza al instante todos los paneles.
 * Para estado que debe sincronizarse o persistir de verdad, usar settings.json.
 */
const EVENT = 'geode-pref'

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

/** Preferencia booleana compartida. Devuelve [valor, setter]. */
export function useBoolPref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((cb: () => void) => {
    const handler = (e: Event): void => {
      if ((e as CustomEvent<string>).detail === key) cb()
    }
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
  }, [key])
  const value = useSyncExternalStore(subscribe, () => read(key, fallback))
  const set = useCallback((v: boolean) => {
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      // sin almacenamiento: la preferencia dura hasta cerrar la app
    }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }))
  }, [key])
  return [value, set]
}

/** Clave de la preferencia "mostrar barra de formato". */
export const PREF_FORMAT_TOOLBAR = 'geode.formatToolbar'
