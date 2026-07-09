---
phase: 12-asistente-de-respaldo-en-la-nube
reviewed: 2026-07-09T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/main/fs/githubRepoSlug.ts
  - src/main/services/backupErrors.ts
  - src/main/services/github.ts
  - src/main/services/settings.ts
  - src/main/index.ts
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/renderer/src/BackupWizard.tsx
  - src/renderer/src/BackupCard.tsx
  - src/renderer/src/BackupButton.tsx
  - src/renderer/src/App.tsx
  - src/renderer/src/SettingsModal.tsx
  - src/renderer/src/NewVaultDialog.tsx
  - src/renderer/src/index.css
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 12 adds a guided cloud-backup onboarding flow (BackupCard, BackupWizard,
BackupButton) on top of the pre-existing GitHub device-flow/push plumbing. The
targeted security checks in the review focus all pass: `backupOpenSignup` opens
a hardcoded `https://github.com/signup` (no renderer-controlled URL), the
GitHub token is never returned to the renderer and never appears in a thrown
error message, `githubRepoSlug` is injection-safe (never throws, always falls
back, only feeds a JSON body — never a shell/URL path), the preload stays
CommonJS-compatible (built via electron-vite, only ESM `import` syntax which
compiles to `.cjs`), and `mapBackupError` correctly classifies createRepo/push
failures into the 4 locked Spanish strings without interpolating raw API text
or the token.

However, tracing `autoPushAfterCommit` / `vaultEnableBackup` / `gitPendingPush`
against `settings.github` (a single **global**, not per-vault, object) surfaced
a serious correctness/data-integrity bug: once backup is enabled for one vault,
the app can silently auto-push a *different* vault's content into the first
vault's private GitHub repo the next time the user saves in that second vault
— with no user action, confirmation, or warning. This is a direct consequence
of Phase 12 wiring real, unconditional auto-push (`autoPushAfterCommit`) on top
of a pre-existing global-settings design that was previously only reachable
through a manual, expert-only "paste a repo URL" field. See CR-01.

Two warnings and one pre-existing info item round out the findings (raw
device-flow error text bypassing `mapBackupError`, and full-error console
logging in the auto-push failure path).

## Critical Issues

### CR-01: Auto-push silently pushes one vault's content into another vault's GitHub repo

**File:** `src/main/services/settings.ts:22-34` (schema), `src/main/index.ts:227-242` (`autoPushAfterCommit`), `src/main/index.ts:847-897` (`vaultEnableBackup`), `src/main/index.ts:800-807` (`gitPendingPush`)

**Issue:**
`Settings.github` (`remote`, `autoPush`, `pushed`, `token`) is a single global
object — it is **not** keyed/scoped per vault (there is no `root` in the
schema, see `settings.ts:22-34`). Geode supports multiple vaults (VaultSwitcher,
`knownVaults`), and switching the active vault never resets or re-scopes
`settings.github`.

Trace of the failure:
1. User enables backup for vault A (`vaultEnableBackup`, or the Settings
   "advanced remote" field). This persists `settings.github.remote = <repoA URL>`
   and `settings.github.autoPush = true` — globally, not "for vault A".
2. User switches to (or creates) vault B, a completely unrelated local
   notebook that has never been connected to any GitHub repo.
   `refreshGithub()` (`App.tsx:321-325`) reads the same global config, so
   `githubCfg.connected = true`, `githubCfg.remote = <repoA URL>`,
   `githubCfg.autoPush = true` — as if vault B were already backed up.
3. `gitPendingPush` (`index.ts:800-807`) computes `pushCount` via
   `gitService.aheadCount(rootB, github.pushed['main'])`. `github.pushed['main']`
   holds vault A's last-pushed oid, which does not exist in vault B's commit
   log. `aheadCount` (`git.ts:465-481`) never finds that oid while walking
   vault B's log, so it counts **every commit in vault B** as "pending" —
   the BackupButton shows a plausible "Sin subir: N" badge.
