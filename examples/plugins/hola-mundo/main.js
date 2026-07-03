// Plugin externo de ejemplo para Geode (Fase A).
//
// Es un módulo CommonJS: se exporta un objeto { id, name, activate }. No necesita
// build ni dependencias — con este archivo alcanza. Para plugins con UI (paneles
// React) o extensiones de editor, se puede hacer require('react') /
// require('@codemirror/view'), que el host resuelve a la misma instancia que la app.

module.exports = {
  id: 'hola-mundo',
  name: 'Hola Mundo',

  // Se llama una vez al cargar. `ctx` es el PluginContext: registrar comandos/
  // paneles/ítems de status/extensiones + leer el workspace. Si devolvés una
  // función/Disposable, se usa para limpiar al desactivar.
  activate(ctx) {
    ctx.commands.register({
      id: 'hola-mundo.saludar',
      title: 'Insertar saludo (plugin externo)',
      category: 'Ejemplos',
      run: () => {
        ctx.editor.insertAtCursor('¡Hola desde un plugin externo! 🎉')
        ctx.notify('Plugin externo: saludo insertado')
      }
    })
  }
}
