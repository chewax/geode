// Plugin externo de ejemplo para Geode: lo mínimo indispensable.
//
// Es un módulo CommonJS: se exporta un objeto { id, name, activate }. No necesita
// build ni dependencias. Corre aislado en su iframe; la API es async (usá await).
// Guía completa: docs/PLUGINS.md

module.exports = {
  id: 'hola-mundo',
  name: 'Hola Mundo',

  // Se llama una vez al cargar. `ctx` es el contexto del plugin: registrar
  // comandos/paneles/ítems de estado/bloques de código + leer el workspace.
  activate(ctx) {
    ctx.commands.register({
      id: 'hola-mundo.saludar',
      title: 'Insertar saludo (plugin externo)',
      category: 'Ejemplos',
      run: async () => {
        await ctx.editor.insertAtCursor('¡Hola desde un plugin externo!')
        await ctx.notify('Plugin externo: saludo insertado')
      }
    })
  }
}
