# Stack Research

**Domain:** First-run onboarding + interactive spotlight tour for a local-first Electron/React desktop app (Geode v1.3)
**Researched:** 2026-07-08
**Confidence:** HIGH

## TL;DR — The opinionated call

**Add ZERO new dependencies.** All three new capabilities are already covered by the existing stack + a small amount of first-party code:

1. **Interactive tour** → build a custom `TourOverlay` (React + `getBoundingClientRect` + one fixed-position overlay). ~120–180 lines. Do **not** pull `react-joyride`, `driver.js`, or `shepherd.js`.
2. **Default `~/Documents/Geode/<name>` notebook** → `app.getPath('documents')` + `node:path` + `node:fs/promises` (all already imported in the main process). Collision handling mirrors the existing `VaultService.createNote` counter pattern.
3. **Open GitHub signup in the browser** → `shell.openExternal` — already used in `src/main/index.ts:286` and `:660`. No new surface, no new dep.

The only "stack" work is first-party code + possibly one new IPC channel (`geode:vault-create-local`) and one `data-tour` attribute convention. This is consistent with the project's deliberately lean dependency tree (13 runtime deps, no utility/UI-kit libraries) and its Lucide + Spanish + strict-CSP conventions.

---

## Recommended Stack

### Core Technologies (all already present)

| Technology | Version (installed) | Purpose for this milestone | Why it's the right tool |
|------------|--------------------|-----------------------------|--------------------------|
| React | 19.2.7 | `TourOverlay` component, welcome screen, backup-assistant checklist | Already the renderer framework; `useLayoutEffect` + refs are exactly the primitives a spotlight needs |
| Electron `app.getPath('documents')` | Electron 43.0.0 | Cross-platform Documents dir for the default Geode folder | Native, returns the OS-correct localized Documents path on Win/macOS/Linux — no `os.homedir()` + hardcoded `"Documents"` guessing (which breaks on redirected/localized folders) |
| Electron `shell.openExternal` | Electron 43.0.0 | Hand-off to `https://github.com/signup` and to the device-flow verification URL | Already the app's way to open the system browser; opens outside the sandboxed renderer safely |
| `node:fs/promises` (`mkdir`) | Node 18 (bundled) | Create `~/Documents/Geode/<name>` (with `{ recursive: true }`) | Already used throughout `VaultService`; atomic-write + path-traversal patterns already established |
| `node:path` (`join`, `basename`, `resolve`) | Node 18 (bundled) | Compose + validate the default path | Already imported in `vault.ts` |
| Lucide React | 1.23.0 | Icons for the tour card, welcome, checklist (monochrome, `currentColor`) | Mandated by convention; no emojis |
| CSS3 (`index.css`) | — | Spotlight mask, coach-mark card, `data-tour` highlight ring | `style-src 'self' 'unsafe-inline'` is already in the CSP (see below) — inline positioning styles are permitted |

### Supporting Libraries

**None required.** This is the headline result of the research. No new supporting library clears the bar of "cheaper than ~150 lines of first-party code, worth a permanent dependency + React-19 coupling."

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript strict (existing) | Type the `TourStep[]` model, IPC contract additions | Explicit return types required by convention |
| electron-vite (existing) | No config change needed | Custom overlay needs no bundler plugin; a tour lib would too, but it's moot |

## Installation

```bash
# Nothing to install. Intentionally empty.
# All capabilities use already-installed packages (react, electron, lucide-react)
# plus Node built-ins (node:fs/promises, node:path).
```

---

## Deep dive (a): Tour overlay — custom vs. library

### Recommendation: **custom `TourOverlay`** (HIGH confidence)

**The mechanism is small and well-understood:**
- Each step references a real element by a stable `data-tour="<id>"` attribute (e.g. `data-tour="btn-nueva-nota"`, `data-tour="btn-respaldo"`).
- On step change: `document.querySelector('[data-tour="…"]')` → `el.getBoundingClientRect()` → position a fixed-position spotlight (an SVG/box-shadow mask cutout) and a coach-mark card next to the rect.
- Recompute on `resize` and `scroll` (capture phase) and via a `ResizeObserver` on the target; use `useLayoutEffect` so the card paints in the right place on the first frame (no flicker).
- Advance/skip/finish are plain React state; persist "tour seen" in `settings.json` (the existing `SettingsService`) so it fires once and is re-launchable from Ayuda.

**Why custom wins here:**

