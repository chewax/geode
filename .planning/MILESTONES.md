# Milestones

## v1.3 Onboarding guiado (Shipped: 2026-07-10)

**Phases completed:** 3 phases, 10 plans, 17 tasks

**Key accomplishments:**

- Creación de cuaderno LOCAL en 1 click sin GitHub ni picker: util de sanitización Windows, `VaultService.createLocal` (colisión por sufijo + siembra atómica de Bienvenida.md) y el canal `geode:vault-create-local` cableado end-to-end con commit del seed como primera versión.
- Reescritura del bloque `if (!vault)` de `App.tsx` como la nueva pantalla de bienvenida sin jerga (tagline "Escribí sin miedo a perder nada.", input pre-rellenado, CTA único y links secundarios) cableada end-to-end contra `window.geode.vault.createLocal`, encadenando `openNote('Bienvenida.md')` tras `adoptVault` para que el cuaderno abra SIEMPRE con la nota sembrada, con estados idle/creando/error.
- Slug de repo GitHub-válido, boundary de errores a español humano (4 mensajes LOCKED), createRepo con status HTTP, persistencia del onboarding y el contrato IPC completo (4 canales tipados + puente preload) que consumirán los planes 12-03/04/05.
- 1. [Rule 2 - Consistencia con must_have] Ítem de nav de Ajustes también renombrado
- El handler orquestador `vaultEnableBackup` (createRepo privado → setRemote → primer push, idempotente, autoPush ON, onboarding completado, errores humanos) + el AUTO-PUSH REAL tras cada commit (manual y snapshot, best-effort, sin IA — antes era config muerta) + los handlers de persistencia del onboarding y el hand-off de signup a una URL fija.
- Tres componentes presentacionales que reutilizan clases CSS existentes: el wizard de cuenta (dos caminos + checklist resumible + device flow sin jerga + enable + errores humanos con ícono Lucide), la tarjeta-banner de invitación no bloqueante, y el botón de respaldo persistente de 4 estados honestos (STAT-01) con `data-tour="respaldo"` siempre montado y popover sin la URL del repo.
- El ultimo eslabon: cablea las tres superficies del respaldo (12-04) contra los handlers del main (12-03) dentro de `App.tsx` — monta la tarjeta de invitacion una sola vez tras el primer cuaderno (sin re-nag), el wizard como modal, y el `BackupButton` persistente que absorbe el `UploadCloud` del header y la pildora "GitHub/sin GitHub" del footer, preservando exactamente la logica honesta de `statusLabel` (STAT-01).
- 1. [Rule 3 - Blocking] Import de `TourState` en settings.ts
- Overlay de tour de 4 pasos vía el primer `createPortal` del repo: spotlight recortado con box-shadow gigante sobre el ancla real medida en vivo, cartel coach-mark con auto-flip, y degradación grácil (rect null/0/enorme/sección colapsada) sin crash.
- Último eslabón de la Fase 13: el hook `useTour` (máquina de estado tri-state con recuperación "reaparecer una vez" y cierre por Esc) más su cableado en App.tsx (disparo tras el primer cuaderno, gate de la BackupCard, comando de paleta, anclas Capa 0 y montaje del overlay) y el botón de Ayuda de la ActivityBar como re-lanzamiento — convierten las piezas aisladas de los Planes 01/02 en un recorrido de primera vez funcional y coordinado con la Fase 12.

---

## v1.2 Power-user y plataforma (Shipped: 2026-07-07)

**Phases completed:** 3 phases (8, 9, 10), 9 plans · PLUG-02 (Fase B) diferido a hito dedicado

**Key accomplishments:**

- Reemplazo del window.confirm/window.alert del borrado de rama por ConfirmDeleteBranchDialog en español, con botón rojo + aviso de pérdida de versiones cuando la rama no está fusionada y seguridad de teclado (Enter nunca borra).
- Contador `+N` verde / `−N` rojo en la status bar que suma las líneas agregadas/quitadas de TODOS los archivos pendientes del vault (content-hash vs HEAD, nunca statusMatrix), expuesto por un nuevo canal IPC y siempre visible.
- El usuario de Modo Avanzado puede borrar/descartar una rama sin mergearla desde el menú "Ramas" del grafo (con diálogo estilizado, protección de `main`, aviso ante trabajo sin mergear y seguridad de teclado), y ve un contador +N/-N de líneas sin commitear siempre visible en la status bar — verificado §A–§B en un build relanzado con sign-off del usuario.
- El usuario puede activar (opt-in en Ajustes → Guardado automático, por defecto APAGADO) que las snapshots automáticas lleven título/descripción por IA; con la opción activada la IA solo corre en el path de cadencia cuando realmente hay cambios .md, cae siempre al marcador v1.0 si falta key o la IA falla, y los snapshots de ciclo de vida nunca invocan IA — verificado §A–§B en un build relanzado con sign-off del usuario.
- Los plugins internos (insert-date, reading-time, outline) se gestionan desde Ajustes → Plugins igual que los externos: aparecen en un grupo "Integrados" con toggle, su estado se persiste en `settings.plugins.enabled`, desactivar uno lo excluye de comandos/paneles/status/extensiones tras reiniciar, y reactivarlo lo restaura — con default ON y activación fail-open. Verificado §A–§C en un build relanzado con sign-off del usuario.

