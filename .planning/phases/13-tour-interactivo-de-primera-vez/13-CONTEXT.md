# Phase 13: Tour interactivo de primera vez - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega un recorrido guiado y liviano de primera vez: tras crear su primer cuaderno, un `TourOverlay` propio (spotlight + cartel anclado a botones reales vía `data-tour`) recorre 4 pasos —escribir → guardar → respaldar → ver historial— señalando controles reales de Capa 0. Muestra progreso ("Paso N de M"), se puede saltar, es re-lanzable desde Ayuda/paleta, persiste "tour visto" y nunca se auto-repite. Degrada con gracia cuando un ancla no está montada y jamás resalta superficies de Modo Avanzado (rama/merge/grafo). Es la última fase del hito v1.3.

**Fuera de esta fase:** coach marks just-in-time de features profundos (tags/diff/volver-atrás) → v2 (ONBX-01). Tour de Modo Avanzado → v2 (ONBX-04). El respaldo en sí (Fase 12, ya shipped): el tour solo SEÑALA el botón de respaldo, no reimplementa el flujo.
</domain>

<decisions>
## Implementation Decisions

### Pasos y anclas (TOUR-01)
- **4 pasos** (cap ≤5): escribir → guardar → respaldar → ver historial.
- Anclas `data-tour` a agregar: **editor host = "escribir"**, **botón "Guardar versión" (App.tsx:1305, `<Save>`) = "guardar"**, **Timeline (App.tsx:1394) = "historial"**. El ancla **"respaldo" ya existe** (BackupButton, Fase 12) — reutilizarla.
- Contenido de cada cartel: microcopy corto, 2ª persona, español sin jerga (redacción exacta a discreción de Claude).
- El paso "respaldar" **solo señala el botón** de respaldo — NO dispara el wizard/tarjeta de la Fase 12 (esos son independientes).

### Disparo, persistencia y re-lanzamiento (TOUR-02)
- Se dispara **tras crear el primer cuaderno** (`createLocalVault` de Fase 11), **no al arrancar** la app, **una sola vez**.
- **Secuencia con la tarjeta de respaldo (Fase 12): el tour corre PRIMERO** (su paso "respaldar" enseña el botón); la tarjeta de respaldo queda como invitación persistente / re-entrada. No se muestran encima uno del otro — coordinar el gating para que no colisionen.
- Persistir **"tour visto"** en un campo nuevo del bloque de onboarding de settings (p.ej. `onboarding.tourSeen` o análogo) + IPC get/set. Nunca se auto-repite en arranques posteriores.
- **Re-lanzable manualmente**: comando en la paleta ("Ver el recorrido guiado") + ítem de Ayuda. (No existe menú de Ayuda hoy — el planner decide la superficie mínima: comando en la paleta como mínimo, más un punto de "Ayuda" si es barato.)

### UX del overlay (TOUR-01/02)
- **`TourOverlay` propio y liviano**: spotlight que recorta el ancla + cartel posicionado. **Sin dependencia nueva.**
- Controles del cartel: **"Paso N de M"**, **"Saltar"** (cierra y marca visto), **"Siguiente"/"Anterior"**, **"Listo"** en el último paso. **Esc cierra** — nunca se puede atascar.
- Posicionamiento: cartel **cerca del ancla con auto-flip** si no entra; spotlight vía `getBoundingClientRect`, **recálculo en resize/scroll**.
- Overlay **semi-transparente, no totalmente bloqueante**: Esc/Saltar siempre disponibles; clic fuera no rompe el tour.

### Degradación y seguridad (TOUR-03)
- Ancla no montada / `getBoundingClientRect` null o 0 → **saltar el paso o mostrar el cartel centrado sin spotlight** (nunca romper, evita el crash de rect null). El botón de respaldo ahora está SIEMPRE montado (Fase 12), así que "respaldar" no falla; el riesgo real es editor/historial en estados raros.
- Los `data-tour` viven **solo en superficies de Capa 0** (escribir/guardar/respaldar/historial); **jamás** en rama/merge/grafo/Modo Avanzado.
- Si el usuario **cierra la app a mitad** del tour: se marca "visto" solo si **termina o salta**; un cierre a mitad **puede reaparecer una vez** (no se pierde el onboarding).
- Si la sección **Timeline está colapsada**, el paso "historial" **la expande** (o ancla a su cabecera) antes del spotlight.

### Claude's Discretion
- Redacción exacta de los 4 microcopys y del label de re-lanzamiento.
- Estructura interna del `TourOverlay` y del modelo de pasos (array de {anchor, título, cuerpo, placement}).
- CSS del spotlight/cartel reutilizando tokens/clases existentes.
- Superficie exacta del re-lanzamiento (mínimo: comando en la paleta).
- Cómo exactamente se coordina el gating tour-vs-tarjeta (mientras se cumpla "tour primero, no encimados").
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/BackupButton.tsx`: ya lleva `data-tour="respaldo"` (siempre montado, Fase 12) — ancla lista del paso "respaldar".
- `src/renderer/src/App.tsx`: botón "Guardar versión" (línea 1305, `onClick={openCommitDialog}`, `<Save size={15}/>`) → ancla "guardar"; `<Timeline .../>` (1394) → ancla "historial"; el editor/`EditorPane` host → ancla "escribir". `createLocalVault` (475-497) es el disparador post-creación; el estado de onboarding ya se carga vía `backup.getOnboarding()` (Fase 12) — reusar/extender para `tourSeen`.
- Paleta de comandos: `host.registerCommand({...})` (App.tsx:1093 registra "Guardar versión") — patrón para registrar "Ver el recorrido guiado".
- `src/main/services/settings.ts`: `settings.backup.onboarding` (Fase 12) — patrón/lugar para persistir `tourSeen`.
- Modales/overlays existentes (ConfirmRemoveVaultDialog, CommitDialog, BackupWizard) usan `modal-overlay`/`modal`; el TourOverlay es distinto (spotlight, no modal) pero puede reusar tokens de color/espaciado.

### Established Patterns
- IPC tipado `geode:*` (ipc.ts → index.ts handler → preload CommonJS → window.geode) para `tourSeen` get/set.
- React con hooks; refs para medir DOM (`getBoundingClientRect`); portals para overlays.
- UI: Lucide icons, clases kebab-case, strings/comentarios en español.

### Integration Points
- Disparo del tour tras `createLocalVault` en App.tsx, coordinado con el gating de la BackupCard (Fase 12, estado `onboarding` 'invitado').
- Nuevos `data-tour` en el editor host, el botón Save y el Timeline.
- Nuevo campo settings `onboarding.tourSeen` + IPC get/set.
- Comando de paleta para re-lanzar.
</code_context>

<specifics>
## Specific Ideas

- 4 pasos: escribir → guardar → respaldar → ver historial.
- Anclas: data-tour="escribir" (editor), "guardar" (botón Save), "respaldo" (ya existe), "historial" (Timeline).
- Persistir `tourSeen` en el bloque de onboarding de settings.
- Re-lanzar vía comando de paleta "Ver el recorrido guiado".
- Cap duro ≤5 pasos (decisión de PROJECT.md: >5 pasos → 63% abandono).
</specifics>

<deferred>
## Deferred Ideas

- Coach marks just-in-time de features profundos (tags, diff, volver-atrás) → v2 (ONBX-01).
- Tour de Modo Avanzado (ramas/grafo) como recorrido opt-in separado → v2 (ONBX-04).
- Checklist de onboarding multi-sesión → v2 (ONBX-02).
- Contenido sembrado personalizado por caso de uso → v2 (ONBX-03).
</deferred>
