# Roadmap: Geode — Capa 0 / Modo Avanzado

## Overview

This milestone reshapes Geode's UX so the git engine disappears for non-technical users while staying fully available to power users. We start by restructuring the sidebar into VSCode-style collapsible sections (the container everything else slots into), then build the marquee capability: a repo-level timeline riding on a brand-new soft linear-restore primitive that lets users rewind the whole vault as a read-only preview and come back with nothing lost. We then humanize the save flow (name a point in time, AI writes the description), add configurable change-aware auto-snapshots with safety snapshots, and finish by gating all remaining git surfaces behind an Advanced Mode toggle plus the ambient save signal and readable diffs. Each phase ships an observable, end-to-end capability.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Sidebar Sections** - Sidebar becomes a stack of collapsible sections with an inline vault switcher (completed 2026-07-04)
- [x] **Phase 2: Go Back in Time** - Repo-level timeline + soft linear restore: rewind the whole vault as a read-only preview (completed 2026-07-04)
- [x] **Phase 3: Save a Named Version** - Saving is naming a point in time; AI writes the description (completed 2026-07-04)
- [x] **Phase 4: Automatic Snapshots** - Configurable, change-aware auto-snapshots plus safety snapshots, no AI (completed 2026-07-05)
- [ ] **Phase 5: Advanced Mode & Capa-0 Polish** - Hide all git behind a toggle; ambient save signal; readable diffs

## Phase Details

### Phase 1: Sidebar Sections

**Goal**: The sidebar becomes a VSCode-Explorer-style stack of collapsible sections with an inline vault switcher, establishing the container that later sections slot into.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: SIDE-01, SIDE-02, SIDE-04
**Success Criteria** (what must be TRUE):

  1. The sidebar is a vertical stack of collapsible sections; the user can collapse and expand the notes/file-tree section from its header.
  2. The notes section's toolbar actions live on that section's header (not a separate global bar).
  3. Switching vaults happens via an inline disclosure under the vault header, not a floating popover.
  4. The layout can hold an additional section below notes without further structural rework.

**Plans**: 2 plans

  - [x] 01-01-PLAN.md — Reestructurar el sidebar en secciones colapsables + cabecera de bóveda en flujo (SIDE-01/02/04)
  - [x] 01-02-PLAN.md — Checkpoint UAT: paridad de comportamiento del sidebar

**UI hint**: yes

### Phase 2: Go Back in Time

**Goal**: Users can rewind the entire vault to any past version as a read-only preview and either return to the present or bring that moment back — linearly, with nothing lost.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SOFT-01, SOFT-02, SOFT-03, SOFT-04, SOFT-05, SOFT-06, TIME-01, TIME-02, TIME-03, TIME-04, TIME-05, TIME-06, SIDE-03
**Success Criteria** (what must be TRUE):

  1. A repo-level timeline section sits below notes in the sidebar, available even with no note open, listing whole-vault versions with human labels only (human name → AI message → relative date) and what changed in each.
  2. Using the transport (step back / step forward / jump to present), the whole app — file tree, tabs, editor — reflects the selected past moment as a read-only preview, with unmistakable "you are in the past" chrome; the previewed entry and the "present" entry are each distinctly and persistently marked.
  3. When the open note didn't exist at the previewed version, its tab is kept as a ghost showing a clear "didn't exist then" state.
  4. Jumping to the present restores the full current state, including the note that was open before previewing.
  5. Choosing "Volver aquí" brings the previewed version back as the current working state (HEAD not moved, no branch or detached-HEAD created) and re-enables editing.

**Plans**: 6 plans

  - [x] 02-01-PLAN.md — Primitivas git de main + superficie IPC (treeAt/restoreTree/changedFiles) (SOFT-01/02/06, TIME-04)
  - [x] 02-02-PLAN.md — Helpers puros de etiquetas/fecha + editor de solo lectura (Compartment) (TIME-03/04, SOFT-05)
  - [x] 02-03-PLAN.md — EditorPane con previewOid: carga desde commit, tab fantasma, guardas de escritura (SOFT-01/03/05)
  - [x] 02-04-PLAN.md — Componentes Timeline + TimeTravelBanner (TIME-01..06, SOFT-05, SIDE-03)
  - [x] 02-05-PLAN.md — Integración en App: previewOid, enter/exit/bringBack, sección Timeline + banner, CSS (SOFT-01/02/04/05/06, TIME-05/06, SIDE-03)
  - [ ] 02-06-PLAN.md — Checkpoint UAT §A–§E (no destructivo: HEAD sin mover, sin detached-HEAD)

