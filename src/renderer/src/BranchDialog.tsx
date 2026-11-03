import { useState } from 'react'
import type { JSX } from 'react'
import { GitBranchPlus } from 'lucide-react'
import { t } from '@shared/i18n'

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
        <h2><GitBranchPlus size={18} /> {t('Nueva rama')}</h2>
        <p className="modal-sub">{t('Se crea desde la versión actual y cambia a ella.')}</p>
        <input
          className="text-input"
          autoFocus
          placeholder={t('Nombre de la rama (vacío = automático)')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onConfirm(name.trim()) }
            else if (e.key === 'Escape') { e.preventDefault(); onClose() }
          }}
        />
        <p className="hint">{t('Los espacios se convierten en guiones.')}</p>
        <div className="modal-actions">
          <button onClick={onClose}>{t('Cancelar')}</button>
          <button className="primary" onClick={() => onConfirm(name.trim())}>{t('Crear rama')}</button>
        </div>
      </div>
    </div>
  )
}
