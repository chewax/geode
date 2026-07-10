/**
 * Limpia el envoltorio de IPC de los errores de IA que llegan al renderer.
 * Electron envuelve los rejects de `ipcMain.handle` como
 * `Error invoking remote method '<canal>': Error: <mensaje real>`, y ese
 * `<mensaje real>` ya viene traducido a español por `mapAiError` (proceso main).
 * Esta función descarta el prefijo para mostrar solo la copy amigable. Si tras
 * limpiar no queda nada útil (o `e` no es Error), cae al `fallback` provisto.
 */

// Prefijo que agrega Electron al serializar un reject de IPC. Quitamos el
// "Error invoking remote method '<canal>':" y, si sigue, el "<Tipo>Error:"
// que Electron antepone al mensaje real.
const IPC_WRAPPER = /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]+Error:\s*)?/

export function friendlyAiError(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback
  const cleaned = e.message.replace(IPC_WRAPPER, '').trim()
  return cleaned.length > 0 ? cleaned : fallback
}
