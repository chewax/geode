import type { JSX } from 'react'
import { HelpCircle, Settings as SettingsIcon } from 'lucide-react'

export interface ActivityBarProps {
  /** Abre el diálogo de ajustes. */
  onOpenSettings: () => void
}

/**
 * Barra de actividad vertical estilo VSCode: riel fino en el borde izquierdo de
 * la ventana, separado del sidebar. Aloja los accesos globales (ajustes, ayuda)
 * anclados abajo, de modo que NO se desplazan al colapsar/expandir las secciones
 * del sidebar (que era la regresión del footer). La zona superior queda lista
 * para futuros conmutadores de vista (p. ej. notas / timeline) en fases próximas.
 */
export function ActivityBar({ onOpenSettings }: ActivityBarProps): JSX.Element {
  return (
    <nav className="activity-bar" aria-label="Barra de actividad">
      {/* Zona superior: reservada para conmutadores de vista (fases próximas). */}
      <div className="activity-bar-top" />

      {/* Zona inferior: accesos globales anclados al borde inferior. */}
      <div className="activity-bar-bottom">
        <button className="activity-btn" title="Ayuda" aria-label="Ayuda" disabled>
          <HelpCircle size={20} />
        </button>
        <button
          className="activity-btn"
          title="Ajustes"
          aria-label="Ajustes"
          onClick={onOpenSettings}
        >
          <SettingsIcon size={20} />
        </button>
      </div>
    </nav>
  )
}
