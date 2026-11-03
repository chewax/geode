# Cómo contribuir a Geode

¡Gracias por querer sumarte! Geode crece con cada reporte, idea y PR. Esta guía te cuenta cómo hacerlo de la forma más simple posible.

> **¿Primera vez contribuyendo a un proyecto abierto?** No hay problema. Buscá un issue con la etiqueta [`good first issue`](https://github.com/chewax/geode/labels/good%20first%20issue) y dejá un comentario: te ayudamos en el camino.

## Formas de ayudar

- **Reportar errores:** abrí un [issue de error](https://github.com/chewax/geode/issues/new?template=bug_report.yml) con los pasos para reproducirlo.
- **Proponer ideas:** abrí una [propuesta](https://github.com/chewax/geode/issues/new?template=feature_request.yml) o charlala primero en [Discussions](https://github.com/chewax/geode/discussions).
- **Escribir código:** arreglos, funciones nuevas, tests, rendimiento.
- **Documentación:** mejorar guías, corregir textos, agregar ejemplos.
- **Plugins:** crear plugins con la [API pública](docs/PLUGINS.md) y compartirlos.
- **Diseño y accesibilidad:** íconos, temas, contraste, navegación con teclado.

## Levantar el proyecto

Requisitos: **Node.js 22+** y **npm**. No hace falta tener git instalado para que la app funcione (usa isomorphic-git), pero sí para clonar el repo.

```bash
git clone https://github.com/chewax/geode.git
```

```bash
cd geode
```

```bash
npm install
```

```bash
npm run dev
```

Antes de abrir un PR, corré:

```bash
npm run typecheck
```

```bash
npm test
```

> Si `npm run dev` dice que Electron no está instalado, corré `node node_modules/electron/install.js`.

## Flujo de trabajo

1. **Hacé un fork** y creá una rama desde `main` con un nombre descriptivo (`arreglo/enlaces-con-punto`, `funcion/busqueda-por-propiedades`).
2. **Cambios chicos y enfocados:** un PR por tema es más fácil de revisar.
3. **Agregá tests** cuando toques lógica (`tests/`, con Vitest). Los módulos puros de `src/shared/` son ideales para testear.
4. **Abrí el PR** contra `main` completando la plantilla. Si cambia la interfaz, sumá una captura.
5. **Revisión:** puede que te pidamos ajustes; es parte normal del proceso.

Para cambios grandes (una función nueva, un cambio de arquitectura), abrí antes un issue o una discusión así acordamos el enfoque y no perdés trabajo.

## Convenciones

### Principios del producto

Geode tiene una regla que está por encima de todo: **nada de lo que escribe la persona puede perderse.** Cualquier operación que reescriba notas tiene que poder deshacerse (instantánea de seguridad, versión, copia). Y la técnica queda escondida: la interfaz no habla de commits, ramas ni merges salvo en el Modo Avanzado.

### Código

- **TypeScript estricto.** Tipos explícitos en funciones exportadas; `import type` para imports de solo tipos.
- **Comentarios y textos de la interfaz en español.** Términos técnicos (git, commit, blob) pueden quedar en inglés.
- **Íconos de [Lucide](https://lucide.dev/)**, nunca emojis.
- **Renderer aislado:** el renderer no accede a Node. Todo pasa por el contrato IPC de `src/shared/ipc.ts` (canales `geode:*`) y el preload (que tiene que seguir siendo CommonJS).
- **Detección de cambios por contenido:** compará hashes de contenido contra HEAD; no uses `statusMatrix` (pierde ediciones del mismo tamaño en el mismo segundo).
- **Escrituras atómicas** con `atomicWrite` para cualquier archivo de la bóveda.
- **La IA nunca se invoca sola** (por ejemplo en guardados automáticos): su costo lo ve la persona.
- Nombres: componentes en `PascalCase`, funciones y variables en `camelCase`, constantes en `UPPER_SNAKE_CASE`.

### Commits

Mensajes claros, en español o inglés, que expliquen **qué** cambia y **por qué**. Recomendamos el estilo [Conventional Commits](https://www.conventionalcommits.org/es/):

```
fix(enlaces): resolver notas con punto en el nombre

"[[Plan v1.0]]" se tomaba como un archivo con extensión ".0".
```

Tipos habituales: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`.

## Licencia de las contribuciones

Geode usa la [Mozilla Public License 2.0](LICENSE). Al enviar un PR aceptás que tu contribución se publique bajo esa misma licencia.

## Código de conducta

Queremos una comunidad amable y respetuosa. Al participar aceptás el [código de conducta](CODE_OF_CONDUCT.md).

## ¿Dudas?

Preguntá en [Discussions](https://github.com/chewax/geode/discussions). No hay preguntas tontas.
