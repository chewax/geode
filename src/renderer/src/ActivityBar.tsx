import type { JSX } from 'react'
import { HelpCircle, Settings as SettingsIcon } from 'lucide-react'
import { t } from '@shared/i18n'

export interface ActivityBarProps {
  /** Abre el diálogo de ajustes. */
  onOpenSettings: () => void
  /** Re-lanza el recorrido guiado de primera vez (botón de ayuda). */
  onShowTour: () => void
}

/**
 * Barra de actividad vertical estilo VSCode: riel fino en el borde izquierdo de
 * la ventana, separado del sidebar. Aloja los accesos globales (ajustes, ayuda)
 * anclados abajo, de modo que NO se desplazan al colapsar/expandir las secciones
 * del sidebar (que era la regresión del footer). La zona superior queda lista
 * para futuros conmutadores de vista (p. ej. notas / timeline) en fases próximas.
 */
export function ActivityBar({ onOpenSettings, onShowTour }: ActivityBarProps): JSX.Element {
  return (
    <nav className="activity-bar" aria-label={t('Barra de actividad')}>
      {/* Zona superior: reservada para conmutadores de vista (fases próximas). */}
      <div className="activity-bar-top" />

      {/* Zona inferior: accesos globales anclados al borde inferior. */}
      <div className="activity-bar-bottom">
        <button
          className="activity-btn"
          title={t('Ver el recorrido guiado')}
          aria-label={t('Ver el recorrido guiado')}
          onClick={onShowTour}
        >
          <HelpCircle size={20} />
        </button>
        <button
          className="activity-btn"
          title={t('Ajustes')}
          aria-label={t('Ajustes')}
          onClick={onOpenSettings}
        >
          <SettingsIcon size={20} />
        </button>
      </div>
    </nav>
  )
}
