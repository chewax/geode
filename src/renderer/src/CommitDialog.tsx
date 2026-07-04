import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import { changedSummary } from './time/labels'

interface CommitDialogProps {
  /** Rutas que se van a versionar. */
  changes: string[]
  /** Si la IA está lista (habilitada + con key + modelo). */
  aiReady: boolean
  onConfirm: (message: string) => Promise<void>
  onClose: () => void
}

/**
 * Diálogo de "Guardar versión": ponle un nombre a este momento.
 * Un nombre opcional arriba (el título del momento) y una descripción editable
 * debajo. Si la IA está lista, propone nombre y descripción a partir del diff de
 * notas (ambos editables). Guardar es liviano: nada bloquea guardar sin nombre.
 */
export function CommitDialog({ changes, aiReady, onConfirm, onClose }: CommitDialogProps): JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  // Resumen humano: cuántas notas (.md) cambiaron, no rutas de archivo. Si sólo
  // cambiaron adjuntos (ninguna nota), decirlo sin mentir un "0 notas cambiadas".
  const noteNames = changes.filter((p) => p.toLowerCase().endsWith('.md'))
  const summary =
    noteNames.length > 0
      ? changedSummary(noteNames)
      : `${changes.length} ${changes.length === 1 ? 'archivo cambiado' : 'archivos cambiados'}`

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const v = await window.geode.ai.suggestVersion()
      setName(v.title)
      setDescription(v.description)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la descripción')
    } finally {
      setGenerating(false)
    }
  }, [])

  // Al abrir, si la IA está lista, generar nombre + descripción automáticamente.
  useEffect(() => {
    if (aiReady) void generate()
  }, [aiReady, generate])

  const confirm = async (): Promise<void> => {
    setCommitting(true)
    try {
      // Mensaje = título + línea en blanco + descripción, seguro ante vacíos.
      const message = [name.trim(), description.trim()].filter(Boolean).join('\n\n')
      await onConfirm(message)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Guardar versión</h2>

        <p className="modal-sub">Ponle un nombre a este momento.</p>
        <p className="modal-sub">{summary}</p>

        <label className="field-label">Nombre</label>
        {/* Deshabilitado mientras la IA genera: si no, el texto tipeado acá se
            perdería al llegar la sugerencia (el campo está autofocused). */}
        <input
          className="text-input"
          value={generating ? '' : name}
          placeholder={generating ? 'Generando nombre con IA…' : 'Dale un nombre a este momento (opcional)'}
          onChange={(e) => setName(e.target.value)}
          disabled={generating}
          autoFocus
        />

        <label className="field-label">
          Descripción
          {aiReady && (
            <button className="link-btn" disabled={generating} onClick={() => void generate()}>
              <RefreshCw size={12} /> {generating ? 'generando…' : 'regenerar con IA'}
            </button>
          )}
        </label>
        <textarea
          className="commit-message"
          value={generating ? '' : description}
          placeholder={
            generating
              ? 'Generando descripción con IA…'
              : aiReady
                ? 'Descripción sugerida por IA (editable)'
                : 'Describí qué cambió (o configurá la IA en Ajustes)'
          }
          onChange={(e) => setDescription(e.target.value)}
          disabled={generating}
          rows={5}
        />

        {error && (
          <p className="modal-error">
            <AlertTriangle size={13} /> {error}
          </p>
        )}

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
