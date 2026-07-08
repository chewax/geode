// Plugin externo de ejemplo (Fase B) para Geode.
//
// A diferencia de `hola-mundo` (API v1 SÍNCRONA), este ejemplo usa la API v2
// ASYNC que reciben los plugins externos a través del puente (postMessage):
// los métodos del editor y `activeNote()` devuelven Promise, así que hay que
// usar `await`. Los built-ins first-party siguen en la API v1 síncrona; el
// contrato async es solo para plugins externos aislados.
//
// Además del comando, este ejemplo ejercita la UI aislada (Fase 12 / UI-01):
//   - un PANEL React que se renderiza DENTRO del iframe del plugin (su Component
//     nunca cruza el puente; el host solo dibuja el header),
//   - un STATUS-ITEM serializable {id,text,tooltip,icon} que el host dibuja y que
//     el plugin actualiza por el puente cuando cambia la nota.
//
// `apiVersion: 1` en el manifiesto declara el contrato; si el host no lo
// soporta, el plugin se rechaza con error visible en Ajustes (no se evalúa).

// `require('react')` lo resuelve el shim del runtime del iframe (misma instancia
// que Geode). El Component se construye con React.createElement (sin JSX, sin build).
const React = require('react')

module.exports = {
  id: 'hola-mundo-async',
  name: 'Hola Mundo (async)',

  // `ctx` es el PluginContext async (v2). Devolvemos un cleanup que desregistra
  // el comando, la suscripción, el panel y el status-item al desactivar el plugin.
  activate(ctx) {
    const PANEL_ID = 'hola-mundo-async.panel'

    // Panel React: muestra la ruta de la nota activa. Se monta DENTRO del iframe;
    // usa hooks vía require('react') y lee el workspace por el puente async.
    function Panel() {
      const [nota, setNota] = React.useState(null)
      React.useEffect(function () {
        let vivo = true
        ctx.activeNote().then(function (n) {
          if (vivo) setNota(n)
        })
        const s = ctx.events.on('note:open', function (payload) {
          if (vivo) setNota(payload)
        })
        return function () {
          vivo = false
          s.dispose()
        }
      }, [])
      return React.createElement(
        'div',
        { style: { padding: 12, lineHeight: 1.5 } },
        React.createElement('h3', { style: { margin: '0 0 8px', fontSize: 14 } }, 'Hola Mundo (async)'),
        React.createElement(
          'p',
          { style: { margin: 0, color: '#b8b8c0' } },
          nota ? 'Nota activa: ' + nota.path : 'No hay ninguna nota activa'
        )
      )
    }

    // Comando: inserta un resumen por el puente async y, de paso, abre/cierra el
    // panel de ejemplo para poder verlo en el dock.
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
        // Abre (o cierra) el panel del plugin, que vive dentro del iframe.
        ctx.panels.toggle(PANEL_ID)
      }
    })

    // Panel del plugin: el Component se monta dentro del iframe; solo {id,title,icon}
    // cruza el puente para que el host dibuje el header (ícono Lucide por nombre).
    const panel = ctx.panels.register({
      id: PANEL_ID,
      title: 'Hola Mundo',
      icon: 'Puzzle',
      Component: Panel
    })

    // Status-item serializable: el host lo dibuja desde datos y lo actualiza cuando
    // el plugin manda un update por el puente.
    const status = ctx.statusBar.addItem({
      id: 'hola-mundo-async.status',
      text: 'Hola async',
      tooltip: 'Plugin de ejemplo aislado',
      icon: 'Puzzle'
    })

    // Suscripción a un evento del workspace: el host empuja el evento al plugin por
    // el puente; acá avisamos y actualizamos el texto del status-item.
    const sub = ctx.events.on('note:open', (payload) => {
      void ctx.notify('Plugin async: nota abierta ' + payload.path)
      status.update({ text: 'Nota: ' + payload.path })
    })

    return () => {
      cmd.dispose()
      sub.dispose()
      panel.dispose()
      status.dispose()
    }
  }
}
