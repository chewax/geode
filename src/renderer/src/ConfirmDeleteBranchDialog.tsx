import type { JSX } from 'react'
import { GitBranch } from 'lucide-react'

interface ConfirmDeleteBranchDialogProps {
  /** Nombre de la rama que se va a borrar. */
  name: string
  /** Si la rama ya está fusionada en su base: borrarla no pierde versiones. */
  merged: boolean
  /** Error de borrado a mostrar inline (reemplaza a window.alert); null = sin error. */
  error?: string | null
  /** Confirma el borrado real de la rama (acción destructiva si merged===false). */
  onConfirm: () => void
  onClose: () => void
}

/**
 * Diálogo de confirmación de borrado de rama (VER-01). Reemplaza a window.confirm/
 * window.alert (Electron no los soporta bien) con la estética propia, espejando
 * ConfirmDeleteDialog. El cuerpo cambia según esté fusionada: si merged===true el
 * texto es suave y el botón neutro; si merged===false avisa explícitamente que se
 * pierden versiones y el botón de confirmar es rojo (danger).
 *
 * Seguridad de teclado (lección Phase 6 CR-01): "Cancelar" queda enfocado por
 * defecto (autoFocus); Escape cancela; NO hay binding Enter→confirmar a nivel de
 * contenedor, así que un Enter reflejo activa "Cancelar" y NUNCA borra la rama.
 * Borrar exige un clic explícito en el botón de confirmar.
 */
export function ConfirmDeleteBranchDialog({
  name,
  merged,
  error,
  onConfirm,
  onClose
}: ConfirmDeleteBranchDialogProps): JSX.Element {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Solo Escape cancela. Sin Enter→confirmar: el foco por defecto está en
          // "Cancelar", así que Enter jamás borra la rama.
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      >
        <h2>
          <GitBranch size={18} /> ¿Borrar la rama &quot;{name}&quot;?
        </h2>
        {merged ? (
          <p className="modal-sub">
            La rama ya está fusionada: se puede descartar sin perder versiones.
          </p>
        ) : (
          <p className="modal-sub">
            Esta rama tiene versiones que no están en su base. Si la borrás, esas versiones se
            pierden.
          </p>
        )}
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          {/* Foco por defecto en la acción no destructiva. */}
          <button autoFocus onClick={onClose}>
            Cancelar
          </button>
          {merged ? (
            <button onClick={onConfirm}>Borrar rama</button>
          ) : (
            <button className="danger" onClick={onConfirm}>
              Borrar rama
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
