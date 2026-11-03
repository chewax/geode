import type { GeodePlugin } from '../types'
import { t } from '@shared/i18n'

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
function isoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Plugin interno: inserta fecha/hora en el cursor. Demuestra el registro de
 * comandos (paleta) + la API imperativa del editor.
 */
export const insertDatePlugin: GeodePlugin = {
  id: 'insert-date',
  get name() {
    return t('Insertar fecha')
  },
  get description() {
    return t('Inserta la fecha (y hora) de hoy en el cursor desde la paleta')
  },
  activate(ctx) {
    ctx.commands.register({
      id: 'insert-date.today',
      title: t('Insertar fecha de hoy (YYYY-MM-DD)'),
      category: t('Editor'),
      run: () => ctx.editor.insertAtCursor(isoDate())
    })
    ctx.commands.register({
      id: 'insert-date.datetime',
      title: t('Insertar fecha y hora'),
      category: t('Editor'),
      run: () => ctx.editor.insertAtCursor(new Date().toLocaleString())
    })
  }
}
