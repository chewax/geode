# Feature Research

**Domain:** Guided first-run onboarding + product tour for a local-first notes app, aimed at NON-TECHNICAL users who have never heard of GitHub (Geode v1.3)
**Researched:** 2026-07-08
**Confidence:** MEDIUM-HIGH (tour mechanics HIGH — backed by measured completion data; account-creation-handoff copy MEDIUM — synthesized from onboarding literature, no exact precedent for "guide a beginner through a dev-tool signup as invisible cloud backup")

## Context & Constraints (read first)

This milestone is scoped by decisions already closed in PROJECT.md:
- **Local first, cloud later** — writing a note is 1 click, no account, never a toll gate.
- **Frame everything as "respaldo en la nube / copia de seguridad."** Name "GitHub" only where unavoidable (the signup page itself), framed as "servicio gratuito y seguro."
- **Account creation cannot be automated** (captcha + email verification) → the ceiling is a *guided hand-off*: open the signup page + an in-app checklist + reuse the existing OAuth **device flow** to connect afterward.

Existing surfaces this milestone must reframe or reuse (do NOT rebuild):
- `App.tsx` welcome screen (`vault == null`, lines 1079-1105) — jargon today ("Abrir carpeta como vault", "Clonar o crear en GitHub", "Notas versionadas sobre Git").
- `NewVaultDialog.tsx` — "Nueva bóveda", "Clonar existente/Crear nueva", "Nombre del repo", "Privado", forces a native folder picker.
- `SettingsModal.tsx` GitHub section — `startDeviceFlow()` / `completeDeviceFlow()`, `listRepos()`, `setRemote()`, `disconnect()`.
- Titlebar Save (Ctrl+S) + `UploadCloud` push button with `pushCount` badge; `LÍNEA DE TIEMPO` sidebar section.
- Planned new primitive: `TourOverlay` (spotlight + card) with `data-tour` anchors on real buttons.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Zero-jargon welcome with ONE obvious primary action** ("Crear mi primer cuaderno") | A blank welcome with two equal git-flavored buttons stalls a non-technical user. Every consumer app leads with a single hero CTA. | LOW | Reframe `App.tsx` 1079-1105. Demote "Abrir carpeta existente" to a secondary text link. Kill the tagline "sobre Git". |
| **One-click local notebook, no folder picker, no account** | Beginners don't have a mental model for "choose an empty folder." Default to `~/Documents/Geode/<nombre>`; ask only for a name (optional, with a sensible default like "Mi cuaderno"). | MEDIUM | New main-process path that creates the default dir + `git init` silently. Folder picker moves behind an "Elegir otra ubicación" advanced affordance. Depends on VaultService + existing create flow. |
| **A non-empty first notebook (seeded welcome note)** | An empty editor is a dead end; every notes app (Bear, Apple Notes, Notion) drops the user into readable starter content. | LOW | Seed one `Bienvenida.md` (or "Empezá acá.md") in Spanish that doubles as the tour's first target and teaches by example. Content is disposable/deletable. |
| **"Do it later" everywhere on the cloud path** | Backup must never block writing. A dismiss that actually dismisses (and is easy to find again) is expected. | LOW | Non-modal banner/card, not a blocking modal. Re-entry point must exist (see below). |
| **Persistent re-entry for skipped setup** ("Respaldar en la nube" stays visible) | Users who defer need an obvious way back. Skipping without a recovery path is the classic onboarding failure. | LOW | Reuse: keep an ambient "Respaldar en la nube" affordance in the sidebar/titlebar area; Settings > (renamed) section as the deep link. |
| **Tour: skippable + replayable from Help** | Standard. Users expect an X/"Saltar" and a way to re-run ("Ver el tour de nuevo" in a Help/Ayuda menu). | LOW | Add a Help entry point; persist "tour seen" in settings.json. |
| **Tour: progress indicator + step counter** | "Paso 2 de 4" raises completion ~40% (Zeigarnik). Users want to know how long this is. | LOW | Part of `TourOverlay` card chrome. |
| **Privacy/free reassurance at the moment of the ask** | A beginner asked to create an account on a site they've never heard of needs "gratis" + "solo vos podés verlo (privado)" *inline*, or they bail. | LOW | Copy work on the cloud-backup card. The repo is already created `private` by default (NewVaultDialog `isPrivate=true`) — surface that as "privado / solo vos". |
| **Connection state feedback** (connecting → connected → backed up) | Users need to see the backup actually happened; ties into existing "Todo en la nube" status (STAT-01). | LOW | Reuse existing device-flow + push status; just human-frame it. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Progressive / contextual tour on the REAL UI** (spotlight anchored to actual buttons, triggered after the first notebook is created) | Measured: user-/event-triggered tours outperform session-start tours 2-3x on engagement and ~38% on 90-day retention. Anchoring to real controls (not a slideshow) teaches the actual app. | MEDIUM | `TourOverlay` + `data-tour` anchors on: new-note button, Save (Ctrl+S), push/cloud button, `LÍNEA DE TIEMPO` header. Fire *after* first notebook exists, not on app launch. Handle anchor-not-visible (e.g. cloud button only renders when connected) gracefully. |
| **Guided GitHub-account hand-off framed as "cloud backup," with an in-app checklist** | No competitor makes a total beginner create a *developer* account without ever saying "developer/repo/commit." A checklist ("1. Creá tu cuenta gratis → 2. Volvé acá → 3. Listo, te conectamos") that survives the browser round-trip is the differentiator that unlocks cloud for non-technical users. | MEDIUM-HIGH | Open `github.com/signup` in browser; show a persistent in-app checklist; on return, the existing **device flow** does the auth. This is the riskiest/most novel piece. |
| **Automatic completion detection ("ya tenés cuenta? seguí acá")** | Since account creation can't be automated, detect it by the user *coming back and successfully authorizing the device flow* — then auto-create the private repo + first push with zero further jargon. | MEDIUM | Detection = device-flow success (already implemented). No polling of GitHub signup needed. Collapse checklist to "¡Listo!" and auto-run `createWithRepo(name, true)` + push. |
| **Invisible auto-backup after first connect** | Once connected, "cada vez que guardás, se respalda solo." Removes the concept of "push" entirely for Capa 0. | LOW-MEDIUM | There's an existing auto-push toggle; default it ON for onboarded users, framed as "respaldo automático". Honors STAT-01 ("Todo en la nube" only when clean+pushed). |
| **"Teach by example" welcome note that is also the tour's stage** | The seeded note's content mirrors the tour ("Escribí acá", "Guardá con el botón de arriba") so reading and doing converge. | LOW | Copy-only; reuses the seeded-note table-stakes item. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Front-loaded multi-slide "welcome carousel" before the app** | Feels like a polished intro | Measured worst-in-class: users skip, retain nothing; arrives before any context. 2-3x worse than contextual. | Drop straight into a seeded notebook; teach in-context via the progressive tour. |
| **A tour longer than 5 steps** | "Show them everything" | Tours >5 steps hit 63% abandonment; the 3→4 step transition alone loses 48%. | Hard cap at 4-5 steps (create, save, backup, history). Defer everything else to just-in-time coach marks. |
| **Blocking modal that forces GitHub signup before writing** | "Get them backed up early" | Violates the closed "local first, cloud later" decision; a signup wall on an unknown third-party site is a mass drop-off. | Non-blocking card, "Empezá a escribir" always wins; backup is offered, never required. |
| **Saying "GitHub / repo / commit / push / clone" in Capa 0 copy** | It's technically accurate | Breaks the core value (git invisible); a beginner reads "repo" as noise or intimidation. | "Respaldo en la nube", "copia de seguridad", "cuenta gratis". Name "GitHub" ONLY on the signup hand-off, framed as "un servicio gratuito y seguro". |
| **Automating account creation (headless browser / scripted signup)** | "Make it truly one-click" | Captcha + email verification make it impossible and fragile; a ToS/anti-bot minefield. | Guided hand-off + checklist is the explicit ceiling (PROJECT.md decision). |
| **Polling GitHub to detect that the account was created** | "Know when they finished signup" | No reliable/authorized signal; brittle and privacy-noisy. | Detect via the device-flow authorization succeeding — the user is back and connected. |
| **Coach marks on features the user has no frame of reference for yet** (e.g. spotlighting the version graph / branches on first run) | "Explain the powerful stuff" | Attention without context → dismissal, not understanding. Advanced Mode is Capa 2. | Only tour Capa 0 intentions (write/save/backup/history). Never surface Advanced-Mode UI in onboarding. |
| **Forcing a folder-picker on the happy path** | "Let them choose where notes live" | Beginners don't reason about filesystem locations; a native dialog mid-onboarding stalls them. | Default `~/Documents/Geode/<nombre>`; "Elegir otra ubicación" is an opt-in secondary link. |
| **Auto-replaying the tour on every launch / nagging reminders** | "Make sure they see it" | Tour fatigue → trained to ignore; suppress completed steps for returning users. | Show once; "tour seen" persisted; replay only on explicit Help action. Backup reminder is passive (a persistent affordance), not a recurring popup. |

