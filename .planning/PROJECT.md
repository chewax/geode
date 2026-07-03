# Geode

## What This Is

Geode is a local-first Markdown notes app (Electron + React + TypeScript) that uses **git as an automatic, invisible memory** — every meaningful change is versioned so nothing is ever lost and users can experiment without fear. It competes with Obsidian; its differentiator is **non-destructive editing** with a human UX layered over git (the user never needs to know git is the engine). Repo folder is named "Amethist"; the product is "Geode".

## Core Value

**Non-destructive editing** — "you can never lose anything" and "you can experiment without fear." If everything else fails, this must hold: no user content is ever irrecoverable, and the git plumbing stays invisible to non-technical users.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from the existing codebase (see .planning/codebase/). -->

- ✓ Markdown editing with CodeMirror, tabs, and multi-pane splits — existing
- ✓ Non-destructive versioning over isomorphic-git (commit = permanent version; journal autosave between versions) — existing
- ✓ Per-note timeline scrubber (slider over a note's versions, view + restore) — existing
- ✓ Per-version visual diff (jsdiff) — existing
- ✓ Version graph (DAG) with lanes, branch labels, tags, HEAD — existing
- ✓ Manual branches, merge-to-base by rebase, branch switcher in status bar — existing
- ✓ Version tags (git tags) with editor + filter — existing
- ✓ Push vault to GitHub via OAuth device flow (manual + auto-push toggle) — existing
- ✓ AI commit messages via OpenRouter (encrypted BYOK key, editable, timestamp fallback) — existing
- ✓ Renderer-side plugin system v1 (commands, panels, status items, editor extensions; built-in + external CommonJS) — existing
- ✓ Racy-git-safe commit detection (content hashing vs HEAD blobs, not statusMatrix) — existing

### Active

<!-- Current milestone: the Capa 0 / Advanced Mode refactor. Hypotheses until shipped. -->

**Layered UX — default (Capa 0) vs. Advanced Mode:**
- [ ] User in the default experience never encounters git vocabulary (commit, branch, merge, push, HEAD) or hashes
- [ ] User can enable "Modo Avanzado" (global toggle in Settings) to reveal the version graph, branches, branch labels, hashes, and the branch switcher
- [ ] Ambient save signal in human language ("Guardando…", "Guardado", "Todo en la nube") replaces raw git status

**Linear soft restore (Capa 0 "go back in time"):**
- [ ] User can go back to a previous version and the whole app reflects that moment (file tree, tabs, editor as read-only preview)
- [ ] Going back is a soft, linear restore (old tree brought as pending changes, HEAD not moved — no branches, no detached HEAD)
- [ ] When the open note doesn't exist at the previewed version, its tab is kept as a ghost with a clear "didn't exist then" state; returning to the present restores everything
- [ ] While previewing the past, unmistakable "you are in the past" chrome is shown, and editing is gated behind "Volver aquí"

**Repo-level timeline in the sidebar:**
- [ ] Timeline is a repo-level (whole-vault) collapsible section in the sidebar, always available (not gated on having a note open)
- [ ] Timeline entries have human labels only (human name → AI message → relative date; never a hash)
- [ ] A transport (step back / step forward / jump to present) at the top of the timeline navigates versions
- [ ] The active/previewed entry and the "present" (newest) entry are both clearly and distinctly marked
- [ ] Sidebar is a stack of collapsible sections (vault/notes + timeline); the vault switcher becomes an inline disclosure, not a floating popover

**Save-version flow:**
- [ ] Saving a version asks for an optional human name; the description is AI-generated (or empty when AI is off)

**Configurable auto-snapshots:**
- [ ] Auto-snapshot cadence is configurable in Settings (manual / every 5/10/15/30 min)
- [ ] A snapshot (timed or safety) is created only when there are actual changes (content-based, racy-git-safe)
- [ ] Safety snapshots are taken before destructive-ish actions (going back, switching vault, quitting) regardless of the cadence setting
- [ ] Auto-snapshots do not invoke AI (labelled by relative date); AI runs only on manual save

**Diff readability (Capa 0):**
- [ ] The diff view hides technical leaks (commit hash, hunk headers, "No newline" markers) and uses human labels

### Out of Scope

<!-- Explicit boundaries with reasoning. -->

- Vault encryption / E2E — breaks diffs and merges (encrypted blobs); a private repo was chosen instead. If ever needed, it's a separate product line.
- Cloud sync without touching GitHub, conversational RAG ("ask your vault"), publish-to-web — these are Pro/Cloud tier features, orthogonal to this milestone.
- Mobile (React Native) embedding-on-device — deferred; mobile goes BYOK-API or Cloud.
- Arbitrary DAG surgery in the default experience (cherry-pick, branch from any commit, moving work between branches) — inherently power-user; lives only in Advanced Mode, never made invisible.
- Removing branching/graph — kept (hidden, not deleted) because the technical PKM wedge relies on it.

## Context

- **Product philosophy:** map to *intentions*, not git *operations*. No button completes "git ___"; each completes "I want to ___". Three UX layers: Capa 0 (default, ~90% of value, zero git vocabulary, linear timeline), Capa 1 (light "try a new version / keep / discard"), Capa 2 (power user = Advanced Mode: DAG, branches, hashes).
- **Prior design conversation** established the load-bearing decisions for this milestone: (1) go-back in Capa 0 must stay linear → soft restore, a new primitive distinct from the existing checkout/detached-HEAD model (which is Advanced-only); (2) the timeline is repo-level, not per-note; (3) the sidebar becomes VSCode-like collapsible sections; (4) save asks for a human name + AI description; (5) auto-snapshots are configurable and only fire when there are changes.
- **Codebase state:** three-tier Electron architecture (sandboxed renderer ↔ typed IPC/preload ↔ main-process services). Key files for this milestone: `src/renderer/src/App.tsx`, `TimelineScrubber.tsx`, `DiffView.tsx`, `VaultSwitcher.tsx`, `SettingsModal.tsx`, `CommitDialog.tsx`, `src/main/services/git.ts`, `src/shared/ipc.ts`. Recent untracked work on multi-pane splits (`EditorPane.tsx`, `paneTree.ts`).
- **Business model:** open-core — client is open source, server-side services are closed. Free/BYOK vs Pro/Cloud vs Teams. Non-destructive editing is never gated (it's the traction hook).

## Constraints

- **Tech stack**: Electron + React + TypeScript; isomorphic-git (no native git binary) — local-first, no backend yet.
- **Security**: Sandboxed renderer (contextIsolation=true, nodeIntegration=false); preload MUST be CommonJS (`.cjs`) — do not convert to ESM.
- **Compatibility**: Racy-git landmine — commit/change detection must hash real content vs HEAD blobs, never revert to statusMatrix (loses same-size same-second edits).
- **UX**: Icons are Lucide (monochrome currentColor), never emojis. Code comments and UI strings are in Spanish.
- **Cost**: AI (OpenRouter) inference cost is user-visible; auto-snapshots must not invoke AI so cost scales with manual saves, not elapsed time.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hide git behind an "Advanced Mode" toggle rather than removing it | Non-technical users get Capa 0; the technical-PKM wedge keeps the DAG | — Pending |
| Capa 0 "go back" = soft linear restore (new primitive), not checkout | Checkout + detached-HEAD auto-fork is inherently Capa 2; Capa 0 must stay linear | — Pending |
| Timeline is repo-level, not per-note | A rewind restores the whole vault; per-note framing misrepresents the model | — Pending |
| Save asks for a human name; AI writes the description | Names map to intention; commit-message ceremony is a git leak | — Pending |
| Auto-snapshots configurable + only when changed + no AI | Keeps timeline meaningful, bounds inference cost, honors "never lose anything" | — Pending |
| Vault encryption is a NO-GOAL | Encrypted blobs break diffs/merges — the core value | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-03 after initialization*