4. The next time the user saves a note in vault B (`gitCommit` handler, or the
   automatic snapshot timer via `snapshotIfChanged`), `autoPushAfterCommit(rootB)`
   runs (`index.ts:227-242`). It only gates on
   `s.github?.autoPush && s.github.remote && token` — all of which are true
   (globally, from vault A's setup) — so it calls
   `gitService.push(rootB, normalizeRemoteUrl(s.github.remote /* repoA URL */), token)`.
   `push()` (`git.ts:488-504`) uses the passed `url` directly, ignoring any
   local `origin` config in vault B's `.git`. **Vault B's content is pushed
   into vault A's GitHub repository, silently, with zero user interaction.**

The same hole is reachable interactively: clicking the persistent
`BackupButton` while vault B is active calls `onForcePush` →
`window.geode.git.push()` (`gitPush` handler, `index.ts:809-837`), which
resolves the URL from the same global `settings.github.remote` and force-sets
`gitService.setRemote(rootB, urlFromVaultA)` before pushing — same result.

`vaultEnableBackup`'s idempotency guard (`index.ts:859-875`, "si ya hay un
remoto seteado... NO recreamos el repo") makes this worse for the *guided*
flow specifically: if the user opens the BackupWizard from vault B after
having backed up vault A, `remote` is non-null (vault A's), so
`vaultEnableBackup` skips `createRepo` entirely and pushes vault B straight
into vault A's repo, marking vault B's onboarding "completado" — the wizard
reports success while merging two unrelated notebooks' git histories into one
remote.

This is a data-integrity/privacy issue (content from one notebook lands in a
repo the user associates with a different notebook, possibly with different
sharing/visibility expectations) and a direct regression risk introduced by
wiring unconditional, automatic push (`autoPushAfterCommit`, new in this
phase) on top of the pre-existing global `github` settings object.

**Fix:** Scope `remote` / `autoPush` / `pushed` (and ideally the decision to
treat a repo as "already backed up") per vault root instead of globally, e.g.:

```ts
// settings.ts
export interface Settings {
  // ...
  backupsByVault?: Record<string, {
    remote?: string
    autoPush?: boolean
    pushed?: Record<string, string>
  }>
}
```

and have `autoPushAfterCommit`, `vaultEnableBackup`, `gitPush`,
`gitPendingPush`, and `githubConfig()` read/write `backupsByVault[root]`
instead of the flat `settings.github` fields (keep `token`/`login` global,
since the GitHub *account* is legitimately shared across vaults — only the
per-repo linkage needs to be per-vault). At minimum, before auto-pushing or
before `vaultEnableBackup` treats an existing `remote` as "this vault's
retry", verify the remote actually corresponds to the active vault (e.g. by
also persisting which vault root last set that remote, and refusing to reuse
it for a different root).

## Warnings

### WR-01: Device-flow errors bypass `mapBackupError`, leaking raw English API text into the guided wizard

**File:** `src/main/services/github.ts:39-55, 58-90` (`requestDeviceCode`, `pollForToken`), `src/main/index.ts:755-771` (`githubStartDeviceFlow`, `githubCompleteDeviceFlow`), `src/renderer/src/BackupWizard.tsx:37-51` (`connect`)

**Issue:** BACKUP-05 requires that all backup-path errors surface as one of
the 4 human Spanish strings via `mapBackupError`, and that raw API text never
reaches the UI. `createRepo`/`push` correctly go through `mapBackupError`, but
the device-flow functions used by the *new* `BackupWizard`'s "Ya tengo
cuenta"/"Conectar cuenta" path do not:
- `requestDeviceCode` can throw `` `GitHub device code: ${res.status}` `` or
  `` `GitHub: ${j.error_description ?? j.error}` `` (raw GitHub API text,
  untranslated, in English).
- These propagate unmodified through `githubStartDeviceFlow`/
  `githubCompleteDeviceFlow` (no try/catch, no `mapBackupError`) to the
  renderer, where `BackupWizard.connect()` does
  `setError((e as Error).message)` and renders it verbatim
  (`<CloudOff size={14} /> {error}`).

This violates both BACKUP-05 ("raw API text never reaches UI") and the
CLAUDE.md convention that UI strings are Spanish. It is easy to trigger
(rate limiting, GitHub outage, revoked OAuth app) since the wizard is now the
primary onboarding surface for non-technical users.

**Fix:** Wrap the device-flow calls in `mapBackupError` too, e.g.:
```ts
ipcMain.handle(IPC.githubStartDeviceFlow, async () => {
  try {
    pendingDeviceCode = await requestDeviceCode(GITHUB_CLIENT_ID)
  } catch (e) {
    throw mapBackupError(e)
  }
  void shell.openExternal(pendingDeviceCode.verificationUri)
  return { userCode: pendingDeviceCode.userCode, verificationUri: pendingDeviceCode.verificationUri }
})
```
(`mapBackupError`'s `unknown` fallback already produces an acceptable generic
Spanish message; consider adding a `rate-limit`/`server` kind if finer copy is
desired.)

### WR-02: Full error object logged on auto-push failure

**File:** `src/main/index.ts:239-241` (`autoPushAfterCommit`)

**Issue:** `console.warn('[auto-push] falló, el cuaderno sigue local:', e)`
logs the entire caught error object (from `gitService.push`, i.e.
isomorphic-git's `HttpError`/transport error) to the main-process console. The
review focus explicitly calls out that the GitHub token must never be logged;
while the token itself is passed via the `onAuth` callback (not embedded in
the URL) so it should not appear in isomorphic-git's error `data`, logging the
raw error object is still an unnecessary widening of what could leak into log
files (e.g. via a future isomorphic-git version that includes request headers
in error diagnostics, or a user pasting a credential-bearing URL into the
"advanced remote" field in Settings, which is not validated/stripped anywhere
before being stored/used).

**Fix:** Log only the safe surface, mirroring the pattern already used
elsewhere for user-facing errors:
```ts
console.warn('[auto-push] falló, el cuaderno sigue local:', e instanceof Error ? e.message : String(e))
```

## Info

### IN-01: Leftover "⚠" literal instead of Lucide icon in SettingsModal

**File:** `src/renderer/src/SettingsModal.tsx:508`

**Issue:** `{error && <p className="modal-error">⚠ {error}</p>}` (the generic
AI-model-list error banner) still uses the literal warning-sign character
instead of a Lucide icon, even though this exact pattern was fixed elsewhere
in this same phase (`NewVaultDialog.tsx` replaced `⚠ {error}` with
`<CloudOff size={14} /> {error}`, and `SettingsModal.tsx` itself already
imports and uses `AlertTriangle` for plugin errors a few lines below). Not
introduced by Phase 12, but directly matches the "Lucide icons, never
emojis/⚠" convention this review was asked to check, and is inconsistent with
the fix already applied to the sibling backup dialogs in this same phase.

**Fix:**
```tsx
{error && <p className="modal-error"><AlertTriangle size={14} /> {error}</p>}
```

---

_Reviewed: 2026-07-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
