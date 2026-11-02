/**
 * Adjuntos de la bóveda (imágenes). Módulo PURO compartido por main y renderer:
 * qué extensiones se muestran en el árbol, cómo se sirven y dónde se guardan.
 */

/** Carpeta (relativa a la raíz) donde se guardan las imágenes pegadas/arrastradas. */
export const ATTACHMENTS_DIR = 'adjuntos'

/** Esquema del protocolo propio que sirve archivos de la bóveda al renderer. */
export const VAULT_SCHEME = 'geode-vault'

/** Tamaño máximo de un adjunto (bytes). Evita que un pegado accidental llene el repo. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** Extensión (en minúsculas) → tipo MIME de las imágenes admitidas. */
export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif'
}

/** Extensión en minúsculas de una ruta ('' si no tiene). */
export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const i = base.lastIndexOf('.')
  return i <= 0 ? '' : base.slice(i + 1).toLowerCase()
}

/** true si la ruta es una imagen admitida como adjunto. */
export function isImagePath(path: string): boolean {
  return extOf(path) in IMAGE_MIME
}

/** Tipo MIME de un archivo de la bóveda (octet-stream si no es imagen conocida). */
export function mimeFor(path: string): string {
  return IMAGE_MIME[extOf(path)] ?? 'application/octet-stream'
}

/**
 * URL del protocolo propio para un archivo de la bóveda. Con `oid`, sirve el
 * archivo tal como estaba en esa versión (viaje en el tiempo); sin él, el actual.
 */
export function vaultFileUrl(relPath: string, oid?: string | null): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/')
  return `${VAULT_SCHEME}://vault/${encoded}${oid ? `?oid=${encodeURIComponent(oid)}` : ''}`
}

/**
 * Ruta relativa (desde la carpeta de `notePath`) hacia `targetPath`, para el
 * Markdown estándar `![](...)`. Codifica espacios y paréntesis para que el
 * enlace funcione en cualquier visor de Markdown, no sólo en Geode.
 */
export function relativeFrom(notePath: string, targetPath: string): string {
  const from = notePath.split('/').slice(0, -1)
  const to = targetPath.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  const ups = from.slice(i).map(() => '..')
  return [...ups, ...to.slice(i)].map((s) => encodeURIComponent(s).replace(/%2F/g, '/')).join('/')
}

/**
 * Resuelve un `src` relativo de Markdown (escrito en la nota `notePath`) a una
 * ruta relativa a la raíz. Devuelve null si es absoluto/externo o se sale de la bóveda.
 */
export function resolveRelativeSrc(notePath: string, src: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('#')) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(src.split(/[?#]/)[0])
  } catch {
    return null
  }
  const base = decoded.startsWith('/') ? [] : notePath.split('/').slice(0, -1)
  const out = [...base]
  for (const seg of decoded.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
    } else out.push(seg)
  }
  return out.length ? out.join('/') : null
}
