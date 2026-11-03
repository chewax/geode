# Guía para escribir plugins de Geode

Un plugin agrega funcionalidad a Geode: comandos en la paleta, paneles, ítems en
la barra de estado, o **bloques de código propios** en la vista previa (por
ejemplo diagramas, gráficos o tarjetas). Esta guía es todo lo que necesitás para
escribir uno y compartirlo.

> Versión de la API: **2** (`HOST_API_VERSION` en `src/shared/ipc.ts`). Los
> plugins escritos para la v1 siguen funcionando.

---

## 1. Primer plugin en 2 minutos

Un plugin es una **carpeta** con dos archivos:

```
saludo/
  plugin.json   ← quién sos y qué versión de la API usás
  main.js       ← tu código (CommonJS)
```

`plugin.json`:

```json
{
  "id": "saludo",
  "name": "Saludo",
  "version": "1.0.0",
  "description": "Inserta un saludo en la nota.",
  "author": "Tu nombre",
  "main": "main.js",
  "apiVersion": 2,
  "minAppVersion": "0.8.1",
  "permissions": []
}
```

`main.js`:

```js
module.exports = {
  id: 'saludo',
  name: 'Saludo',
  activate(ctx) {
    const cmd = ctx.commands.register({
      id: 'saludo.insertar',
      title: 'Insertar saludo',
      category: 'Saludo',
      run: async () => {
        await ctx.editor.insertAtCursor('¡Hola desde mi plugin!')
        await ctx.notify('Listo')
      }
    })
    // Lo que devuelvas se llama al desactivar el plugin.
    return () => cmd.dispose()
  }
}
```

**Instalarlo:** Ajustes → **Plugins** → **Abrir carpeta**, copiá ahí la carpeta
`saludo/`, activalo en la lista y **reiniciá Geode**. El comando aparece en la
paleta (Ctrl+P).

Más ejemplos listos para copiar en [`examples/plugins/`](../examples/plugins/).

---

## 2. Cómo corre tu plugin (y por qué importa)

Cada plugin corre **aislado** en su propio iframe de origen opaco:

- **No** tiene acceso a `window.geode`, al resto de la app, a Node ni a tus
  archivos directamente. Todo pasa por el objeto `ctx` que recibe `activate`.
- **No tiene red** (`fetch`/XHR bloqueados). Si tu plugin necesita una librería,
  **empaquetala adentro** de tu `main.js` (ver §6).
- Cada llamada a `ctx` cruza un puente de mensajes, por eso **casi todo es
  `async`**: usá `await`.
- Si tu plugin falla o se cuelga, no rompe Geode ni a los demás plugins.
- El HTML/SVG que devolvés para dibujar se **sanea** (sin `<script>`, sin
  `onclick`, sin URLs `javascript:`).

---

## 3. Manifiesto (`plugin.json`)

| Campo | Obligatorio | Qué es |
|---|---|---|
| `id` | sí | Único, en kebab-case (`mi-plugin`). Usalo como prefijo de tus ids de comandos. |
| `name` | sí | Nombre visible en Ajustes. |
| `version` | sí | Versión de tu plugin (`x.y.z`). |
| `main` | sí | Archivo de entrada CommonJS, relativo a la carpeta. |
| `description`, `author` | no | Se muestran en Ajustes. |
| `apiVersion` | no | Versión de la API que usás (por defecto 1). Si es mayor que la que soporta Geode, el plugin no se carga y Ajustes muestra el motivo. |
| `minAppVersion` | no | Versión mínima de Geode (`x.y.z`). |
| `permissions` | no | Reservado. Hoy es informativo; en una próxima versión Geode va a pedir consentimiento por permiso (`notes:read`, `notes:write`, `editor:read`, `editor:write`…). Declaralos desde ya. |

---

## 4. Referencia de la API (`ctx`)

### Workspace

| Método | Devuelve | Notas |
|---|---|---|
| `ctx.activeNote()` | `Promise<{ path, content } \| null>` | Nota abierta en el panel activo. |
| `ctx.vault.readNote(path)` | `Promise<string>` | Rutas relativas a la bóveda, con `/`. |
| `ctx.vault.tree()` | `Promise<TreeNode[]>` | Árbol `{ name, path, isDir, children? }`. |
| `ctx.vault.exists(path)` | `Promise<boolean>` | *(v2)* |
| `ctx.vault.createNote(path, content)` | `Promise<void>` | *(v2)* Falla con "Ya existe" si la ruta está ocupada: **nunca pisa** una nota. |
| `ctx.openNote(path)` | `Promise<void>` | *(v2)* Abre la nota en el panel activo. |
| `ctx.git.graph()` | `Promise<GitGraph>` | Historial de versiones (solo lectura). |
| `ctx.runCommand(id)` | `Promise<void>` | Ejecuta cualquier comando de la paleta. |
| `ctx.notify(mensaje)` | `Promise<void>` | Aviso breve (toast). |

### Editor

| Método | Devuelve |
|---|---|
| `ctx.editor.insertAtCursor(texto)` | `Promise<void>` — inserta (o reemplaza la selección). |
| `ctx.editor.getSelection()` | `Promise<string>` |
| `ctx.editor.revealRange(desde, hasta)` | `Promise<void>` — selecciona y hace scroll (offsets en caracteres). |

Todo lo que escribís en la nota queda en el historial: el usuario lo puede
deshacer o volver atrás en la línea de tiempo.

### Comandos

```js
const d = ctx.commands.register({
  id: 'mi-plugin.algo',      // único
  title: 'Hacer algo',       // texto en la paleta
  category: 'Mi Plugin',     // agrupa en la paleta
  shortcut: 'Ctrl+Alt+A',    // informativo (no crea el atajo)
  run: async () => { /* … */ }
})
d.dispose() // lo quita
```

