import type { JSX } from 'react'
import type { GitVersion } from '@shared/ipc'

interface HistoryPanelProps {
  versions: GitVersion[]
  onRestore: (version: GitVersion) => void
  onClose: () => void
}

/**
 * Historial de versiones de la nota abierta (feature estrella, ARCHITECTURE.md
 * §3). Cada versión es un commit que tocó ese archivo; "Restaurar" trae ese
 * contenido como estado nuevo, sin reescribir la historia.
 */
export function HistoryPanel({ versions, onRestore, onClose }: HistoryPanelProps): JSX.Element {
  return (
    <aside className="history">
      <div className="history-head">
        <span>Historial</span>
        <button title="Cerrar" onClick={onClose}>✕</button>
      </div>
      {versions.length === 0 ? (
        <p className="tree-empty">Todavía no hay versiones de esta nota.</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.oid} className="version">
              <div className="v-msg">{v.message}</div>
              <div className="v-meta">
                {new Date(v.timestamp).toLocaleString()} · {v.oid.slice(0, 7)}
              </div>
              <button className="v-restore" onClick={() => onRestore(v)}>
                Restaurar
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
