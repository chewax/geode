// Plugin externo de ejemplo (Fase B) para Geode.
//
// A diferencia de `hola-mundo` (API v1 SÍNCRONA), este ejemplo usa la API v2
// ASYNC que reciben los plugins externos a través del puente (postMessage):
// los métodos del editor y `activeNote()` devuelven Promise, así que hay que
// usar `await`. Los built-ins first-party siguen en la API v1 síncrona; el
// contrato async es solo para plugins externos aislados.
//
// `apiVersion: 1` en el manifiesto declara el contrato; si el host no lo
// soporta, el plugin se rechaza con error visible en Ajustes (no se evalúa).

module.exports = {
  id: 'hola-mundo-async',
  name: 'Hola Mundo (async)',

  // `ctx` es el PluginContext async (v2). Devolvemos un cleanup que desregistra
  // el comando y la suscripción al desactivar el plugin.
  activate(ctx) {
    const cmd = ctx.commands.register({
      id: 'hola-mundo-async.insertar-resumen',
      title: 'Insertar resumen (plugin async)',
      category: 'Ejemplos',
      // run async: cada llamada al editor/workspace viaja por el puente y se espera.
      run: async () => {
        const seleccion = await ctx.editor.getSelection()
        let texto
        if (seleccion && seleccion.trim()) {
          texto = '\n> Resumen: ' + seleccion.trim() + '\n'
        } else {
          const nota = await ctx.activeNote()
          texto = nota
            ? '\n> Nota "' + nota.path + '" (' + nota.content.length + ' caracteres)\n'
            : '\n> No hay ninguna nota activa\n'
        }
        await ctx.editor.insertAtCursor(texto)
        await ctx.notify('Resumen insertado por el puente async')
      }
    })

    // Suscripción a un evento del workspace: el host empuja el evento al plugin
    // por el puente y acá reaccionamos con un aviso.
    const sub = ctx.events.on('note:open', (payload) => {
      void ctx.notify('Plugin async: nota abierta ' + payload.path)
    })

    return () => {
      cmd.dispose()
      sub.dispose()
    }
  }
}
