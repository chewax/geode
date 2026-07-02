import { useState } from 'react'
import type { JSX } from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'
import type { EditorContext } from './editor/CodeMirrorEditor'

interface AiPromptModalProps {
  context: EditorContext
  onInsert: (text: string) => void
  onClose: () => void
}

/** Acciones rápidas según haya o no selección. */
const ACTIONS_SELECTION = [
  { label: 'Reescribir', instruction: 'Reescribí el texto seleccionado para que quede más claro y fluido, manteniendo el sentido.' },
  { label: 'Resumir', instruction: 'Resumí el texto seleccionado en pocas frases.' },
  { label: 'Mejorar', instruction: 'Corregí ortografía y gramática y mejorá la redacción del texto seleccionado.' },
  { label: 'Expandir', instruction: 'Desarrollá y ampliá el texto seleccionado con más detalle.' }
]
const ACTIONS_CURSOR = [
  { label: 'Continuar', instruction: 'Continuá escribiendo el texto desde donde quedó, en el mismo tono y estilo.' },
  { label: 'Ideas', instruction: 'Proponé una lista breve de ideas o puntos para seguir este texto.' }
]

/**
 * Prompt de IA dentro del editor (Ctrl+K). Con selección, opera sobre ella;
 * sin selección, inserta en el cursor usando el contexto previo.
 */
export function AiPromptModal({ context, onInsert, onClose }: AiPromptModalProps): JSX.Element {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasSelection = context.selection.trim().length > 0
  const quickActions = hasSelection ? ACTIONS_SELECTION : ACTIONS_CURSOR

  const run = async (text: string): Promise<void> => {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.geode.ai.generateText(text, context.selection, context.before)
      onInsert(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el texto')
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ai-prompt" onClick={(e) => e.stopPropagation()}>
        <h2><Sparkles size={18} /> Asistente</h2>
        <p className="modal-sub">
          {hasSelection
            ? `Sobre la selección (${context.selection.length} caracteres).`
            : 'Se insertará en la posición del cursor.'}
        </p>

        <div className="quick-actions">
          {quickActions.map((a) => (
            <button key={a.label} disabled={loading} onClick={() => void run(a.instruction)}>
              {a.label}
            </button>
          ))}
        </div>

        <textarea
          className="commit-message"
          placeholder="O escribí una instrucción libre (ej. 'traducí al inglés', 'hacelo más formal')…"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void run(instruction)
            }
          }}
          rows={3}
          autoFocus
          disabled={loading}
        />

        {error && <p className="modal-error"><AlertTriangle size={13} /> {error}</p>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="primary" onClick={() => void run(instruction)} disabled={loading || !instruction.trim()}>
            {loading ? 'Generando…' : 'Generar (Ctrl+Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}
