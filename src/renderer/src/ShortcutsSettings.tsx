import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { AlertTriangle, Keyboard, RotateCcw } from 'lucide-react'
import { SHORTCUTS, acceleratorFromEvent, shortcutLabel, type ShortcutId, type ShortcutScope } from '@shared/shortcuts'
import { IS_MAC, applyShortcuts, useShortcuts } from './shortcuts'
import { friendlyAiError } from './ai/friendlyError'
import { t } from '@shared/i18n'

/** Texto corto de dónde funciona cada atajo (se traduce al dibujar). */
function scopeLabel(scope: ShortcutScope): string {
  switch (scope) {
    case 'global':
      return t('En todo el sistema')
    case 'app':
      return t('En Geode')
    case 'editor':
      return t('En el editor')
  }
}

/**
 * Sección "Atajos" de Ajustes: lista los atajos reasignables y permite grabar
 * una combinación nueva (apretándola) o volver a la de fábrica.
 */
export function ShortcutsSettings(): JSX.Element {
  const { bindings, customized, globalRegistered } = useShortcuts()
  /** Atajo que está esperando la nueva combinación (null = ninguno). */
  const [recording, setRecording] = useState<ShortcutId | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ShortcutId, string>>>({})
  const [saving, setSaving] = useState(false)

  const save = async (id: ShortcutId, accel: string | null): Promise<void> => {
    setSaving(true)
    try {
      applyShortcuts(await window.geode.shortcuts.set(id, accel))
      setErrors((prev) => ({ ...prev, [id]: undefined }))
    } catch (e) {
      // El main ya manda el motivo traducido; se le quita el envoltorio de IPC.
      setErrors((prev) => ({ ...prev, [id]: friendlyAiError(e, t('No se pudo cambiar el atajo.')) }))
    } finally {
      setSaving(false)
    }
  }

  // Grabando: se captura la próxima combinación ANTES que cualquier otro handler
  // (fase de captura + stopPropagation) para que, p. ej., Ctrl+S no abra el
  // diálogo de guardar mientras se está eligiendo el atajo. Escape cancela.
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setRecording(null)
        return
      }
      const accel = acceleratorFromEvent(e, IS_MAC)
      if (!accel) return // sólo modificadores: seguir esperando la tecla
      const id = recording
      setRecording(null)
      void save(id, accel)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  return (
    <section className="settings-section">
      <h2><Keyboard size={18} /> {t('Atajos de teclado')}</h2>
      <p className="modal-sub">
        {t('Tocá un atajo y apretá la combinación nueva. Si una combinación no te anda (por ejemplo, porque otra app ya la usa), cambiala acá. Esc cancela.')}
      </p>

      <ul className="shortcut-list">
        {SHORTCUTS.map((s) => {
          const isRec = recording === s.id
          const isCustom = customized.includes(s.id)
          const globalFailed = s.scope === 'global' && !globalRegistered
          const error = errors[s.id]
          return (
            <li key={s.id} className="shortcut-row">
              <div className="shortcut-info">
                <span className="shortcut-title">{s.title}</span>
                <span className="shortcut-scope">{scopeLabel(s.scope)}</span>
              </div>
              <button
                className={`shortcut-key${isRec ? ' recording' : ''}${globalFailed ? ' failed' : ''}`}
                onClick={() => setRecording(isRec ? null : s.id)}
                disabled={saving}
                title={isRec ? t('Apretá la combinación nueva (Esc cancela)') : t('Cambiar atajo')}
              >
                {isRec ? t('Apretá la combinación…') : <kbd>{shortcutLabel(bindings[s.id], IS_MAC)}</kbd>}
              </button>
              <button
                className="icon-btn"
                title={t('Volver a {key}', { key: shortcutLabel(s.default, IS_MAC) })}
                aria-label={t('Volver al atajo de fábrica')}
                disabled={!isCustom || saving}
                onClick={() => void save(s.id, null)}
              >
                <RotateCcw size={14} />
              </button>
              {(error || globalFailed) && (
                <p className="shortcut-error" role="status">
                  <AlertTriangle size={12} />{' '}
                  {error ?? t('No se pudo activar este atajo (probablemente lo usa otra app). Elegí otra combinación.')}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="hint">
        {t('Los atajos globales funcionan aunque Geode no esté al frente. En Linux con Wayland puede que el sistema no los permita; en ese caso queda el comando «Dictar» de la paleta.')}
      </p>
    </section>
  )
}
