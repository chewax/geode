# Project Research Summary

**Project:** Geode - v1.3 Onboarding guiado
**Domain:** Guided first-run onboarding, progressive coach-mark tour, and guided (non-automatable) account hand-off, layered over an existing sandboxed Electron/React/TypeScript local-first notes app
**Researched:** 2026-07-08
**Confidence:** HIGH

## Executive Summary

Geode v1.3 turns a git-savvy welcome screen into a zero-jargon path that gets a non-technical user from open the app to wrote a note, saved a version, backed it up in the cloud without ever seeing the words vault, Git, clonar, repo, commit, push. Experts build this kind of first-run flow with three well-understood ingredients: a single-CTA welcome, a seeded starter document, and a short (5 steps or fewer) contextual coach-mark tour fired after the user has done something real, not at cold launch. Geode existing stack already contains everything needed to build all three: React 19 plus getBoundingClientRect for a custom TourOverlay, Electron app.getPath(documents) for a picker-free default folder, and shell.openExternal plus the already-shipped OAuth device flow for the cloud hand-off. The recommended approach adds zero new dependencies; every new capability is roughly 100-200 lines of first-party code following patterns already in the codebase (VaultService.createNote collision-suffix idiom, SettingsService advanced/snapshots block shape, NewVaultDialog modal step-machine).

The one genuinely novel and risky piece is the cloud-backup account hand-off: GitHub account creation cannot be automated (captcha plus mandatory email verification), so the ceiling is a guided, resumable, non-blocking hand-off (open signup in the external browser, then an in-app checklist, then the existing device flow does the actual authentication, then auto-create a private repo and push). No competitor precedent walks a total beginner through creating a developer platform account framed purely as cloud backup, so this needs careful, tested copy and error handling, not just wiring.

The dominant risk cluster is honesty and jargon leakage at exactly the moments the user is most anxious: (1) the app own shipped invariant, Todo en la nube only when clean-and-pushed, must not be contradicted by warm onboarding copy that says a salvo while the notebook is still local-only; (2) raw GitHub/git error strings (422 repo-name-taken, 401, non-fast-forward) currently bubble straight to e.message and must be translated at a new onboarding-layer boundary; (3) the tour must never anchor to conditionally-rendered elements (branch/merge/graph/cloud-push buttons are all advanced- or connected-gated and simply do not exist in the default first-run DOM) or it renders a spotlight over nothing. Architecturally, all of this fits the existing three-tier IPC boundary with 4 new geode: channels and one new settings block; the tour dependency on a backup button forces a two-phase build order: creation onboarding first, tour second.

## Key Findings

### Recommended Stack

Zero new dependencies. React 19.2.7 plus a custom TourOverlay (portal plus getBoundingClientRect plus useLayoutEffect, about 150 lines) beats any tour library (react-joyride, driver.js, shepherd.js) for this scope: all three libraries force a full re-theme and re-string to match Geode dark theme, Lucide icons, and Spanish copy, and react-joyride only gained real React 19 support in a March-2026 rewrite (v3.0.0), a coupling risk not worth taking for about 150 lines of custom work.

Core technologies (all already present):
- React 19.2.7: TourOverlay, welcome screen, backup-assistant checklist. useLayoutEffect plus refs are exactly the primitives a spotlight needs.
- Electron app.getPath(documents): cross-platform, localization and OneDrive-redirect-safe default folder. Never os.homedir() plus a hardcoded Documents string.
- Electron shell.openExternal: already used twice in src/main/index.ts. Hands off to GitHub signup and the device-flow verification URL.
- node:fs/promises plus node:path (Node 18 bundled): already the pattern in VaultService; no new library needed for path/dir creation.
- Lucide React 1.23.0 plus existing CSP (style-src self unsafe-inline): inline positioning styles for the overlay are already permitted, no CSP change needed.

### Expected Features

