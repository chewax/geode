/**
 * Boundary de traducción de errores del camino de respaldo a español humano
 * (BACKUP-05). Los errores crudos de GitHub (`createRepo` github.ts) y de git
 * (`push` de isomorphic-git) llevan status HTTP, `e.message` de la API y a veces
 * la credencial en la URL. Nada de eso puede cruzar al renderer: `mapBackupError`
 * clasifica y devuelve SOLO uno de 4 strings fijos, sin interpolar el crudo
 * (threat T-12-01 / T-12-03, ASVS V7 Information Disclosure).
 */

/** Familia de fallo del respaldo; determina la copy y la superficie de la UI. */
export type BackupErrorKind = 'name-taken' | 'auth' | 'offline' | 'unknown'

/**
 * Error clasificado del respaldo. `kind` deja que el renderer elija superficie
 * (inline, botón "Reconectar", etc.); `message` es ya la copy humana LOCKED.
 */
export class BackupError extends Error {
  constructor(
    public readonly kind: BackupErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'BackupError'
  }
}

// Los 4 mensajes LOCKED de UI-SPEC.md:159-164. NO editar sin actualizar el spec.
const MSG_OFFLINE =
  'No hay internet. Tu cuaderno sigue guardado en este dispositivo; se respaldará cuando vuelva la conexión.'
const MSG_AUTH = 'Se perdió la conexión con tu cuenta. Reconectá para seguir respaldando.'
const MSG_NAME_TAKEN = 'Ya tenés un respaldo con ese nombre. Probá con otro nombre de cuaderno.'
const MSG_UNKNOWN =
  'No se pudo respaldar ahora. Tu cuaderno sigue guardado en este dispositivo; volvé a intentarlo en un momento.'

/** Códigos de error de red de Node (fetch de createRepo o transport de push). */
const NETWORK_CODES = new Set(['ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'])

/**
 * Clasifica cualquier error del camino de respaldo en un `BackupError` con copy
 * humana. Prioriza señales ESTRUCTURADAS sobre regex de texto (anti-patrón: el
 * regex es solo último recurso):
 *   1. Red: `e.code` de red, o `/network|fetch failed|ENOTFOUND/i` → offline.
 *   2. Status: `e.status` (nuevo campo de createRepo) o `e.data.statusCode`
 *      (HttpError de isomorphic-git), o `4xx` del texto como último recurso.
 *      401/403 → auth; 422 (o "already exists") → name-taken.
 *   3. Fallback → unknown.
 * NUNCA interpola `e.message`, `e.body` ni la credencial en el mensaje devuelto.
 */
export function mapBackupError(e: unknown): BackupError {
  const err = e as {
    code?: string
    status?: number
    data?: { statusCode?: number }
    message?: string
  }
  const msg = err?.message ?? ''

  // 1. Red / sin internet
  if (NETWORK_CODES.has(err?.code ?? '') || /network|fetch failed|ENOTFOUND/i.test(msg)) {
    return new BackupError('offline', MSG_OFFLINE)
  }

  // 2. Status HTTP: campo de createRepo, HttpError de git, o texto (último recurso)
  const status = err?.status ?? err?.data?.statusCode ?? Number(/\b(4\d\d)\b/.exec(msg)?.[1] ?? 0)
  if (status === 401 || status === 403) {
    return new BackupError('auth', MSG_AUTH)
  }
  if (status === 422 || /already exists/i.test(msg)) {
    return new BackupError('name-taken', MSG_NAME_TAKEN)
  }

  // 3. Desconocido: genérico, sin filtrar texto de API
  return new BackupError('unknown', MSG_UNKNOWN)
}
