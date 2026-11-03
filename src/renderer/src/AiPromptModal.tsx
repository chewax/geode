import { useState } from 'react'
import type { JSX } from 'react'
import { Sparkles, AlertTriangle } from 'lucide-react'
import type { EditorContext } from './editor/CodeMirrorEditor'
import { friendlyAiError } from './ai/friendlyError'
import { t } from '@shared/i18n'

interface AiPromptModalProps {
  context: EditorContext
  onInsert: (text: string) => void
  onClose: () => void
}

/**
 * Acciones rápidas según haya o no selección. Son funciones (no constantes del
 * módulo) para que se traduzcan con el idioma ya elegido.
 */
const actionsSelection = (): { label: string; instruction: string }[] => [
  { label: t('Reescribir'), instruction: t('Reescribí el texto seleccionado para que quede más claro y fluido, manteniendo el sentido.') },
  { label: t('Resumir'), instruction: t('Resumí el texto seleccionado en pocas frases.') },
  { label: t('Mejorar'), instruction: t('Corregí ortografía y gramática y mejorá la redacción del texto seleccionado.') },
  { label: t('Expandir'), instruction: t('Desarrollá y ampliá el texto seleccionado con más detalle.') }
]
const actionsCursor = (): { label: string; instruction: string }[] => [
  { label: t('Continuar'), instruction: t('Continuá escribiendo el texto desde donde quedó, en el mismo tono y estilo.') },
  { label: t('Ideas'), instruction: t('Proponé una lista breve de ideas o puntos para seguir este texto.') }
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
  const quickActions = hasSelection ? actionsSelection() : actionsCursor()

  const run = async (text: string): Promise<void> => {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.geode.ai.generateText(text, context.selection, context.before)
      onInsert(result)
    } catch (e) {
      setError(
        friendlyAiError(
          e,
          t('No se pudo generar el texto. Probá otra instrucción o revisá la IA en Ajustes → IA.')
        )
      )
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ai-prompt" onClick={(e) => e.stopPropagation()}>
        <h2><Sparkles size={18} /> {t('Asistente')}</h2>
        <p className="modal-sub">
          {hasSelection
            ? context.selection.length === 1
              ? t('Sobre la selección ({n} carácter).', { n: context.selection.length })
              : t('Sobre la selección ({n} caracteres).', { n: context.selection.length })
            : t('Se insertará en la posición del cursor.')}
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
          placeholder={t("O escribí una instrucción libre (ej. 'traducí al inglés', 'hacelo más formal')…")}
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
          <button onClick={onClose} disabled={loading}>{t('Cancelar')}</button>
          <button className="primary" onClick={() => void run(instruction)} disabled={loading || !instruction.trim()}>
            {loading ? t('Generando…') : t('Generar (Ctrl+Enter)')}
          </button>
        </div>
      </div>
    </div>
  )
}
