import type { JSX } from 'react'
import { Cloud, CloudOff, CloudUpload, RefreshCw } from 'lucide-react'

/**
 * Botón de respaldo persistente de la status bar (BACKUP-01/04). Absorbe el
 * viejo `UploadCloud` y la píldora "GitHub/sin GitHub" en una sola superficie.
 *
 * SIEMPRE montado con `data-tour="respaldo"` (ancla del tour de Fase 13): nunca
 * se renderiza condicionalmente. Deriva 4 estados por prioridad y honra STAT-01
 * (jamás dice "Todo en la nube" con cambios sin subir). El popover no expone la
 * URL del repo (T-12-10). El popover se arma con spans/`<b>` (contenido en
 * línea) para que el nodo raíz sea un `<button>` accesible válido.
 */
export function BackupButton({
  connected,
  pushCount,
  backingUp,
  failed,
  login,
  autoPush,
  onOpenWizard,
  onForcePush
}: {
  connected: boolean
  pushCount: number
  backingUp: boolean
  failed: boolean
  login: string | null
  autoPush: boolean
  onOpenWizard: () => void
  onForcePush: () => void
}): JSX.Element {
  // Prioridad: respaldando > error > al-día > sin subir (pendientes) > sin respaldo.
  const kind = backingUp
    ? 'respaldando'
    : failed
      ? 'error'
      : connected && pushCount === 0
        ? 'al-dia'
        : connected
          ? 'sin-subir'
          : 'sin-respaldo'

  let icon: JSX.Element
  let text: string
  switch (kind) {
    case 'respaldando':
      icon = <RefreshCw size={14} className="spin" style={{ color: 'var(--accent)' }} />
      text = 'Respaldando…'
      break
    case 'error':
      icon = <CloudOff size={14} className="st-warn" />
      text = 'No se pudo respaldar'
      break
    case 'al-dia':
      icon = <Cloud size={14} className="st-ok" />
      text = 'Todo en la nube'
      break
    case 'sin-subir':
      // Conectado pero con cambios sin subir: estado honesto, nunca "a salvo".
      icon = <CloudUpload size={14} />
      text = 'Sin subir'
      break
    default:
      icon = <Cloud size={14} className="st-off" />
      text = 'Sin respaldo'
  }

  // Sin respaldo o error → reabre el wizard; conectado → fuerza una copia
  // (rol del viejo UploadCloud). Durante el respaldo, el click es no-op.
  const handleClick = (): void => {
    if (!connected || failed) onOpenWizard()
    else if (!backingUp) onForcePush()
  }

  return (
    <button
      className="status-item backup-btn"
      data-tour="respaldo"
      aria-label={text}
      title={text}
      onClick={handleClick}
    >
      {icon}
      <span>{text}</span>
      {pushCount > 0 && <span className="push-badge">{pushCount}</span>}
      <span className="status-pop">
        <span className="pop-title">
          <Cloud size={13} /> Respaldo en la nube
        </span>
        {connected ? (
          <>
            <span className="pop-row">
              <span>Cuenta</span>
              <b>{login ?? '—'}</b>
            </span>
            <span className="pop-row">
              <span>Sin respaldar</span>
              <b>{pushCount}</b>
            </span>
            <span className="pop-row">
              <span>Copia automática</span>
              <b>{autoPush ? 'activada' : 'desactivada'}</b>
            </span>
          </>
        ) : (
          <span className="pop-note">
            Todavía sin respaldo. Tocá para respaldar tu cuaderno en la nube.
          </span>
        )}
      </span>
    </button>
  )
}
