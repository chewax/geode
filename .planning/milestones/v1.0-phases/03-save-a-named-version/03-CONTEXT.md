# Phase 3: Save a Named Version - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Reencuadrar el guardado de una versión como **ponerle un nombre a un momento en el tiempo**, no como hacer un commit de git. Al guardar, el usuario recibe un **título opcional** (el nombre humano del momento) y una **descripción generada por IA** discriminada del título; con IA deshabilitada la descripción queda vacía. El flujo por defecto no muestra jerga de git ni una lista de archivos encuadrada como commit. Cubre SAVE-01, SAVE-02, SAVE-03. Modo MVP.

Fuera de alcance: snapshots automáticos (Fase 4), modo avanzado / toggle de git (Fase 5), historial por-nota.
</domain>

<decisions>
## Implementation Decisions

### Modelo de datos: título + descripción (Área 1 — con override del usuario)
- **El nombre humano es el TÍTULO = primera línea del mensaje del commit** — NO un tag de git. Motivo: los tags deben ser únicos y no admiten repetición; el título del mensaje sí puede repetirse y no tiene esa restricción. (Corrige la propuesta inicial de usar `addTag`.)
- **La descripción es el CUERPO del mensaje** (líneas siguientes a la primera), generada por IA (SAVE-02).
- La IA debe **generar título Y descripción discriminados** en una sola pasada (título corto en la 1ª línea + descripción en el cuerpo), no un único bloque de una línea como hoy. Requiere un método/prompt nuevo en el proveedor de IA (p. ej. `generateNamedVersion(diff) → { title, description }`) o un formato de salida parseable.
- **`entryLabel` (timeline) debe mostrar solo la PRIMERA LÍNEA (título)** del mensaje, no el mensaje completo. Hoy devuelve `c.message.trim()` entero; ajustarlo a la primera línea.
- El título es **opcional y editable**: la IA lo propone, el usuario puede sobrescribirlo o vaciarlo.

### Fix del bug de IA: el diff toma cambios no-nota del repo (Área 1)
- **Bug confirmado:** `pendingDiff` (que alimenta a `ai.suggestMessage`) usa `pendingChanges`, que solo filtra `IGNORED_TOP` (.git/.geode/node_modules/.obsidian) e incluye **todos** los archivos cambiados. En cambio el timeline (`changedFiles`, git.ts:606) sí filtra a `.md`. Por eso la IA describe cambios de archivos que no son notas.
- **Fix:** `pendingDiff` debe **filtrar a notas `.md`** (consistente con `changedFiles`/`changedSummary`), para que la generación describa solo contenido de notas.

### UX del diálogo — sin jerga git (Área 2 — aceptada)
- Título del diálogo: **"Guardar versión"**, con copy centrado en "ponle un nombre a este momento".
- Reemplazar la lista de archivos commit-framed por un **resumen humano** "N notas cambiadas" (reusar `changedSummary`), no rutas de archivo.
- **Quitar** la advertencia "versión permanente en el historial (ledger)" — es jerga técnica; guardar debe sentirse liviano.
- Orden de campos: **Nombre/título (opcional, arriba, autofocus)** → descripción IA editable debajo.

### Comportamiento de IA y guardado (Área 3 — aceptada)
- Con IA lista al abrir el diálogo: **autogenerar** título + descripción (como hoy autogenera el mensaje).
- La descripción (y el título) generados son **editables** por el usuario.
- Con IA deshabilitada: título y descripción **vacíos**, el guardado igual procede (SAVE-02); el usuario puede escribir un título a mano.
- **Permitir guardar sin nombre y sin descripción** (IA off): la versión queda identificada por fecha relativa (el fallback final de `entryLabel`). Nada bloquea guardar.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/CommitDialog.tsx` — el diálogo de guardado actual (pide "Mensaje", autogenera con IA, muestra lista de archivos + advertencia de ledger). Es el punto de reencuadre para SAVE-01/03.
- `src/main/services/ai.ts` — `OpenRouterProvider.generateMessage(diff)` con `SYSTEM_PROMPT` (resumen de una línea) y `toOneLine()`. Base para el nuevo generador título+descripción.
- `src/renderer/src/time/labels.ts` — `entryLabel(commit, tags)` (fallback tag→mensaje→fecha; ajustar a primera-línea) y `changedSummary(names)` ("N notas cambiadas").
- `git.ts`: `pendingDiff` (diff para IA — filtrar a .md), `changedFiles`/`changedSummary` (ya filtran .md), `commit()`, `changes()`.
- `App.tsx`: `openCommitDialog` / `doCommit` (flujo actual de guardado), estado `commitChanges`.

### Established Patterns
- IA es opcional y su costo es visible; **auto-snapshots NUNCA invocan IA** (Fase 4). El guardado manual sí puede invocarla (mensaje explícito ⇒ sin IA en `bringBack`/safety snapshots).
- IPC tipado `geode:*` en `src/shared/ipc.ts`; el main valida y arma el diff, el renderer solo consume `window.geode.ai.*`.
- Etiqueta de versión SIEMPRE humana, nunca hash (TIME-03).
- Strings/comentarios en español; iconos Lucide; TS strict con tipos de retorno explícitos; `noUnusedLocals`.

### Integration Points
- `ai.suggestMessage` (IPC handler en `src/main/index.ts:312`) — hoy devuelve una línea; extender a título+descripción o añadir un handler nuevo `geode:ai-suggest-version`.
- El resultado del guardado (mensaje con título+cuerpo) fluye al `git.graph()` → `entryLabel` en la timeline de la Fase 2.
- `AiApi` en `src/shared/ipc.ts:313` — superficie a extender.
</code_context>

<specifics>
## Specific Ideas

- El usuario rechazó explícitamente usar un tag de git para el nombre humano por el problema de unicidad; el nombre debe ser el título del mensaje.
- La generación por IA debe **discriminar título de descripción** (dos campos, no un blob).
- Bug reportado y confirmado: la IA "está tomando los cambios del repo también" → causa raíz en `pendingDiff` sin filtro `.md`.
</specifics>

<deferred>
## Deferred Ideas

- Preservar nombres "bonitos" con espacios vía tags anotados — descartado (los tags no encajan como nombre humano).
- Snapshots automáticos y su cadencia — Fase 4.
- Toggle de modo avanzado que revele la jerga git / lista de archivos — Fase 5.
</deferred>
