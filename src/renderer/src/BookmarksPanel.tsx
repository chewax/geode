import type { JSX } from 'react'
import { FileText, X } from 'lucide-react'
import { dirName, displayName } from '@shared/links'
import { t } from '@shared/i18n'

export interface BookmarksPanelProps {
  /** Favoritas que existen en la bóveda, en el orden en que se marcaron. */
  paths: string[]
  openPath: string | null
  disabled?: boolean
  onOpen: (path: string) => void
  onRemove: (path: string) => void
}

/** Lista de notas favoritas en la barra lateral. */
export function BookmarksPanel({ paths, openPath, disabled, onOpen, onRemove }: BookmarksPanelProps): JSX.Element {
  if (paths.length === 0) {
    return (
      <div className="tree-empty"><p>
        {t('Marcá una nota desde su menú en el explorador (click derecho) para tenerla siempre a mano.')}
      </p></div>
    )
  }
  return (
    <ul className="bookmarks-list">
      {paths.map((p) => (
        <li key={p} className={`bookmark-item${p === openPath ? ' active' : ''}`} title={p}>
          <button className="bookmark-open" disabled={disabled} onClick={() => onOpen(p)}>
            <FileText size={14} />
            <span className="bookmark-name">{displayName(p)}</span>
            {dirName(p) && <span className="bookmark-dir">{dirName(p)}</span>}
          </button>
          <button
            className="icon-btn bookmark-remove"
            title={t('Quitar de favoritas')}
            aria-label={t('Quitar de favoritas')}
            onClick={() => onRemove(p)}
          >
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  )
}
