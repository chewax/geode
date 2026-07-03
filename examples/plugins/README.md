# Plugins de Geode (Fase A)

Un plugin es una **carpeta** con un `plugin.json` (manifiesto) y un entry
CommonJS. Se instalan copiando esa carpeta a la **carpeta de plugins** de Geode:

> Ajustes → **Plugins** → **Abrir carpeta**

Luego, en la lista de "Instalados", **activá** el plugin y **reiniciá** la app.

## Estructura

```
mi-plugin/
  plugin.json    # manifiesto
  main.js        # entry CommonJS (module.exports = { id, name, activate })
```

## Manifiesto (`plugin.json`)

```json
{
  "id": "mi-plugin",
  "name": "Mi Plugin",
  "version": "1.0.0",
  "description": "Qué hace, en una línea.",
  "author": "Tu nombre",
  "main": "main.js",
  "minAppVersion": "0.4.0",
  "permissions": []
}
```

- `id` — único, en kebab-case. `name`, `version`, `main` son obligatorios.
- `permissions` — **reservado**: hoy es informativo; cuando exista el sandbox
  (Fase B) va a declarar a qué partes del workspace accede el plugin.

## El entry (`main.js`)

Exporta un objeto con `id`, `name` y `activate(ctx)`. `ctx` es el **PluginContext**:

```js
module.exports = {
  id: 'mi-plugin',
  name: 'Mi Plugin',
  activate(ctx) {
    // Registrar un comando (aparece en la paleta, Ctrl+P)
    ctx.commands.register({
      id: 'mi-plugin.hacer-algo',
      title: 'Hacer algo',
      category: 'Mi Plugin',
      run: () => ctx.editor.insertAtCursor('texto'),
    })
    // ctx.panels.register({...})        -> panel lateral (React)
    // ctx.statusBar.addItem({...})      -> ítem en la barra de estado
    // ctx.editorExtensions.add(ext)     -> extensión de CodeMirror
    // ctx.events.on('note:change', ...) -> eventos del workspace
    // return () => { ...cleanup... }     -> opcional, al desactivar
  },
}
```

## Módulos disponibles vía `require()`

El host presta **su misma instancia** de estas dependencias (necesario para que
los componentes React y las extensiones de editor funcionen):

- `react`, `react/jsx-runtime`
- `@codemirror/state`, `@codemirror/view`

Cualquier otro `require(...)` falla con un error claro. Para plugins con UI,
compilá tu TS/JSX a un único `main.js` CommonJS dejando esos módulos como
externos.

## Ejemplo

`hola-mundo/` — agrega un comando "Insertar saludo (plugin externo)" a la paleta.
Copialo a tu carpeta de plugins, activalo y reiniciá para probarlo.
