# Roadmap: Geode

## Milestones

- ✅ **v1.0 Capa 0 / Modo Avanzado** — Phases 1-5 (shipped 2026-07-05)
- 🚧 **v1.1 Explorador y gestión de archivos** — Phases 6-7 (active)

## Phases

<details>
<summary>✅ v1.0 Capa 0 / Modo Avanzado (Phases 1-5) — SHIPPED 2026-07-05</summary>

Full detail archived at [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md).

- [x] Phase 1: Sidebar Sections (2/2 plans) — completed 2026-07-04
- [x] Phase 2: Go Back in Time (6/6 plans) — completed 2026-07-04
- [x] Phase 3: Save a Named Version (3/3 plans) — completed 2026-07-04
- [x] Phase 4: Automatic Snapshots (3/3 plans) — completed 2026-07-05
- [x] Phase 5: Advanced Mode & Capa-0 Polish (4/4 plans) — completed 2026-07-05

</details>

### 🚧 v1.1 Explorador y gestión de archivos (Phases 6-7)

Lleva el explorador de archivos y la gestión de bóvedas a paridad tipo VSCode — operaciones de árbol por teclado, sincronización con cambios externos, tabs de preview y baja de bóvedas — sin romper el valor central (nada se pierde). Los borrados (FILE-01/05) permanecen recuperables vía historial git y todo borrado irreversible de disco queda detrás de un aviso explícito.

**Phase Numbering:**

- Integer phases (6, 7): Planned milestone work (continues from v1.0's Phase 5)
- Decimal phases (6.1, 6.2): Urgent insertions (marked INSERTED), appear between their surrounding integers

- [x] **Phase 6: Operaciones del árbol lateral** - Borrar (Del/Supr), renombrar (F2) y refrescar el árbol para reflejar cambios externos (completed 2026-07-06)
- [ ] **Phase 7: Tabs de preview y gestión de bóvedas** - Tab temporal estilo VSCode (1 click) y baja de bóveda (de la lista, opcionalmente del disco con aviso)

## Phase Details

### Phase 6: Operaciones del árbol lateral

**Goal**: El usuario opera el árbol lateral con el teclado — borrar y renombrar el elemento seleccionado — y mantiene el árbol sincronizado con cambios hechos por fuera de la app, sin perder nada.
**Mode:** mvp
**Depends on**: v1.0 shipped (FileTree.tsx + VaultService ya existen); no depende de la Phase 7
**Requirements**: FILE-01, FILE-02, FILE-03
**Success Criteria** (what must be TRUE):

  1. Con un elemento seleccionado en el árbol, presionar Del/Supr lo borra; el borrado queda recuperable en el historial de versiones y ningún contenido se elimina de disco de forma irreversible sin un aviso claro y explícito.
  2. Presionar F2 sobre un archivo o carpeta abre edición inline en el árbol; el nombre se valida (vacío/duplicado/caracteres inválidos) y las tabs abiertas y el estado de edición del elemento sobreviven al renombrado.
  3. Una acción de refrescar re-lee la bóveda desde disco, de modo que archivos creados, movidos, renombrados o borrados desde el explorer del SO aparecen o desaparecen del árbol sin reiniciar la app.

**Plans**: 3 plans
Plans:

- [x] 06-01-PLAN.md — Teclado del árbol: F2 rename inline (con error inline) + diálogo de borrado Lucide/español (FILE-01, FILE-02)
- [x] 06-02-PLAN.md — Refrescar el árbol: botón en cabecera EXPLORADOR + auto-refresh al recuperar foco (FILE-03)
- [x] 06-03-PLAN.md — UAT end-of-phase: gate de build verde + verificación humana FILE-01/02/03

**UI hint**: yes

### Phase 7: Tabs de preview y gestión de bóvedas

**Goal**: El usuario navega notas rápidamente con tabs de preview estilo VSCode y puede dar de baja una bóveda — quitándola de la lista siempre y, opcionalmente, borrándola del disco tras un aviso inequívoco.
**Mode:** mvp
**Depends on**: v1.0 shipped (paneTree.ts/PaneView/EditorPane y VaultSwitcher/knownVaults ya existen); independiente de la Phase 6
**Requirements**: FILE-04, FILE-05
**Success Criteria** (what must be TRUE):

  1. Un solo click sobre una nota la abre en una tab de "preview" temporal, visualmente distinta y reutilizable: el siguiente click reemplaza esa misma tab en lugar de acumular tabs.
  2. Un doble click sobre la nota, o cualquier edición sobre la preview, fija la tab como permanente (deja de ser reutilizable) — comportamiento tipo VSCode.
  3. El usuario puede quitar una bóveda de la lista de bóvedas conocidas en cualquier momento; quitarla de la lista no toca los archivos del disco.
  4. Al dar de baja una bóveda, la app ofrece además borrarla del disco detrás de un aviso explícito e inequívoco; si el usuario no confirma, los archivos permanecen intactos en disco.

**Plans**: 3 plans
Plans:

- [x] 07-01-PLAN.md — Tabs de preview estilo VSCode: campo preview en paneTree + single/double click + itálica (FILE-04)
- [x] 07-02-PLAN.md — Baja de bóveda: IPC geode:vault-remove + shell.trashItem + ConfirmRemoveVaultDialog en VaultSwitcher (FILE-05)
- [ ] 07-03-PLAN.md — UAT end-of-phase: gate de build verde + verificación humana FILE-04/05 (con relaunch por el main process)

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 (independientes entre sí; se ejecutan en orden numérico)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Sidebar Sections | v1.0 | 2/2 | Complete | 2026-07-04 |
| 2. Go Back in Time | v1.0 | 6/6 | Complete | 2026-07-04 |
| 3. Save a Named Version | v1.0 | 3/3 | Complete | 2026-07-04 |
| 4. Automatic Snapshots | v1.0 | 3/3 | Complete | 2026-07-05 |
| 5. Advanced Mode & Capa-0 Polish | v1.0 | 4/4 | Complete | 2026-07-05 |
| 6. Operaciones del árbol lateral | v1.1 | 3/3 | Complete | 2026-07-06 |
| 7. Tabs de preview y gestión de bóvedas | v1.1 | 2/3 | In Progress|  |
