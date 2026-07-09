/**
 * Utilidades para crear un cuaderno LOCAL: limpieza del nombre de carpeta para
 * Windows y contenido canónico de la nota de bienvenida sembrada (ver Fase 11,
 * ONB-03/ONB-04). Vive en el main porque es donde se arma la ruta y se escribe
 * la carpeta; el renderer está sandboxed y no toca el filesystem.
 *
 * OJO: NO reutilizar `sanitizeTagName` (git.ts) — sus reglas son para refs de git
 * (colapsa espacios a guiones, quita `~^:?*[`), incorrectas para una carpeta:
 * las carpetas SÍ permiten espacios y prohíben otro conjunto de caracteres.
 */

/**
 * Nombres de dispositivo reservados por Windows. Están prohibidos incluso con
 * extensión (`CON.md` también falla), por eso se chequean sobre el "stem" (el
 * texto previo al primer punto), case-insensitive.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * Limpia un nombre libre para que sea una carpeta válida en Windows. Nunca lanza:
 * ante cualquier entrada (vacía, sólo ilegales, reservada) devuelve el fallback
 * `"Cuaderno"`. Implementa ONB-04.
 *
 * Reglas: reemplaza los ilegales de Windows `< > : " / \ | ? *` y los caracteres
 * de control por un espacio; colapsa espacios múltiples y recorta; quita puntos y
 * espacios finales (Windows los descarta y generarían carpetas fantasma). Si el
 * resultado queda vacío o el stem es un nombre reservado, cae a `"Cuaderno"`.
 */
export function sanitizeVaultName(raw: string): string {
  // ilegales de Windows + control chars (\x00-\x1f) → espacio
  let name = (raw ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ') // eslint-disable-line no-control-regex
  name = name.replace(/\s+/g, ' ').trim() // colapsa espacios múltiples
  name = name.replace(/[. ]+$/g, '').trim() // sin punto/espacio final
  const stem = name.split('.')[0] || name
  if (name === '' || WINDOWS_RESERVED.test(stem)) return 'Cuaderno'
  return name
}

/**
 * Contenido canónico de la nota de bienvenida (`Bienvenida.md`) que se siembra al
 * crear un cuaderno nuevo. Es una constante FIJA: nunca se interpola con el nombre
 * del cuaderno, para no abrir una superficie de inyección markdown vía el nombre
 * (ver threat model T-11-04). Tono en 2ª persona, cálido, sin jerga; menciona
 * "copia de seguridad", nunca "GitHub".
 */
export const SEED_BIENVENIDA = `# Te damos la bienvenida

Este es tu primer cuaderno. Escribí acá lo que quieras: ideas, notas,
borradores, listas… lo que se te ocurra.

No tenés que preocuparte por guardar: tu cuaderno se guarda solo y
recuerda cada cambio, así que **nunca vas a perder nada** y podés
experimentar sin miedo.

Más adelante vas a poder hacer una **copia de seguridad** para tenerlo a
salvo en otro lugar. Pero eso es para después: por ahora, simplemente
escribí.

¿Querés empezar de cero? Borrá esta nota y hacela tuya.
`
