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
import { getLocale, t } from '@shared/i18n'

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
 * espacios finales (Windows los descarta y generarían carpetas fantasma); acota a
 * 100 caracteres (nombres muy largos rompen el límite de ruta de Windows con
 * `ENAMETOOLONG`). Si el resultado queda vacío o el stem es un nombre reservado,
 * cae a `"Cuaderno"`.
 */
const MAX_VAULT_NAME = 100

export function sanitizeVaultName(raw: string): string {
  // ilegales de Windows + control chars (\x00-\x1f) → espacio
  let name = (raw ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ') // eslint-disable-line no-control-regex
  name = name.replace(/\s+/g, ' ').trim() // colapsa espacios múltiples
  // Acota antes del strip final: truncar puede dejar un punto/espacio al borde.
  // Se corta por code point (Array.from) y NO por code unit UTF-16 (slice): así
  // un carácter astral (emoji, CJK extendido) justo en el borde no queda partido
  // a la mitad de su par surrogado, dejando un surrogado suelto en la carpeta.
  name = Array.from(name).slice(0, MAX_VAULT_NAME).join('')
  name = name.replace(/[. ]+$/g, '').trim() // sin punto/espacio final
  const stem = name.split('.')[0] || name
  if (name === '' || WINDOWS_RESERVED.test(stem)) return t('Cuaderno')
  return name
}

/**
 * Contenido canónico de la nota de bienvenida (`Bienvenida.md`) que se siembra al
 * crear un cuaderno nuevo. Es un texto FIJO: nunca se interpola con el nombre
 * del cuaderno, para no abrir una superficie de inyección markdown vía el nombre
 * (ver threat model T-11-04). Tono en 2ª persona, cálido, sin jerga; menciona
 * "copia de seguridad", nunca "GitHub".
 *
 * Es una función (no una constante) para elegir el idioma con `getLocale()` en el
 * momento de crear el cuaderno. El nombre del archivo (`Bienvenida.md`) NO se
 * traduce: el renderer lo abre por esa ruta tras la creación.
 */
export function seedBienvenida(): string {
  return getLocale() === 'en' ? SEED_WELCOME_EN : SEED_BIENVENIDA_ES
}

const SEED_BIENVENIDA_ES = `# Te damos la bienvenida

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

const SEED_WELCOME_EN = `# Welcome

This is your first notebook. Write whatever you like here: ideas, notes,
drafts, lists… anything that comes to mind.

You don't have to worry about saving: your notebook saves itself and
remembers every change, so **you'll never lose anything** and you can
experiment without fear.

Later on you'll be able to make a **backup** to keep it safe somewhere
else. But that's for later: for now, just write.

Want to start from scratch? Delete this note and make it your own.
`