## Feature Dependencies

```
[Zero-jargon welcome + 1-click local notebook]
    └──unblocks──> [Seeded welcome note]
                        └──is the stage for──> [Progressive tour (after 1st notebook)]

[Progressive tour] ──step 3 links to──> [Cloud-backup assistant card]
                                              └──requires──> [GitHub account hand-off + checklist]
                                                                  └──completion detected via──> [existing device flow]
                                                                          └──then──> [auto create private repo + first push]
                                                                                          └──enables──> [invisible auto-backup + "Todo en la nube" status]

[Persistent re-entry affordance] ──enhances──> [Cloud-backup assistant]  (recovery path for "later")
[TourOverlay + data-tour anchors] ──requires──> stable anchors on real buttons (some conditional, e.g. cloud button only when connected)
```

### Dependency Notes

- **Tour requires the seeded note + first notebook:** the tour must anchor to a live editor and real controls, so it fires only after 1-click create succeeds — never at cold launch.
- **Cloud assistant reuses the device flow, not new auth:** account *creation* is a browser hand-off; account *connection* is the already-shipped `startDeviceFlow`/`completeDeviceFlow`. No new OAuth work.
- **Auto-backup depends on connect succeeding:** only after `createWithRepo(name, true)` + push can the "respaldo automático / Todo en la nube" state (STAT-01) be honestly shown.
- **Tour step 3 (backup) must degrade gracefully when the cloud button isn't rendered:** the titlebar push button only mounts when `githubCfg.connected && remote`. On first run it won't exist, so the tour step must point at the assistant entry point instead, or be conditional.

