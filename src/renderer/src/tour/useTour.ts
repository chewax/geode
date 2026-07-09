import { useCallback, useEffect, useRef, useState } from 'react'
import type { TourState } from '@shared/ipc'
import { TOUR_STEPS } from './steps'

/**
 * Superficie del hook del recorrido guiado. Expone el estado tri-state para el
 * disparo/gate desde App, el `active` para montar el overlay, el `stepIndex`
 * para el progreso y los verbos de navegación/cierre.
 */
export interface UseTour {
  /** Estado persistente del tour: 'unseen' (nunca visto), 'started' (interrumpido), 'seen' (visto). */
  tourState: TourState
  /** True mientras el overlay debe montarse. Alimenta el gate de la BackupCard. */
  active: boolean
  /** Índice del paso actual (0..TOUR_STEPS.length-1). */
  stepIndex: number
  /** Re-lanza el recorrido reproduciéndolo desde el paso 0. NO toca persistencia. */
  launch: () => void
  /** Disparo de primer uso: persiste 'started' y abre el tour por primera vez. */
  startFirstRun: () => Promise<void>
  /** Avanza un paso (clamp al último). */
  next: () => void
  /** Retrocede un paso (clamp a 0). */
  prev: () => void
  /** Cierra el tour saltándolo; persiste 'seen' una sola vez. */
  skip: () => void
  /** Cierra el tour por finalización; persiste 'seen' una sola vez. */
  finish: () => void
}

/**
 * Hook máquina-de-estado del recorrido guiado de primera vez (Fase 13).
 *
 * Modela el tri-state 'unseen'|'started'|'seen' con la semántica "reaparecer una
 * vez": si el usuario cierra la app a mitad del tour (estado 'started'), en el
 * próximo arranque —cuando ya hay un cuaderno abierto (`vaultReady`)— el tour se
 * relanza EXACTAMENTE una vez y de inmediato queda 'seen', de modo que una
 * segunda interrupción no genere un loop (RESEARCH Pitfall 4).
 *
 * La persistencia se delega en `window.geode.tour` (Plan 01). El disparo de
 * primer uso (marcar 'started' tras crear el primer cuaderno) lo invoca App vía
 * `startFirstRun()`. Re-lanzar cuando ya es 'seen' solo reproduce el recorrido
 * sin tocar la persistencia (anti-pattern RESEARCH: no re-nag).
 *
 * @param vaultReady Hay un cuaderno abierto (las anclas Capa 0 existen en el DOM).
 */
export function useTour(vaultReady: boolean): UseTour {
  const [tourState, setTourState] = useState<TourState>('unseen')
  const [active, setActive] = useState<boolean>(false)
  const [stepIndex, setStepIndex] = useState<number>(0)

  // Espejo del estado para leerlo desde callbacks estables sin re-crearlos.
  const tourStateRef = useRef<TourState>('unseen')
  useEffect(() => {
    tourStateRef.current = tourState
  }, [tourState])

  // Guarda de "una sola vez por sesión": impide que la recuperación 'started' se
  // dispare más de una vez y que colisione con el disparo de primer uso.
  const oneShotRef = useRef<boolean>(false)

  // Re-lanzamiento: reproduce el tour desde el inicio. NUNCA persiste (si ya es
  // 'seen', re-verlo no debe reabrir el nag).
  const launch = useCallback((): void => {
    setStepIndex(0)
    setActive(true)
  }, [])

  // Disparo de primer uso: persiste 'started' (para poder "reaparecer una vez"
  // si se interrumpe) y abre el recorrido. Lo llama App en createLocalVault.
  const startFirstRun = useCallback(async (): Promise<void> => {
    oneShotRef.current = true // ya consumimos la apertura de esta sesión
    await window.geode.tour.set('started')
    setTourState('started')
    setStepIndex(0)
    setActive(true)
  }, [])

  const next = useCallback((): void => {
    setStepIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1))
  }, [])

  const prev = useCallback((): void => {
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  // Cierre común de saltar/terminar/Esc: baja el overlay y marca 'seen' una sola
  // vez (idempotente si ya lo estaba, p. ej. tras un re-lanzamiento).
  const close = useCallback(async (): Promise<void> => {
    setActive(false)
    if (tourStateRef.current !== 'seen') {
      await window.geode.tour.set('seen')
      setTourState('seen')
    }
  }, [])

  const skip = useCallback((): void => {
    void close()
  }, [close])
  const finish = useCallback((): void => {
    void close()
  }, [close])

  // Carga inicial + recuperación "reaparecer una vez". Se re-evalúa cuando el
  // cuaderno queda listo, porque las anclas del tour requieren un vault abierto.
  useEffect(() => {
    void (async () => {
      const snap = await window.geode.tour.get()
      // Guarda de orden explícita: si ya hubo una escritura más autoritativa esta
      // sesión (startFirstRun o la propia rama de recuperación), NO pisamos
      // tourState con el snapshot —posiblemente ya obsoleto— de este fetch, que
      // pudo emitirse antes de esa escritura. Evita el revert transitorio de
      // 'started'→'unseen' en la carrera de creación del primer cuaderno (WR-03).
      if (oneShotRef.current) return
      setTourState(snap.state)
      // Interrumpido a mitad ('started') + cuaderno abierto → relanzar UNA vez y
      // fijar 'seen' de inmediato, para que una segunda interrupción no cicle.
      if (snap.state === 'started' && vaultReady) {
        oneShotRef.current = true
        launch()
        await window.geode.tour.set('seen')
        setTourState('seen')
      }
    })()
  }, [vaultReady, launch])

  // Esc cierra el recorrido (equivale a "Saltar"). Gateado en `active` con
  // limpieza en desmontaje (mismo patrón que la paleta Ctrl+P en App.tsx).
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close])

  return { tourState, active, stepIndex, launch, startFirstRun, next, prev, skip, finish }
}
