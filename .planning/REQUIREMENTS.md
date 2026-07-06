# Requirements: Geode — v1.1 Explorador y gestión de archivos

**Defined:** 2026-07-06
**Core Value:** Non-destructive editing — nothing is ever lost and the git plumbing stays invisible to non-technical users.

## v1.1 Requirements

Paridad tipo VSCode para el explorador de archivos y la gestión de bóvedas. Cada requisito mapea a una fase del roadmap.

### Operaciones del árbol lateral (teclado + sync)

- [x] **FILE-01**: El usuario puede borrar el elemento seleccionado del árbol lateral con Del/Supr; el borrado es recuperable (queda en el historial de versiones) y nunca elimina contenido de forma irreversible sin un aviso claro.
- [x] **FILE-02**: El usuario puede renombrar un archivo o carpeta del árbol lateral con F2 mediante edición inline, con validación de nombre y sin perder el estado de tabs/edición abiertos.
- [x] **FILE-03**: El usuario puede refrescar el árbol para reflejar cambios hechos por fuera de la app (archivos creados, movidos, renombrados o borrados desde el explorer del sistema operativo), sin reiniciar la app.

### Tabs y bóvedas

- [ ] **FILE-04**: Un solo click sobre una nota la abre en una tab de "preview" temporal (visualmente distinta, no permanente, reutilizable); un doble click o cualquier edición fija la tab como permanente — comportamiento tipo VSCode.
- [ ] **FILE-05**: El usuario puede eliminar una bóveda: quitarla de la lista de bóvedas conocidas siempre, con la opción de borrarla también del disco tras un aviso explícito e inequívoco.

## Future Requirements

Diferidos a hitos futuros (del ToDo del usuario, tracked pero fuera de este hito):

### Edición Markdown enriquecida

- **EDIT-xx**: barra de formato (toolbar markdown), editor de tablas, insertar imágenes fácil, hiperlinks/block links, diagramas Mermaid en preview (plugin), pantalla de ayuda funcional.

### Power-user: versionado + plugins

- **VER-xx**: deshacer/borrar una rama sin mergear; recuento de líneas sin commitear (+N/-N) en la status bar; IA opcional para título/descripción de snapshots automáticas.
- **PLUG-xx**: blindar el sandbox de plugins (Fase B), desactivar plugins internos.

### Capa 1 / conflictos (del hito v1.0)

- **CAPA1-01**: "probar una versión nueva" → luego "conservar"/"descartar", sin nombres técnicos (branch/merge por debajo).
- **CONF-01**: manejo de conflictos en lenguaje humano en divergencia de sync (nunca mostrar marcadores; conservar ambos lados).

### Otros

- **VOICE-xx**: dictado de notas por voz (speech-to-text) con hook global sin foco en el editor — su propio hito (permisos de micrófono, motor STT).

## Out of Scope

Excluido explícitamente de v1.1 para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Watcher de FS en tiempo real automático | FILE-03 empieza como refresh manual (comando/botón); el auto-watch (chokidar/fs.watch) es un incremento posterior si el manual no alcanza |
| Papelera/undo global del SO | El borrado es recuperable vía historial git; una papelera separada duplica el mecanismo |
| Renombrar/mover por drag-and-drop | F2 (FILE-02) cubre el rename; el DnD de reorganización es un feature aparte |
| Multi-selección en el árbol | Las operaciones apuntan al elemento seleccionado individual; batch es futuro |

## Traceability

Qué fases cubren qué requisitos. Se completa al crear el roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FILE-01 | Phase 6 | Complete |
| FILE-02 | Phase 6 | Complete |
| FILE-03 | Phase 6 | Complete (06-02) |
| FILE-04 | Phase 7 | Pending |
| FILE-05 | Phase 7 | Pending |

**Coverage:**

- v1.1 requirements: 5 total
- Mapped to phases: 5/5 ✓ (Phase 6: FILE-01/02/03 · Phase 7: FILE-04/05)
- Orphaned: none

---
*Requirements defined: 2026-07-06 · Roadmap mapped: 2026-07-06*
