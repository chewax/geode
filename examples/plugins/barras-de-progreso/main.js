// Plugin de ejemplo para Geode: bloques ```progreso con barras de avance.
//
// Muestra la API de bloques de código (apiVersion 2): el plugin registra un
// renderizador para un lenguaje y devuelve HTML/SVG. Corre AISLADO en su iframe
// (sin red ni acceso a tus archivos); Geode sanea lo que devuelve antes de
// mostrarlo, así que no puede inyectar scripts.
//
// Uso en una nota:
//
//   ```progreso
//   7/10 Escribir el capítulo 3
//   45% Corregir notas
//   1/4 Lecturas del mes
//   ```

function escapar(texto) {
  return String(texto).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

/** "7/10 algo" o "45% algo" → { valor 0..1, etiqueta } (null si la línea no es válida). */
function leerLinea(linea) {
  const m = /^\s*(?:(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*%)\s*(.*)$/.exec(linea)
  if (!m) return null
  const num = (s) => Number(String(s).replace(',', '.'))
  const valor = m[3] !== undefined ? num(m[3]) / 100 : num(m[1]) / num(m[2])
  const texto = m[3] !== undefined ? `${m[3]}%` : `${m[1]}/${m[2]}`
  return { valor: Math.max(0, Math.min(1, valor || 0)), texto, etiqueta: m[4] || '' }
}

function dibujar(fuente) {
  const filas = fuente.split('\n').map(leerLinea).filter(Boolean)
  if (filas.length === 0) return '<p><em>Bloque «progreso» vacío: escribí líneas como «7/10 Tarea».</em></p>'
  const ancho = 420
  const alto = 26
  const svg = filas
    .map((f, i) => {
      const y = i * (alto + 8)
      const color = f.valor >= 1 ? '#38a169' : f.valor >= 0.5 ? '#4299e1' : '#dd6b20'
      return (
        `<g transform="translate(0 ${y})">` +
        `<text x="0" y="12" font-size="12" fill="currentColor">${escapar(f.etiqueta)}</text>` +
        `<rect x="0" y="16" width="${ancho}" height="8" rx="4" fill="currentColor" opacity="0.15"/>` +
        `<rect x="0" y="16" width="${Math.round(ancho * f.valor)}" height="8" rx="4" fill="${color}"/>` +
        `<text x="${ancho + 8}" y="24" font-size="11" fill="currentColor" opacity="0.7">${escapar(f.texto)}</text>` +
        `</g>`
      )
    })
    .join('')
  const total = filas.length * (alto + 8)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho + 60}" height="${total}" viewBox="0 0 ${ancho + 60} ${total}" role="img" aria-label="Barras de progreso">${svg}</svg>`
}

module.exports = {
  id: 'barras-de-progreso',
  name: 'Barras de progreso',
  activate(ctx) {
    const bloque = ctx.markdown.registerCodeBlock('progreso', dibujar)
    // Un comando para insertar un bloque de ejemplo en la nota activa.
    const cmd = ctx.commands.register({
      id: 'barras-de-progreso.insertar',
      title: 'Insertar bloque de progreso',
      category: 'Ejemplos',
      run: async () => {
        await ctx.editor.insertAtCursor('\n```progreso\n3/10 Mi objetivo\n```\n')
      }
    })
    return () => {
      bloque.dispose()
      cmd.dispose()
    }
  }
}
