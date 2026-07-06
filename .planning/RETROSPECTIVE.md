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

## Milestone: v1.1 — Explorador y gestión de archivos

**Shipped:** 2026-07-06
**Phases:** 2 | **Plans:** 6

### What Was Built

Paridad tipo VSCode para el explorador de archivos y la gestión de bóvedas:

- **Operaciones del árbol lateral (Fase 6)** — borrar con Del/Supr (diálogo estilizado, recuperable por historial), renombrar con F2 (edición inline, error inline, tabs sobreviven), y refrescar el árbol (botón + auto al recuperar foco) para reflejar cambios hechos por fuera de la app. Gran parte se apoyó en infra ya existente (renameNode/deleteNode/refreshTree) — la fase fue mayormente wiring + un diálogo + un botón.
- **Tabs de preview y gestión de bóvedas (Fase 7)** — tab de preview estilo VSCode (1 click = itálica reutilizable; doble click / edición / doble-click-tab la fija) modelada con un campo `preview` en `paneTree`; y baja de bóveda (quitar de la lista sin tocar disco, o enviar a la papelera del SO con `shell.trashItem`, recuperable).

### What Worked

- **Reusar y escanear antes de planear.** El scout de código de la Fase 6 detectó que borrar/renombrar/refresh ya existían casi completos → el plan evitó reconstruir y se acotó al gap real (trigger F2, botón de refresh, diálogo Lucide). Planes chicos, ejecución casi mecánica.
- **Los gates adversariales atajaron todo lo importante.** Cada defecto de peso vino de un gate, no de la ejecución: el plan-checker no encontró blockers, pero el **code-review** atajó el crítico de la Fase 7 (la preview se fijaba sola porque el load programático de CodeMirror disparaba onChange — misma clase que el CR-01 de la Fase 2), y el **integration-checker del hito** atajó un blocker cross-phase que ninguna verificación de fase individual podía ver (renameNode de la Fase 6 no remapeaba el campo `preview` nuevo de la Fase 7).
- **UAT humano encontró un bug preexistente.** El usuario, probando F2, disparó el "Ya existe" al renombrar al mismo nombre / cambiando solo el case en un FS case-insensitive — bug viejo de `vault.rename` que el flujo nuevo hizo visible; corregido en el momento.
- **Papelera > rm.** La decisión de que el borrado de bóveda vaya a la papelera del SO (no `rm`) mantuvo el valor central intacto incluso para una acción que borra el `.git` entero.

### What Was Inefficient

- **Anotación de reload reinventada.** El bug de "load programático dispara onChange" ya se había visto en la Fase 2 (fix por `previewOid` guard). En la Fase 7 volvió en otra forma (pin-on-load) y se resolvió recién en code-review con la anotación de transacción — la solución general (anotar reloads) podría haberse aplicado desde el diseño.
- **STATE.md / linter races** de nuevo: archivos tocados en paralelo forzaron re-lecturas y algunos edits vía `sed`.
- **Backticks en `git commit -m` bajo bash** command-substituyeron y mancharon un mensaje (amendado).

### Patterns Established

- Antes de planear un feature "nuevo" en brownfield, escanear si la infra ya existe — varias veces el trabajo real es wiring, no construcción.
- Todo reload programático del editor debe llevar una anotación para que `onChange` (dirty + pin) solo lo disparen ediciones reales del usuario.
- Operaciones de archivo destructivas o que cambian de contexto (borrar, renombrar, refrescar, cambiar/baja de bóveda) hacen `flushAll()` del journal ANTES de tocar disco.
- Diálogos destructivos: Cancelar autofocus, Enter nunca confirma, Escape cancela (patrón fijado en Fase 6 CR-01, reusado en Fase 7).
- El **integration-checker del hito** es el único gate que ve los seams entre fases nuevas (campo agregado en una fase, mutación escrita en otra) — no saltearlo.

### Key Lessons

- Un campo nuevo en un modelo compartido (`LeafPane.preview`) obliga a auditar TODAS las mutaciones de ese modelo, incluidas las de fases anteriores (renameNode). El integration-checker es el lugar donde eso se caza.
- Cuando un bug de una clase ya conocida reaparece, aplicar la solución general, no otro parche puntual.

### Cost Observations

- Mezcla de modelos: planificación/ejecución/review en opus; checkers/verifiers/integration en sonnet.
- Costo de IA de producto: sin cambios — esta línea de trabajo no toca ningún path de OpenRouter.

## Cross-Milestone Trends

| Milestone | Phases | Plans | Tasks | Shipped |
|-----------|--------|-------|-------|---------|
| v1.0 Capa 0 / Modo Avanzado | 5 | 18 | 32 | 2026-07-05 |
| v1.1 Explorador y gestión de archivos | 2 | 6 | 15 | 2026-07-06 |

**Recurring signal:** en ambos hitos, los defectos que importaron (data-loss/UX-breaking) salieron de gates adversariales (code-review, integration-checker), no de la ejecución ni del UAT feliz. El patrón "load programático dispara onChange" apareció en v1.0 (Fase 2) y v1.1 (Fase 7) — vale tratarlo como invariante de diseño del editor.
