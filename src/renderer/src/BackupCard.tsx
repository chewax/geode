import type { JSX } from 'react'
import { CloudUpload } from 'lucide-react'
import { t } from '@shared/i18n'

/**
 * Tarjeta-banner de invitación al respaldo (BACKUP-01). No bloqueante: el
 * usuario puede seguir escribiendo con la tarjeta visible. Reusa el patrón de
 * ancho completo de `.time-banner` (tinte púrpura vía `.backup`, no el teal del
 * time-travel). Sólo presenta: las acciones llegan por props. App.tsx la monta
 * entre la barra de título y el cuerpo tras crear el primer cuaderno (plan 12-05).
 *
 * "Hacerlo después" está SIEMPRE presente y no vuelve a aparecer sola (sin
 * re-nag); el respaldo se retoma sólo desde el botón persistente.
 */
export function BackupCard({
  onBackup,
  onLater
}: {
  onBackup: () => void
  onLater: () => void
}): JSX.Element {
  return (
    <div className="time-banner backup">
      <div className="time-banner-info">
        <CloudUpload size={15} />
        <span className="time-banner-title">{t('Respaldá tu cuaderno en la nube')}</span>
        <span
          className="time-banner-label"
          title={t(
            'Guardá una copia de seguridad para no perder tu cuaderno aunque le pase algo a este dispositivo.'
          )}
        >
          {' '}
          —{' '}
          {t(
            'Guardá una copia de seguridad para no perder tu cuaderno aunque le pase algo a este dispositivo.'
          )}
        </span>
      </div>
      <div className="time-banner-actions">
        <button className="link-btn" onClick={onLater}>
          {t('Hacerlo después')}
        </button>
        <button
          className="tb-btn cta"
          title={t('Respaldar en la nube')}
          aria-label={t('Respaldar en la nube')}
          onClick={onBackup}
        >
          <CloudUpload size={16} /> {t('Respaldar en la nube')}
        </button>
      </div>
    </div>
  )
}
