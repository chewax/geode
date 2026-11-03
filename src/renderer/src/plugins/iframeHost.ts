/**
 * ── Host del iframe sandbox del plugin (Fase 12 / ISO-01) ────────────────────
 *
 * Crea, por cada plugin externo, un `<iframe>` de ORIGEN OPACO donde corre el
 * runtime del plugin (bundle IIFE de `build:iframe`). El plugin queda aislado
 * del host: sin acceso a la API global de Geode, al DOM del host ni a Node. El
 * único canal es el `MessagePort` que se transfiere al iframe en el mensaje `init`.
 *
 * El documento del iframe lo sirve el main por `geode-plugin://sandbox/sandbox.html`
 * con SU PROPIA CSP (ver `main/pluginSandbox.ts`). NO se usa `srcdoc`: un iframe
 * srcdoc hereda el CSP estricto del renderer principal (`script-src 'self'`) y el
 * runtime no podía ejecutarse. Tras `load`, el host le manda el texto del runtime
 * (`boot`) y después la fuente del plugin con el port (`init`). La CSP del
 * sandbox lleva `connect-src 'none'`: el plugin no tiene red.
 */

/** URL del documento del sandbox (servido por el main). */
const SANDBOX_URL = 'geode-plugin://sandbox/sandbox.html'

/** Margen para que el iframe arranque; si no responde, se loguea sin colgar. */
const INIT_TIMEOUT_MS = 5000

/** iframe creado + su limpieza (remueve el iframe del DOM y cierra el port). */
export interface PluginIframe {
  iframe: HTMLIFrameElement
  dispose(): void
}

/**
 * Crea el iframe sandbox del plugin y, tras el evento `load`, le envía el runtime
 * (`boot`) y luego transfiere `port` con el mensaje `init` (que lleva la fuente
 * CommonJS del plugin). Devuelve el iframe y un `dispose()` que lo remueve del DOM
 * y cierra el port.
 *
 * @param pluginId       id del plugin (para logs y el mensaje `init`).
 * @param source         fuente CommonJS cruda del plugin (se evalúa DENTRO del iframe).
 * @param runtimeSource  texto del bundle IIFE del runtime.
 * @param port           port1 del canal, que se TRANSFIERE al iframe.
 * @param onInitTimeout  se invoca si el iframe no carga dentro de `INIT_TIMEOUT_MS`:
 *   para entonces el lado plugin YA se dispuso; el caller limpia su lado y avisa.
 */
export function createPluginIframe(
  pluginId: string,
  source: string,
  runtimeSource: string,
  port: MessagePort,
  onInitTimeout?: () => void
): PluginIframe {
  const iframe = document.createElement('iframe')
  // sandbox="allow-scripts" SIN same-origin: el iframe queda en un origen opaco,
  // sin acceso a la API global del host, al DOM del host ni a Node. NUNCA agregar
  // el flag same-origin: eso derrumba el aislamiento.
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = `plugin:${pluginId}`
  // Oculto pero CON layout (no display:none): librerías que miden texto (p. ej.
  // diagramas) necesitan un documento con tamaño. Fuera de pantalla y sin eventos.
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '800px',
    height: '600px',
    visibility: 'hidden',
    pointerEvents: 'none',
    border: '0'
  })
  iframe.src = SANDBOX_URL

  let settled = false

  const onLoad = (): void => {
    if (settled) return
    settled = true
    const win = iframe.contentWindow
    if (!win) return
    // El origen del iframe es opaco: '*' es la única forma de dirigirle mensajes.
    // Nada sensible viaja acá (runtime público + fuente del propio plugin).
    win.postMessage({ type: 'boot', runtime: runtimeSource }, '*')
    // El tema efectivo (claro/oscuro) al arrancar el plugin.
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    win.postMessage({ type: 'init', pluginId, source, theme }, '*', [port])
  }
  iframe.addEventListener('load', onLoad)

  document.body.appendChild(iframe)

  let disposed = false

  const dispose = (): void => {
    // Idempotente: el timeout puede disponer y luego el unmount volver a llamar.
    if (disposed) return
    disposed = true
    window.clearTimeout(timer)
    iframe.removeEventListener('load', onLoad)
    // Remover el <iframe> del DOM destruye el runtime del plugin y su endpoint.
    iframe.remove()
    port.close()
  }

  // Timeout de arranque: un plugin cuyo iframe no carga no debe colgar la app NI
  // filtrar recursos. No afecta a los demás plugins.
  const timer = window.setTimeout(() => {
    if (settled) return
    settled = true
    console.warn(`[plugins] el iframe del plugin "${pluginId}" no arrancó en ${INIT_TIMEOUT_MS}ms`)
    dispose()
    onInitTimeout?.()
  }, INIT_TIMEOUT_MS)

  return { iframe, dispose }
}
