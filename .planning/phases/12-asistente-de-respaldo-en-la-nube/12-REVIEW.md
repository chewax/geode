---
phase: 12-asistente-de-respaldo-en-la-nube
reviewed: 2026-07-09T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/main/services/git.ts
  - src/main/services/settings.ts
  - src/main/index.ts
  - src/main/services/github.ts
  - src/main/services/backupErrors.ts
  - src/renderer/src/App.tsx
  - src/renderer/src/BackupButton.tsx
  - src/renderer/src/SettingsModal.tsx
  - src/renderer/src/BackupWizard.tsx
  - src/renderer/src/BackupCard.tsx
findings:
  critical: 1
  warning: 1
  info: 1
  total: 3
status: issues_found
---

# Phase 12: Code Review Report (re-review)

**Reviewed:** 2026-07-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This is a targeted re-review of the fixes applied for the prior CR-01 blocker
(cross-vault auto-push leak) and WR-01/WR-02/IN-01. `npm run typecheck` and
`npm run build` both pass clean; the preload still builds as CommonJS
(`out/preload/index.cjs`, `"use strict"; const electron = require("electron")`).

**CR-01 (cross-vault push destination) is correctly closed.** `getRemote(dir)`
reads `origin` from the vault's own `.git` config; `autoPushAfterCommit`,
`gitPush`, and `vaultEnableBackup` all resolve the push URL exclusively via
`gitService.getRemote(root)`, never via a global `settings.github.remote`. A
vault with no origin correctly no-ops on auto-push and throws a Spanish
"activá el respaldo primero" error on manual push. `pushedByVault` is
consistently used by every reader/writer (`gitPendingPush`, `gitGraph`,
`autoPushAfterCommit`, `gitPush`, `vaultEnableBackup`); the legacy flat
`github.pushed` is only ever read (lazily attributed to `lastVault`), never
written. `githubConfig()` keeps `connected`/`login` global (correct — one
GitHub account, shared) while `remote` is now genuinely per-vault. I could not
find any remaining code path that reads the deprecated global
`settings.github.remote` as a source of truth for a push decision.

**WR-02 (full error object logged) and IN-01 (⚠ literal) are both correctly
fixed** — verified below.

**However, the CR-01 refactor introduced a new regression (see CR-01 below,
renumbered from the previous review since the old CR-01 is now closed):** the
renderer's status bar and persistent backup button derive "is this vault
backed up" from `githubCfg.connected` (the **global** GitHub-account flag)
without also checking `githubCfg.remote` (the **per-vault** field the CR-01
fix just introduced). Since `pushCount` is forced to `0` whenever
`cfg.remote` is `null` (see `refreshGithub`), a vault that has **never** been
backed up shows "Todo en la nube" / the green cloud "al-dia" state as soon as
the user's GitHub account is connected globally — which, in a multi-vault
app, now happens routinely for every newly created vault. This directly
violates the STAT-01 invariant the review focus asked to re-verify, and is a
textbook example of a regression caused by only partially propagating the
CR-01 per-vault scoping (one call site, `pushEnabled` in the command palette
wiring, *was* updated correctly and shows the intended pattern; two others
were not).

A secondary, lower-severity regression from the WR-01 fix is also flagged
(mapping already-Spanish, already-specific device-flow errors through
`mapBackupError` collapses them into a generic fallback message).

## Critical Issues

### CR-01: "Todo en la nube" / backup-button "al día" state ignores per-vault `remote`, falsely claiming an unbacked vault is safe

**File:** `src/renderer/src/App.tsx:1474` (`statusLabel` call), `src/renderer/src/App.tsx:1512` (`BackupButton` `connected` prop), `src/renderer/src/App.tsx:1815-1837` (`statusLabel`), `src/renderer/src/BackupButton.tsx:39-47` (`kind` derivation)