Must have (table stakes):
- Zero-jargon welcome with one obvious primary CTA (Crear mi primer cuaderno); demote Abrir carpeta to a secondary link.
- One-click local notebook, no folder picker, no account, defaulting to Documents/Geode/<nombre>.
- A non-empty seeded first notebook (a Bienvenida.md starter note) that doubles as the tour stage.
- Hacerlo despues always present and effective on the cloud path; a persistent re-entry affordance for deferred backup.
- Tour: skippable, replayable from Ayuda, with a step-counter/progress indicator (Paso N de M).
- Privacy and free reassurance inline at the moment of the account ask (gratis plus privado).
- Connection-state feedback that reuses the existing honest Todo en la nube status.

Should have (differentiators):
- Progressive tour triggered after the first notebook exists, not at cold launch; measured 2-3x better engagement and retention than front-loaded tours.
- Guided GitHub-account hand-off framed entirely as cloud backup, with a persistent, resumable checklist; the milestone hardest and most novel problem.
- Completion detection via the device-flow authorization succeeding; never poll GitHub for did they sign up.
- Invisible auto-backup after first connect (auto-push toggle defaults ON post-onboarding).

Defer (v2+):
- Just-in-time coach marks for deeper features (tags, diff, go-back); add only if users complete the 4-step tour but never discover history.
- Multi-session onboarding checklist and personalized seeded content by use case.
- Advanced-Mode (branches/graph) onboarding as a wholly separate, later, opt-in tour.

### Architecture Approach

All four new pieces are new instances of existing patterns, not new architectural concepts: a sibling VaultService.createLocal() (never overload createWithRepo, which hard-requires a token plus native picker), a new onboarding block in Settings mirroring the shape of advanced/snapshots, a CloudBackupWizard modal modeled on NewVaultDialog step machine that sequences the already-shipped device flow, and a renderer-only TourOverlay portaled to document.body and driven by data-tour attribute selectors with no refs threaded through the tree.

Major components:
1. VaultService.createLocal(name) plus defaultNotebooksDir() plus sanitizeFolderName(): picker-free, account-free local notebook creation with collision-suffix handling, mirroring createNote numbered-suffix idiom.
2. Settings.onboarding block plus getOnboarding/setOnboarding: persists completedFirstRun, tourCompleted, backupDeclined, mirroring advanced fail-safe-default getter pattern.
3. CloudBackupWizard.tsx plus new geode:vault-enable-backup channel: attaches a remote to the current local vault (distinct from createWithRepo, which only makes a new folder) and drives account hand-off, device flow, repo create, first push.
4. TourOverlay.tsx: portal, spotlight plus coach-mark card, data-tour anchors, getBoundingClientRect-based positioning with resize/scroll re-measurement.

4 new IPC channels: geode:vault-create-local, geode:vault-enable-backup, geode:onboarding-get, geode:onboarding-set, all following the existing geode:-prefixed, typed, main/preload/renderer contract in src/shared/ipc.ts.

### Critical Pitfalls

1. Tour anchored to elements absent from the default UI (branch/merge/graph/cloud-push buttons are all conditionally rendered; only Save and the command palette are always mounted). Guard every anchor resolution, fall back to a centered card, never render a spotlight on a null rect; point the backup step at onboarding own always-rendered entry point, not the conditional titlebar push button.
2. Onboarding copy claims safety the app has not earned. A salvo/respaldado/en la nube language must be gated behind the same clean-plus-pushed invariant that already governs statusLabel (STAT-01); local-only success copy stays in the guardado en este dispositivo register.
3. Raw GitHub/git jargon leaks through errors (422 name-taken, 401/404, non-fast-forward all currently render via e.message directly). Add a translation boundary at the onboarding layer mapping known failure classes to human Spanish, cloud-framed copy.
4. Automating GitHub signup is impossible (captcha plus email verification) and must not be attempted (no embedded webview or scripted form). The guided hand-off plus resumable checklist plus external browser is the explicit, closed-decision ceiling.
5. Default-folder collisions, permissions, and unicode/space paths. De-duplicate deterministically with numbered suffixes, sanitize the notebook name into a Windows-safe folder name, validate Documents/Geode is writable up front, and test explicitly against OneDrive-redirected/localized Documents.

