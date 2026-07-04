import type { JSX } from 'react'
import { SkipForward, RotateCcw, Eye } from 'lucide-react'

/**
 * Banner de ancho completo que hace inconfundible que estás viendo el pasado
 * (SOFT-05). Aparece sólo mientras hay un preview activo — App lo monta entre
 * la barra de título y el cuerpo en el plan 05. Sólo presenta: las acciones
 * llegan por props.
 */
export function TimeTravelBanner({
  label,
  relativeDate,
  onReturnToPresent,
  onBringBack
}: {
  label: string
  relativeDate: string
  onReturnToPresent: () => void
  onBringBack: () => void
}): JSX.Element {
  return (
    <div className="time-banner">
      <div className="time-banner-info">
        <Eye size={15} />
        <span className="time-banner-title">Estás viendo el pasado</span>
        {/* title = texto completo: si el mensaje se trunca, se ve todo al hover. */}
        <span className="time-banner-label" title={label}> — {label}</span>
        <span className="time-banner-date"> · {relativeDate}</span>
      </div>
      <div className="time-banner-actions">
        <button
          className="tb-btn present"
          title="Volver al presente"
          aria-label="Volver al presente"
          onClick={onReturnToPresent}
        >
          <SkipForward size={14} /> Volver al presente
        </button>
        <button
          className="tb-btn primary head"
          title="Traer este momento como cambios sin guardar"
          aria-label="Volver aquí"
          onClick={onBringBack}
        >
          <RotateCcw size={14} /> Volver aquí
        </button>
      </div>
    </div>
  )
}
