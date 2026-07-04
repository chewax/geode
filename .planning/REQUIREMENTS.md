# Requirements: Geode — Capa 0 / Modo Avanzado

**Defined:** 2026-07-03
**Core Value:** Non-destructive editing — nothing is ever lost and the git plumbing stays invisible to non-technical users.

## v1 Requirements

Requirements for this milestone (the Capa 0 / Advanced Mode refactor). Each maps to a roadmap phase.

### Advanced Mode & Git Hiding

- [ ] **ADV-01**: In the default experience, the user never encounters git vocabulary (commit, branch, merge, push, HEAD) or commit hashes anywhere in the UI
- [ ] **ADV-02**: User can toggle "Modo Avanzado" from Settings, and the choice is global and persisted across sessions
- [ ] **ADV-03**: Advanced Mode reveals the version graph, branches, branch labels, hashes, and the branch switcher; the default keeps all of them hidden

### Ambient Save Status

- [ ] **STAT-01**: The save state is shown in human language ("Guardando…", "Guardado", "Todo en la nube", "Guardado en este dispositivo") instead of raw git/timestamp status

### Soft Linear Restore

- [ ] **SOFT-01**: User can go back to a previous version and the entire app reflects that moment — file tree, tabs, and editor (read-only preview)
- [ ] **SOFT-02**: Going back is a soft, linear restore — the working tree is set to the old state without moving HEAD and without creating a branch or detached-HEAD
- [ ] **SOFT-03**: When the open note doesn't exist at the previewed version, its tab is kept as a ghost showing a clear "didn't exist then" state
- [ ] **SOFT-04**: Returning to the present restores the full current state, including the note that was open before previewing
- [ ] **SOFT-05**: While previewing the past, the app shows unmistakable "you are in the past" chrome and does not allow editing the previewed content directly
- [ ] **SOFT-06**: Choosing "Volver aquí" materializes the previewed version as the current working state (linear, nothing lost) and re-enables editing

### Repo-level Timeline

- [ ] **TIME-01**: The timeline represents the whole vault's history (repo-level), not a single note's history
- [ ] **TIME-02**: The timeline is always available, regardless of whether a note is open
- [ ] **TIME-03**: Timeline entries are labeled in human terms only — human name, else AI message, else relative date; never a hash
- [ ] **TIME-04**: Each timeline entry shows what changed in that version (the affected files) in human wording
- [ ] **TIME-05**: A transport control (step back, step forward, jump to present) navigates versions, drives the whole-app preview, and keeps the active entry in view
- [ ] **TIME-06**: The currently previewed entry and the "present" (newest) entry are each distinctly and persistently marked, so their divergence during time-travel is legible

### Sidebar Sections

- [ ] **SIDE-01**: The sidebar is a stack of collapsible sections (VSCode-Explorer style)
- [ ] **SIDE-02**: The notes/file-tree is a collapsible section whose toolbar actions live on its section header
- [ ] **SIDE-03**: The timeline is a collapsible section within the sidebar, placed below the notes section
- [ ] **SIDE-04**: Switching vaults is an inline disclosure under the vault header, not a floating popover

### Save-Version Flow

- [ ] **SAVE-01**: Saving a version prompts for an optional human name for that point
- [ ] **SAVE-02**: The version description is AI-generated from the changes, or left empty when AI is disabled
- [ ] **SAVE-03**: In the default experience, saving is presented as naming a point in time, not as a git commit (no required message, no commit-framed file list)

### Auto-snapshots

- [ ] **SNAP-01**: User can configure the auto-snapshot cadence in Settings (manual, or every 5 / 10 / 15 / 30 minutes)
- [ ] **SNAP-02**: A timed snapshot is created only when there are actual changes, detected by content (racy-git-safe), never on an unchanged working tree
- [ ] **SNAP-03**: Safety snapshots are taken before going back in time, switching vault, or quitting the app — and only when there are changes
- [ ] **SNAP-04**: Auto-snapshots never invoke AI and are labeled by relative date; AI runs only on manual save

### Diff Readability

- [ ] **DIFF-01**: The diff view hides commit hashes, hunk headers (`@@`), and "No newline at end of file" markers
- [ ] **DIFF-02**: The diff uses human labels (date + version name) and states "agregado"/"quitado" in words alongside color

## v2 Requirements

Deferred to future milestones. Tracked but not in this roadmap.

### Capa 1 (light intentions)

- **CAPA1-01**: User can "try a new version" and later "keep" or "discard" it, without technical names (branch/merge under the hood)

### Conflict handling

- **CONF-01**: On a remote/sync divergence, the user is never shown conflict markers; both sides are kept and surfaced in human terms ("there were two versions — I kept your laptop's, see the other here")

## Out of Scope

Explicitly excluded for this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Vault encryption / E2E | Breaks diffs and merges (encrypted blobs) — contradicts core value; private repo chosen instead |
| Cloud sync / conversational RAG / publish-to-web | Pro/Cloud tier features, orthogonal to the Capa 0 refactor |
| Mobile (React Native) | Deferred; mobile goes BYOK-API or Cloud |
| Arbitrary DAG surgery in the default experience | Inherently power-user; lives only in Advanced Mode, never made invisible |
| Removing branching/graph | Kept (hidden, not deleted) — the technical PKM wedge relies on it |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIDE-01 | Phase 1 | Pending |
| SIDE-02 | Phase 1 | Pending |
| SIDE-04 | Phase 1 | Pending |
| SOFT-01 | Phase 2 | Pending |
| SOFT-02 | Phase 2 | Pending |
| SOFT-03 | Phase 2 | Pending |
| SOFT-04 | Phase 2 | Pending |
| SOFT-05 | Phase 2 | Pending |
| SOFT-06 | Phase 2 | Pending |
| TIME-01 | Phase 2 | Pending |
| TIME-02 | Phase 2 | Pending |
| TIME-03 | Phase 2 | Pending |
| TIME-04 | Phase 2 | Pending |
| TIME-05 | Phase 2 | Pending |
| TIME-06 | Phase 2 | Pending |
| SIDE-03 | Phase 2 | Pending |
| SAVE-01 | Phase 3 | Pending |
| SAVE-02 | Phase 3 | Pending |
| SAVE-03 | Phase 3 | Pending |
| SNAP-01 | Phase 4 | Pending |
| SNAP-02 | Phase 4 | Pending |
| SNAP-03 | Phase 4 | Pending |
| SNAP-04 | Phase 4 | Pending |
| ADV-01 | Phase 5 | Pending |
| ADV-02 | Phase 5 | Pending |
| ADV-03 | Phase 5 | Pending |
| STAT-01 | Phase 5 | Pending |
| DIFF-01 | Phase 5 | Pending |
| DIFF-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29 ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-07-03 after roadmap creation (traceability populated)*