## Implications for Roadmap

Based on research, the natural phase structure is fixed by one hard dependency: the tour backup step needs a backup entry-point button to exist as a data-tour anchor, and that button is introduced by the backup-assistant feature, so creation/backup onboarding must ship before the tour.

### Phase 1: Creation onboarding (local-first happy path)
Rationale: Zero external dependencies, immediate standalone value (fast local start), and it is the foundation every later phase anchors against.
Delivers: Zero-jargon welcome with single CTA; VaultService.createLocal plus geode:vault-create-local (no picker, no account); seeded Spanish welcome note; Settings.onboarding persistence plus geode:onboarding-get/-set.
Addresses: FEATURES.md table stakes - zero-jargon welcome, 1-click local notebook, seeded note.
Avoids: PITFALLS #9 (folder collision/permissions/unicode), #10 (forced picker/account on the happy path), #5 partial (local-only copy stays honest).

### Phase 2: Cloud-backup assistant
Rationale: Depends on Phase 1 local vault existing to attach a remote to; introduces the tour required anchor; is the riskiest and most novel feature and benefits from being isolated and hardened on its own.
Delivers: CloudBackupWizard.tsx (intro, account hand-off, device flow, creating, done/error), new geode:vault-enable-backup channel (createRepo plus setRemote plus first push on the current vault), titlebar backup button with data-tour equal to backup, error-translation boundary for GitHub/git jargon, Hacerlo despues plus backupDeclined persistence.
Uses: shell.openExternal, the already-shipped device flow (startDeviceFlow/completeDeviceFlow), createRepo/setRemote/push from github.ts and git.ts.
Implements: VaultApi.enableBackup, OnboardingApi.
Avoids: PITFALLS #5 (false safety claims, this is where en la nube copy becomes true), #6 (no signup automation), #7 (account/token race, closed-tab handling), #8 (jargon in errors), #11 (empty-repo first-push failure), #12 (non-blocking, dismissible everywhere).

### Phase 3: Interactive first-run tour
Rationale: Depends on Phase 2 backup button existing as a stable, always-onboarding-rendered anchor; is purely renderer-side and independently testable once all anchors exist.
Delivers: TourOverlay.tsx (portal, spotlight, coach-mark card, 5 steps or fewer: escribir, guardar, respaldar, historial), data-tour attributes on stable/always-mounted anchors only, trigger-after-first-notebook logic gated on UI-ready (not IPC-resolve), resize/scroll re-measurement, keyboard nav plus focus management, Repetir tour entry in Ayuda, progress indicator, skip, replay.
Avoids: PITFALLS #1 (anchor does not exist), #2 (fires before UI mounted), #3 (layout-shift desync), #4 (z-index/soft-lock), #12 (never blocks writing).

### Phase Ordering Rationale

- Local-create must exist before the tour has anything to anchor to, and before backup has a vault to attach a remote to; Phase 1 is the strict prerequisite for both later phases.
- The backup button (Phase 2) is the tour (Phase 3) load-bearing anchor for the respaldar step; building the tour before the button exists would mean building against a selector that returns null.
- Isolating the account-hand-off (Phase 2) lets its distinctive failure modes (captcha, closed-tab races, 422/401 errors, empty-repo first-push) be hardened and tested independently of the tour distinct failure modes (anchor resolution, resize/scroll, focus trapping); the two phases share almost no pitfalls, which validates the split.
- A transversal jargon-rewrite pass (GitHub/repo/clonar to respaldo en la nube) is cross-cutting and should land incrementally within each phase own surfaces rather than as a separate phase, since it is mostly a copy-review gate applied at each phase PR, not a standalone technical deliverable.

