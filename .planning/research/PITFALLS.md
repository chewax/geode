# Pitfalls Research

**Domain:** Guided first-run onboarding + coach-mark tour + guided GitHub account creation, layered over a sandboxed Electron (contextIsolation) local-first git-invisible notes app
**Researched:** 2026-07-08
**Confidence:** HIGH for codebase-specific findings (direct inspection of `github.ts`, `App.tsx`, `main/index.ts`, `NewVaultDialog.tsx`, PROJECT.md decisions); MEDIUM for tour/coach-mark UX pitfalls (validated against current web sources).

> **Phase legend** used in "Phase to address":
> - **P-LOCAL** = Welcome + one-click local notebook (creation onboarding)
> - **P-CLOUD** = Cloud-backup assistant (guided account creation + device flow + createRepo + first push)
> - **P-TOUR** = First-run spotlight/coach-mark tour overlay
> - **P-STRINGS** = Cross-cutting jargon rewrite ("GitHub/repo/commit/push/clonar" → "respaldo en la nube")

---

## Critical Pitfalls

### Pitfall 1: Tour anchored to elements that don't exist in the default (Capa 0) UI

**What goes wrong:**
The tour points a spotlight at a button that isn't rendered for the target user. In this codebase the highest-value-looking anchors are conditionally rendered:
- Branch button `{advanced && hasHead && ...}` (App.tsx:1172)
- Merge button `{advanced && canMerge && ...}` (App.tsx:1182)
- Version-graph button `{advanced && ...}` (App.tsx:1200)
- **Cloud/upload button `{githubCfg?.connected && githubCfg.remote && ...}` (App.tsx:1210)** — this is the dangerous one: the exact user the onboarding targets (brand-new, local-only, no account) will NOT have this button, yet the "backup" story wants to point at it.

A `document.querySelector('[data-tour="push"]')` returns `null`, and the spotlight either renders at `{top:0,left:0}` (a highlight box in the corner over nothing) or throws when reading `.getBoundingClientRect()` of null.

**Why it happens:**
The tour is authored while the developer is in Advanced Mode / already GitHub-connected, so every anchor exists on their machine. The default first-run user has a strictly smaller DOM.

**How to avoid:**
- Only anchor tour steps to **always-mounted** elements. The Save button (App.tsx:1192, `tb-btn icon cta`, no `advanced` guard) and the command-palette button (App.tsx:1164) are safe; the sidebar tree, the editor, and the save-status pill are safe. The branch/merge/graph/cloud buttons are NOT.
- Make each tour step **anchor-aware**: before showing a step, resolve the anchor; if it's missing, either skip the step or fall back to a centered card (no spotlight). Never render a spotlight on a null rect.
- Drive the "backup" tour step by *capability*, not a fixed selector — the step that teaches cloud backup should point at the onboarding's own "Respaldar en la nube" entry point (which you control and always render during onboarding), not at the conditional toolbar upload button.

**Warning signs:**
A highlight box appears in the top-left corner over nothing; console error `Cannot read properties of null (reading 'getBoundingClientRect')`; the tour "works for me" but testers on a fresh profile see it break.

**Phase to address:** P-TOUR (anchor-resolution contract), with a guard verified against a fresh profile in default mode.

---

### Pitfall 2: Tour fires before the notebook UI has mounted / laid out

**What goes wrong:**
The tour starts right after `createWithRepo`/local-create resolves, but the vault tree, first note tab, and editor mount asynchronously (IPC round-trips: `refreshTree`, `refreshGraph`, `refreshGithub` in the App bootstrap effect, App.tsx:~893). The spotlight measures anchor rects that are still zero-size or not yet in the DOM, so it lands in the wrong place — or the first note the tour references ("here's your note") isn't open yet.

**Why it happens:**
"Notebook created" (a promise resolving in main) is not the same event as "notebook UI painted." Developers trigger the tour on the data event, not the render event.

