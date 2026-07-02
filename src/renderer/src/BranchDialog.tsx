import { useState } from 'react'
import type { JSX } from 'react'
import { GitBranchPlus } from 'lucide-react'

interface BranchDialogProps {
  /** Confirma con el nombre tipeado (vacío = nombre automático). */
  onConfirm: (name: string) => void
  onClose: () => void
}

/**
 * Diálogo para nombrar una rama nueva. Reemplaza a window.prompt (que Electron
 * no soporta). Enter confirma, Escape cancela.
 */
export function BranchDialog({ onConfirm, onClose }: BranchDialogProps): JSX.Element {
  const [name, setName] = useState('')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal branch-modal" onClick={(e) => e.stopPropagation()}>
        <h2><GitBranchPlus size={18} /> Nueva rama</h2>
        <p className="modal-sub">Se crea desde la versión actual y cambia a ella.</p>
        <input
          className="text-input"
          autoFocus
          placeholder="Nombre de la rama (vacío = automático)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(name.trim()) }
            else if (e.key === 'Escape') { e.preventDefault(); onClose() }
          }}
        />
        <p className="hint">Los espacios se convierten en guiones.</p>
        <div className="modal-actions">
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={() => onConfirm(name.trim())}>Crear rama</button>
        </div>
      </div>
    </div>
  )
}
