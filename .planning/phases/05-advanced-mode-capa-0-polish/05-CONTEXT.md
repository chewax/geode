# Phase 5: Advanced Mode & Capa-0 Polish - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

La experiencia por defecto queda totalmente libre de git: ninguna jerga (commit, branch, merge, push, HEAD) ni hashes aparecen en la UI default. Un toggle persistido "Modo Avanzado" en Ajustes revela el grafo de versiones, las ramas, sus etiquetas, los hashes y el selector de ramas; apagarlo los vuelve a ocultar. Además se humanizan las dos filtraciones de Capa 0 restantes: el estado de guardado (lenguaje humano en vez de git/timestamp crudo) y el visor de diff (sin hashes, sin `@@`, sin "No newline", con etiquetas humanas y "agregado/quitado" en palabras). Cubre ADV-01/02/03, STAT-01, DIFF-01/02. Depende de Fase 2 (timeline/preview) y Fase 3 (guardado nombrado).

</domain>

<decisions>
## Implementation Decisions

### Toggle Modo Avanzado — persistencia y ubicación
- Se persiste en `settings.json` vía IPC (nuevo canal `geode:advanced-get` / `geode:advanced-set`), consistente con la config de ai/github/snapshots — verdaderamente global entre sesiones (ADV-02).
- El toggle vive en una **nueva sección "General"** al tope de Ajustes.
- Valor por defecto: **Off** (experiencia sin git) — cumple ADV-01 para usuarios nuevos y existentes.
- Aplica al instante vía estado React reactivo; sin reinicio.

### Qué revela/oculta el Modo Avanzado (ADV-03)
- Botón "árbol de versiones" del toolbar + modal `VersionGraph` (grafo, ramas, etiquetas, hashes): **solo en avanzado**.
- Botones de crear-rama (`GitBranchPlus`) e integrar-rama (`GitMerge`) del toolbar: **solo en avanzado**.
- `BranchSwitcher` de la statusbar: **solo en avanzado**.
- Push a GitHub + "N commit(s) sin pushear": se **mantiene visible pero humanizado** (sin las palabras "commit"/"push"); el estado de sincronización se pliega en el indicador de guardado ("Todo en la nube"). No se oculta, porque la sincronización a la nube es una función real y deseada en el modo default.

### Estado de guardado humano (STAT-01)
- Mapeo de estados: `saving`→"Guardando…" · `saved` sin GitHub conectado→"Guardado en este dispositivo" · `saved` con GitHub conectado y sin pendientes→"Todo en la nube" · `clean`→"Guardado".
- Se reemplazan los glyphs `✓`/`●` por un icono Lucide + texto, y se **elimina la hora literal** (`toLocaleTimeString`) — era timestamp crudo.
- "Todo en la nube" solo cuando GitHub está conectado y `pushCount === 0`; si hay pendientes o no hay GitHub, "Guardado en este dispositivo".
- Mismo texto humano en modo default y avanzado (no se muestra hash/hora extra en avanzado para este indicador).

### Legibilidad del diff (DIFF-01/02)
- Encabezado del `DiffView`: etiqueta humana "Cambios del {fecha} — {nombre de versión}" en vez del hash `oid.slice(0,7)`; se pasa/consulta la metadata de la versión, no el hash.
- Líneas de hunk `@@`: **se ocultan**; los hunks se separan con un divisor sutil sin texto.
- "agregado"/"quitado" en palabras: **leyenda** arriba del diff (verde=agregado / rojo=quitado) además del color, con `aria-label` por línea para accesibilidad.
- Las líneas "No newline at end of file" se **filtran/descartan**.

### Claude's Discretion
- Nombres exactos de clases CSS, iconos Lucide concretos (ej. cuál para "guardado"/"nube"), y la forma precisa del divisor de hunks quedan a criterio de implementación, respetando las convenciones existentes (kebab-case, Lucide monocromo, strings en español).
- Mecanismo de propagación del flag avanzado a los componentes (prop drilling vs contexto) a criterio, priorizando el patrón ya usado en App.tsx.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/services/settings.ts` — patrón de config persistida (`ai`, `github`, `snapshots`); agregar `advanced: { enabled: boolean }` + setter, análogo a `setSnapshotCadence`.
- `src/shared/ipc.ts` — contrato IPC tipado; agregar `AdvancedApi` + canales `geode:advanced-get/set`, análogo a `SnapshotsApi` (Fase 4).
- `src/preload/index.ts` — puente; exponer `window.geode.advanced`.
- `src/renderer/src/SettingsModal.tsx` — ya tiene la sección "Guardado automático" (Fase 4); agregar sección "General" con el toggle.
- `src/renderer/src/DiffView.tsx` — `patchLines()` ya clasifica líneas (add/del/hunk/ctx) y `statusLabel()` ya dice "agregado/borrado/modificado"; ajustar para ocultar `hunk` y "No newline", y cambiar el encabezado.
- `src/renderer/src/App.tsx` — `statusLabel(status, savedAt)` (línea ~1310) para el estado de guardado; `graphOpen`/`toggleGraph`, botones toolbar (~905-963), `BranchSwitcher` en statusbar (~1104), `VersionGraph` (~1068).

### Established Patterns
- Config global: settings.json en main + IPC tipado + `window.geode.*` (no localStorage para config de dominio; localStorage se usa solo para view-state trivial como ancho del sidebar).
- Iconos Lucide monocromo `currentColor`, tamaño vía prop `size`; nunca emojis/glyphs.
- Strings de UI y comentarios en español; clases CSS en kebab-case.
- Estado del diff/commit meta se obtiene vía `window.geode.git.*` (ej. `commitDiff`).

### Integration Points
- El flag "avanzado" se lee una vez en App.tsx (como `aiConfig`/`githubCfg`) y condiciona el render de las superficies git; se actualiza al cerrar Ajustes.
- El encabezado del `DiffView` necesita la metadata de la versión (fecha + nombre humano) — reusar la data ya presente en el grafo/timeline o consultar por oid.

</code_context>

<specifics>
## Specific Ideas

- Las 4 frases exactas de STAT-01 son requisito literal: "Guardando…", "Guardado", "Todo en la nube", "Guardado en este dispositivo".
- El default git-free debe ser total: revisar que no queden fugas de "commit/branch/merge/push/HEAD"/hash en tooltips, aria-labels ni popovers del modo default.

</specifics>

<deferred>
## Deferred Ideas

- Capa 1 (intenciones ligeras: "probar una versión nueva" → "conservar/descartar") — CAPA1-01, v2.
- Manejo de conflictos en lenguaje humano — CONF-01, v2.

</deferred>