**Issue:**
`refreshGithub()` computes `pushCount` as:
```ts
setPushCount(cfg.connected && cfg.remote ? await window.geode.git.pendingPush() : 0)
```
So `pushCount` is `0` both when the vault is fully backed up **and** when the
vault has no `origin` at all (`cfg.remote === null`) — the CR-01 fix
correctly made `cfg.remote` per-vault, so a freshly created/switched-to vault
that was never backed up now legitimately has `remote: null`.

But the two UI call sites that decide "is this vault safe to call
backed-up" only look at `githubCfg.connected` (the **global** account flag,
intentionally kept global per CR-01's design) — they never check
`githubCfg.remote`:

```ts
// App.tsx:1474
const s = statusLabel(status, !!githubCfg?.connected, pushCount)

// App.tsx:1512
<BackupButton
  connected={!!githubCfg?.connected}
  pushCount={pushCount}
  ...
/>

// App.tsx:1826-1833 (statusLabel)
case 'clean':
  if (githubConnected) {
    return pushCount === 0
      ? { text: 'Todo en la nube', Icon: Cloud }
      : { text: 'Guardado en este dispositivo', Icon: HardDrive }
  }
  return { text: 'Guardado', Icon: Check }

// BackupButton.tsx:39-47
const kind = backingUp ? 'respaldando'
  : failed ? 'error'
    : connected && pushCount === 0 ? 'al-dia'      // <-- reached with remote=null
      : connected ? 'sin-subir'
        : 'sin-respaldo'
```

Repro: user connects their GitHub account while working in vault A (sets
`settings.github.token`, i.e. `connected = true` globally) and backs it up.
They then create vault B (`vaultCreateLocal`, a plain local notebook, no
`origin` ever configured). `githubConfig()` correctly reports
`{ connected: true, remote: null }` for vault B. `refreshGithub()` sets
`pushCount = 0` (because `cfg.remote` is null, not because anything is
actually synced). As soon as any note is opened in vault B
(`onPaneNoteOpen` sets `status = 'clean'`), the footer shows **"Todo en la
nube"** with the green `Cloud` icon, and the persistent `BackupButton` shows
**"al-dia"** — for a vault that has no remote configured at all and has never
been pushed anywhere.

This is worse than it sounds combined with the onboarding flow: `BackupCard`
(the explicit invitation banner) only fires once, guarded by
`backupOnboarding === null` at vault-creation time
(`App.tsx:507-510`); `backupOnboarding` is a single global setting
(`settings.backup.onboarding`), so once vault A's backup completes it becomes
`'completado'` and the invitation card never fires again for vault B either.
The user is left with no correct signal anywhere that vault B is unprotected
— the status bar actively claims the opposite.

Note that the fix pattern already exists correctly elsewhere in the same
file, one gate away from these two:
```ts
// App.tsx:1027 (commandApi.pushEnabled) — correct: checks BOTH connected and remote
pushEnabled: !!(githubCfg?.connected && githubCfg.remote) && pushCount > 0 && !pushing
```

This is a direct, easily reproducible regression introduced by the CR-01
refactor: before the fix, `remote` was a single global field shared by every
vault, so `connected` and `remote` were (accidentally) correlated almost
everywhere — the false-safe state was rare (and masked by the *worse*
cross-vault-push bug). After correctly scoping `remote` per vault, every new
never-backed-up vault now routinely hits this path, because `connected`
(global) is very commonly `true` while `remote` (per-vault) is legitimately
`null`.

**Fix:** Derive a single per-vault "backed up" flag and use it consistently,
mirroring the already-correct `pushEnabled` pattern:
```ts
// App.tsx — derive once, alongside the other graph/head-derived booleans
const backedUp = !!(githubCfg?.connected && githubCfg.remote)

// footer status label
const s = statusLabel(status, backedUp, pushCount)

// persistent backup button
<BackupButton
  connected={backedUp}
  pushCount={pushCount}
  ...
/>
```
Also update the `statusLabel`/`BackupButton` doc comments and parameter names
(currently `githubConnected`/`connected`) to make clear the flag now means
"this vault has an active backup", not "the GitHub account is connected" —
the current naming is exactly what let the two call sites be updated
inconsistently.