### Research Flags

Needs deeper research during planning:
- Phase 2 (Cloud-backup assistant): the account-hand-off UX has no clean precedent (guiding a total beginner through a developer-platform signup framed as consumer cloud backup); the resumable-checklist/race-handling design and the exact error-translation copy map deserve a research-phase pass before planning tasks.

Phases with standard, well-documented patterns (skip research-phase):
- Phase 1 (Creation onboarding): directly mirrors existing VaultService/SettingsService idioms already in the codebase (collision-suffix naming, advanced-block-shaped settings); low ambiguity.
- Phase 3 (Tour): the coach-mark/spotlight pattern is well-documented (step-count caps, progress-indicator lift, contextual-trigger data) and the codebase-specific anchor/z-index/resize gotchas are already fully enumerated in PITFALLS.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against actual repo usage (app.getPath, shell.openExternal already in use) plus npm/version checks on the tour-library alternatives (react-joyride React-19 history, driver.js/shepherd.js deps). |
| Features | MEDIUM-HIGH | Tour mechanics (step caps, completion lift, contextual-vs-front-loaded retention) are backed by measured industry data; the GitHub-account-hand-off framing is synthesized/inferred, no exact precedent exists for guiding a non-technical user through a dev-tool signup as invisible cloud backup. |
| Architecture | HIGH | Grounded directly in the actual codebase (file/line citations for every integration point); no external framework unknowns. |
| Pitfalls | HIGH for codebase-specific findings, MEDIUM for tour/UX pitfalls | Codebase-specific findings (conditional-render gating, raw error strings, statusLabel invariant) are direct source inspection; general tour/coach-mark UX pitfalls (focus trapping, WCAG, resize handling) are corroborated against current web sources but not codebase-verified until built. |

Overall confidence: HIGH

### Gaps to Address

- Account-hand-off exact copy and race-handling design (Phase 2): no external precedent to lean on; needs its own research/validation pass and probably a UAT round focused specifically on user closes the signup tab and clicks Ya tengo cuenta too early flows.
- Whether to fold the account-creation explainer into the device-flow screen or keep it as a separate wizard step (research suggested prefer folding, architecture suggested a discrete account step): a small design decision to resolve during Phase 2 planning, not blocking for the roadmap.
- Exact backup-button placement and visual design in the titlebar when local-only (no existing precedent in the current UI for a titlebar button in this state): a UI-detail gap to resolve in Phase 2 planning, not a research gap.

## Sources

### Primary (HIGH confidence)
- Direct repository inspection: src/main/index.ts, src/main/services/vault.ts, settings.ts, github.ts, git.ts, src/renderer/src/App.tsx, NewVaultDialog.tsx, src/shared/ipc.ts, src/preload/index.ts, src/renderer/index.html (CSP)
- .planning/PROJECT.md - closed decisions (local-first, Todo en la nube honesty invariant, signup cannot be automated)
- npm view driver.js 1.6.0, react-joyride 3.1.0, shepherd.js 15.2.2 - version and peer-dep verification, 2026-07-08
- Electron official docs - app.getPath(documents), shell.openExternal semantics

### Secondary (MEDIUM confidence)
- The Anatomy of a Great In-App Onboarding Tour, Digia - step-count caps, abandonment percentages, contextual-vs-front-loaded retention data
- Appcues onboarding UX patterns and product tour patterns
- Notion onboarding writeup (GoodUX); Userflow onboarding strategies; Userpilot onboarding flow examples
- react-joyride React-19 support history - GitHub issues 1122, 1130, 1151

### Tertiary (LOW confidence)
- UXCam - apps with great onboarding, general consumer-app pattern reference, not domain-specific
- WCAG 2.4.11 and focus-trap implementation guides - general accessibility references, not yet validated against this specific overlay implementation

---
Research completed: 2026-07-08
Ready for roadmap: yes
