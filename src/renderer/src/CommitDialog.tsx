import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'

interface CommitDialogProps {
  /** Rutas que se van a versionar. */
  changes: string[]
  /** Si la IA está lista (habilitada + con key + modelo). */
  aiReady: boolean
  onConfirm: (message: string) => Promise<void>
  onClose: () => void
}

/**
 * Diálogo de "Guardar versión": el único momento que crea un commit permanente.
 * Si la IA está lista, propone un mensaje a partir del diff (editable). Avisa
 * explícitamente que esto queda en el ledger permanente.
 */
export function CommitDialog({ changes, aiReady, onConfirm, onClose }: CommitDialogProps): JSX.Element {
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const msg = await window.geode.ai.suggestMessage()
      setMessage(msg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el mensaje')
    } finally {
      setGenerating(false)
    }
  }, [])

  // Al abrir, si la IA está lista, generar la sugerencia automáticamente.
  useEffect(() => {
    if (aiReady) void generate()
  }, [aiReady, generate])

  const confirm = async (): Promise<void> => {
    setCommitting(true)
    try {
      await onConfirm(message.trim())
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Guardar versión</h2>

        <p className="modal-sub">
          Vas a versionar <strong>{changes.length}</strong>{' '}
          {changes.length === 1 ? 'archivo' : 'archivos'}:
        </p>
        <ul className="change-list">
          {changes.slice(0, 8).map((p) => (
            <li key={p}>{p}</li>
          ))}
          {changes.length > 8 && <li>…y {changes.length - 8} más</li>}
        </ul>

        <label className="field-label">
          Mensaje
          {aiReady && (
            <button className="link-btn" disabled={generating} onClick={() => void generate()}>
              {generating ? 'generando…' : '↻ regenerar con IA'}
            </button>
          )}
        </label>
        <textarea
          className="commit-message"
          value={generating ? '' : message}
          placeholder={
            generating
              ? 'Generando mensaje con IA…'
              : aiReady
                ? 'Mensaje sugerido por IA (editable)'
                : 'Describí qué cambió (o configurá la IA en Ajustes)'
          }
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          autoFocus
        />

        {error && <p className="modal-error">⚠ {error}</p>}

        <p className="modal-warn">
          ⚠ Esto crea una <strong>versión permanente</strong> en el historial (ledger).
        </p>

        <div className="modal-actions">
          <button onClick={onClose} disabled={committing}>Cancelar</button>
          <button className="primary" onClick={() => void confirm()} disabled={committing || generating}>
            {committing ? 'Guardando…' : 'Guardar versión'}
          </button>
        </div>
      </div>
    </div>
  )
}
