import { useState } from 'react'
import type { JSX } from 'react'
import { FolderX } from 'lucide-react'
import { t } from '@shared/i18n'

interface ConfirmRemoveVaultDialogProps {
  /** Nombre visible de la bóveda que se da de baja. */
  vaultName: string
  /** Confirma la baja. `fromDisk` = enviar además la carpeta a la papelera del SO. */
  onConfirm: (fromDisk: boolean) => void
  onClose: () => void
}

/**
 * Diálogo de baja de bóveda. La acción segura por defecto ("Quitar de la lista")
 * NUNCA toca el disco: solo la saca del selector. Un checkbox default-OFF escala
 * la acción a "Quitar y enviar a la papelera" (recuperable, vía shell.trashItem),
 * cambiando el botón a estilo danger.
 *
 * Seguridad de teclado (lección Phase 6 CR-01): "Cancelar" queda enfocado por
 * defecto (autoFocus); Escape cancela; NO hay binding Enter→confirmar a nivel de
 * contenedor, así que Enter jamás dispara el borrado de disco. Borrar la carpeta
 * exige un clic explícito en el botón danger.
 */
export function ConfirmRemoveVaultDialog({
  vaultName,
  onConfirm,
  onClose
}: ConfirmRemoveVaultDialogProps): JSX.Element {
  const [fromDisk, setFromDisk] = useState(false)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Solo Escape cancela. Sin Enter→confirmar: el foco por defecto está en
          // "Cancelar", así que Enter jamás envía la carpeta a la papelera.
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      >
        <h2>
          <FolderX size={18} /> {t('¿Quitar el cuaderno "{name}" de la lista?', { name: vaultName })}
        </h2>
        <p className="modal-sub">
          {t(
            'Se saca del selector de cuadernos. Tus archivos y todo el historial quedan intactos en el disco.'
          )}
        </p>
        <label className="remove-vault-check">
          <input
            type="checkbox"
            checked={fromDisk}
            onChange={(e) => setFromDisk(e.target.checked)}
          />
          {t('Eliminar también los archivos del disco')}
        </label>
        {fromDisk && (
          <p className="modal-sub">
            {t(
              'Se mueve a la papelera del sistema (recuperable). Se borra la carpeta completa, incluido el historial de versiones.'
            )}
          </p>
        )}
        <div className="modal-actions">
          {/* Foco por defecto en la acción no destructiva. */}
          <button autoFocus onClick={onClose}>
            {t('Cancelar')}
          </button>
          {fromDisk ? (
            <button className="danger" onClick={() => onConfirm(true)}>
              {t('Quitar y enviar a la papelera')}
            </button>
          ) : (
            <button onClick={() => onConfirm(false)}>{t('Quitar de la lista')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
