import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { t } from '@shared/i18n'

/**
 * Controles de la ventana (minimizar / maximizar-restaurar / cerrar) para la
 * title bar custom. Glifos SVG simples al estilo Windows: no forman parte de la
 * iconografía de la app (lucide), por eso van inline y con trazo fino.
 */
export function WindowControls(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.geode.window.isMaximized().then(setMaximized)
    return window.geode.window.onMaximizeChange(setMaximized)
  }, [])

  return (
    <div className="win-controls">
      <button
        className="win-btn"
        title={t('Minimizar')}
        aria-label={t('Minimizar')}
        onClick={() => window.geode.window.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5 H10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>

      <button
        className="win-btn"
        title={maximized ? t('Restaurar') : t('Maximizar')}
        aria-label={maximized ? t('Restaurar') : t('Maximizar')}
        onClick={() => window.geode.window.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="3" width="6" height="6" />
            <polyline points="3,3 3,0.5 9.5,0.5 9.5,7 7,7" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        )}
      </button>

      <button
        className="win-btn win-close"
        title={t('Cerrar')}
        aria-label={t('Cerrar')}
        onClick={() => window.geode.window.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}
