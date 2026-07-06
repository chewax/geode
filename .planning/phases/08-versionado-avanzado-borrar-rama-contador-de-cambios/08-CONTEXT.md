# Phase 8: Versionado avanzado — borrar rama + contador de cambios - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Dos superficies de control del versionado para el usuario: (VER-01) borrar/descartar una rama sin mergearla, de forma segura y descubrible, desde el grafo de versiones (Modo Avanzado), con un diálogo de confirmación estilizado; y (CHG-01) un contador de líneas sin commitear (+N/-N, verde/rojo) siempre visible en la status bar. NO incluye rebase/cherry-pick ni DAG surgery; VER-01 es solo borrar una rama.

</domain>

<decisions>
## Implementation Decisions

### Borrar/descartar rama (VER-01)
- **La capacidad YA existe** (`git.deleteBranch`): protege `main`, y si es la rama actual cambia primero a su base antes de borrarla (se descarta sin mergear). El problema real es **discoverability** — hoy el único punto de entrada es el menú del `VersionGraph`, que es solo-Modo-Avanzado.
- Decisión: **mejorar la acción del menú del grafo** (único punto de entrada), haciéndola más clara/visible — NO agregar entradas nuevas en el BranchSwitcher ni el toolbar.
- Reemplazar el `window.confirm`/`window.alert` de `deleteBranch` (App.tsx) por un **diálogo estilizado** (Lucide/español, patrón `ConfirmDeleteDialog` de Fase 6/7): botón **rojo** cuando la rama tiene trabajo sin mergear (`merged === false`) con aviso explícito de que se pierden versiones; texto más suave cuando ya está mergeada; **Cancelar autofocus, Enter no borra, Escape cancela** (seguridad de teclado de Fase 6 CR-01).
- Protección de `main` intacta (nunca borrable; el intento ya lanza mensaje claro).

### Contador de líneas sin commitear (CHG-01)
- **Siempre visible** (estilo VSCode), para todos los usuarios — no gateado por Modo Avanzado. `+N` en verde (agregadas), `-N` en rojo (quitadas). Aparece solo cuando hay cambios pendientes; desaparece con el vault limpio.
- Cuenta **todos los archivos pendientes** (no solo `.md`): adjuntos y demás incluidos.
- Vive en la **status bar**. Se actualiza al editar y al guardar (mismos momentos en que hoy se refresca el estado de guardado / el árbol).

### Claude's Discretion
- Cómo se computa el +N/-N: nuevo método en `git.ts` (p.ej. `pendingLineStat(dir): { added, removed }`) que suma líneas +/- de todos los cambios pendientes (contenido actual vs blob de HEAD, o vía jsdiff), expuesto por un canal IPC `geode:git-*`. Reusar la maquinaria de `pendingChanges`/`commitDiff` existente; no reintroducir statusMatrix (regla racy-git).
- Ubicación exacta en la status bar (junto a palabras/caracteres/líneas en `status-left`, o cerca del estado de guardado) y el formato visual, a criterio respetando convenciones.
- Nombre/forma del componente de diálogo de rama (reusar/adaptar `ConfirmDeleteDialog` o uno nuevo análogo).

</decisions>

<code_context>
## Existing Code Insights

### VER-01 — la lógica existe; falta diálogo estilizado + visibilidad
- `src/main/services/git.ts` `deleteBranch(dir, name)` (~429): protege `PROD`/`main`; si es la rama actual hace `checkout` a la base (o main) con `force:true` y luego `git.deleteBranch`; limpia branch meta. **No requiere cambios** (o mínimos).
- `src/renderer/src/App.tsx` `deleteBranch(name, merged)` (~778): hoy `window.confirm` (aviso según `merged`) + `window.geode.git.deleteBranch(name)` + `window.alert` en error + refresca árbol/grafo/github. **Cambiar** el confirm/alert por el diálogo estilizado.
- `src/renderer/src/VersionGraph.tsx` + App `onDeleteBranch={deleteBranch}` (~1256): el menú de ramas del grafo es el punto de entrada; ahí se computa `merged`. Mejorar la claridad/visibilidad de la opción.
- `src/renderer/src/ConfirmDeleteDialog.tsx` / `ConfirmRemoveVaultDialog.tsx` (Fase 6/7): patrón de diálogo destructivo a reusar (rojo, Cancelar autofocus, Enter no confirma).

### CHG-01 — contador nuevo apoyado en maquinaria existente
- `src/main/services/git.ts`: `pendingChanges(dir)` (~853, file-level {filepath, deleted}), `pendingDiff(dir)` (~755, patch concatenado SOLO .md), `commitDiff(dir, oid)` (~807, patch por archivo con jsdiff). Base para un nuevo `pendingLineStat(dir): { added, removed }` sobre TODOS los pendientes (no solo .md). Content-hash vs HEAD (nunca statusMatrix).
- `src/shared/ipc.ts` `GitApi`: agregar el canal (`geode:git-pending-linestat` o similar) + método tipado; `src/preload/index.ts` bridge.
- `src/renderer/src/App.tsx` status bar (`footer.statusbar`, ~1084): `status-left` tiene palabras/caracteres/líneas y el `save-status` (STAT-01). El contador +N/-N va acá; se recomputa en los mismos puntos donde se refresca el estado (onSaved/onChange/refreshTree).

### Established Patterns
- Diálogos propios Lucide/español; iconos Lucide; clases kebab-case; strings/comentarios en español.
- IPC tipado `geode:*` (los canales de plugins usan prefijo `plugins:`; git usa `geode:git-*`).
- Detección de cambios SIEMPRE por content-hash vs blobs de HEAD (regla racy-git; no statusMatrix).

### Integration Points
- El diálogo de borrar rama se dispara desde el menú del grafo (igual que hoy), solo que estilizado; tras borrar, refrescar árbol/grafo (ya se hace).
- El contador +N/-N lee `pendingLineStat` y se muestra en la status bar; se refresca junto al estado de guardado.

</code_context>

<specifics>
## Specific Ideas

- El usuario reportó "no me deja borrar una rama": es discoverability (la acción existe pero escondida en el grafo Avanzado) — la fase la hace clara + segura, no la crea de cero.
- +N/-N siempre visible (VSCode-like) fue elección explícita del usuario, aun sabiendo que es info técnica; convive con el estado de guardado humano.

</specifics>

<deferred>
## Deferred Ideas

- Rebase / cherry-pick / mover trabajo entre ramas — fuera de alcance (Modo Avanzado, otro hito si acaso).
- Entradas de borrar-rama en BranchSwitcher/toolbar — descartadas: un solo punto de entrada (grafo).

</deferred>
