import type { GeodePlugin, PluginContext } from '../types'
import { TEMPLATES_DIR, applyTemplate, localDate } from './templating'

/** Carpeta de las notas diarias. */
export const DAILY_DIR = 'Diario'
/** Plantilla opcional: si existe, se usa para crear la nota del día. */
const DAILY_TEMPLATE = `${TEMPLATES_DIR}/Diario.md`

/** Contenido inicial de la nota de un día (plantilla del usuario o una mínima). */
async function initialContent(ctx: PluginContext, title: string, day: Date): Promise<string> {
  if (await ctx.vault.exists(DAILY_TEMPLATE)) {
    try {
      return applyTemplate(await ctx.vault.readNote(DAILY_TEMPLATE), { title, now: day })
    } catch {
      // Plantilla ilegible: caemos al contenido mínimo, sin bloquear.
    }
  }
  return `# ${title}\n\n`
}

/** Abre la nota del día `day` (la crea si no existe). */
async function openDay(ctx: PluginContext, day: Date): Promise<void> {
  const title = localDate(day)
  const path = `${DAILY_DIR}/${title}.md`
  try {
    if (!(await ctx.vault.exists(path))) {
      await ctx.vault.createNote(path, await initialContent(ctx, title, day))
    }
    await ctx.openNote(path)
  } catch (e) {
    ctx.notify(e instanceof Error ? e.message : 'No se pudo abrir la nota del día')
  }
}

/** Desplaza una fecha `delta` días. */
function shift(delta: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + delta)
  return d
}

/**
 * Plugin interno: notas diarias. Una nota por día en `Diario/AAAA-MM-DD.md`,
 * creada desde `Plantillas/Diario.md` si existe. Ideal para el hábito de
 * escribir todos los días (y, con el historial, nada de lo escrito se pierde).
 */
export const dailyNotesPlugin: GeodePlugin = {
  id: 'daily-notes',
  name: 'Notas diarias',
  description: 'Una nota por día en la carpeta «Diario», con plantilla opcional',
  activate(ctx) {
    ctx.commands.register({
      id: 'daily-notes.today',
      title: 'Abrir la nota de hoy',
      category: 'Notas',
      shortcut: 'Ctrl+Shift+D',
      run: () => openDay(ctx, new Date())
    })
    ctx.commands.register({
      id: 'daily-notes.yesterday',
      title: 'Abrir la nota de ayer',
      category: 'Notas',
      run: () => openDay(ctx, shift(-1))
    })
    ctx.commands.register({
      id: 'daily-notes.tomorrow',
      title: 'Abrir la nota de mañana',
      category: 'Notas',
      run: () => openDay(ctx, shift(1))
    })
  }
}
