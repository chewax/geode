import type { JSX } from 'react'
import { Trash2 } from 'lucide-react'
import type { TreeNode } from '@shared/ipc'

interface ConfirmDeleteDialogProps {
  /** Nodo (nota o carpeta) que se va a borrar. */
  node: TreeNode
  /** Confirma el borrado (acción destructiva sobre disco, recuperable vía historial). */
  onConfirm: () => void
  onClose: () => void
}

/**
 * Diálogo de confirmación de borrado. Reemplaza a window.confirm (Electron no lo
 * soporta bien) con la estética propia, espejando BranchDialog. El texto comunica
 * que el borrado es recuperable desde el historial git. Enter confirma, Escape cancela.
 */
export function ConfirmDeleteDialog({ node, onConfirm, onClose }: ConfirmDeleteDialogProps): JSX.Element {
  // Las notas se muestran sin la extensión .md; las carpetas con su nombre tal cual.
  const nombre = node.isDir ? node.name : node.name.replace(/\.md$/i, '')
  const esCarpeta = node.isDir

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
          else if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
      >
        <h2>
          <Trash2 size={18} /> {esCarpeta ? `¿Eliminar la carpeta "${nombre}"?` : `¿Eliminar la nota "${nombre}"?`}
        </h2>
        <p className="modal-sub">
          Se elimina del disco, pero podés recuperarla desde una versión anterior en el historial.
        </p>
        {esCarpeta && (
          <p className="modal-sub">Se eliminarán también las notas que contiene.</p>
        )}
        <div className="modal-actions">
          {/* Foco por defecto en la acción no destructiva. */}
          <button autoFocus onClick={onClose}>Cancelar</button>
          <button className="danger" onClick={onConfirm}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}
