# Geode

## What This Is

Geode is a local-first Markdown notes app (Electron + React + TypeScript) that uses **git as an automatic, invisible memory** — every meaningful change is versioned so nothing is ever lost and users can experiment without fear. It competes with Obsidian; its differentiator is **non-destructive editing** with a human UX layered over git (the user never needs to know git is the engine). Repo folder is named "Amethist"; the product is "Geode".

## Core Value

**Non-destructive editing** — "you can never lose anything" and "you can experiment without fear." If everything else fails, this must hold: no user content is ever irrecoverable, and the git plumbing stays invisible to non-technical users.

## Current Milestone: v1.3 Onboarding guiado

**Goal:** Que un usuario que no sabe qué es GitHub llegue solo, guiado, desde "abrir la app por primera vez" hasta "escribí una nota, la guardé y la respaldé en la nube" — sin toparse nunca con jerga (vault/Git/clonar/repo/commit/push).

**Target features:**
- Bienvenida sin jerga; camino primario "Crear mi primer cuaderno".
- Cuaderno local en 1 click (carpeta Geode por defecto `~/Documents/Geode/<nombre>`, sin selector de carpeta en el happy path; sin cuenta).
- Asistente de respaldo en la nube no bloqueante: onboarding de cuenta GitHub guiado (hand-off a signup + checklist + reuso del device flow), crear repo privado + primer push automático sin exponer repo/commit/push.
- Reescritura transversal de strings "GitHub/repo/clonar" → "respaldo en la nube / copia de seguridad" en la UI de cara al usuario.
- Tour interactivo de primera vez (`TourOverlay` propio y liviano: spotlight + cartel, anclas `data-tour` en botones reales, disparo tras crear el primer cuaderno, re-lanzable desde Ayuda).

**Key context (decisiones cerradas con el usuario):** (1) *local primero, nube después* — el respaldo nunca es peaje de entrada; empezar a escribir es 1 click sin cuenta. (2) Framear todo como "respaldo en la nube"; nombrar "GitHub" solo cuando es inevitable (la propia página de signup), enmarcado como "servicio gratuito y seguro". La creación de cuenta no se puede automatizar (captcha/verificación de email) → hand-off guiado con checklist es el máximo posible. Refuerza el core value (git invisible).

## Current State: v1.2 shipped (2026-07-07)

Tres hitos enviados (v1.0, v1.1, v1.2). **v1.2 "Power-user y plataforma"** cerró con 3 fases (8-10): borrar rama sin mergear + contador +N/-N (Modo Avanzado), IA opcional en auto-snapshots (opt-in), y activar/desactivar plugins internos. **Re-scope al cierre:** PLUG-02 (aislamiento de plugins de terceros, Fase B MVP) se difirió a un hito dedicado por tamaño/riesgo.

**Próximo hito candidato:** *Aislamiento de plugins (Fase B)* — PLUG-02: iframe sandbox + puente postMessage + permisos `plugin.json` + API de editor async + quitar `unsafe-eval` del CSP (ver docs/PLUGINS.md). Otros candidatos del ToDo: edición Markdown enriquecida, dictado por voz.

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

### Validated — v1.1 (Explorador y gestión de archivos, shipped 2026-07-06)

**Operaciones del árbol lateral (paridad VSCode):**
- ✓ Borrar con Del/Supr vía diálogo estilizado; recuperable por historial git; nada irreversible sin confirmación explícita — v1.1 (FILE-01)
- ✓ Renombrar con F2 (edición inline, error inline, tabs sobreviven; mismo-nombre/solo-case ya no da "Ya existe") — v1.1 (FILE-02)
- ✓ Refrescar el árbol (botón en cabecera + auto al recuperar foco, sin resetear cursor/undo ni perder ediciones) — v1.1 (FILE-03)

**Tabs y bóvedas:**
- ✓ Tab de preview estilo VSCode (1 click = preview itálica reutilizable; doble click / edición / doble-click-tab la fija) — v1.1 (FILE-04)
- ✓ Baja de bóveda: quitar de la lista sin tocar disco, u opción explícita de enviar a la papelera del SO (recuperable) — v1.1 (FILE-05)

### Validated — v1.2 (Power-user y plataforma, shipped 2026-07-07)

**Versionado avanzado (Modo Avanzado):**
- ✓ Borrar/descartar una rama sin mergearla desde el menú "Ramas" del grafo (diálogo estilizado, `main` protegida, aviso de pérdida, Enter nunca borra) — v1.2 (VER-01)
- ✓ Contador +N/-N de líneas sin commitear en la status bar (content-hash vs HEAD, todos los pendientes, oculto en preview) — v1.2 (CHG-01)

**Snapshots + IA:**
- ✓ IA opcional (opt-in en Ajustes, default OFF) en auto-snapshots: solo en cadencia con cambios reales, fallback al marcador, nunca en ciclo de vida — v1.2 (AISNAP-01)