## MVP Definition

### Launch With (v1.3)

- [ ] Rewritten zero-jargon welcome, single primary CTA "Crear mi primer cuaderno" — table stakes, first impression.
- [ ] 1-click local notebook to `~/Documents/Geode/<nombre>`, no picker, no account — the core "local first" promise.
- [ ] Seeded Spanish welcome note that doubles as the tour stage — removes the empty-editor dead end.
- [ ] Non-blocking cloud-backup assistant with checklist + "Hacerlo después", framed as "copia de seguridad", naming GitHub only on the signup hand-off with "gratis + privado" reassurance — the milestone's hard problem.
- [ ] Auto create-private-repo + first push on connect; then invisible auto-backup + honest "Todo en la nube" — closes the loop.
- [ ] `TourOverlay` progressive tour, ≤5 steps (escribir → guardar → respaldar → historial), triggered after first notebook, with Saltar + progress "Paso N de M" + replay from Ayuda.
- [ ] Transversal string rewrite: "GitHub/repo/clonar/bóveda" → "respaldo en la nube / cuaderno" in Capa 0 user-facing UI.

### Add After Validation (v1.x)

- [ ] Just-in-time coach marks at first use of deeper features (tags, diff, go-back) instead of adding tour steps — trigger: users complete the 4-step tour but don't discover history.
- [ ] Multi-session onboarding checklist ("2 de 3 pasos listos") if analytics show users defer backup and never return.
- [ ] Personalized seeded content by declared use case (student/writer/notes) — trigger: demand for templates.

### Future Consideration (v2+)

- [ ] Advanced-Mode onboarding (branches/graph) as a *separate opt-in* tour — never mixed with the Capa 0 first-run tour.
- [ ] Alternative cloud providers behind the same "respaldo en la nube" framing — only if GitHub-specific friction proves fatal.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Zero-jargon welcome + single CTA | HIGH | LOW | P1 |
| 1-click local notebook (no picker/account) | HIGH | MEDIUM | P1 |
| Seeded welcome note | MEDIUM | LOW | P1 |
| Cloud-backup assistant (checklist + "later" + reassurance) | HIGH | MEDIUM-HIGH | P1 |
| Auto repo-create + first push on connect | HIGH | LOW-MEDIUM | P1 |
| Progressive TourOverlay (≤5 steps, skip/replay/progress) | HIGH | MEDIUM | P1 |
| Transversal jargon rewrite | HIGH | LOW-MEDIUM | P1 |
| Persistent re-entry for deferred backup | MEDIUM | LOW | P1 |
| Just-in-time coach marks (deeper features) | MEDIUM | MEDIUM | P2 |
| Multi-session checklist / reminders | MEDIUM | MEDIUM | P2 |
| Personalized seeded content | LOW | MEDIUM | P3 |

## Concrete Copy & Step Patterns (for the roadmap)

**Welcome screen (reframe App.tsx):**
- H1 "Geode" → tagline in plain language, e.g. "Tus notas, siempre a salvo." (drop "sobre Git").
- Primary: **"Crear mi primer cuaderno"**. Secondary text link: "Abrir una carpeta que ya tengo".

