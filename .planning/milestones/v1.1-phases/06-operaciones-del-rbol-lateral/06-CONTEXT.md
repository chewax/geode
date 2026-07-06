# Phase 6: Operaciones del árbol lateral - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

El usuario opera el árbol lateral con el teclado — borrar (Del/Supr) y renombrar (F2) el elemento seleccionado — y mantiene el árbol sincronizado con cambios hechos por fuera de la app (explorer del SO), sin perder nada. Cubre FILE-01, FILE-02, FILE-03. NO incluye tabs de preview ni baja de bóvedas (Fase 7), ni drag-and-drop, ni multi-selección (Out of Scope).

</domain>

<decisions>
## Implementation Decisions

### Borrado (FILE-01)
- Al borrar una nota/carpeta: **se elimina del disco tras un aviso de confirmación**; como la bóveda es un repo git, el contenido sigue **recuperable desde una versión anterior del timeline** (no se agrega papelera interna separada — la recuperación es 100% vía el historial ya existente).
- **Siempre pedir confirmación** antes de borrar (tanto notas sueltas como carpetas).
- La confirmación actual usa `window.confirm` nativo; se debe reemplazar por un **diálogo con estética propia (Lucide, español)** consistente con `BranchDialog`/`CommitDialog`, para no romper la UX (los glyphs/diálogos nativos no están permitidos por convención). Igual para el `window.alert` de error de rename.

### Renombrar (FILE-02)
- **F2** sobre el elemento seleccionado/enfocado del árbol inicia la **edición inline** (reusa `NameInput` + `editingPath` + `renameNode`, que ya existen y ya remapean tabs/selección y validan nombre). El gap real es el **trigger F2** (hoy `editingPath` solo se setea al crear un archivo/carpeta).
- Al renombrar, las tabs abiertas y la selección deben sobrevivir (ya implementado en `renameNode`); mantener ese comportamiento.

### Refrescar (FILE-03)
- **Botón de refresh en la cabecera de la sección NOTAS** (icono Lucide, p.ej. `RefreshCw`) **y** auto-refresh cuando la ventana de Geode **recupera el foco** (caso típico: editaste por fuera y volvés). Reusa `refreshTree()` que ya existe.
- El refresh es una re-lectura de la bóveda desde disco (no un watcher de FS en tiempo real — eso quedó Out of Scope). No debe pisar ediciones sin guardar en curso (respetar el journal/pending).

### Claude's Discretion
- Forma exacta del diálogo de confirmación (texto, iconos Lucide), y si el auto-refresh al enfocar hace un diff mínimo o un re-render completo, a criterio, respetando convenciones.
- Manejo de la tecla en distintos teclados: `Delete` cubre "Supr" en teclados español; evaluar si sumar `Backspace` (macOS) sin romper la edición inline.

</decisions>

<code_context>
## Existing Code Insights

**IMPORTANTE: gran parte de la infraestructura YA EXISTE — esta fase es mayormente wiring/polish, no construcción desde cero.**

### Reusable Assets (ya implementados)
- `src/renderer/src/FileTree.tsx` — props `onRename`/`onRenameCancel`/`onDelete`, `editingPath`, componente inline `NameInput` (Enter confirma, Escape cancela, blur confirma), y `onKeyDown` que ya maneja la tecla `Delete` → `onDelete(node)` (línea ~76). **Falta:** manejar `F2` → iniciar rename del nodo enfocado.
- `src/renderer/src/App.tsx`:
  - `renameNode(node, rawName)` (~467): rename completo con validación (strip `\/`, vacío, fuerza `.md`), **remapeo de tabs y selección**, y `refreshTree()`. Ya cumple "las tabs sobreviven al renombrado".
  - `deleteNode(node)` (~495): `window.confirm` + `vault.delete(node.path)` + actualiza panes/selección + `refreshTree()`. Ya cumple borrado con confirmación; **falta** cambiar `window.confirm`→diálogo Lucide.
  - `editingPath`/`setEditingPath` (~118): hoy se setea solo al crear (`createNote`/`createFolder`); F2 debe setearlo para un nodo existente.
  - `refreshTree(oidOverride?)` (~190): re-lee `window.geode.vault.tree()` (o `git.treeAt` en preview). Existe; **falta** un trigger de usuario (botón en cabecera NOTAS) y un listener de `window` `focus`.
- `src/main/services/vault.ts` — `rename(fromRel, toRel)` (~146) y `deletePath(relPath)` (~156, `rm` recursive+force) con `resolveInside` (guard de path traversal). Backend completo; probablemente no requiera cambios.
- La cabecera de la sección NOTAS (SidebarSection de la Fase 1) es donde viven las acciones de notas — ahí va el botón de refresh.

### Established Patterns
- Diálogos propios: `CommitDialog`/`BranchDialog` (modal-overlay, español, Lucide) — modelo para el diálogo de confirmación de borrado.
- Iconos Lucide monocromo; strings/comentarios en español; clases CSS kebab-case.
- IPC ya expone `window.geode.vault.rename/delete/tree`.

### Integration Points
- FileTree `onKeyDown`: agregar rama `F2` → nuevo callback `onStartRename(node)` que en App hace `setEditingPath(node.path)`.
- Cabecera NOTAS: botón refresh → `refreshTree()`.
- `window.addEventListener('focus', …)` en un `useEffect` de App → `refreshTree()` (con cleanup).

</code_context>

<specifics>
## Specific Ideas

- Paridad tipo VSCode: F2 = renombrar, Del/Supr = borrar, refresh manual + al enfocar.
- El valor central manda: ningún borrado destruye contenido de forma irrecuperable — vive en el historial git; solo se pide confirmación explícita antes de tocar el disco.

</specifics>

<deferred>
## Deferred Ideas

- Watcher de FS en tiempo real (auto-detección sin refocus) — Out of Scope de v1.1.
- Papelera interna `.geode/trash` — descartado; la recuperación es vía historial.
- Drag-and-drop para mover/reorganizar y multi-selección — futuros.

</deferred>
