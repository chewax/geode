/**
 * Convierte el nombre libre de un cuaderno en un nombre de repo GitHub-válido.
 * Vive en el main junto a `vaultName.ts` porque es donde se arma la ruta y se
 * llama a `createRepo` (github.ts); el renderer está sandboxed.
 *
 * OJO: NO reutilizar `sanitizeVaultName` — sus reglas son para CARPETAS de
 * Windows (permiten espacios, acentos, mayúsculas; prohíben `< > : " / \ | ? *`).
 * Las reglas de un repo GitHub son OTRAS: solo `[A-Za-z0-9._-]`, sin espacios,
 * sin diacríticos, sin empezar/terminar con `-` o `.`. Se comparte la FORMA
 * (nunca lanza, fallback constante, cota de longitud) pero no las REGLAS.
 */

const MAX_REPO_NAME = 100
const FALLBACK_REPO = 'cuaderno-geode'

/**
 * Limpia un nombre libre para que sea un nombre de repo GitHub válido. Nunca
 * lanza: ante cualquier entrada (vacía, sólo símbolos, 100% no-ASCII) devuelve
 * el fallback `"cuaderno-geode"`. Implementa BACKUP-03.
 *
 * Reglas: normaliza NFKD y quita diacríticos (á→a); reemplaza cualquier cosa
 * fuera de `[A-Za-z0-9._-]` por `-`; colapsa `-` múltiples a uno; recorta `-` y
 * `.` de los extremos (GitHub los rechaza al borde); acota a 100 caracteres.
 * Si tras todo el resultado queda vacío (nombre 100% no-ASCII), cae al fallback
 * — el retorno NUNCA es `''`. El slug NO se interpola en ninguna superficie
 * markdown/HTML: solo viaja al cuerpo JSON de la API de GitHub.
 */
export function githubRepoSlug(raw: string): string {
  // Quita diacríticos: NFKD separa base+combinante, y \p{Diacritic} los elimina.
  let slug = (raw ?? '').normalize('NFKD').replace(/\p{Diacritic}/gu, '')
  slug = slug.replace(/[^A-Za-z0-9._-]+/g, '-') // fuera del set válido → guión
  slug = slug.replace(/-+/g, '-') // colapsa guiones múltiples
  slug = slug.replace(/^[-.]+|[-.]+$/g, '') // sin `-`/`.` al borde
  slug = Array.from(slug).slice(0, MAX_REPO_NAME).join('')
  slug = slug.replace(/^[-.]+|[-.]+$/g, '') // el corte pudo dejar un borde sucio
  return slug || FALLBACK_REPO
}