**1-click create:** optional name field prefilled "Mi cuaderno"; caption "Se guarda en tu equipo. Podés respaldarlo en la nube cuando quieras." No folder picker on happy path.

**Cloud-backup assistant (non-blocking card):**
- Title: "Respaldá tu cuaderno en la nube (gratis)"
- Body: "Guardá una copia de seguridad para no perder nada, ni si se rompe tu equipo. Es gratis y privado: solo vos podés verla."
- Checklist:
  1. "Creá tu cuenta gratis" → opens signup in browser; card stays and shows "Cuando termines, volvé a esta ventana."
  2. "Conectá tu cuenta" → runs device flow (shows the code, "esperando autorización…").
  3. "¡Listo! Estamos respaldando tu cuaderno." → auto repo-create + first push.
- Secondary always present: **"Hacerlo después"** (dismiss, keep a "Respaldar en la nube" affordance visible).
- Name "GitHub" appears once, at step 1: "Usamos GitHub, un servicio gratuito y seguro, para guardar tu copia."

**Tour (TourOverlay), ≤5 steps, fired after first notebook, 50-70% dim, copy <140 chars, arrow touching target, "Paso N de M", "Saltar":**
1. Editor / seeded note — "Acá escribís tus notas."
2. Save button (Ctrl+S, `data-tour="save"`) — "Guardá una versión cuando quieras. Nunca perdés lo anterior."
3. Cloud/backup entry (`data-tour="backup"`) — "Acá mandás una copia a la nube." (conditional; points at assistant if push button not yet mounted)
4. `LÍNEA DE TIEMPO` header (`data-tour="timeline"`) — "Acá ves toda tu historia y volvés atrás sin miedo."

Tour rules (measured): hard cap 5 steps (>5 → 63% abandon; 3→4 loses 48%); progress indicator lifts completion ~40%; each step = hook + one action + confirmation + bridge; suppress steps whose action is already done; accessible (screen-reader-parseable, coach marks visually distinct from buttons); fire within ~100ms of the qualifying event to feel contextual.

## Competitor Feature Analysis

| Feature | Notion | Bear / Apple Notes | Obsidian | Our Approach (Geode) |
|---------|--------|--------------------|----------|----------------------|
| First-run content | "Getting Started" learn-by-doing page + functional checklist, personalized templates | Drops into a pre-filled welcome note; no wall | Starter vault / minimal; assumes some savvy | Seeded Spanish welcome note that is also the tour stage |
| Onboarding style | In-context tooltips on hover, learn-by-doing | Almost none — content speaks for itself | Docs-driven, community starter kits | Progressive spotlight tour on the real UI, ≤5 steps |
| Account/cloud framing | Account up front (SaaS) | iCloud is invisible/native | Sync is a paid add-on, explicitly technical | "Respaldo en la nube", account only named at signup, non-blocking |
| Jargon exposure | Low (consumer) | Very low | High (dev-oriented) | Zero in Capa 0 — the core differentiator |

## Sources

- [The Anatomy of a Great In-App Onboarding Tour — Digia](https://www.digia.tech/post/anatomy-of-a-great-in-app-onboarding-tour/) — step-count caps, abandonment %, contextual-vs-front-loaded retention, coach-mark rules, accessibility (HIGH — quantitative)
- [Choosing the right user onboarding UX pattern — Appcues](https://www.appcues.com/blog/choosing-the-right-onboarding-ux-pattern) and [Product tour UI patterns — Appcues](https://www.appcues.com/blog/product-tours-ui-patterns) — coach mark / spotlight / progressive patterns and anti-patterns (MEDIUM)
- [Notion's clever onboarding and inspirational templates — Appcues/GoodUX](https://goodux.appcues.com/blog/notions-lightweight-onboarding) — learn-by-doing, personalized templates (MEDIUM)
- [User onboarding strategies — Userflow](https://help.userflow.com/docs/onboarding-strategies) and [11 Onboarding User Flow Examples — Userpilot](https://userpilot.com/blog/onboarding-user-flow-examples/) — multi-session / dashboard checklist, deferred optional steps (MEDIUM)
- [12 Apps with Great User Onboarding — UXCam](https://uxcam.com/blog/10-apps-with-great-user-onboarding/) — consumer-app patterns (LOW-MEDIUM)
- Codebase: `src/renderer/src/App.tsx` (welcome + titlebar), `NewVaultDialog.tsx`, `SettingsModal.tsx` (device flow), `.planning/PROJECT.md` (closed decisions) — HIGH

---
*Feature research for: guided non-technical onboarding + first-run tour (Geode v1.3)*
*Researched: 2026-07-08*