1. **Scope is tiny and bounded.** A first-run tour of a handful of real buttons is one component, one CSS block, one `TourStep[]` array. A library is net-negative when the custom version is ~150 lines.
2. **Theming + Spanish are unavoidable work either way — and libraries fight you on it.** `react-joyride`/`shepherd` ship their own tooltip DOM, beacon, and default (light) styling. You'd re-skin all of it to Geode's dark theme, replace their icons with Lucide, and override every English default string. That is often *more* work than owning the markup, and it leaves foreign class names in the DOM.
3. **React 19 coupling risk.** `react-joyride` only gained React 19 support in **v3.0.0 (a full rewrite shipped March 2026)** after lagging React 19 by more than a year (2.x used APIs removed in React 19: `unmountComponentAtNode`, `unstable_renderSubtreeIntoContainer`). Anchoring a core onboarding flow to a young rewrite of a library that historically trailed React majors is a maintenance liability for an app pinned to React 19.2.
4. **Dependency philosophy.** The project has a deliberately lean tree (no lodash, no date lib, no UI kit). A tour library is exactly the kind of "convenience for a one-off" dep the codebase has so far avoided.
5. **CSP is *not* the blocker (verified).** The renderer CSP is `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:` (`src/renderer/index.html:14`). `unsafe-inline` for styles means a lib that injects inline styles would technically load — so CSP is a *non-argument* in either direction. The decision rests on scope, theming, Spanish, and coupling, all of which favor custom.

**Custom-overlay gotchas to design for (feed these to PITFALLS/roadmap):**
- **First-paint flicker** → use `useLayoutEffect`, not `useEffect`, for measure+position.
- **Target not yet mounted / off-screen** → guard `querySelector` for null; `scrollIntoView` the target before measuring; skip the step gracefully if the anchor is absent (defensive against UI changes).
- **Window resize / maximize / pane splits** → listen to `resize` + `scroll` (capture) and a `ResizeObserver`; the app already emits `windowMaximizeChanged`.
- **Multi-pane layout moving anchors** → anchor to toolbar/sidebar buttons (stable) rather than editor-content elements (volatile).
- **Trigger timing** → fire the tour *after* the first notebook is created and the tree is rendered, not on cold boot, so the anchors exist.

### If you ever must use a library (documented alternative)

| Library | Version | Deps | Verdict for Geode |
|---------|---------|------|-------------------|
| **driver.js** | 1.6.0 | **zero runtime deps**, framework-agnostic vanilla | The *least-bad* library option: tiny, no React coupling, MIT. Still injects its own overlay + popover CSS to re-theme and English defaults to re-string. Only consider if the tour grows into a large multi-flow system. |
| react-joyride | 3.1.0 | React peer `16.8 - 19`, Floating UI | React-19 support is brand-new (v3, Mar 2026 rewrite). Heavier, opinionated tooltip/beacon DOM. Not worth the coupling for a small tour. |
| shepherd.js | 15.2.2 | `@floating-ui/dom` | Framework-agnostic but larger; own theme system (Shepherd themes) to override. Overkill. |

---

## Deep dive (b): Default `~/Documents/Geode/<name>` in the main process

### Recommendation (HIGH confidence)

Add a new main-process path resolver + a thin IPC channel; **reuse the existing create-with-repo plumbing minus the folder picker.**

**Path resolution (main process, cross-platform):**
```
base   = app.getPath('documents')          // OS-correct, localized Documents dir
geode  = path.join(base, 'Geode')          // parent container for all notebooks
target = path.join(geode, safeName)        // safeName = sanitized <nombre>
```
- Use `app.getPath('documents')` — **not** `os.homedir() + '/Documents'`. On Windows the Documents folder can be redirected (OneDrive) or localized ("Documentos"); `getPath('documents')` returns the real path. On Linux it honors `XDG_DOCUMENTS_DIR`.
- Create with `mkdir(target, { recursive: true })` (already the pattern in `VaultService.createFolder`).

**Collision / uniqueness handling** — mirror the existing counter pattern in `VaultService.createNote`/`createFolder` (`"Nueva nota 2"`): if `~/Documents/Geode/<name>` already exists and is non-empty, append ` 2`, ` 3`, … until free. Reuse `VaultService.isEmptyDir` (already exists) to decide "existing-but-empty is fine to use."

**Name sanitization** — strip characters illegal in file names on Windows (`< > : " / \ | ? *`), trim, collapse whitespace, and reject reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…). This is *new* validation the current picker-based flow never needed (the OS dialog guaranteed a valid path). Flag for PITFALLS.

**Integration point:** the existing `IPC.vaultCreateWithRepo` handler (`src/main/index.ts:437`) calls `vault.pickFolder(...)`. For the local happy path, add a sibling handler (proposed `geode:vault-create-local`) that:
1. resolves the default path (above),
2. `mkdir` recursive,
3. `vault.setRoot(dir)` + `gitService.ensureRepo(dir)` (local init only — **no** GitHub, honoring "local first, cloud later"),
4. `rememberVault(dir)`.

Keep folder-picker creation available as an "elegir otra carpeta" escape hatch, but off the happy path.

## Deep dive (c): Opening the GitHub signup page