**How to avoid:**
- Gate tour start on a **UI-ready signal**, not on the create-IPC resolving. Wait until the specific anchor of step 1 exists and has a non-zero rect (poll via `requestAnimationFrame` / `ResizeObserver` for one anchor, or a `useLayoutEffect` after the tree+editor have rendered).
- Sequence the happy path explicitly: create notebook → open/seed the first note → editor focused → *then* arm the tour.
- Add a short "settle" using `ResizeObserver`/`autoUpdate`-style re-measurement so the first paint's layout shift doesn't strand the spotlight.

**Warning signs:**
First tour step consistently mis-positioned on cold start but correct on "replay"; flakier on slower machines; spotlight jumps ~100ms after appearing.

**Phase to address:** P-TOUR (start-trigger), coordinated with P-LOCAL (defines the "first note ready" event).

---

### Pitfall 3: Layout shift / scroll / window-resize desynchronizes the spotlight from its target

**What goes wrong:**
The spotlight rect is computed once from `getBoundingClientRect()` and cached. Then the user resizes the Electron window, the sidebar section expands/collapses, a toast pushes content, or the editor scrolls — and the highlighted hole no longer covers the button. On Electron this is common because the frameless window is freely resizable and content reflows.

**Why it happens:**
`getBoundingClientRect()` is a point-in-time measurement. Without listeners, the overlay is frozen while the page underneath moves.

