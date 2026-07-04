# Phase 2: Go Back in Time - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

El usuario puede rebobinar toda la bóveda a cualquier versión pasada como una **vista previa de solo lectura** (todo el app —árbol, tabs, editor— refleja ese momento) y luego volver al presente o **traer ese momento de vuelta** ("Volver aquí") de forma lineal, sin perder nada y sin mover HEAD ni crear ramas/detached-HEAD.

Cubre: SOFT-01..06 (restauración lineal blanda), TIME-01..06 (timeline repo-level), SIDE-03 (sección Timeline en el sidebar, debajo de Notas).

Fuera de alcance: guardar versión con nombre humano (Fase 3), cadencia de auto-snapshots (Fase 4), Modo Avanzado / grafo / ramas visibles (Fase 5). La preview NO debe usar `git.checkout()` (force checkout + detached HEAD) — eso es Capa-2.
</domain>

<decisions>
## Implementation Decisions

### Mecanismo de preview (solo lectura, "estás en el pasado")
- **Preview virtual de solo lectura**: el árbol y el editor leen del árbol del commit vía un nuevo IPC "leer-en-commit"; el working dir y HEAD quedan intactos hasta "Volver aquí".
- El árbol de archivos también refleja el pasado (requiere un nuevo IPC "listar árbol en commit" que envuelva el `treeBlobs` privado de git.ts).
- Durante la preview el editor es **de solo lectura** (CodeMirror `readOnly`) con chrome de "pasado"; la única forma de editar es "Volver aquí" (SOFT-05).
- Modelo de estado: un único `previewOid` en App conmuta todas las fuentes de datos a leer-en-commit; `null` = presente en vivo.

### "Volver aquí" (traer el momento de vuelta) — SOFT-02/06
- Materializa escribiendo cada archivo del árbol previsualizado al working dir + borrando los archivos que no existían en esa versión — **HEAD no se mueve, sin rama, sin detached-HEAD** (generaliza el patrón `restoreVersion` → `vault.writeNote`).
- Antes de sobrescribir, si el working tree está sucio, tomar un **snapshot de seguridad (commit sin AI)** para no perder nada — mínimo aquí; la Fase 4 formaliza la cadencia.
- Tras materializar, el contenido viejo queda como **cambios pendientes** sobre la línea del presente; el usuario guarda después (Fase 3). Se reactiva la edición y se sale de la preview.
- Confirmación liviana, no bloqueante (toast/inline) ya que no se pierde nada — sin modal alarmante.

### Sección Timeline repo-level — SIDE-03, TIME-01..06
- Reutiliza el `SidebarSection` de la Fase 1 con `id="timeline"`, **debajo de Notas**, siempre disponible (no requiere una nota abierta).
- Fuente de historia: reutiliza **`git.graph()`** (repo-level, newest-first, con refs/HEAD) — misma fuente que VersionGraph; se retira el `TimelineScrubber` per-note.
- Etiqueta de entrada (TIME-03, nunca un hash): cadena de fallback **nombre humano/tag → mensaje (AI) del commit → fecha relativa**; la fecha relativa siempre visible como secundaria.
- "Qué cambió" (TIME-04): por entrada, mostrar los archivos cambiados en lenguaje humano (p. ej. "3 notas cambiadas: …") desde un diff por-commit.
- Transporte + marcado (TIME-05/06): transporte arriba de la sección: **paso atrás / paso adelante / saltar al presente**; la entrada más nueva siempre marcada "presente", la entrada previsualizada marcada con acento "viendo" — ambos persistentes para que la divergencia sea legible; mantener la entrada activa a la vista.