### Recommendation (HIGH confidence)

**Reuse `shell.openExternal` — no new dependency, no new pattern.** It's already used at `src/main/index.ts:286` (external-link handler) and `:660` (device-flow verification URI). Add one IPC call (or reuse a generic `geode:open-external`) that opens `https://github.com/signup`. The non-blocking backup assistant is React state + the *already-implemented* device flow (`startDeviceFlow`/`completeDeviceFlow` in the preload, `requestDeviceCode`/`pollForToken` in `github.ts`) + the *already-implemented* `createRepo` + push. **No stack additions.**

---

## Alternatives Considered

| Recommended | Alternative | When the alternative would win |
|-------------|-------------|-------------------------------|
| Custom `TourOverlay` | `driver.js` 1.6.0 | If the tour becomes a large, multi-flow, reusable product-tour system across many screens; then a vanilla, zero-dep engine amortizes. Not the case for a one-time first-run tour. |
| Custom `TourOverlay` | `react-joyride` 3.1.0 | Basically never for this app — React-19 coupling + heavy theming/re-stringing outweigh any savings on a small tour. |
| `app.getPath('documents')` | `os.homedir()` + `'Documents'` | Never — breaks on localized/redirected (OneDrive/XDG) Documents folders. |
| New `geode:vault-create-local` IPC + default path | Reuse `vaultCreateWithRepo` with a "skip picker" flag | Acceptable, but a dedicated channel keeps the local-first (no-account) path clean and typed; preferred. |
| `shell.openExternal` | `BrowserWindow` embedding github.com/signup | Never — embedding an auth/signup page in-app is a security and captcha/2FA nightmare; the system browser is correct. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-joyride` (and any tour lib) for the v1.3 tour | Permanent dep + React-19 coupling (only fixed Mar 2026) + full re-theme/re-string to match Lucide/Spanish/dark — for ~150 lines of work | First-party `TourOverlay` |
| `os.homedir()` + hardcoded `'Documents'` | Wrong on localized ("Documentos") / OneDrive-redirected / XDG-configured systems | `app.getPath('documents')` |
| Embedding signup in an Electron `BrowserWindow`/`webview` | Captcha/email verification can't be automated (locked decision); security + CSP risk | `shell.openExternal('https://github.com/signup')` + in-app checklist |
| Popper.js / Floating UI as a direct dep | Would only be pulled to position the coach-mark card; `getBoundingClientRect` + simple clamp-to-viewport math is enough for anchored cards | Manual positioning in `TourOverlay` |
| Converting anything to reach these features | Preload MUST stay CommonJS `.cjs`; renderer stays sandboxed | Keep the existing three-tier IPC boundary |

## Stack Patterns by Variant

**If the tour stays a small first-run walkthrough (the actual plan):**
- Custom `TourOverlay` + `data-tour` attributes + `settings.json` "seen" flag.
- Because: minimal code, zero deps, full control of Spanish copy + Lucide + dark theme.

**If a future milestone turns this into a large, evolving product-tour system:**
- Revisit `driver.js` (zero-dep, framework-agnostic) — not `react-joyride`.
- Because: at that scale a maintained engine (keyboard nav, multi-step orchestration, positioning edge cases) amortizes; still avoid React-coupled libs.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| React 19.2.7 | custom overlay | No third-party React version constraints introduced (that's the point) |
| Electron 43.0.0 | `app.getPath('documents')`, `shell.openExternal` | Both stable, long-standing APIs; already used in-repo |
| CSP `style-src 'self' 'unsafe-inline'` | inline positioning styles in `TourOverlay` | Inline styles permitted; no CSP change needed for the overlay |
| Node 18 (bundled) | `fs/promises.mkdir`, `node:path` | Already used across `VaultService` |

## Sources

- `src/main/index.ts` (lines 286, 437–453, 660), `src/main/services/vault.ts`, `src/main/services/github.ts`, `src/renderer/index.html:14`, `package.json` — repo inspection, HIGH confidence (primary source for "already exists")
- `npm view driver.js@1.6.0 / react-joyride@3.1.0 / shepherd.js@15.2.2` — version + peer-dep verification, 2026-07-08, HIGH confidence
- react-joyride React-19 history — https://github.com/gilbarbara/react-joyride/issues/1122 , /1130 , /1151 ; https://www.npmjs.com/package/react-joyride — MEDIUM-HIGH (issue tracker + npm)
- Electron `app.getPath` semantics (localized/redirected Documents) — Electron docs (`app.getPath('documents')`), HIGH confidence (long-standing documented API, corroborated by in-repo usage of `getPath('userData')`)

---
*Stack research for: v1.3 Onboarding guiado (welcome + local notebook + cloud-backup assistant + first-run tour)*
*Researched: 2026-07-08*
