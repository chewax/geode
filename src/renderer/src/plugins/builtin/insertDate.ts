import type { GeodePlugin } from '../types'

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
  name: 'Insertar fecha',
  activate(ctx) {
    ctx.commands.register({
      id: 'insert-date.today',
      title: 'Insertar fecha de hoy (YYYY-MM-DD)',
      category: 'Editor',
      run: () => ctx.editor.insertAtCursor(isoDate())
    })
    ctx.commands.register({
      id: 'insert-date.datetime',
      title: 'Insertar fecha y hora',
      category: 'Editor',
      run: () => ctx.editor.insertAtCursor(new Date().toLocaleString())
    })
  }
}