### Selector rápido *(v2)*

```js
const elegido = await ctx.ui.pick(
  [{ label: 'Rojo', detail: '#f00', value: 'rojo' }, { label: 'Azul', value: 'azul' }],
  'Elegí un color…'
)
// elegido === 'rojo' | 'azul' | null (si cancela). Los `value` deben ser datos simples.
```

### Bloques de código propios *(v2)*

Para dibujar en la vista previa un bloque como:

````markdown
```progreso
7/10 Capítulo 3
```
````

```js
const d = ctx.markdown.registerCodeBlock('progreso', (texto) => {
  // Devolvé HTML o SVG como string (o una Promise de string).
  return `<svg …>…</svg>`
})
```

- El lenguaje se compara sin mayúsculas. Si dos plugins registran el mismo, gana el último.
- Si tu función lanza un error, la nota muestra «No se pudo dibujar el bloque…» con tu mensaje: usá mensajes claros en español.
- Tenés 10 segundos para responder; después el bloque muestra un error.
- El resultado se sanea: se permiten HTML y SVG (incluido `<style>` dentro del SVG), no scripts ni eventos.

### Eventos

```js
const sub = ctx.events.on('note:open', ({ path, content }) => { /* … */ })
sub.dispose()
```

| Evento | Datos |
|---|---|
| `note:open` | `{ path, content }` — se abrió una nota. |
| `note:change` | `{ path, content }` — el usuario editó (se emite seguido: no hagas trabajo pesado en cada uno). |
| `note:beforeSave` / `note:afterSave` | `{ path }` — antes/después de guardar una versión. |
| `sync:after` | `{ branch, oid }` — después de respaldar en la nube. |
| `vault:switch` | `{ root, name }` — se cambió de bóveda. |

### Barra de estado

```js
const item = ctx.statusBar.addItem({ id: 'mi-plugin.estado', text: 'Listo', tooltip: 'Detalle', icon: 'Info' })
item.update({ text: 'Procesando…' })
item.dispose()
```

`icon` es el **nombre** de un ícono de una lista acotada de Lucide: `Puzzle`,
`List`, `Star`, `Info`, `FileText`, `Tag`, `Bell`, `Bookmark`.

### Paneles

Un panel es un componente React que se dibuja **dentro de tu iframe**; Geode
le reserva el espacio y dibuja el encabezado.

```js
const React = require('react')
function Panel() {
  return React.createElement('div', { style: { padding: 12 } }, 'Hola')
}
const p = ctx.panels.register({ id: 'mi-plugin.panel', title: 'Mi panel', icon: 'Puzzle', Component: Panel })
ctx.panels.toggle('mi-plugin.panel') // mostrar/ocultar
```

### No disponible para plugins externos

`ctx.editorExtensions.add(...)` (extensiones de CodeMirror) solo funciona en
los plugins integrados de Geode: una extensión del editor no puede cruzar el
aislamiento. Llamarla lanza un error explicativo.

---

## 5. Módulos que podés `require()`

Dentro del iframe hay disponibles: `react`, `react-dom`, `react/jsx-runtime`,
`@codemirror/state`, `@codemirror/view`. Cualquier otro `require` falla con un
mensaje claro; el resto lo tenés que empaquetar (§6).

---

## 6. Usar librerías (TypeScript, JSX, npm)

Escribí tu plugin como quieras y **compilalo a un único `main.js` CommonJS**,
dejando como externos los módulos de §5. Con esbuild:

```bash
npx esbuild src/index.ts --bundle --format=cjs --platform=browser --outfile=main.js --external:react --external:react-dom --external:react/jsx-runtime --external:@codemirror/state --external:@codemirror/view
```

Cualquier librería que no use red ni Node funciona empaquetada así (por ejemplo
un renderizador de gráficos o de fórmulas). Geode trae **Mermaid integrado**
(bloques ` ```mermaid `), hecho con esta misma API: ver
`src/renderer/src/plugins/builtin/mermaid.ts`.

Tipos: copiá `src/renderer/src/plugins/types.ts` (`AsyncPluginContext` es el
`ctx` que recibe un plugin externo).

---

## 7. Buenas prácticas

- **Prefijá tus ids** con el id del plugin (`mi-plugin.algo`) para no chocar con otros.
- **Limpiá al desactivar:** devolvé una función desde `activate` que haga `dispose()` de todo lo registrado.
- **Nunca pises contenido del usuario:** usá `vault.createNote` (falla si existe) y escribí en la nota solo cuando el usuario lo pide (un comando).
- **Textos en español** y sin jerga técnica: Geode está pensado para cualquier persona.
- **Íconos:** Lucide por nombre, nunca emojis.
- **Errores claros:** si algo falla, `ctx.notify('No se pudo …')` o lanzá un `Error` con un mensaje accionable.

---

## 8. Probar y depurar

- Activar/desactivar un plugin requiere **reiniciar** Geode (por ahora).
- Si el plugin no carga, Ajustes → Plugins muestra el motivo (manifiesto inválido, `apiVersion` no soportada, etc.).
- Los `console.log` de tu plugin aparecen en las DevTools de Geode, dentro del contexto del iframe `plugin:<id>`.

## 9. Compartir tu plugin

Por ahora un plugin se comparte como **carpeta** (o `.zip` de la carpeta) que el
usuario copia en su carpeta de plugins. Incluí un README con qué hace, qué
permisos usa y capturas. La instalación desde un listado de la comunidad está en
el plan.
