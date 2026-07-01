import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AiConfig, AiModel } from '@shared/ipc'

interface SettingsModalProps {
  onClose: () => void
  onConfigChange: (config: AiConfig) => void
}

/** Ajustes de IA: API key de OpenRouter, modelo y activación. */
export function SettingsModal({ onClose, onConfigChange }: SettingsModalProps): JSX.Element {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [models, setModels] = useState<AiModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback(
    (c: AiConfig) => {
      setConfig(c)
      onConfigChange(c)
    },
    [onConfigChange]
  )

  useEffect(() => {
    void window.geode.ai.getConfig().then(apply)
  }, [apply])

  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    setError(null)
    apply(await window.geode.ai.setKey(keyInput.trim()))
    setKeyInput('')
  }

  const clearKey = async (): Promise<void> => {
    apply(await window.geode.ai.clearKey())
    setModels([])
  }

  const loadModels = async (): Promise<void> => {
    setLoadingModels(true)
    setError(null)
    try {
      setModels(await window.geode.ai.listModels())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los modelos')
    } finally {
      setLoadingModels(false)
    }
  }

  const setModel = async (model: string): Promise<void> => {
    apply(await window.geode.ai.setModel(model))
  }

  const toggleEnabled = async (enabled: boolean): Promise<void> => {
    apply(await window.geode.ai.setEnabled(enabled))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ajustes · Mensajes por IA</h2>

        <p className="modal-sub">
          Motor: <strong>OpenRouter</strong>. La API key se guarda cifrada en tu equipo, fuera del
          repositorio.
        </p>

        <label className="field-label">API key de OpenRouter</label>
        {config?.hasKey ? (
          <div className="key-row">
            <span className="key-set">✓ Key guardada</span>
            <button onClick={() => void clearKey()}>Quitar</button>
          </div>
        ) : (
          <div className="key-row">
            <input
              type="password"
              className="text-input"
              placeholder="sk-or-…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button onClick={() => void saveKey()} disabled={!keyInput.trim()}>
              Guardar
            </button>
          </div>
        )}

        <label className="field-label">Modelo</label>
        <div className="key-row">
          <input
            list="or-models"
            className="text-input"
            placeholder="ej. anthropic/claude-3.5-haiku"
            defaultValue={config?.model ?? ''}
            onChange={(e) => void setModel(e.target.value)}
            disabled={!config?.hasKey}
          />
          <button onClick={() => void loadModels()} disabled={!config?.hasKey || loadingModels}>
            {loadingModels ? 'cargando…' : 'Cargar lista'}
          </button>
        </div>
        <datalist id="or-models">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </datalist>
        {models.length > 0 && (
          <p className="hint">{models.length} modelos disponibles. Para mensajes de commit conviene uno rápido y barato.</p>
        )}

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            disabled={!config?.hasKey || !config?.model}
            onChange={(e) => void toggleEnabled(e.target.checked)}
          />
          Generar mensajes de commit con IA
        </label>

        {error && <p className="modal-error">⚠ {error}</p>}

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
