# Geode — Living Retrospective

## Milestone: v1.0 — Capa 0 / Modo Avanzado

**Shipped:** 2026-07-05
**Phases:** 5 | **Plans:** 18 | **Tasks:** 32

### What Was Built

The git engine became invisible for non-technical users while staying fully available to power users:

- **Sidebar Sections** — VSCode-Explorer-style collapsible sections + inline vault switcher (the container everything else slots into).
- **Go Back in Time** — a repo-level Timeline riding a brand-new *soft linear restore* primitive: a single `previewOid` switch reroutes the whole app into a read-only preview of any past version; "Volver aquí" materializes it via a safety snapshot + `restoreTree`, HEAD never moved, no detached-HEAD, nothing lost.
- **Save a Named Version** — saving reframed as naming a point in time; optional human name + AI-written description via `geode:ai-suggest-version`, no git-commit ceremony.
- **Automatic Snapshots** — configurable main-process cadence timer that commits only on real content change (racy-git-safe), plus safety snapshots before go-back/vault-switch/quit; never invokes AI.
- **Advanced Mode & Capa-0 Polish** — persisted "Modo Avanzado" flag gates every git surface (toolbar, VersionGraph, BranchSwitcher, *and* the command-palette git commands); humanized save-status (4 literal phrases, Lucide icon, no timestamp) and readable diff (no hash/`@@`/"No newline", human header, agregado/quitado legend).

### What Worked

- **Mirror-an-analog planning.** Phase 5's advanced-flag round-trip copied Phase 4's `snapshots` config wiring verbatim across settings→ipc→preload→main→renderer — the pattern-mapper anchoring changes to exact line numbers made execution near-mechanical.
- **Adversarial gates caught real defects the happy path missed.** Phase 2 code-review found a critical data-loss bug (exit-preview overwriting the present note) that manual UAT had passed. The Phase 5 plan-checker caught a command-palette git leak the plans didn't cover; the verifier then extended the leak-audit tree-wide and found a residual in SettingsModal. None of these were visible without the checks.
- **Honest-status discipline.** Code-review WR-01 flagged "Todo en la nube" overstating cloud safety for disk-only edits — fixed to only claim the cloud when clean+pushed. The core value ("never lose anything") held as the tie-breaker.
- **Human UAT per phase** kept the AI-generated save descriptions and the git-free default honest in a way typecheck never could.

### What Was Inefficient

- **Zero automated tests** meant every guarantee leaned on typecheck+build + manual UAT. Fine for a solo dev, but the git primitives (restore/snapshot) remain the highest standing risk.
- **STATE.md race churn.** Parallel-ish executors and the milestone CLI repeatedly rewrote STATE.md out from under edits, forcing re-reads and manual reconciliation.
- **Commit-message footguns.** Early PowerShell `@'…'@` heredocs leaked a literal `@` into commit subjects (had to reset+redo); the stray `Geode_Informe_Estrategico.pdf` got swept into a `git add -A` and had to be un-committed. Both avoidable with tighter staging.

### Patterns Established

- Global app config = `settings.json` + typed IPC `geode:*` + `window.geode.*` (never localStorage for domain config; localStorage only for trivial view-state like sidebar width).
- Non-destructive primitives take a **non-AI safety snapshot before any risky action** and route through a single `snapshotIfChanged` that never empties-commits, never blocks, never calls AI.
- Git-vocabulary leak audits must run **tree-wide**, not just the file under edit (tooltips, aria-labels, popovers, command palette all count).
- Change detection stays **content-hash vs HEAD blobs**, never statusMatrix (racy-git landmine) — reaffirmed across Phases 2 and 4.

### Key Lessons

- Keep the code-review → fix → verify loop even on "polish" phases; the two most important finds of the milestone (palette leak, cloud-safety overstatement) came from gates, not execution.
- When a requirement says "anywhere in the UI," scope the verification to the whole render tree from the start — the phase's own leak grep was scoped to one file and missed a surface.
- A persisted view-mode flag is cheapest as a one-shot read into app state, re-read on the settings-close seam (mirrors `githubCfg`/`aiConfig`), with `dispose()`-based cleanup for anything it conditionally registers (command palette).

### Cost Observations

- Model mix: planning/execution/review agents ran predominantly on opus, with sonnet for checkers/verifiers/integration.
- AI-inference cost (product-side) held to manual saves only — auto/safety snapshots never touch OpenRouter, as designed.

## Cross-Milestone Trends

*(First milestone — trends accumulate here from v1.1 onward.)*

| Milestone | Phases | Plans | Tasks | Shipped |
|-----------|--------|-------|-------|---------|
| v1.0 Capa 0 / Modo Avanzado | 5 | 18 | 32 | 2026-07-05 |
