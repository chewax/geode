# Phase 7: Tabs de preview y gestión de bóvedas - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Dos capacidades independientes que cierran el hito v1.1: (FILE-04) tabs de preview estilo VSCode — 1 click abre una nota en una tab temporal reutilizable (itálica), doble click o edición la fija como permanente; y (FILE-05) baja de bóveda — quitarla de la lista de conocidas siempre, con opción secundaria de borrarla del disco (a la papelera del SO) tras un aviso explícito. NO incluye drag-and-drop de tabs (ya existe), ni multi-selección, ni cerrar/pin masivo.

</domain>

<decisions>
## Implementation Decisions

### Tab de preview (FILE-04)
- **1 click** sobre una nota (en el árbol) la abre en una **tab de preview**: visualmente en **itálica**, y **reutilizable** — el siguiente click sobre otra nota **reemplaza esa misma tab** en vez de acumular (una sola preview por panel).
- Se **fija como permanente** (deja de ser itálica/reutilizable) con: **doble click** sobre la nota en el árbol, **cualquier edición** de su contenido, **o doble click sobre la propia tab** (atajo extra tipo VSCode).
- Si la nota ya está abierta como tab permanente, 1 click solo la activa (no crea preview).

### Baja de bóveda (FILE-05)
- **Dos niveles:** acción primaria **"Quitar de la lista"** (segura, saca la bóveda del selector, NO toca archivos del disco) y, dentro del diálogo de confirmación, una opción secundaria explícita **"Eliminar también del disco"**.
- El borrado de disco va **a la papelera del SO** vía `shell.trashItem` de Electron (recuperable) — coherente con "nada se pierde": la bóveda incluye `.git` (todo el historial), que un `rm` permanente destruiría; la papelera da red de seguridad.
- La acción vive **en la lista del `VaultSwitcher`** (el disclosure inline bajo la cabecera de bóveda): cada bóveda conocida expone la acción (icono trash al hover o menú contextual), cerca de donde ya se cambia de bóveda.
- Aviso de confirmación **estilizado** (Lucide/español, patrón `ConfirmDeleteDialog` de la Fase 6), con el borrado de disco claramente diferenciado (destructivo) del simple "quitar de la lista".

### Claude's Discretion
- Qué pasa al dar de baja la bóveda **actualmente abierta**: cambiar a la más reciente de las restantes, o mostrar el estado "sin bóveda" si no queda ninguna (comportamiento obvio, a criterio).
- Forma exacta del campo de preview en el modelo de panes (p.ej. `preview: string | null` en `LeafPane`) y cómo se propaga el pin; el afijo visual (itálica) y el hover/menú del VaultSwitcher, a criterio respetando convenciones.
- Si "quitar de la lista" y "eliminar del disco" son dos botones en un mismo diálogo o un checkbox — a criterio, siempre que el borrado de disco requiera intención explícita.

</decisions>

<code_context>
## Existing Code Insights

### FILE-04 (preview tabs) — requiere agregar el concepto de preview
- `src/renderer/src/paneTree.ts`: `LeafPane` tiene `tabs: string[]` + `active`, pero **no** hay concepto de preview. Hay que agregar (p.ej.) `preview: string | null` a `LeafPane` y ajustar las operaciones puras (`openInLeaf` ~85, `mapLeaves`, `updateLeaf`, remoción de tabs) para preservar/limpiar el preview. Los `id` de hojas son estables (no romper eso).
- `src/renderer/src/App.tsx`: los handlers `onNoteOpen`/`onSelectTab`/`selectTab`/`openNote` y `onPaneNoteChange` (edición) son los puntos donde distinguir 1-click (preview) vs doble-click/edición (pin). El árbol (`FileTree`) hoy hace `onOpen` en click; hay que sumar la distinción single/double y el "editar fija".
- `src/renderer/src/PaneView.tsx` / la barra de tabs: render de la tab en itálica cuando es la preview; doble click sobre la tab la fija.

### FILE-05 (baja de bóveda) — requiere IPC nuevo + shell.trashItem
- `src/shared/ipc.ts`: `VaultApi` (línea 116) tiene open/current/list/switch/clone/create pero **no** un `remove`. Agregar algo como `remove(root, { fromDisk }): Promise<...>` con canal `geode:vault-remove` (prefijo geode:).
- `src/main/services/settings.ts`: `knownVaults[]` es la lista; agregar un método para quitar una ruta. `src/main/index.ts`: handler que quita de knownVaults y, si `fromDisk`, llama `shell.trashItem(absPath)` (import de `electron`). Manejar el caso de dar de baja la bóveda activa (setRoot a otra o a null).
- `src/renderer/src/VaultSwitcher.tsx`: la lista inline de bóvedas conocidas (Fase 1) — sumar la acción de baja por ítem (hover trash / menú) + el diálogo de confirmación.
- `src/renderer/src/ConfirmDeleteDialog.tsx` (Fase 6): patrón de diálogo destructivo a reusar/adaptar.

### Established Patterns
- Config global en settings.json + IPC tipado `geode:*` + `window.geode.*`; preload CommonJS.
- Diálogos propios (Lucide/español), iconos Lucide, clases kebab-case, strings/comentarios en español.
- `paneTree` = transformaciones puras, ids estables (React preserva el montaje del editor).

### Integration Points
- Preview: un solo lugar de verdad en `paneTree` (`preview` por hoja); App decide setear/pinnear; PaneView lo pinta.
- Baja de bóveda: VaultSwitcher → `window.geode.vault.remove` → main (knownVaults + shell.trashItem) → refrescar lista/bóveda activa.

</code_context>

<specifics>
## Specific Ideas

- Paridad VSCode para preview: itálica, una sola preview por panel, pin por doble-click/edición.
- Valor central: el borrado de bóveda va a la papelera del SO (recuperable), nunca `rm` permanente por defecto; "quitar de la lista" jamás toca el disco.

</specifics>

<deferred>
## Deferred Ideas

- Drag-and-drop / reorden de tabs (ya existe), multi-selección, pin masivo — fuera de alcance.
- Watcher de FS, papelera interna de notas — de fases/hitos anteriores, no acá.

</deferred>