---

## v1.1 Explorador y gestión de archivos (Shipped: 2026-07-06)

**Phases completed:** 2 phases, 6 plans, 10 tasks

**Key accomplishments:**

- F2 inicia el rename inline con error en español sin alert nativo (FILE-02), y Del/Supr abre un diálogo de confirmación de borrado propio (ConfirmDeleteDialog, Lucide/español, botón rojo destructivo) que comunica la recuperabilidad vía historial git (FILE-01).
- Botón RefreshCw en la cabecera EXPLORADOR + auto-refresh al recuperar el foco de la ventana, ambos releen la bóveda desde disco vía refreshFromDisk (flushAll -> refreshTree -> syncPanesToTree) sin pisar ediciones en curso ni actuar durante el preview.
- El usuario opera el árbol lateral con el teclado — borrar (Del/Supr, con diálogo estilizado donde Enter cancela y solo el click en "Eliminar" borra) y renombrar (F2 inline con error inline) — y lo mantiene sincronizado con cambios externos (botón de refresh con giro visible + auto-refresh al enfocar sin resetear el editor), sin perder nada — verificado §A–§C en un build corriendo con sign-off del usuario.
- Tabs de preview reutilizables (itálicas, una por panel) con single-click en el árbol; doble-click, edición o doble-click sobre la tab la fijan como permanente.
- Baja de bóveda end-to-end vía nuevo IPC geode:vault-remove: "Quitar de la lista" nunca toca el disco y un checkbox default-OFF escala a envío a la papelera del SO (recuperable) con `shell.trashItem`, validando la ruta contra knownVaults en el main.
- El usuario navega notas con tabs de preview estilo VSCode (1 click = preview en itálica reutilizable; doble click/edición/doble-click-en-tab = fija) y da de baja bóvedas — quitándolas de la lista sin tocar disco, o enviándolas a la papelera del SO (recuperable) tras un aviso explícito con seguridad de teclado — verificado §A–§B en un build relanzado con sign-off del usuario.

---

## v1.1 Explorador y gestión de archivos (Shipped: 2026-07-06)

**Phases completed:** 2 phases, 6 plans, 10 tasks

**Key accomplishments:**

- F2 inicia el rename inline con error en español sin alert nativo (FILE-02), y Del/Supr abre un diálogo de confirmación de borrado propio (ConfirmDeleteDialog, Lucide/español, botón rojo destructivo) que comunica la recuperabilidad vía historial git (FILE-01).
- Botón RefreshCw en la cabecera EXPLORADOR + auto-refresh al recuperar el foco de la ventana, ambos releen la bóveda desde disco vía refreshFromDisk (flushAll -> refreshTree -> syncPanesToTree) sin pisar ediciones en curso ni actuar durante el preview.
- El usuario opera el árbol lateral con el teclado — borrar (Del/Supr, con diálogo estilizado donde Enter cancela y solo el click en "Eliminar" borra) y renombrar (F2 inline con error inline) — y lo mantiene sincronizado con cambios externos (botón de refresh con giro visible + auto-refresh al enfocar sin resetear el editor), sin perder nada — verificado §A–§C en un build corriendo con sign-off del usuario.
- Tabs de preview reutilizables (itálicas, una por panel) con single-click en el árbol; doble-click, edición o doble-click sobre la tab la fijan como permanente.
- Baja de bóveda end-to-end vía nuevo IPC geode:vault-remove: "Quitar de la lista" nunca toca el disco y un checkbox default-OFF escala a envío a la papelera del SO (recuperable) con `shell.trashItem`, validando la ruta contra knownVaults en el main.
- El usuario navega notas con tabs de preview estilo VSCode (1 click = preview en itálica reutilizable; doble click/edición/doble-click-en-tab = fija) y da de baja bóvedas — quitándolas de la lista sin tocar disco, o enviándolas a la papelera del SO (recuperable) tras un aviso explícito con seguridad de teclado — verificado §A–§B en un build relanzado con sign-off del usuario.

---

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
