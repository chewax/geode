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

### Validated — v1.0 (Capa 0 / Modo Avanzado, shipped 2026-07-05)

**Layered UX — default (Capa 0) vs. Advanced Mode:**
- ✓ Default experience never shows git vocabulary (commit/branch/merge/push/HEAD) or hashes — incl. tooltips, aria-labels, GitHub popover, and the command palette — v1.0 (ADV-01)
- ✓ "Modo Avanzado" global toggle (persisted in settings.json) reveals the version graph, branches, labels, hashes, branch switcher; off hides them — v1.0 (ADV-02/03)
- ✓ Ambient save signal in human language ("Guardando…"/"Guardado"/"Todo en la nube"/"Guardado en este dispositivo"), no raw timestamp — v1.0 (STAT-01)

**Linear soft restore + repo-level timeline:**
- ✓ Go back = whole-app read-only preview of any past version (tree, tabs, editor); soft linear restore, HEAD never moves, no branch/detached-HEAD — v1.0 (SOFT-01/02)
- ✓ Ghost tab for notes that didn't exist then; jump-to-present restores everything; "you are in the past" chrome; "Volver aquí" materializes non-destructively — v1.0 (SOFT-03/04/05/06)
- ✓ Repo-level Timeline sidebar section, always available, human labels only, transport (back/forward/present), previewed vs present distinctly marked — v1.0 (TIME-01..06)
- ✓ Sidebar = stack of collapsible sections; vault switcher is an inline disclosure — v1.0 (SIDE-01..04)

**Save-version flow + auto-snapshots:**
- ✓ Saving asks for an optional human name; AI writes the description (empty when AI off); no git-commit framing — v1.0 (SAVE-01/02/03)
- ✓ Configurable cadence (manual / 5/10/15/30 min); snapshot only when content changed (racy-git-safe); safety snapshots before go-back/switch/quit; never AI — v1.0 (SNAP-01..04)

**Diff readability:**
- ✓ Diff hides hash/`@@`/"No newline"; human header (date + version name); "agregado"/"quitado" in words alongside color — v1.0 (DIFF-01/02)

### Active

<!-- Next milestone — not yet planned. Candidates below; run /gsd-new-milestone to define. -->

- [ ] Capa 1 (light intentions): "try a new version" → later "keep" or "discard", no technical names (branch/merge under the hood) — CAPA1-01 (deferred from v1)
- [ ] Human-language conflict handling on remote/sync divergence (never show conflict markers; keep both sides, surface in human terms) — CONF-01 (deferred from v1)

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
- **Current state (post-v1.0):** the Capa 0 / Modo Avanzado refactor shipped (5 phases, 18 plans, 32 tasks). The default UI is fully git-free; power users flip "Modo Avanzado" to reveal the DAG. Repo-level timeline + soft linear restore replaced the per-note scrubber. Verification model is typecheck+build green + human UAT per phase (repo still has zero automated tests — the top standing risk for the git primitives). Next: Capa 1 (light try/keep/discard intentions) and human-language conflict handling.

## Constraints

- **Tech stack**: Electron + React + TypeScript; isomorphic-git (no native git binary) — local-first, no backend yet.
- **Security**: Sandboxed renderer (contextIsolation=true, nodeIntegration=false); preload MUST be CommonJS (`.cjs`) — do not convert to ESM.
- **Compatibility**: Racy-git landmine — commit/change detection must hash real content vs HEAD blobs, never revert to statusMatrix (loses same-size same-second edits).
- **UX**: Icons are Lucide (monochrome currentColor), never emojis. Code comments and UI strings are in Spanish.
- **Cost**: AI (OpenRouter) inference cost is user-visible; auto-snapshots must not invoke AI so cost scales with manual saves, not elapsed time.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hide git behind an "Advanced Mode" toggle rather than removing it | Non-technical users get Capa 0; the technical-PKM wedge keeps the DAG | ✓ Good (v1.0 — ADV-01/02/03) |
| Capa 0 "go back" = soft linear restore (new primitive), not checkout | Checkout + detached-HEAD auto-fork is inherently Capa 2; Capa 0 must stay linear | ✓ Good (v1.0 — SOFT-01/02, HEAD-not-moved verified) |
| Timeline is repo-level, not per-note | A rewind restores the whole vault; per-note framing misrepresents the model | ✓ Good (v1.0 — TIME-01, per-note scrubber retired) |
| Save asks for a human name; AI writes the description | Names map to intention; commit-message ceremony is a git leak | ✓ Good (v1.0 — SAVE-01/02/03) |
| Auto-snapshots configurable + only when changed + no AI | Keeps timeline meaningful, bounds inference cost, honors "never lose anything" | ✓ Good (v1.0 — SNAP-01..04) |
| Save-status "Todo en la nube" only when clean+pushed, not on disk-autosave | A disk save isn't committed/pushed; claiming cloud safety would betray "never lose anything" | ✓ Good (v1.0 — STAT-01, code-review WR-01) |
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
*Last updated: 2026-07-05 after v1.0 milestone*