**How to avoid:**
- Re-measure on `resize`, `scroll` (capture phase, so nested scrollers count), and on layout mutations (`ResizeObserver` on the anchor + a `MutationObserver` or the app's existing state changes). This is exactly what Floating-UI `autoUpdate` does; a lightweight custom overlay must replicate it.
- Prefer positioning the callout card with a collision-aware strategy (flip/shift) so it stays on-screen after re-measure.
- Consider gently disabling free resize *or* just re-anchoring on resize; do NOT lock scroll globally (see Pitfall 4).

**Warning signs:**
Spotlight drifts off the button after resizing the window or opening/closing a sidebar section; callout clipped at the viewport edge.

**Phase to address:** P-TOUR.

---

### Pitfall 4: Z-index / portal ordering — spotlight rendered under a modal (or trapping the app under a dim layer)

**What goes wrong:**
The onboarding involves overlapping layers: the tour overlay, the existing modal system (`.modal-overlay` used by NewVaultDialog, SettingsModal, CommitDialog), and toasts (`notify()`). If the tour overlay isn't portaled above the modal layer, a step that references a dialog gets dimmed *out* instead of highlighted. Conversely, if the dim layer stays mounted after a crash/early-exit, the whole app is left behind a non-interactive scrim (nothing clickable) — a soft lock that reads as "the app froze."

**Why it happens:**
Ad-hoc z-index numbers accrete; the tour is built as a sibling of `#root` without a defined stacking contract. Cleanup on unmount/abort is forgotten.

**How to avoid:**
- Define an explicit layer order (editor < sidebar < toolbar < modal-overlay < tour-overlay < toast) and portal the tour to `document.body` above the modal layer. Decide deliberately whether the tour sits above or below modals per step.
- Make the dim scrim **click-through except on the highlighted cutout**, or always render a visible "Saltar" / "Cerrar" affordance so the user can never be trapped.
- Guarantee teardown: unmount the overlay on abort, error, route change, and on `Escape`; a `finally`/effect-cleanup must remove the scrim even if a step throws.

**Warning signs:**
A dialog the tour references looks greyed-out; clicking does nothing anywhere after the tour errors; the scrim persists after "Saltar."

**Phase to address:** P-TOUR.

---

### Pitfall 5: Onboarding implies data is "safe"/"backed up" when it lives only on disk — betrays the core value

**What goes wrong:**
The welcome or the local-create success screen says something reassuring like "Listo, tus notas están a salvo" / "guardado y protegido." But a freshly created local notebook is only on disk with no remote — exactly the state the app already deliberately labels "Guardado en este dispositivo," NOT "Todo en la nube" (App.tsx:1702–1724, and PROJECT.md Key Decision: *"Todo en la nube" only when clean+pushed*). Overclaiming safety during onboarding directly contradicts the shipped honesty invariant and the product's central promise ("nunca perdés nada").

**Why it happens:**
Onboarding copy optimizes for warm reassurance; "safe" is the natural word. The nuance that local ≠ backed-up is invisible to a copywriter.

**How to avoid:**
- Establish a **copy invariant** mirroring `statusLabel`: the words "nube / respaldo / copia de seguridad / a salvo en otro lugar" may appear ONLY when a remote exists AND everything is pushed. Local-only success copy must stay in the "guardado en este dispositivo / en tu computadora" register.
- The cloud-backup assistant is explicitly framed as the step that *adds* safety ("todavía está solo en esta compu → hagamos una copia en la nube"), which both motivates the feature and stays honest.
- Add this as a review checklist item and, ideally, a lint/test over onboarding strings.

**Warning signs:**
Any onboarding string with "a salvo," "protegido," "respaldado," "en la nube" shown before a successful push; contradiction between the welcome screen and the status pill on the same screen.

**Phase to address:** P-LOCAL (local success copy) + P-STRINGS (the copy invariant) + P-CLOUD (where "safe" becomes true).

---

### Pitfall 6: Trying to automate GitHub signup — captcha / email verification wall

**What goes wrong:**
Someone attempts to script or embed account creation (autofill the signup form, submit via a hidden webview) to make it "one click." GitHub gates signup with CAPTCHA, a puzzle challenge, and mandatory email verification — none automatable. The flow dead-ends, or worse, an embedded webview trips fraud detection.

**Why it happens:**
The one-click local path sets an expectation that the cloud path should also be one click; the friction of "go make an account" feels like a failure to eliminate.

**How to avoid:**
- Accept the hand-off as the design (PROJECT.md already states this). Open the signup page in the **external browser** (`shell.openExternal`), not an embedded webview — embedding a login/signup page in Electron is both a security anti-pattern and more likely to be blocked.
- Provide a **checklist** ("1. Crea tu cuenta gratis 2. Confirma tu email 3. Volvé acá y tocá 'Ya tengo cuenta'") the user drives at their own pace; the assistant is non-blocking and resumable.
- Frame it as "servicio gratuito y seguro" and name "GitHub" only on the signup handoff, per the closed decision.

**Warning signs:**
Any design that reads the signup form, any embedded `<webview>`/`BrowserWindow` pointed at github.com/signup, any assumption the account exists moments after the button click.

**Phase to address:** P-CLOUD.

---

### Pitfall 7: Race between "Ya tengo cuenta" and token availability; the user closes the signup tab

**What goes wrong:**
Because signup is a hand-off in an external browser, the app has no callback for "account created." Failure modes:
- User clicks "Ya tengo cuenta" before finishing email verification → the subsequent device-flow authorize fails or `createRepo`/`getLogin` returns 401/403.
- User closes the signup tab and never authorizes → `pollForToken` sits until `expired_token`/deadline (up to `expiresIn`, default 900s) and then throws.
- The device flow is started too early (before the account exists) so its window burns while the user is still filling the signup form.

**Why it happens:**
Two out-of-band processes (browser signup, in-app device poll) with no shared completion signal; the code assumes a linear await (`startDeviceFlow()` then `completeDeviceFlow()`, NewVaultDialog.tsx:35–36).

**How to avoid:**
- **Order the steps**: don't request a device code until the user asserts the account exists. Then start the device flow, which itself verifies real credentials (a bad/no account simply never authorizes).
- Make the device-flow wait **cancelable and re-startable**: expose an abort so closing/abandoning doesn't strand a 15-minute poll; on `expired_token` show a friendly "Se venció el código, generá otro" with a re-try button (the raw error string "El código expiró; probá de nuevo" from github.ts:82 is acceptable, but the assistant should present it as a retry affordance, not a dead end).
- Treat the whole assistant as **resumable**: persist "cuenta pendiente" state so the user can leave, finish signup, and come back.

**Warning signs:**
Assistant spins indefinitely; users report "nada pasó" after closing the browser; 401 from `getLogin`/`createRepo` right after "Ya tengo cuenta."

**Phase to address:** P-CLOUD.

---

### Pitfall 8: Raw GitHub/git vocabulary leaks through error and edge-case messages

**What goes wrong:**
The happy-path UI is scrubbed of jargon, but errors bypass it. Concrete leaks in the current code:
- `createRepo` throws `GitHub crear repo: 422 {...}` (github.ts:152) — the common case is **repo name already taken** (422), surfaced verbatim with "GitHub" and a JSON body.
- `listRepos` / `getLogin` throw `GitHub repos: 404 ...`, `GitHub user: 401` (github.ts:101,120).
- `pollForToken` default branch throws `GitHub: <error>` (github.ts:86).
- `vaultCreateWithRepo` throws `Conectá tu cuenta de GitHub en Ajustes` (main/index.ts:441) — names GitHub and "Ajustes."
- The push path (git.ts) can surface `commit`, `remote`, `HEAD`, `non-fast-forward` strings.
Any of these shown in the onboarding assistant breaks the "git stays invisible" invariant precisely at the moment a non-technical user is most anxious.

**Why it happens:**
Errors are thrown deep in services with developer-facing English/GitHub strings and rendered directly (`setError((e as Error).message)`, NewVaultDialog.tsx:40,56,71,85).

**How to avoid:**
- Add a **translation boundary** in the onboarding/cloud-backup layer: map known failure classes to human Spanish, cloud-framed copy — e.g. 422 name-taken → "Ya usás ese nombre para otra copia; probá otro"; 401/403 → "No pudimos verificar tu cuenta; volvé a conectar"; network → "Sin conexión a internet". Never render the raw service message in onboarding surfaces.
- Reword the "connect first" guard to cloud language ("Primero conectá tu respaldo en la nube").
- Sanitize push errors through the same map (see Pitfall 11).

**Warning signs:**
Any toast/inline error in onboarding containing "GitHub", "repo", "commit", "push", "remote", "422", "HEAD", or a JSON blob.

**Phase to address:** P-CLOUD (error map) + P-STRINGS (vocabulary rules).

---

### Pitfall 9: Default `~/Documents/Geode/<nombre>` folder collisions, permissions, and unicode/space paths

**What goes wrong:**
The one-click local path skips the folder picker and writes to `~/Documents/Geode/<nombre>`. Failure modes:
- **Collision**: the user makes "Mi cuaderno" twice, or a folder already exists (possibly a *different* existing vault, or a non-empty non-git folder) → silent overwrite, or init-into-existing-content, or a confusing error.
- **Permissions / relocated Documents**: OneDrive-redirected `Documents`, a read-only or synced folder, corporate policy, or `Documents` not existing → write fails.
- **Path with spaces/unicode/emoji** in username or notebook name → isomorphic-git and fs mostly handle it, but shell reveal, path building, and any string-concatenated path can break; a notebook name with `/`, `\`, `:` or trailing dots is invalid on Windows.

**Why it happens:**
"No picker in the happy path" removes the user's chance to resolve collisions; the default location is assumed writable and ASCII.

**How to avoid:**
- **De-duplicate deterministically**: if `<nombre>` exists, append " 2", " 3"… (or a suffix) rather than reusing/overwriting; never `ensureRepo` into a folder that already contains someone else's `.git` or notes.
- **Sanitize the notebook name** into a safe folder name (strip/replace `\ / : * ? " < > |`, trailing dots/spaces, reserved Windows names CON/PRN/AUX/NUL); keep the pretty name as display metadata.
- **Validate the base dir up front**: ensure `Documents/Geode` exists and is writable; on failure, fall back gracefully (offer a picker or an app-data location) with human copy — never a raw `EACCES`/`EPERM`.
- Test explicitly on a machine with OneDrive-redirected Documents and a unicode username.

**Warning signs:**
Second "Crear cuaderno" opens/overwrites the first; `EPERM`/`EACCES` on create; reveal-in-explorer opens the wrong or no folder; users with accented usernames report failures.

**Phase to address:** P-LOCAL.

---

### Pitfall 10: The one-click create path still forces a native folder picker (mismatch with the design)

**What goes wrong:**
The existing `vaultCreateWithRepo` handler calls `vault.pickFolder(...)` (main/index.ts:442) — a native OS dialog — and also *requires a GitHub token up front* (main/index.ts:440–441). The v1.3 happy path is explicitly "1 click, carpeta por defecto, sin selector, sin cuenta." If onboarding reuses this handler as-is, it violates two core requirements at once (picker appears; account demanded before writing).

**Why it happens:**
Reusing the existing "new vault" plumbing (built for the power-user NewVaultDialog) instead of a new local-first create path.

**How to avoid:**
- Add a **new IPC path** (e.g. `vaultCreateLocal(name)`) that: computes the default `Documents/Geode/<safe-name>` path, `ensureRepo` (git init, no remote), sets root, remembers vault — **no picker, no token**. Keep `createWithRepo` for the Advanced/explicit path.
- Keep the folder picker available as an "elegir otra carpeta" escape hatch, but off the happy path.

**Warning signs:**
A native folder dialog appears during "Crear mi primer cuaderno"; onboarding errors with "Conectá tu cuenta" before the user has written anything.

**Phase to address:** P-LOCAL.

---

### Pitfall 11: First push fails on the freshly created repo (auth / empty / protocol) with a jargon error

**What goes wrong:**
After `createRepo` (auto_init:false, good — avoids README merge conflict, github.ts:150) the app must push the local `main` for the first time. Failure modes: token lacks write (scope/SSO), the local repo has **no commits yet** (nothing to push → confusing "everything up to date" or an error), branch name mismatch (`main` local vs GitHub default), transient network, or isomorphic-git http auth quirks. Any raw failure ("non-fast-forward", "remote rejected", "401") leaks jargon and strands the user believing the backup succeeded or failed opaquely.

**Why it happens:**
The empty-repo first-push is a distinct edge from the routine incremental push the app already does; onboarding assumes push "just works."

**How to avoid:**
- Ensure there is **at least one commit** before the first push (the onboarding seeds a first note; make sure creating the notebook also creates the initial version so `main` has a ref to push).
- Verify the pushed branch matches (`main` end-to-end; `SCOPE='repo'` in github.ts:12 already covers private write).
- Wrap first-push in the **same error-translation boundary** as Pitfall 8; on success, only then flip status/copy to the "en la nube" register (ties to Pitfall 5).
- Make first-push **idempotent/retryable**: if it fails mid-way, "Reintentar respaldo" must not create a second repo or leave a half-attached remote.

**Warning signs:**
"Respaldo listo" shown while the GitHub repo is still empty; push errors containing "fast-forward"/"401"; a second click creates a duplicate repo.

**Phase to address:** P-CLOUD.

---

### Pitfall 12: Onboarding blocks the user from writing (backup as a toll, or a modal that can't be escaped)

**What goes wrong:**
The welcome/tour/backup assistant becomes a gate: a full-screen modal the user can't dismiss, a tour that must be completed before the editor is usable, or a "connect cloud to continue" wall. This contradicts the closed decision *"local primero, nube después — el respaldo nunca es peaje de entrada"* and the core promise that you can always just write.

**Why it happens:**
Onboarding flows are naturally linear/modal; "non-blocking" requires deliberate escape hatches at every step.

**How to avoid:**
- Every onboarding surface has an obvious, always-available "Saltar" / "Ahora no" / "Cerrar" (Escape works), and closing it lands the user in a usable editor with a real (local) notebook.
- The cloud assistant is a dismissible panel, not a required step; it can be re-summoned from Ayuda.
- The tour is skippable at any step and its state is separate from app usability.

**Warning signs:**
No visible dismiss on any onboarding screen; Escape does nothing; the editor is inert until the tour/backup finishes.

**Phase to address:** P-LOCAL (welcome), P-CLOUD (assistant), P-TOUR (skip).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reuse `vaultCreateWithRepo` (picker + token) for the local path | No new IPC | Violates "no picker / no account" happy path; couples local create to GitHub | Never for the happy path — add `vaultCreateLocal` |
| Anchor tour to `data-tour` on advanced/conditional buttons | Easy to author while in Advanced Mode | Breaks on fresh profiles; corner-of-screen spotlights | Never — anchor only to always-mounted elements |
| Measure anchor rect once (no resize/scroll listeners) | Simpler overlay | Spotlight drifts on resize/scroll/layout shift | Only a throwaway prototype |
| Render service error text directly in onboarding (`e.message`) | Zero mapping work | Leaks "GitHub/repo/422/HEAD" jargon at the worst moment | Never in onboarding surfaces |
| Persist no onboarding/tour "seen" flag | Ships faster | Tour re-fires every launch or can't be replayed from Ayuda | Never — needs a settings flag |
| Global scroll-lock during the tour | Prevents scroll-away | "Trapped" feeling; can strand a soft-locked app if teardown fails | Avoid; re-anchor on scroll instead |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub signup | Embedding signup in a webview / scripting the form | External browser (`shell.openExternal`) + resumable checklist; captcha/email make automation impossible |
| GitHub device flow | Awaiting `completeDeviceFlow()` with no cancel; starting before the account exists | Cancelable/re-startable poll; start only after "Ya tengo cuenta"; handle `expired_token`/`access_denied`/`slow_down` (already in github.ts:75–89) with retry affordances, not dead ends |
| `createRepo` | Surfacing 422 (name taken) verbatim; assuming success = repo has content | Translate 422 → "ese nombre ya está usado"; `auto_init:false` means the repo is empty until first push — seed a commit and push |
| First push (isomorphic-git) | Pushing a repo with no commits / wrong branch / no auth mapping | Ensure ≥1 commit, branch `main` both sides, `repo` scope; retry idempotently (don't recreate the repo) |
| GitHub REST (`user/repos`, `user`) | Ignoring 401/403/rate-limit (403 + `X-RateLimit-Remaining: 0`) | Map to human copy; back off; don't loop |
| Electron external links | `window.open`/anchor navigating the app window to github.com | `shell.openExternal`; never navigate the renderer to remote origins (CSP + security) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Tour re-measures on every rAF unconditionally | CPU spin, fan on, jank during tour | Re-measure only on resize/scroll/anchor-mutation (ResizeObserver), debounced | Any low-end laptop, immediately |
| Device-flow poll interval ignored | GitHub returns `slow_down`, then throttles | Respect `interval`+`slow_down` (already handled github.ts:78–80) | Under GitHub's rate limiting |
| `listRepos` for a user with hundreds of repos | Slow "elegir repo"; `per_page=100` truncates | Not on the onboarding happy path (create, don't list); paginate only in Advanced clone | Power users; not the onboarding target |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Embedding GitHub login/signup in a BrowserWindow/webview | Credential phishing surface; GitHub blocks it; breaks sandbox posture | External browser only; device flow keeps the token exchange in main |
| Relaxing CSP (`unsafe-inline`/remote origins) to make an overlay/webview work | Widens XSS surface in the sandboxed renderer | Keep strict CSP; build the tour with local DOM/CSS, no remote assets |
| Passing a raw renderer-supplied path/name to fs or shell | Path traversal; escaping the vault | Reuse `vault.resolveInside`/`absPath` (already the pattern, main/index.ts:465–467); sanitize the notebook name before it becomes a folder |
| Logging the OAuth access token during device-flow debugging | Token leak in console/logs | Never log tokens; token stays encrypted via safeStorage (existing pattern) |
| Trusting `data-tour` selectors that could be injected by a plugin | Tour highlights/acts on attacker-controlled DOM | Scope anchors to app-owned elements; don't `eval`/act on plugin-provided nodes |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Spanish copy overflows tooltip/callout (ES ~15–30% longer than EN) | Clipped text, broken layout in the coach-mark card | Design callouts for long strings; test with the actual longest ES copy; no fixed-height cards |
| Overlay dim too dark/too light | Disorientation or no attention direction | 50–70% scrim opacity; arrow points at the specific element, not a region |
| Tour teaches a feature the user has no context for yet | Dismissal, confusion | Order steps to follow the user's first real action (write → save → back up); don't front-load backup |
| No focus management on the overlay | Keyboard users tab into dimmed background; screen readers lost | Move focus into the callout on open; trap focus within the step (Escape to exit); restore focus to the trigger on close (WCAG 2.4.11 / focus-trap) |
| "Todo listo / a salvo" on a local-only notebook | False sense of safety, betrays core value | Local register only; "en la nube" strictly after a successful push |
| Naming "GitHub/repo/commit" anywhere but the unavoidable signup page | Jargon anxiety for non-technical users | "respaldo en la nube / copia de seguridad"; name GitHub once, framed as free & safe |

## "Looks Done But Isn't" Checklist

- [ ] **Tour anchors:** Verify on a FRESH profile in DEFAULT mode (not Advanced, not GitHub-connected) — the branch/merge/graph/upload buttons are absent; confirm no null-rect spotlight.
- [ ] **Tour start:** Confirm step 1 lands correctly on COLD start (slow machine), not just on replay — UI-ready gating, not IPC-resolve gating.
- [ ] **Tour resilience:** Resize the window and expand/collapse a sidebar section mid-tour — spotlight re-anchors; callout stays on-screen.
- [ ] **Tour teardown:** Trigger an error / hit Escape mid-tour — scrim is fully removed, app is interactive, focus restored.
- [ ] **Replay:** Tour fires once on first run, is re-launchable from Ayuda, and doesn't re-fire every launch (settings flag persisted).
- [ ] **Local create:** No native folder picker and no account prompt on the happy path; default folder used.
- [ ] **Collision:** Create two notebooks with the same name — second doesn't overwrite; existing non-empty folders aren't clobbered.
- [ ] **Unicode/space path:** Accented username + notebook name with spaces creates, opens, reveals correctly on Windows.
- [ ] **Local honesty:** No "a salvo/respaldado/en la nube" copy before a push; status pill and onboarding copy agree.
- [ ] **Account hand-off:** Signup opens in EXTERNAL browser; assistant is dismissible and resumable; "Ya tengo cuenta" too early yields a friendly retry, not a raw 401.
- [ ] **Device flow:** `expired_token`/`access_denied`/tab-closed produce friendly, retryable Spanish copy — never a 15-min hang.
- [ ] **First push:** Repo has content after "respaldo listo" (≥1 commit pushed); retry doesn't create a duplicate repo.
- [ ] **Error jargon:** Force a 422 (repeat repo name) and a network drop — no "GitHub/repo/commit/push/422/HEAD/JSON" reaches the user.
- [ ] **Non-blocking:** Every onboarding surface has a working Skip/Close/Escape landing in a usable editor.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Tour anchored to missing element (shipped) | LOW | Add anchor-existence guard + fallback centered card; re-audit selectors against default-mode DOM |
| Spotlight desync on resize/scroll (shipped) | LOW–MED | Add ResizeObserver/scroll/resize re-measure; debounce |
| Onboarding overclaims cloud safety (shipped) | MED | Copy audit + string invariant test; correct local-register wording; add to review gate |
| Jargon leaked in error (shipped) | LOW | Insert error-translation boundary at the onboarding layer; map known codes |
| Duplicate repo from retry | MED | Detect existing remote/repo before `createRepo`; make first-push idempotent; user deletes the stray repo (rare) |
| Default folder collision overwrote data | HIGH | Prevention-only — the app's git history + OS trash mitigate, but overwrite of a non-git folder is unrecoverable; must de-dupe up front |
| Soft-lock scrim left after tour crash | LOW | Effect-cleanup/`finally` removes overlay; add a global "press Esc to exit any overlay" guard |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Anchor doesn't exist in default UI | P-TOUR | Fresh-profile default-mode run; anchor guard returns fallback, no null rect |
| 2 Tour fires before UI mounted | P-TOUR (+P-LOCAL ready-event) | Cold-start on slow machine, step 1 positioned correctly |
| 3 Layout/scroll/resize desync | P-TOUR | Resize + section toggle mid-tour, spotlight re-anchors |
| 4 Z-index/portal/soft-lock | P-TOUR | Error mid-tour, scrim removed, app interactive |
| 5 False cloud-safety copy | P-LOCAL + P-STRINGS + P-CLOUD | String audit; no "a salvo/nube" pre-push; matches status pill |
| 6 Automating signup | P-CLOUD | Signup opens external browser; no embedded webview |
| 7 Account/token race + closed tab | P-CLOUD | Early "Ya tengo cuenta" → friendly retry; cancelable poll |
| 8 Jargon in errors | P-CLOUD + P-STRINGS | Force 422/401/network → human Spanish, no git terms |
| 9 Default folder collision/perms/unicode | P-LOCAL | Duplicate-name + unicode + OneDrive-Documents tests |
| 10 Forced picker/account on local path | P-LOCAL | Happy path shows no picker, no account prompt |
| 11 First-push empty/auth failure | P-CLOUD | Repo has ≥1 commit post-backup; retry no duplicate |
| 12 Onboarding blocks writing | P-LOCAL/P-CLOUD/P-TOUR | Skip/Escape everywhere lands in usable editor |

## Sources

- Direct codebase inspection (HIGH): `src/main/services/github.ts` (device flow `expired_token`/`access_denied`/`slow_down`, `createRepo` auto_init:false, raw `GitHub …` error strings, `repo` scope); `src/renderer/src/App.tsx` (advanced-gated branch/merge/graph buttons L1172–1209, cloud button gated on `githubCfg?.connected && remote` L1210, `statusLabel` honesty invariant L1702–1724); `src/main/index.ts` (`vaultCreateWithRepo` uses picker + requires token L437–454); `src/renderer/src/NewVaultDialog.tsx` (device-flow await, raw `e.message` rendering).
- `.planning/PROJECT.md` — closed decisions: "local primero, nube después / respaldo nunca es peaje"; "Todo en la nube" only when clean+pushed (STAT-01, code-review WR-01); signup can't be automated → guided hand-off.
- [The Anatomy of a Great In-App Onboarding Tour — digia.tech](https://www.digia.tech/post/anatomy-of-a-great-in-app-onboarding-tour/) (scrim opacity, arrow specificity, context/timing)
- [Product tours for mobile-first web apps — userTourKit](https://usertourkit.com/blog/product-tours-mobile-first-web-apps) (resize recalculation / autoUpdate, scroll handling)
- [WCAG 2.2 SC 2.4.11 Focus Not Obscured — W3C WAI](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- [Focus Trap Implementation Guide — designsystemproblems.com](https://designsystemproblems.com/accessibility-compliance/focus-trap-implementation/) and [How to Build Accessible Modals with Focus Traps — UXPin](https://www.uxpin.com/studio/blog/how-to-build-accessible-modals-with-focus-traps/) (focus move-in/restore, animationend timing)

---
*Pitfalls research for: guided onboarding + coach-mark tour + guided GitHub account creation over a sandboxed Electron, git-invisible, local-first notes app*
*Researched: 2026-07-08*
