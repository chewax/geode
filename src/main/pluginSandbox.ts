import { protocol } from 'electron'

/**
 * Documento del sandbox de plugins, servido por un protocolo propio
 * (`geode-plugin://sandbox/…`) en vez de `srcdoc`.
 *
 * Por qué: un iframe `srcdoc` HEREDA el CSP de la página que lo contiene, y el
 * renderer principal tiene `script-src 'self'` estricto (sin inline ni eval), así
 * que el runtime del plugin no podía ejecutarse. Servido desde su propio esquema,
 * el documento tiene SU CSP (cabecera de la respuesta) y sigue en un ORIGEN OPACO
 * (`sandbox="allow-scripts"`, sin same-origin): sin acceso a `window.geode`, al DOM
 * del host ni a Node, y sin red (`connect-src 'none'`).
 *
 * El documento sólo trae un arranque mínimo: el host le envía el texto del runtime
 * (`boot`) y luego la fuente del plugin + el MessagePort (`init`). El `unsafe-eval`
 * vive únicamente en este documento aislado.
 */
export const PLUGIN_SCHEME = 'geode-plugin'

const CSP =
  "default-src 'none'; script-src geode-plugin: 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"

const HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><script src="geode-plugin://sandbox/boot.js"></script></head><body></body></html>`

/** Arranque: recibe UNA vez el runtime (texto) y lo ejecuta; el runtime atiende `init`. */
const BOOT = `(function () {
  var booted = false;
  window.addEventListener('message', function (ev) {
    var msg = ev.data;
    if (booted || !msg || msg.type !== 'boot' || typeof msg.runtime !== 'string') return;
    booted = true;
    (new Function(msg.runtime))();
  });
})();`

/** Registra el esquema como privilegiado (antes de app ready). */
export const PLUGIN_SCHEME_PRIVILEGES = {
  scheme: PLUGIN_SCHEME,
  privileges: { standard: true, secure: true }
}

/** Sirve los dos archivos del sandbox (cualquier otra ruta → 404). */
export function registerPluginSandboxProtocol(): void {
  protocol.handle(PLUGIN_SCHEME, (request) => {
    const { pathname } = new URL(request.url)
    const headers = { 'content-security-policy': CSP, 'cache-control': 'no-store' }
    if (pathname === '/sandbox.html') {
      return new Response(HTML, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } })
    }
    if (pathname === '/boot.js') {
      return new Response(BOOT, { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } })
    }
    return new Response('No encontrado', { status: 404 })
  })
}
