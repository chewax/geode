import { BrowserWindow, globalShortcut, ipcMain, screen, session } from 'electron'
import { IPC, type DictationCommand, type DictationStatus } from '@shared/ipc'

/**
 * Dictado por voz con atajo GLOBAL (funciona aunque Geode no esté al frente).
 *
 * El main registra el atajo y muestra una ventanita flotante "Escuchando…"; la
 * grabación y la transcripción ocurren en el renderer (micrófono + OpenRouter por
 * IPC). El atajo del sistema sólo informa que se apretó (no cuándo se soltó), así
 * que es "apretar para empezar, apretar para terminar".
 *
 * Destino del texto: si Geode estaba al frente al empezar → en el cursor de la
 * nota abierta; si no → al final de la nota de hoy (Diario/AAAA-MM-DD.md).
 */
export const DICTATION_ACCELERATOR = 'CommandOrControl+Alt+Space'
/** Texto humano del atajo para mostrar en la UI. */
const ACCELERATOR_LABEL = process.platform === 'darwin' ? 'Cmd+Option+Espacio' : 'Ctrl+Alt+Espacio'

let overlay: BrowserWindow | null = null
let recording = false
let hideTimer: NodeJS.Timeout | null = null
let registered = false

/** HTML de la ventanita (sin red ni recursos externos; se actualiza con `set`). */
const OVERLAY_HTML = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;background:transparent;font:13px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden;user-select:none}
  .pill{position:absolute;inset:6px;display:flex;align-items:center;gap:10px;padding:0 16px;border-radius:999px;
    background:rgba(28,28,34,.94);color:#e6e6ea;border:1px solid rgba(183,148,246,.45);box-shadow:0 8px 24px rgba(0,0,0,.35)}
  .dot{width:10px;height:10px;border-radius:50%;background:#b794f6;flex-shrink:0}
  .listening .dot{background:#ff6b6b;animation:pulse 1s ease-in-out infinite}
  .transcribing .dot{background:#b794f6;animation:pulse .6s ease-in-out infinite}
  .done .dot{background:#68d391}.error .dot{background:#f6ad55}
  .txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sub{opacity:.6;font-size:11px;margin-left:auto;white-space:nowrap}
  @keyframes pulse{50%{opacity:.35;transform:scale(.8)}}
</style></head><body>
<div class="pill idle" id="p"><span class="dot"></span><span class="txt" id="t"></span><span class="sub" id="s"></span></div>
<script>
  window.set = function (state, text, sub) {
    document.getElementById('p').className = 'pill ' + state;
    document.getElementById('t').textContent = text;
    document.getElementById('s').textContent = sub || '';
  };
</script></body></html>`

function ensureOverlay(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay
  overlay = new BrowserWindow({
    width: 380,
    height: 56,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false, // nunca le roba el foco a la app en la que está la persona
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setIgnoreMouseEvents(true)
  void overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`)
  return overlay
}

/** Muestra la ventanita abajo al centro de la pantalla donde está el cursor. */
function showOverlay(state: DictationStatus['state'], text: string, sub = '', autoHideMs = 0): void {
  const win = ensureOverlay()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const [w, h] = win.getSize()
  win.setPosition(Math.round(x + (width - w) / 2), Math.round(y + height - h - 40))
  const apply = (): void => {
    void win.webContents
      .executeJavaScript(`window.set(${JSON.stringify(state)}, ${JSON.stringify(text)}, ${JSON.stringify(sub)})`)
      .catch(() => {})
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', apply)
  else apply()
  if (!win.isVisible()) win.showInactive()
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = autoHideMs > 0 ? setTimeout(() => win.hide(), autoHideMs) : null
}

/**
 * Registra el atajo global, el permiso de micrófono y el canal de estado.
 * `getMainWindow` devuelve la ventana principal (el renderer que graba).
 */
export function setupDictation(getMainWindow: () => BrowserWindow | null): void {
  // Micrófono: sólo audio, sólo para la ventana principal. El resto de los
  // permisos conserva el comportamiento anterior de Electron (concedido).
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (permission === 'media') {
      const main = getMainWindow()
      const types = (details as { mediaTypes?: string[] }).mediaTypes ?? []
      callback(!!main && wc === main.webContents && types.every((t) => t === 'audio'))
      return
    }
    callback(true)
  })

  const send = (cmd: DictationCommand): void => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) main.webContents.send(IPC.dictationCommand, cmd)
  }

  registered = globalShortcut.register(DICTATION_ACCELERATOR, () => {
    const main = getMainWindow()
    if (!main || main.isDestroyed()) return
    const target = BrowserWindow.getFocusedWindow() === main ? 'cursor' : 'daily'
    send({ action: recording ? 'stop' : 'start', target })
  })
  if (!registered) console.warn(`[dictado] no se pudo registrar el atajo global ${DICTATION_ACCELERATOR} (¿lo usa otra app?)`)

  ipcMain.handle(IPC.dictationGetShortcut, () => (registered ? ACCELERATOR_LABEL : null))

  // El renderer informa en qué etapa está; la ventanita lo refleja.
  ipcMain.on(IPC.dictationStatus, (_e, status: DictationStatus) => {
    switch (status?.state) {
      case 'listening':
        recording = true
        showOverlay('listening', status.message || 'Escuchando…', `${ACCELERATOR_LABEL} para terminar`)
        break
      case 'transcribing':
        recording = false
        showOverlay('transcribing', status.message || 'Transcribiendo…')
        break
      case 'done':
        recording = false
        showOverlay('done', status.message || 'Listo', '', 2200)
        break
      case 'error':
        recording = false
        showOverlay('error', status.message || 'No se pudo dictar', '', 4500)
        break
      default:
        recording = false
        overlay?.hide()
    }
  })
}

/** Libera el atajo global y la ventanita al salir. */
export function teardownDictation(): void {
  if (registered) globalShortcut.unregister(DICTATION_ACCELERATOR)
  registered = false
  if (overlay && !overlay.isDestroyed()) overlay.destroy()
  overlay = null
}
