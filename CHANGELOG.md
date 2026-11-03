# Registro de cambios

Todos los cambios relevantes de Geode se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [1.0.1] - 2026-11-03

### Cambiado
- **Nuevo cuaderno sin cuenta**: el selector de cuadernos ahora tiene "Nuevo cuaderno…", que crea un cuaderno local versionado sin conectar GitHub. El respaldo en la nube queda como opción en las otras pestañas del diálogo.
- El diálogo "Nuevo cuaderno" muestra la **ubicación** y la ruta final antes de crear; "Cambiar…" solo elige la carpeta y el cuaderno se crea adentro, como subcarpeta con su nombre.
- Al crear un cuaderno (local o respaldado) se abre automáticamente con su nota de bienvenida.
- Los cuadernos creados con respaldo en GitHub ya nacen con su primera versión y se suben enseguida.
- La interfaz habla siempre de "cuadernos" (antes mezclaba "bóveda" y "vault").

### Corregido
- Crear un cuaderno en la raíz de una unidad de Windows (p. ej. `D:\`) fallaba con un falso error de permisos.
- "Crear y abrir" ignoraba la ubicación elegida y siempre creaba el cuaderno en Documentos/Geode.

## [1.0.0] - 2026-11-03

### Agregado
- **Interfaz en inglés**: Ajustes → General → Idioma (o el del sistema). La IA responde en el idioma elegido.
- **Abrir nota por nombre** (Ctrl+O, reasignable): búsqueda difusa, recientes y favoritas primero; crea la nota si no existe.
- **Fórmulas matemáticas** (`$…$` y `$$…$$`) con KaTeX, como plugin integrado que se puede desactivar, con dos botones en la barra de formato (fórmula en el texto y bloque de fórmula).
- La página del proyecto (`site/`) muestra las fórmulas LaTeX, los diagramas Mermaid y la exportación a PDF.
- **Notas al pie** (`[^1]`).
- **Búsqueda por propiedades**: `estado:pendiente`, `cliente:"Acme"`, `fecha:>2026-01-01`, `prioridad:` y negación con `-`.
- **Exportar a PDF** una nota, con el mismo dibujo que la vista previa.
- **Favoritas** por bóveda, en el menú del explorador, la paleta y la barra lateral.
- **Memoria para IA (MCP)**: servidor MCP incluido para que Claude, Cursor u otros asistentes usen la bóveda como memoria (buscar, leer, escribir, editar, agregar e historial). Cada escritura de la IA es una versión con su propio autor; se configura desde Ajustes → Memoria para IA.
- **Organizar con IA**: el servidor MCP suma `move_note` (mover o renombrar notas y carpetas actualizando los enlaces), `archive_note` (archivar en lugar de borrar), `list_tags`, `backlinks` y la búsqueda por `#etiqueta`.
- Candado entre procesos por bóveda (`.geode/write.lock`): la app, los servidores MCP y el sync nunca escriben el repo a la vez.
- **Búsqueda de texto completo** en toda la bóveda (Ctrl+Shift+F), sin tildes ni mayúsculas, con resultados descartables y búsqueda por `#etiqueta`.
- **Enlaces `[[wiki]]`** con autocompletado, enlaces entrantes y actualización automática de enlaces al renombrar o mover notas.
- **Imágenes y adjuntos**: pegar o arrastrar, guardados en la bóveda y versionados.
- **Etiquetas** (anidadas) y **propiedades** editables sin ver YAML.
- **Notas diarias** (Ctrl+Shift+D) y **plantillas**.
- **Tema claro**, además del oscuro.
- **Sync entre computadoras** con resolución de conflictos sin pérdida: si dos computadoras editan lo mismo, se guarda una copia «(versión de la nube)».
- **Barra de formato** y **tablas** (grilla para insertar, Tab entre celdas, editor visual).
- **Importar bóvedas de Obsidian**: carpeta de adjuntos, enlaces Markdown, callouts, `==resaltado==`, `%%comentarios%%` e incrustaciones.
- **Plugins de la comunidad** aislados en iframes (API v2 asíncrona) con **bloques de código propios** en la vista previa.
- **Mermaid** integrado.
- **Dictado por voz** con atajo global (Ctrl+Alt+Espacio) y transcripción con OpenRouter.
- **Atajos de teclado reasignables** en Ajustes → Atajos: el global del dictado, guardar versión, paleta, búsqueda, nota de hoy, nueva nota (Ctrl+N), nueva carpeta (Ctrl+Shift+N), dividir, IA y formato. Si el sistema no deja registrar un atajo global (otra app lo usa), se avisa y se puede elegir otro sin reiniciar.
- **IA con tu suscripción**: además de OpenRouter con tu clave, Geode puede usar Claude, ChatGPT o Gemini a través de su programa oficial (Claude Code, Codex CLI o Gemini CLI) ya instalado y con sesión iniciada.
- **Vista previa en vivo** sincronizada entre paneles.
- Nuevo **logo**: una geoda low poly.
- Tests automáticos con Vitest.
- README, guía de contribución, código de conducta, política de seguridad, plantillas de issues y PRs, e integración continua.

### Cambiado
- El renderer ya no usa `unsafe-eval`: los plugins se sirven desde un protocolo propio con su propia CSP.
- Licencia: el proyecto pasa a publicarse bajo **MPL 2.0**.

### Corregido
- Viajar en el tiempo con notas abiertas que todavía no existían ya no registra errores en la consola.
- Los colores hexadecimales (`#fff`, `#1e1e2e`) ya no se cuentan como etiquetas.
- Las notas con un punto en el nombre («Plan v1.0») se resuelven bien como destino de enlaces.
- Los enlaces entrantes se actualizan después de renombrar.
- Dependencias actualizadas por avisos de seguridad.

## [0.8.1]

### Agregado
- Arrastrar y soltar notas entre carpetas del explorador.
- **Onboarding guiado**: «Crear mi primer cuaderno» y recorrido inicial.
- **Modo Avanzado** (opcional): ramas, grafo de versiones y operaciones de git visibles para quien las quiera.
- Explorador y gestión de archivos: crear, renombrar, mover y borrar con instantánea de seguridad.
- Activar y desactivar plugins integrados; IA opcional en guardados automáticos (solo si hay cambios).

## [0.6.0]

### Agregado
- **Línea de tiempo** y viaje en el tiempo de toda la bóveda, con «Volver aquí» no destructivo.
- Respaldo en la nube en un repositorio privado de GitHub (inicio de sesión por código de dispositivo).

## [0.5.0]

### Agregado
- Plugins externos independientes (carga desde la carpeta de plugins).

## [0.4.0]

### Agregado
- **Sistema de plugins** (API v1): comandos, paneles, barra de estado y eventos.

## [0.3.1]

### Agregado
- Grafo de versiones más legible e ícono de la app.
- Empaquetado con instalador.

## [0.3.0]

### Agregado
- Editor estable, diferencias por versión, modo vista previa y ramas manuales.

## [0.2.0]

### Agregado
- Mejoras de la primera versión local.

## [0.1.0]

### Agregado
- Primera versión: notas Markdown locales con versionado automático sobre isomorphic-git.

[Sin publicar]: https://github.com/chewax/geode/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/chewax/geode/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/chewax/geode/compare/v0.8.0...v1.0.0
[0.8.1]: https://github.com/chewax/geode/compare/v0.6.0...v0.8.0
[0.6.0]: https://github.com/chewax/geode/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/chewax/geode/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/chewax/geode/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/chewax/geode/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/chewax/geode/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/chewax/geode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/chewax/geode/releases/tag/v0.1.0