**Plataforma de plugins:**
- ✓ Activar/desactivar plugins internos (built-in) desde Ajustes (grupo "Integrados"), persistido, default ON, apply-on-restart, fail-open — v1.2 (PLUG-01)

**Diferido a hito dedicado:**
- ↪ Aislamiento de plugins de terceros (Fase B MVP) — PLUG-02: movido a su propio hito al cierre de v1.2 (tamaño/riesgo).

<!-- Diferidos a hitos futuros: edición Markdown rica (toolbar/tablas/imágenes/links/Mermaid/ayuda); dictado por voz (STT); CAPA1-01 (try/keep/discard); CONF-01 (conflictos humanos). -->


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
- **Current state (post-v1.2):** three milestones shipped. v1.0 (Capa 0 / Modo Avanzado — 5 phases) made the default UI git-free with an Advanced Mode toggle, repo-level timeline + soft linear restore, humanized save-status/diff. v1.1 (Explorador y gestión de archivos — 2 phases, 6 plans, 15 tasks) brought VSCode-parity file ops: Del/Supr delete + F2 rename + tree refresh, preview tabs, and vault removal (unlist / OS-trash). v1.2 (Power-user y plataforma — 3 phases, 9 plans) added Advanced-Mode branch delete + an uncommitted +N/-N counter (VER-01/CHG-01), opt-in AI titles for auto-snapshots (changes-gated, fallback-safe — AISNAP-01), and enable/disable of built-in plugins (PLUG-01); PLUG-02 (third-party plugin isolation, Fase B MVP) was deferred to a dedicated milestone at close. Verification model is typecheck+build green + human UAT per phase (repo still has zero automated tests — the top standing risk). Recurring win: adversarial gates (code-review, plan-checker, integration-checker) catch cross-phase breaks the happy path misses (e.g. preview-tab pin-on-load, rename not remapping the preview pointer). Next candidates: rich Markdown editing (toolbar/tables/images/links/Mermaid), power-user versioning, plugin hardening, voice dictation.

## Constraints

- **Tech stack**: Electron + React + TypeScript; isomorphic-git (no native git binary) — local-first, no backend yet.
- **Security**: Sandboxed renderer (contextIsolation=true, nodeIntegration=false); preload MUST be CommonJS (`.cjs`) — do not convert to ESM.
- **Compatibility**: Racy-git landmine — commit/change detection must hash real content vs HEAD blobs, never revert to statusMatrix (loses same-size same-second edits).
- **UX**: Icons are Lucide (monochrome currentColor), never emojis. Code comments and UI strings are in Spanish.
- **Cost**: AI (OpenRouter) inference cost is user-visible. Auto-snapshots don't invoke AI by default; the v1.2 opt-in (AISNAP-01) only calls AI on a cadence snapshot that actually has changes (clean tree = no-op), so cost still scales with real editing activity, not elapsed time.

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
| Borrar bóveda del disco va a la papelera del SO (shell.trashItem), no rm permanente | La bóveda incluye .git (todo el historial); un rm lo destruiría — la papelera da red de seguridad ("nada se pierde") | ✓ Good (v1.1 — FILE-05) |
| Borrar/renombrar/refrescar hacen flush del journal antes de tocar disco/cambiar estado | Evita perder los últimos ms tipeados en operaciones de archivo | ✓ Good (v1.1 — FILE-01/02/03) |
| Tab de preview reutilizable, se fija solo con intención (doble-click/edición) | Paridad VSCode; navegar sin ensuciar el set de tabs | ✓ Good (v1.1 — FILE-04) |
| Reload programático de CodeMirror lleva una anotación para no disparar onChange | Distingue carga-de-nota de edición-real; sin ella la preview se fijaba sola y latían falsos "dirty" | ✓ Good (v1.1 — FILE-04, code-review CR-01) |
| Borrar rama: mejorar la acción del grafo (único punto de entrada) en vez de agregar superficies nuevas | La capacidad ya existía (protege `main`, descarta cambiando a base); el problema era discoverability | ✓ Good (v1.2 — VER-01) |
| IA en auto-snapshots = opt-in con gate emergente "solo con cambios" (sin detector de idle, sin tocar el timer) | Árbol limpio = no-op ⇒ el costo escala con edición real, no con tiempo; la misma snapshot de seguridad se nombra con IA | ✓ Good (v1.2 — AISNAP-01) |
| Built-ins gestionados como externos pero default ON (`?? true`) + activación fail-open | Consistencia con externos; un error de IPC nunca deja al usuario sin funcionalidad core | ✓ Good (v1.2 — PLUG-01) |
| Diferir PLUG-02 (Fase B) a un hito dedicado al cierre de v1.2 | Es el ítem más grande/riesgoso (iframe + bridge + permisos + API async + quitar unsafe-eval); merece su propio ciclo | ✓ Decisión de alcance (v1.2 close) |

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
*Last updated: 2026-07-08 — v1.3 Onboarding guiado started*
