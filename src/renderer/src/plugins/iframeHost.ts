/**
 * ── Host del iframe sandbox del plugin (Fase 12 / ISO-01) ────────────────────
 *
 * Crea, por cada plugin externo, un `<iframe>` de ORIGEN OPACO donde corre el
 * runtime del plugin (bundle IIFE del Task 2). El plugin queda aislado del host:
 * sin acceso a la API global de Geode, al DOM del host ni a Node. El único canal
 * es el `MessagePort` que se transfiere al iframe en el mensaje `init`.
 *
 * El bundle del runtime se inyecta INLINE en el `srcdoc` porque un iframe de
 * origen opaco no puede cargar `<script src>` del origen del host. El `srcdoc`
 * lleva su propia CSP restrictiva con `connect-src 'none'`: el plugin no tiene
 * red (la Fase 13 la abrirá con permiso `network`).
 */

/**
 * CSP del documento del iframe: sin recursos externos, sin red. Se permite
 * `unsafe-inline`/`unsafe-eval` para el runtime inline y el `new Function` del
 * plugin (que vive AISLADO en este origen opaco). `connect-src 'none'` bloquea
 * toda salida de red desde el plugin.
 */
const IFRAME_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"

/** Margen para que el iframe arranque; si no responde, se loguea sin colgar. */
const INIT_TIMEOUT_MS = 5000

/** iframe creado + su limpieza (remueve el iframe del DOM y cierra el port). */
export interface PluginIframe {
  iframe: HTMLIFrameElement
  dispose(): void
}

/**
 * Crea el iframe sandbox del plugin, inyecta el runtime inline en su `srcdoc` y,
 * tras el evento `load`, transfiere `port` al iframe con el mensaje `init` (que
 * lleva la fuente CommonJS del plugin). Devuelve el iframe y un `dispose()` que
 * lo remueve del DOM y cierra el port.
 *
 * @param pluginId       id del plugin (para logs y el mensaje `init`).
 * @param source         fuente CommonJS cruda del plugin (se evalúa DENTRO del iframe).
 * @param runtimeSource  texto del bundle IIFE del runtime (se inyecta inline).
 * @param port           port1 del canal, que se TRANSFIERE al iframe.
 */
export function createPluginIframe(
  pluginId: string,
  source: string,
  runtimeSource: string,
  port: MessagePort
): PluginIframe {
  const iframe = document.createElement('iframe')
  // Se crea con sandbox="allow-scripts" y SIN el token same-origin, de modo que
  // el iframe queda en un origen opaco: sin acceso a la API global del host, al
  // DOM del host ni a Node. NUNCA agregar el flag same-origin: eso derrumba el
  // aislamiento.
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.title = `plugin:${pluginId}`
  // Oculto por defecto (el Plan 02 lo reposiciona dentro del panel del plugin).
  iframe.style.display = 'none'

  // srcdoc: CSP del iframe (red bloqueada) + el runtime IIFE inline. El plugin se
  // evalúa dentro de este documento de origen opaco, no en el renderer host.
  iframe.srcdoc =
    `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}">` +
    `</head><body><script>${runtimeSource}</script></body></html>`

  let settled = false

  const onLoad = (): void => {
    if (settled) return
    settled = true
    // Transferir el port al iframe junto al `init`. El array de transfer mueve el
    // port (no lo comparte): tras esto el plugin habla por su propio endpoint. El
    // `theme` ESTÁTICO ('dark') viaja acá UNA sola vez (Geode es dark fijo): no hay
    // suscripción de cambio de tema.
    iframe.contentWindow?.postMessage({ type: 'init', pluginId, source, theme: 'dark' }, '*', [port])
  }
  iframe.addEventListener('load', onLoad)

  // Se monta off-screen (display:none) en el body del host.
  document.body.appendChild(iframe)

  // Timeout de arranque: un plugin que no dispara `load` no debe colgar la app.
  const timer = window.setTimeout(() => {
    if (!settled) {
      console.warn(`[plugins] el iframe del plugin "${pluginId}" no arrancó en ${INIT_TIMEOUT_MS}ms`)
    }
  }, INIT_TIMEOUT_MS)

  const dispose = (): void => {
    window.clearTimeout(timer)
    iframe.removeEventListener('load', onLoad)
    // Remover el <iframe> del DOM destruye el runtime del plugin y su endpoint.
    iframe.remove()
    // Cerrar el port (ya transferido al iframe: cerrarlo acá es inofensivo pero
    // deja explícito que este endpoint queda liberado).
    port.close()
  }

  return { iframe, dispose }
}