**UI hint**: yes

### Phase 3: Save a Named Version

**Goal**: Saving a version is framed as naming a point in time rather than making a git commit, with the description written by AI.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SAVE-01, SAVE-02, SAVE-03
**Success Criteria** (what must be TRUE):

  1. When saving, the user is prompted for an optional human name for that point in time — no required message.
  2. The version's description is AI-generated from the changes, or left empty when AI is disabled.
  3. The default save flow shows no git vocabulary and no commit-framed file list; names entered here appear as the human labels in the timeline.

**Plans**: 3 plans

  - [x] 03-01-PLAN.md — Motor de IA título+descripción (canal geode:ai-suggest-version) + fix de scope de diff a .md + etiqueta de primera línea (SAVE-01/02)
  - [x] 03-02-PLAN.md — Reencuadre del diálogo "Guardar versión": dos campos, resumen humano, sin jerga git (SAVE-01/02/03)
  - [x] 03-03-PLAN.md — Checkpoint UAT: SAVE-01/02/03 + fix de diff + etiqueta de título

**UI hint**: yes

### Phase 4: Automatic Snapshots

**Goal**: The vault snapshots itself on a configurable cadence and before risky actions, only when something actually changed, and never invoking AI.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SNAP-01, SNAP-02, SNAP-03, SNAP-04
**Success Criteria** (what must be TRUE):

  1. User can set the auto-snapshot cadence in Settings (manual, or every 5 / 10 / 15 / 30 minutes).
  2. A timed snapshot is created only when content actually changed (racy-git-safe, reusing the existing content-hash detection), never on an unchanged working tree.
  3. A safety snapshot is taken before going back in time, switching vault, or quitting the app — and only when there are changes.
  4. Auto-snapshots are labeled by relative date and never call AI; AI runs only on manual save.

**Plans**: 3 plans

  - [x] 04-01-PLAN.md — Motor de auto-snapshots: config de cadencia + timer en main + snapshotIfChanged + sección "Guardado automático" (SNAP-01/02/04)
  - [x] 04-02-PLAN.md — Instantáneas de seguridad: antes de cambiar de bóveda y al cerrar la app (SNAP-03)
  - [x] 04-03-PLAN.md — Checkpoint UAT §A–§D: SNAP-01/02/03/04

**UI hint**: yes

### Phase 5: Advanced Mode & Capa-0 Polish

**Goal**: The default experience is fully git-free; power users can reveal the machinery via a persisted Advanced Mode toggle, and the remaining Capa-0 leaks (save signal, diff) are humanized.
**Mode:** mvp
**Depends on**: Phase 2, Phase 3
**Requirements**: ADV-01, ADV-02, ADV-03, STAT-01, DIFF-01, DIFF-02
**Success Criteria** (what must be TRUE):

  1. In the default experience, no git vocabulary (commit, branch, merge, push, HEAD) or commit hashes appear anywhere in the UI.
  2. Enabling "Modo Avanzado" from Settings — a global choice persisted across sessions — reveals the version graph, branches, branch labels, hashes, and the branch switcher; disabling hides all of them again.
  3. The save state is shown in human language ("Guardando…", "Guardado", "Todo en la nube", "Guardado en este dispositivo") instead of raw git/timestamp status.
  4. The diff view hides commit hashes, hunk headers (`@@`), and "No newline at end of file" markers, and uses human labels (date + version name) with "agregado"/"quitado" stated in words alongside color.

**Plans**: 4 plans

  - [x] 05-01-PLAN.md — Round-trip del flag Modo Avanzado (settings/ipc/preload/main) + sección "General" en Ajustes (ADV-02)
  - [x] 05-02-PLAN.md — Diff legible en DiffView: encabezado humano, sin @@/"No newline"/hash, leyenda agregado/quitado (DIFF-01/02)
  - [x] 05-03-PLAN.md — App.tsx: gating de superficies git + humanizar fugas + estado de guardado humano + wiring de metadata al diff (ADV-01/03, STAT-01, DIFF-01/02)
  - [ ] 05-04-PLAN.md — Checkpoint UAT §A–§E + gate de build (ADV-01/02/03, STAT-01, DIFF-01/02)

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Sidebar Sections | 2/2 | Complete   | 2026-07-04 |
| 2. Go Back in Time | 6/6 | Complete   | 2026-07-04 |
| 3. Save a Named Version | 3/3 | Complete   | 2026-07-04 |
| 4. Automatic Snapshots | 3/3 | Complete   | 2026-07-05 |
| 5. Advanced Mode & Capa-0 Polish | 3/4 | In Progress|  |