## Warnings

### WR-01: `mapBackupError` collapses already-good, already-Spanish device-flow messages into a generic fallback

**File:** `src/main/services/github.ts:81-89` (`pollForToken`), `src/main/index.ts:794-807` (`githubCompleteDeviceFlow`), `src/main/services/backupErrors.ts:49-74` (`mapBackupError`)

**Issue:** The previous review's WR-01 (raw English API text leaking to the
UI) is correctly fixed — `githubStartDeviceFlow`/`githubCompleteDeviceFlow`
now wrap every call in `mapBackupError`, so nothing untranslated reaches the
renderer. However, `pollForToken` already throws specific, well-written
Spanish messages for the common device-flow outcomes:
```ts
case 'expired_token': throw new Error('El código expiró; probá de nuevo')
case 'access_denied': throw new Error('Autorización cancelada')
...
throw new Error('Se agotó el tiempo de autorización')
```
None of these carry an HTTP `status`/`code` that `mapBackupError` recognizes
(they're not network errors, not 401/403, not 422/"already exists"), so every
one of them falls through to the generic `unknown` branch and gets replaced
by the same fallback string:
```
"No se pudo respaldar ahora. Tu cuaderno sigue guardado en este dispositivo; volvé a intentarlo en un momento."
```
A user whose device code expired, or who declined authorization on GitHub's
page, now sees this generic "try again later" message instead of the
specific, more actionable original copy — a UX regression relative to
pre-fix behavior for these particular cases, even though the "no raw English"
goal is achieved. This also conflicts with the CLAUDE.md convention that
Spanish errors be "specific and actionable".

**Fix:** Let `mapBackupError` pass through errors that are already a
`BackupError` (or already-classified/human), and have `pollForToken` throw
`BackupError` directly for its known cases instead of a raw `Error`:
```ts
// backupErrors.ts — early pass-through
export function mapBackupError(e: unknown): BackupError {
  if (e instanceof BackupError) return e
  // ...existing classification...
}
```
```ts
// github.ts — pollForToken
import { BackupError } from './backupErrors'
// ...
case 'expired_token':
  throw new BackupError('unknown', 'El código expiró; probá de nuevo')
case 'access_denied':
  throw new BackupError('unknown', 'Autorización cancelada')
// ...
throw new BackupError('unknown', 'Se agotó el tiempo de autorización')
```
(`kind: 'unknown'` is fine here since these aren't `offline`/`auth`/
`name-taken`; the point is preserving the specific `message`.)

## Info

### IN-01: Deprecated global `settings.github.remote` is still written by three handlers even though it is no longer read as a source of truth

**File:** `src/main/index.ts:471-491` (`vaultCloneFromGithub`), `src/main/index.ts:493-510` (`vaultCreateWithRepo`), `src/main/index.ts:809-816` (`githubSetRemote`)

**Issue:** All three handlers still do
`settings.github = { ...settings.github, remote: url }` even though
`githubConfig()` (the only reader that matters for UI/push decisions) now
exclusively derives `remote` from `gitService.getRemote(vault.root)`. The
field is correctly documented `@deprecated` in `settings.ts:28-33`, but
continuing to write it from three call sites is dead weight that could
mislead a future maintainer into thinking it's still load-bearing (it very
nearly was, per CR-01 above, for a different field with the same shape of
bug).

**Fix:** Either stop writing `settings.github.remote` from these three
handlers now that it's inert, or add a one-line comment at each write site
pointing at the `@deprecated` doc in `settings.ts`, e.g.:
```ts
// Compat only: `remote` is unused as source of truth (see settings.ts @deprecated).
settings.github = { ...settings.github, remote: url }
```

---

_Reviewed: 2026-07-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
