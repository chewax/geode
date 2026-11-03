# Memoria para IA (servidor MCP)

Geode trae un servidor [MCP](https://modelcontextprotocol.io) para que un asistente de IA (Claude Code, Claude Desktop, Cursor u otro compatible) use una bóveda como **memoria de largo plazo**. Puede buscar y leer tus notas, y guardar lo que valga la pena recordar.

Lo que lo diferencia de la memoria propia de cada asistente:

- **La memoria es tuya**: son archivos Markdown en tu disco (y en tu GitHub si activaste el respaldo), no algo encerrado en un producto.
- **Sirve para cualquier modelo**: el mismo vault funciona con Claude, Cursor o un modelo local.
- **Todo cambio de la IA se puede auditar y deshacer**: cada escritura es una versión con la IA como autor, visible en la línea de tiempo.
- **Viaja entre computadoras**: lo que escribe la IA se respalda y sincroniza igual que lo que escribís vos.

## Conectarlo

En la app: **Ajustes → Memoria para IA**. Ahí está el comando listo para copiar para Claude Code y el bloque JSON para Claude Desktop o Cursor. Ambos lanzan el mismo binario de Geode en modo Node (`ELECTRON_RUN_AS_NODE=1`), así que no hace falta tener Node instalado:

```bash
claude mcp add geode --scope user -e ELECTRON_RUN_AS_NODE=1 -- "<Geode>" "<app>/out/main/mcp.js" --vault "<bóveda>"
```

Con Node instalado y el repo compilado también funciona `node out/main/mcp.js --vault <bóveda>`.

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `list_notes` | Rutas de todas las notas (o de una carpeta) |
| `search_notes` | Notas que contienen todas las palabras (sin tildes ni mayúsculas) |
| `read_note` | Contenido y `version` (oid del blob) de una nota |
| `write_note` | Crea o reescribe una nota completa; reescribir exige `expected_version` |
| `edit_note` | Reemplaza un fragmento exacto y único |
| `append_note` | Agrega al final (crea la nota si no existe) |
| `note_history` | Versiones de una nota con autor y fecha |
| `read_note_version` | Contenido de una nota en una versión pasada |

No hay borrar ni mover: la IA solo agrega y edita. Toda escritura pasa por la línea de tiempo.

## Concurrencia

El problema: la app (con su autosave), uno o varios servidores MCP (por ejemplo, Claude Desktop y Claude Code a la vez) y la sincronización con GitHub pueden tocar la misma bóveda al mismo tiempo, desde procesos distintos. isomorphic-git no protege el index ni los refs entre procesos.

La estrategia combina tres mecanismos. Cada uno cubre un hueco que los otros dejan:

1. **Un solo escritor a la vez (candado entre procesos).** `src/main/fs/vaultLock.ts` crea `.geode/write.lock` con `O_EXCL`, que es atómico en todos los SO. Lo toman los commits, el checkout, la restauración, la integración del sync, las escrituras de la IA y el autosave. Se sostiene solo lo que dura la operación, nunca mientras la app está abierta. Es reentrante dentro del mismo flujo asíncrono y se rompe solo si el proceso dueño murió. El autosave, si el candado tarda, **escribe igual**: lo tipeado por el usuario nunca se descarta por un candado trabado.

2. **Concurrencia optimista para la IA.** `read_note` devuelve la `version` de la nota y `write_note` sobre una nota existente la exige. Si la nota cambió desde que la IA la leyó (porque la editaste vos u otra IA), la escritura se rechaza con la versión actual y la IA tiene que releer. `edit_note` es seguro por construcción: falla si el fragmento ya no está. `append_note` no pisa nada.

3. **Nada sin versionar se pierde.** Antes de aplicar un cambio de la IA a una nota con ediciones tuyas todavía sin versionar, esas ediciones se versionan primero (con tu autor). Después el cambio de la IA va en un commit propio, **acotado a esa nota**, así nunca se lleva tus cambios en otras notas.

**Aviso a la app.** Tras cada commit, el MCP escribe `.geode/external-change.json`. La app abierta lo sondea (cada 1,5 s, sin sockets), recarga la nota y la línea de tiempo, muestra quién la cambió y dispara el respaldo. Si estabas tipeando justo en esa nota, el panel guarda lo tuyo antes de recargar: en disco queda tu versión y la de la IA queda en la historia.

### Alternativas descartadas

- **La app como único intermediario (socket local):** sería ideal con la app abierta, pero el MCP tiene que funcionar también con la app cerrada, y entonces igual hace falta el candado. Agrega un protocolo y un punto de falla más sin cubrir casos nuevos.
- **Solo el candado:** evita corromper el repo, pero no evita que la IA reescriba una nota con contenido viejo.
- **Solo concurrencia optimista:** no protege el index de git de dos commits simultáneos.
- **Rama aparte para la IA:** máxima seguridad, pero obliga a "integrar" a mano y rompe la idea de memoria compartida inmediata. Se puede sumar más adelante como opción.

## Limitaciones conocidas

- Con la app cerrada, lo que escribe la IA queda versionado localmente y se sube a GitHub la próxima vez que abrís Geode. El MCP no tiene acceso al token de GitHub, que está cifrado con `safeStorage` y solo lo lee la app.
- Por lo mismo, con la app cerrada el MCP no trae lo que otras computadoras subieron.
- En la línea de tiempo, las versiones de la IA se reconocen por el autor y el prefijo `IA:` en el mensaje. Una marca visual propia queda para una segunda vuelta.