### Chrome de "pasado", tabs fantasma, salida — SOFT-03/04/05
- Chrome global inconfundible: un **banner superior** a lo ancho del app ("Estás viendo el pasado — {fecha/nombre}") con "Volver al presente" + "Volver aquí"; editor tintado/atenuado.
- Tab fantasma (SOFT-03): si la nota abierta no existía en el momento previsualizado, se conserva su tab como **fantasma** con un placeholder claro "no existía en este momento" en vez de contenido.
- Salida / saltar al presente (SOFT-04): snapshot del layout de panes/tabs/nota-abierta al entrar en preview; **restaurarlo exactamente** al salir.
- Al entrar en preview: flush de las ediciones pendientes a disco primero (reutilizar `flushAll`) para no perder nada en vuelo.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `git.graph(dir)` (git.ts:305) → `GitGraph` (commits newest-first con oid/message/timestamp/author/parents/lane, branches, tags, head, onCurrentLine, pushed). **Fuente única de la timeline repo-level.**
- `git.readAt(dir, oid, filepath)` (git.ts:523) / IPC `readNoteAt` — leer un archivo en un commit sin tocar working tree/HEAD. Primitivo de preview de un archivo.
- `git.treeBlobs(dir, ref)` (git.ts:645, privado) → `Map<path, blobOid>` del árbol completo en un commit. **Exponer vía nuevo IPC** para listar el árbol previsualizado.
- `git.commitDiff(dir, oid)` (git.ts:666) / IPC `commitDiff` → `FileDiff[]` (tree-vs-HEAD, solo lectura) — base para "qué cambió".
- Detección de cambios racy-git-safe: `pendingChanges`/`workBlobs`/`headBlobs` (git.ts:712-781) hashean contenido real vs blobs de HEAD — usar para saber si el working tree está sucio antes del safety snapshot.
- `App.restoreVersion(text)` (App.tsx:300) — patrón de restaurar-sin-mover-HEAD (`vault.writeNote` + `bumpPane` + `refreshGraph`). Generalizar a multi-archivo para "Volver aquí".
- `SidebarSection` (Fase 1) con `id="timeline"` — contenedor de la sección Timeline.
- Modelo de panes: `paneTree` helpers; `reloadNonces`/`bumpAll`/`bumpPane` para recargar panes desde disco; `syncPanesToTree(t)` (App.tsx:433) cierra tabs de archivos borrados; `flushAll()` (App.tsx:154) persiste panes a disco.
- `refreshTree()` (App.tsx:176) recarga el árbol vía `vault.tree()`.

### Established Patterns
- IPC tipado en `src/shared/ipc.ts` (canales `geode:*`, interfaz `GitApi`); handler en main/index.ts; superficie en preload; consumo vía `window.geode.git.*`. Nuevos canales necesarios: **listar árbol en commit** (envuelve `treeBlobs`) y posiblemente **restaurar-árbol-en-commit** (materializar "Volver aquí" en el main, escribiendo/borrando archivos sin mover HEAD) — o materializar en el renderer iterando readAt+writeNote.
- Renderer sandboxeado; sin acceso a fs; toda operación por IPC.
- Strings de UI y comentarios en español; iconos Lucide (History, Clock, etc.), nunca emojis.

### Integration Points
- `App.tsx` introduce el estado `previewOid` y conmuta las fuentes de datos (árbol, contenido del editor) según preview vs presente; renderiza el banner de "pasado"; snapshot/restore del layout de panes.
- La sección Timeline se inserta en el `<aside>` del sidebar debajo de la sección NOTAS (usando `SidebarSection`), sin desplazar el selector "Bóvedas" del fondo ni la ActivityBar.
- `TimelineScrubber.tsx` se retira (o se reduce) — su patrón noteHistory→readNoteAt→preview cacheada se generaliza a repo-level.
- Editor CodeMirror: pasar `readOnly` durante la preview.

### Landmines (de STATE.md / CONCERNS.md)
- **Racy-git**: la detección de cambios debe hashear contenido real vs blobs de HEAD — nunca statusMatrix (afecta el safety snapshot y el estado sucio).
- **No force checkout / no detached-HEAD**: el primitivo de soft-restore NO debe usar `git.checkout()` ni `goToVersion()`.
- App.tsx es un monolito grande con 40+ state vars y el modelo de panes — la preview toca muchas fuentes de datos; aislar el conmutador `previewOid` con cuidado.
- Cero cobertura de tests automatizados; operaciones git sin tests — verificación = `npm run typecheck` + UAT manual humana.
</code_context>

<specifics>
## Specific Ideas

- La preview es **no destructiva de verdad**: durante la vista previa NO se escribe nada a disco; solo "Volver aquí" escribe (y snapshotea el estado sucio antes).
- "Volver aquí" debe ser lineal: deja el contenido viejo como cambios pendientes sobre el presente (HEAD sin mover), preservando toda la historia.
- La entrada "presente" (más nueva) y la "viendo" (previsualizada) deben verse simultáneamente marcadas para que la divergencia durante el viaje en el tiempo sea legible (TIME-06).
- Reutilizar `git.graph()` como fuente única evita duplicar lógica de historia y mantiene consistencia con el (futuro, Modo Avanzado) VersionGraph.
</specifics>

<deferred>
## Deferred Ideas

- Guardar versión con nombre humano + descripción AI (Fase 3) — aquí las etiquetas de la timeline usan tag→mensaje→fecha, sin flujo de nombrado.
- Cadencia configurable de auto-snapshots y snapshots de seguridad formales antes de acciones riesgosas (Fase 4) — aquí solo el safety snapshot mínimo antes de "Volver aquí".
- Modo Avanzado (grafo DAG, ramas, hashes, branch switcher) (Fase 5) — la timeline de Capa-0 es lineal y sin hashes.
- Del backlog del usuario (fuera de este milestone salvo que se re-priorice): borrar elementos del sidebar con Del/Supr, deshacer/descartar una rama sin merge, status bar que crea una segunda línea al achicar la ventana.
</deferred>
