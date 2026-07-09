import type { JSX } from 'react'
import { Cloud, CloudOff, CloudUpload, RefreshCw } from 'lucide-react'

/**
 * Botón de respaldo persistente de la status bar (BACKUP-01/04). Absorbe el
 * viejo `UploadCloud` y la píldora "GitHub/sin GitHub" en una sola superficie.
 *
 * SIEMPRE montado con `data-tour="respaldo"` (ancla del tour de Fase 13): nunca
 * se renderiza condicionalmente. Deriva 4 estados por prioridad y honra STAT-01
 * (jamás dice "Todo en la nube" con cambios sin subir NI en una bóveda sin
 * respaldo propio). El popover no expone la URL del repo (T-12-10). El popover
 * se arma con spans/`<b>` (contenido en línea) para que el nodo raíz sea un
 * `<button>` accesible válido.
 */
export function BackupButton({
  backedUp,
  pushCount,
  backingUp,
  failed,
  failedMessage,
  login,
  autoPush,
  onOpenWizard,
  onForcePush
}: {
  /** Esta bóveda tiene respaldo activo: cuenta conectada Y origin propio. NO es
   *  sólo "la cuenta de GitHub está conectada" — una bóveda nunca respaldada da
   *  `false` aunque la cuenta esté conectada globalmente (STAT-01). */
  backedUp: boolean
  pushCount: number
  backingUp: boolean
  failed: boolean
  /** Copy humana del último fallo (ya mapeada por mapBackupError en el main).
   *  Se muestra inline en el popover del estado "error" (BACKUP-05); jamás el
   *  crudo de la API. */
  failedMessage: string | null
  login: string | null
  autoPush: boolean
  onOpenWizard: () => void
  onForcePush: () => void
}): JSX.Element {
  // Prioridad: respaldando > error > al-día > sin subir (pendientes) > sin respaldo.
  // "al-dia"/"sin-subir" sólo con respaldo real de ESTA bóveda (backedUp): una
  // bóveda con cuenta conectada pero sin origin propio cae a "sin-respaldo".
  const kind = backingUp
    ? 'respaldando'
    : failed
      ? 'error'
      : backedUp && pushCount === 0
        ? 'al-dia'
        : backedUp
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

  // Sin respaldo o error → reabre el wizard; respaldada → fuerza una copia
  // (rol del viejo UploadCloud). Durante el respaldo, el click es no-op.
  const handleClick = (): void => {
    if (!backedUp || failed) onOpenWizard()
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
        {kind === 'error' ? (
          // Estado "error": mostramos la copy humana del fallo (BACKUP-05) e
          // invitamos a reintentar. Nunca el mensaje crudo de la API.
          <span className="pop-note st-warn">
            {failedMessage ??
              'No se pudo respaldar ahora. Tocá para volver a intentarlo.'}
          </span>
        ) : backedUp ? (
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
