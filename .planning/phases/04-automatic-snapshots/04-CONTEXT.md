# Phase 4: Automatic Snapshots - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

La bóveda se versiona sola: en una **cadencia configurable** y **antes de acciones riesgosas** (viajar en el tiempo, cambiar de bóveda, cerrar la app), **solo cuando algo realmente cambió** (racy-git-safe) y **sin invocar nunca a la IA**. Cubre SNAP-01..04. Modo MVP.

Fuera de alcance: distinguir visualmente auto vs manual en la timeline (Fase 5), modo avanzado/toggle de git (Fase 5), sincronización remota.
</domain>

<decisions>
## Implementation Decisions

### Configuración de cadencia (Área 1 — aceptada)
- La config vive en **`settings.snapshots = { cadenceMinutes: number | null }`** (`null` = manual), reusando `SettingsService` (mismo patrón que `ai`/`github`).
- Opciones de cadencia: **manual / 5 / 10 / 15 / 30 minutos** (del criterio SNAP-01).
- **Default: cada 10 minutos (ON)** — coherente con la visión del producto ("git como memoria automática e invisible": nada se pierde por defecto).
- UI: nueva sección **"Guardado automático"** en el panel de Ajustes, reusando el patrón visual de la sección de IA (label + control).

### Timer + detección de cambios (Área 2 — Q4 modificada por el usuario)
- El **timer corre en el main process** (`setInterval`); se (re)inicia al cambiar la cadencia o la bóveda. Vive en main para sobrevivir recargas del renderer y permitir el snapshot al cerrar.
- Detección de cambios: **reusar `git.changes()`** (hash de contenido vs HEAD, racy-safe). Snapshot **solo si hay cambios** (SNAP-02). NUNCA `statusMatrix`.
- Los auto-snapshots **nunca invocan IA** (SNAP-04); el costo de IA solo escala con guardados manuales.
- **Etiqueta (Q4, elección del usuario):** los auto-snapshots commitean con un **mensaje marcador** `"Instantánea automática — {fecha local}"` (no mensaje vacío). SNAP-04 ("labeled by relative date") se cumple porque la timeline **ya muestra la fecha relativa como línea secundaria** en cada entrada (comportamiento de Fase 2), y el marcador es consistente con el `"Instantánea de seguridad — {fecha}"` que ya usa `bringBack`.

### Snapshots de seguridad (Área 3 — aceptada)
- Se toma un snapshot de seguridad **solo si hay cambios**, antes de:
  1. **Viajar en el tiempo** → ya lo hace `bringBack` en `App.tsx:510` (reutilizar/alinear el mensaje).
  2. **Cambiar de bóveda** → antes de `vault.setRoot` en el handler `vaultSwitch` (main/index.ts:193).
  3. **Cerrar la app** → interceptar `before-quit`: si hay cambios, snapshot **síncrono** antes de salir.
- **Centralización:** un método/función en el main **`snapshotIfChanged(reason)`** reutilizado por los 3 puntos + el timer (una sola implementación de "si hay cambios, commiteá sin IA con mensaje marcador").
- **MVP: NO** se distingue visualmente auto vs manual en la timeline (la etiqueta/fecha ya los separa de los nombrados); lo visual queda para Fase 5.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/services/settings.ts` — `interface Settings` (`knownVaults`/`ai`/`github`) + `SettingsService`; extender con `snapshots`.
- `src/main/index.ts` — `autoCommitMessage()` (`Snapshot {ISO}`); handler `gitCommit` (`message ?? autoCommitMessage()`); `vaultSwitch` (línea 193); `app.on('window-all-closed')` (483, `before-quit` NO manejado hoy); `requireRoot()`.
- `src/main/services/git.ts` — `changes(dir)` (racy-safe, content-hash) y `commit(dir, message)`: base de `snapshotIfChanged`.
- `src/renderer/src/App.tsx` — `bringBack` ya toma un snapshot de seguridad (línea 510, mensaje `"Instantánea de seguridad — …"`); alinear con la lógica central.
- `src/renderer/src/Settings.tsx` (+ patrón de la sección de IA) — para la sección "Guardado automático".
- `src/shared/ipc.ts` — canales `geode:*` tipados; agregar get/set de la config de snapshots.

### Established Patterns
- Config persistida en `SettingsService` (JSON); el renderer lee/escribe vía `window.geode.*`.
- Detección de cambios SIEMPRE por hash de contenido vs blobs de HEAD (regla racy-git); nunca statusMatrix.
- Mensaje explícito de commit ⇒ SIN IA (el fallback de IA solo corre en guardado manual con mensaje/nombre).
- `entryLabel` (time/labels.ts): tag → mensaje → fecha relativa; la fecha relativa siempre visible como secundaria.

### Integration Points
- El timer del main necesita la bóveda activa (`requireRoot`) y debe reiniciarse en `vaultSwitch`, `vaultOpen`, y al cambiar la cadencia.
- Nuevo canal IPC para leer/escribir `settings.snapshots` (p. ej. `geode:snapshots-get` / `geode:snapshots-set`), consumido por la sección de Ajustes.
- `before-quit` en `app` (main) para el snapshot de cierre.
</code_context>

<specifics>
## Specific Ideas

- El usuario prefirió un **marcador** ("Instantánea automática — {fecha}") por sobre un mensaje vacío, para que los auto-snapshots sean reconocibles; consistente con el snapshot de seguridad ya existente.
- Default ON (cada 10 min) alineado con "memoria automática e invisible".
</specifics>

<deferred>
## Deferred Ideas

- Distinguir auto vs manual con ícono/atenuado en la timeline — Fase 5.
- Toggle de modo avanzado / revelar jerga git — Fase 5.
- Cadencia por inactividad (debounce) en vez de intervalo fijo — no en MVP.
</deferred>
