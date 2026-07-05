# Milestones

## v1.0 Capa 0 / Modo Avanzado (Shipped: 2026-07-05)

**Phases completed:** 5 phases, 18 plans, 32 tasks

**Key accomplishments:**

- Sidebar reestructurado en pila de secciones colapsables estilo VSCode-Explorer: nuevo primitivo SidebarSection (colapso persistido en localStorage), acciones de notas movidas a la cabecera de la sección NOTAS, y switcher de bóveda convertido de popover flotante a disclosure en flujo.
- checkpoint:human-verify (puerta bloqueante)
- 1. [Rule 3 - Blocking] Deferred the `rm` import from Task 1 to Task 2
- Two dependency-free renderer leaves: the TIME-03/TIME-04 Spanish label/date humanizers (`time/labels.ts`) and a SOFT-05 runtime `readOnly` toggle on `CodeMirrorEditor` via a CM6 `Compartment` — both unconsumed, so the app is behavior-neutral and `npm run typecheck` is green.
- `PaneView` now threads an optional `previewOid` to every leaf `EditorPane`, which — when set — loads each note from `git.readNoteAt(previewOid, path)` instead of disk, renders a Spanish `FileQuestion` ghost placeholder when the note did not exist at that commit (SOFT-03), locks the editor `readOnly`, and early-returns from `flush()` so no preview content can ever reach disk (SOFT-05); the prop is optional and unset by App, so the app renders exactly as today and `npm run typecheck` is green.
- A single `previewOid` switch in `App.tsx` reroutes the whole app (tree, tabs, editor) into a read-only preview of any past version, mounts the repo-level LÍNEA DE TIEMPO section and the full-width "Estás viendo el pasado" banner, restores the exact prior layout on exit, and materializes a moment via `bringBack` (safety snapshot → `restoreTree`, HEAD unmoved) — with the per-note TimelineScrubber retired.
- The whole "Go Back in Time" feature — repo-level Timeline, read-only whole-vault preview, ghost tabs, exact layout restore, and non-destructive "Volver aquí" — passed the §A–§E manual UAT in a running build, with git state captured before/after to substantiate that previewing and materializing never move HEAD, never write to disk during preview, and never create a detached HEAD or new branch.
- AI title/description round-trip via new geode:ai-suggest-version channel, pendingDiff scoped to .md notes, and entryLabel trimmed to the title line — all additive, no user-visible change yet
- Reframed CommitDialog into the two-field "Guardar versión" flow (optional autofocus Nombre + AI-written editable Descripción) consuming suggestVersion(), with a human "N notas cambiadas" summary, a Lucide error icon, no git jargon, and empty-safe save
- El flujo de guardar como "nombrar un momento" pasó el UAT §1–§7 en un build corriendo: nombre opcional como título, descripción por IA en punteo enfocada en el delta, sin jerga git, y las correcciones (scope del diff a notas, etiqueta de primera línea) confirmadas — con varias iteraciones de pulido del prompt de IA hechas en vivo hasta que el usuario aprobó título + descripción.
- Configurable main-process cadence timer that auto-commits the vault only when content changed, using a distinct marker message and never invoking AI, with a new "Guardado automatico" Settings section.
- Two remaining SNAP-03 safety-snapshot triggers wired on top of Plan 01's engine — a snapshot of the OLD vault before a vault switch, and a snapshot on app quit via a before-quit handler with a re-entrancy guard — both routed through the central snapshotIfChanged so they never invoke AI, never create an empty commit, and never block on failure.
- La bóveda se versiona sola en una cadencia configurable y antes de acciones riesgosas (cambio de bóveda, cierre, viaje en el tiempo), solo cuando algo cambió y sin invocar nunca a la IA — verificado §A–§D en un build corriendo con sign-off del usuario.
- Cableado de punta a punta del flag booleano "Modo Avanzado" (settings.json → IPC `geode:advanced-get/set` → preload → main) y una nueva sección "General" en Ajustes con un toggle accesible, default off, que persiste entre sesiones.
- DiffView ahora lee como cambios de una versión: encabezado humano (fecha + nombre) sin hash, hunks `@@` ocultos como divisor mudo, líneas "No newline" descartadas, y leyenda agregado/quitado en palabras con aria-label por línea.
- App.tsx consume el flag `advanced` (Plan 01) para ocultar todas las superficies git en el default — botones del toolbar, VersionGraph, BranchSwitcher Y los comandos git de la paleta de comandos (que dejan de estar registrados/invocables y sin categoria 'Git') — humaniza las fugas residuales del popover/tooltip, reescribe el indicador de guardado a las 4 frases STAT-01 con icono Lucide sin hora, y cablea fecha+nombre humanos al DiffView (Plan 02).
- El modo default queda totalmente libre de git (toolbar, statusbar, popover, tooltips, diálogo de guardar y paleta de comandos), un toggle "Modo Avanzado" persistido revela/oculta el grafo, ramas, switcher y los comandos git de la paleta, el estado de guardado usa lenguaje humano honesto, y el diff es legible — verificado §A–§E en un build corriendo con sign-off del usuario.

---
