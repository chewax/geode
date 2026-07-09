import { PencilLine, Save, Cloud, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Modelo de los 4 pasos del recorrido guiado de primera vez (Capa 0):
 * escribir → guardar → respaldar → historial.
 *
 * IMPORTANTE: la copy (títulos y cuerpos) es LOCKED por la UI-SPEC de la Fase 13
 * (Copywriting Contract, 13-UI-SPEC.md líneas 104-111). Está en español
 * rioplatense (voseo), 2ª persona, sin jerga. NO reescribir sin actualizar la
 * UI-SPEC. Los iconos son Lucide monocromo (nunca emojis).
 */
export interface TourStep {
  /** Nombre del ancla `data-tour` sobre el control real (unión interna fija). */
  anchor: 'escribir' | 'guardar' | 'respaldo' | 'historial'
  /** Ícono Lucide del paso (size 16 en el cartel). */
  icon: LucideIcon
  /** Título del cartel (18/600). */
  title: string
  /** Cuerpo/microcopy del cartel (14/400, máx. ~2 líneas). */
  body: string
  /** Colocación preferida del cartel respecto al ancla (con auto-flip). */
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
}

/**
 * Los 4 pasos, en orden. Copy verbatim de la UI-SPEC (LOCKED). El paso
 * "respaldo" solo describe el botón: NO afirma que el cuaderno ya esté a salvo
 * (respeta STAT-01, copy instructiva en condicional futuro).
 */
export const TOUR_STEPS: TourStep[] = [
  {
    anchor: 'escribir',
    icon: PencilLine,
    title: 'Escribí sin miedo',
    body: 'Este es tu cuaderno. Escribí lo que quieras acá: se guarda solo y nunca vas a perder nada.',
    placement: 'bottom'
  },
  {
    anchor: 'guardar',
    icon: Save,
    title: 'Marcá una versión',
    body: 'Cuando algo te importe, guardá una versión desde acá. Vas a poder volver a este momento más adelante.',
    placement: 'top'
  },
  {
    anchor: 'respaldo',
    icon: Cloud,
    title: 'Respaldá en la nube',
    body: 'Desde este botón guardás una copia de seguridad en la nube, por si algo le pasa a este dispositivo.',
    placement: 'top'
  },
  {
    anchor: 'historial',
    icon: History,
    title: 'Volvé cuando quieras',
    body: 'Acá está el historial de tu cuaderno. Podés mirar los cambios y volver a cualquier versión anterior.',
    placement: 'left'
  }
]
