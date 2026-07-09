---
phase: 12-asistente-de-respaldo-en-la-nube
reviewed: 2026-07-09T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/renderer/src/App.tsx
  - src/renderer/src/BackupButton.tsx
  - src/main/services/github.ts
  - src/main/services/backupErrors.ts
  - src/main/index.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 12: Code Review Report (final re-review)

**Reviewed:** 2026-07-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** clean

## Summary

This is the final re-review of the fixes applied for the prior CR-02/STAT-01
regression (false "Todo en la nube" for never-backed-up vaults), the WR-01
device-flow message collapse, and the IN-01 deprecated-field annotation. All
three are verified closed, with no new regression introduced by the prop
renames. `npm run typecheck` (node + web) and `npm run build` both pass
clean, and the preload still builds as CommonJS
(`out/preload/index.cjs`: `"use strict"; const electron = require("electron")`).

**1. STAT-01 is correctly closed.** A single flag is now derived once and
threaded through every backup-safety UI surface:
```ts
// App.tsx:1017
const backedUp = !!(githubCfg?.connected && githubCfg.remote)
```
- `statusLabel(status, backedUp, pushCount)` (App.tsx:1483, def at 1829-1851)
  only returns `{ text: 'Todo en la nube' }` inside the `case 'clean'` branch,
  gated by `backedUp`, and only when `pushCount === 0`; otherwise it falls
  back to `'Guardado en este dispositivo'` (backedUp+pending) or `'Guardado'`
  (not backed up at all). No path reaches the cloud-safe copy without both
  `backedUp` and `pushCount === 0`.
- `<BackupButton backedUp={backedUp} ... />` (App.tsx:1520-1521) matches the
  renamed `backedUp: boolean` prop in `BackupButton.tsx:16/29`. Its `kind`
  derivation (`BackupButton.tsx:45-53`) only reaches `'al-dia'` when
  `backedUp && pushCount === 0`; a connected-but-no-origin vault correctly
  falls through to `'sin-respaldo'` ("Sin respaldo" text, off-state cloud
  icon), never a cloud-safe claim.
- Grepping every remaining `githubCfg?.connected` read in `App.tsx` confirms
  they are legitimate account/auth-level gates, not backup-safe claims:
  `NewVaultDialog` (App.tsx:1584, gates whether the clone-from-GitHub repo
  list is fetched), `BackupWizard` (App.tsx:1595, skips the "connect
  account" step if the account is already authorized — the wizard still
  performs the real per-vault `enable()`/push before reporting success), and
  `SettingsModal`'s `github?.connected` (account display: "Conectado como
  {login}", remote field, disconnect button — describes the GitHub account,
  not a specific vault's backup state). None of these assert or imply "this
  vault's content is safely in the cloud."
- `commandApi.pushEnabled` (App.tsx:1036) also now reads `backedUp` directly
  (previously duplicated the `connected && remote` expression inline) —
  single source of truth, no drift risk.

**2. Device-flow messages hold.** `mapBackupError` (backupErrors.ts:55) early
-returns any `e instanceof BackupError` unchanged, before the network/status
classification runs. `pollForToken` (github.ts:86-96) now throws
`BackupError('unknown', ...)` for `expired_token`, `access_denied`, and the
post-loop timeout, so their specific Spanish copy ("El código expiró; probá
de nuevo", "Autorización cancelada", "Se agotó el tiempo de autorización")
survives intact to the wizard. The `default` branch (unrecognized API error)
still throws a plain `Error` with the raw `GitHub: ...` text, which does NOT
match `instanceof BackupError`, so it correctly continues on to
`mapBackupError`'s classification/generic-fallback path — no raw English
leaks. Both `githubStartDeviceFlow` and `githubCompleteDeviceFlow` in
`main/index.ts` (782-811) wrap their bodies in `try { ... } catch (e) { throw
mapBackupError(e) }`, so the boundary is enforced at the IPC edge regardless
of what `github.ts` throws.

**3. No new regression from the renames.** `grep` for `BackupButton` usage
across `src/` shows only the two expected files
(`BackupButton.tsx`/`App.tsx`); the sole call site passes `backedUp`
matching the prop's new name. `statusLabel`'s parameter is consistently named
`backedUp` in both signature and JSDoc (App.tsx:1826-1831). No stale
`connected`/`githubConnected` prop names remain on either component.
`git.ts`'s `pushedByVault`/`getRemote` per-vault plumbing (verified in the
prior review round) is untouched by this round's changes.

**4. Build verification (self-run).**
- `npm run typecheck` → `typecheck:node` (tsc -p tsconfig.node.json) and
  `typecheck:web` (tsc -p tsconfig.web.json) both exit clean, no errors.
- `npm run build` → exits 0, no error/fail lines in output; preload output
  confirmed CommonJS (`.cjs`, `require("electron")`, no ESM `import`).

## Remaining non-blocking notes (not filed as findings — informational only)

- Runtime multi-vault UAT (create vault A, connect+backup, create vault B,
  confirm the footer/button correctly show "Sin respaldo" for B) is
  legitimately a human-in-the-loop check; the static trace above supports
  correctness but was not executed against a running Electron instance in
  this pass, consistent with the review's stated scope.
- `SettingsModal`'s "Tu cuaderno se respalda solo cada vez que guardás" hint
  (SettingsModal.tsx:372-375) is shown whenever the GitHub *account* is
  connected, regardless of whether the *current* vault has an origin yet.
  This is descriptive/aspirational copy in a settings panel, not a status
  claim gated by `case 'clean'` like `statusLabel`/`BackupButton`, and it was
  not in scope for this focused re-review (not flagged in the prior CR-02);
  noting it here only for completeness, not as a blocker.

---

_Reviewed: 2026-07-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
