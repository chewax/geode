---
phase: 11-bienvenida-y-creaci-n-local
reviewed: 2026-07-08T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/main/fs/vaultName.ts
  - src/main/services/vault.ts
  - src/main/index.ts
  - src/renderer/src/App.tsx
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 11: Code Review Report (Re-Review)

**Reviewed:** 2026-07-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Re-reviewed the fixes applied for WR-01, WR-02, WR-03, IN-01, IN-02, IN-03 from the prior
review of the local-vault-creation path. All six prior findings are **verified resolved**,
correctly implemented, and introduce **no regressions** in the areas they touch (IPC
contract shape, load-bearing write order, Spanish strings, `geode:` IPC prefix, CommonJS
preload, racy-safe commit ordering). Details per finding are below.

While verifying, one new robustness gap and one narrow edge case were found that were not
present in — or not fully covered by — the original review, so this is not a clean bill:

- A new **WARNING**: the fix for WR-01 correctly stops `VaultService.createLocal()` from
  mutating the active-vault singleton before git succeeds, but it does so by moving
  `ensureRepo`/`commit` entirely outside of `createLocal()`'s own try/catch. If either call
  throws (disk fills up between seed-write and `git init`, AV locks the fresh `.git`
  folder, etc.), the folder that `createLocal()` already created and seeded is **not**
  cleaned up — unlike the IN-02 fix, which only covers the narrower
  `mkdir`→`atomicWrite` failure window. A retry with the same name then skips straight to
  the `" (2)"` suffix (via the EEXIST collision loop), leaving the orphaned, git-less,
  untracked folder on disk forever, accumulating with every failed retry.
- A new **INFO**: the IN-01 fix clamps the sanitized name with `name.slice(0, MAX_VAULT_NAME)`,
  which operates on UTF-16 code units. A name containing an astral character (e.g. an
  emoji) exactly at the 100-char boundary can be sliced through the middle of a surrogate
  pair, leaving a lone unpaired surrogate in the folder name. Narrow, cosmetic-at-worst,
  but worth a one-line note.

## Verification of Prior Findings

### WR-01 — `createLocal()` set active vault before git init/commit succeeded — **RESOLVED**

`VaultService.createLocal()` (`src/main/services/vault.ts:165-202`) no longer calls
`setRoot`; it returns `{ root: dir }` after mkdir + atomic seed-write only. The handler
(`src/main/index.ts:471-498`) now does, in order: `vault.createLocal()` →
`gitService.ensureRepo(root)` → `gitService.commit(root, 'Primera versión')` →
`vault.setRoot(root)` → `rememberVault` → `restartSnapshotTimer`. This matches the sibling
flows (`vaultCreateWithRepo`, `vaultCloneFromGithub`) exactly, and the returned shape is
still `VaultInfo | null` per the `GeodeApi.vault.createLocal` contract
(`src/shared/ipc.ts:152`), so the renderer's `adoptVault(info)` / `openNote('Bienvenida.md')`
chain in `App.tsx:479-483` continues to receive what it expects. If `ensureRepo` or
`commit` now throws, `vault.root` (the singleton) is never touched, so the active vault
can no longer diverge from what the renderer believes succeeded — the specific
state-divergence bug is fixed. (See new WARNING above for the residual disk-litter case
this reorder introduces.)

### WR-02 — bare `catch {}` swallowed the main-crafted EACCES/EPERM message — **RESOLVED**

`App.tsx:484-493` now binds `e` and checks
`e instanceof Error && e.message.startsWith('No se pudo crear el cuaderno')`, showing
`e.message` verbatim only in that case and falling back to the generic Spanish message
otherwise. The literal string thrown by `main/index.ts:492-494`
(`'No se pudo crear el cuaderno. Revisá que tengas permiso de escritura en la carpeta.'`)
does start with that prefix, so the intended safe copy now actually reaches the UI. Every
other thrown error (raw stack/path text, isomorphic-git internals, `ENOSPC`, etc.) fails
the `startsWith` check and falls through to the generic fallback — raw API text cannot
reach the UI. Cross-checked against the rest of the codebase (`App.tsx:344, 545, 623, 758,
840, 853, 886`), which reads `e.message` directly from rejected `ipcRenderer.invoke` calls
without any wrapper-prefix stripping, confirming Electron in this app does not mangle the
thrown message before it reaches the renderer's `catch` — the `startsWith` comparison is
comparing like-for-like.

### WR-03 — TOCTOU between collision check and `mkdir` — **RESOLVED**

The leaf directory is now created with `mkdir(target, { recursive: false })` inside the
suffix loop (`vault.ts:176-189`); `EEXIST` is caught and only then does `candidate` bump to
`" (2)"`, `" (3)"`, … Any other error code rethrows immediately, so the loop cannot spin
on an unrelated permanent failure (e.g. `EACCES`) or infinite-loop under normal
conditions — it only continues while genuinely colliding with an existing name, which is
bounded by however many same-named siblings actually exist on disk. `baseDir` is still
created recursively once, upfront (`vault.ts:170`), as intended. The check-then-create
race the original finding described is gone: creation and the “does it already exist”
check are now the same atomic syscall.

### IN-01 — `sanitizeVaultName` had no length cap — **RESOLVED**

`vaultName.ts:38-39` now does `name = name.slice(0, MAX_VAULT_NAME)` **before** the
trailing dot/space strip (`name.replace(/[. ]+$/g, '').trim()`), which is the correct
order — truncating first and stripping after guarantees a clamped name can never end in a
stray `.`/space that the truncation itself introduced. An all-dots or all-trimmed-to-empty
result correctly falls through to the `name === ''` check and returns `'Cuaderno'`.
Verified by hand-tracing an input of >100 dots and an input where the 100-char cut lands
exactly on an internal space: both correctly resolve to a clean name or the `'Cuaderno'`
fallback, never an empty string that bypasses the fallback. (See new INFO above for the
one edge case — astral/surrogate-pair splitting — outside what IN-01 was scoped to catch.)

### IN-02 — orphaned empty dir on seed-write failure — **RESOLVED**

`vault.ts:194-199` wraps the `atomicWrite` call in try/catch and calls
`rm(dir, { recursive: true, force: true }).catch(() => {})` before rethrowing the original
error on failure. The `rm` failure is deliberately swallowed so a secondary cleanup error
never masks the primary seed-write error, and the primary error still propagates to the
handler's EACCES/EPERM mapping. This covers exactly the window the finding described
(mkdir succeeds, atomicWrite fails). Note this fix does **not** extend to the
`ensureRepo`/`commit` failure window that now lives outside `createLocal()` after the WR-01
fix — that gap is the new WARNING above.

### IN-03 — Enter-key handler diverges from custom-location button — **RESOLVED (comment added)**

`App.tsx:1139-1141` now has a comment explicitly noting "Enter siempre apunta a la
ubicación por defecto, nunca al picker de 'otra ubicación'... Si se agrega un tercer
disparador, mantener esta distinción." Purely a documentation fix as requested; behavior
unchanged (still correct).

## Warnings

### WR-04: Orphaned git-less folder left on disk if `ensureRepo`/`commit` fails after `createLocal()` succeeds

**File:** `src/main/index.ts:478-497`, `src/main/services/vault.ts:165-202`
**Issue:** The WR-01 fix correctly stops the *active vault pointer* from diverging on a
partial failure, but it does so by relocating `gitService.ensureRepo(root)` and
`gitService.commit(root, ...)` to the IPC handler, entirely outside of
`VaultService.createLocal()`'s own try/catch (which only guards `mkdir` +
`atomicWrite(seed)`, per IN-02). If `ensureRepo` or `commit` throws — e.g. disk fills up
while isomorphic-git writes `.git/objects` (`ensureRepo` calls `git.init` which is not
atomic; see `git.ts:113-121`), an antivirus/indexer locks the freshly created `.git`
folder, or any other mid-operation failure — the folder created by `createLocal()`
(containing a valid `Bienvenida.md` and possibly a half-written `.git`) is never removed.
It sits on disk, untracked by `knownVaults`, invisible to the vault selector, and — because
the collision loop in `createLocal()` treats "directory already exists" as a hard EEXIST
signal (WR-03's fix) — every subsequent create attempt with the same name will skip past
it straight to `" (2)"`, `" (3)"`, etc. Each failed retry (e.g. a user hitting "Crear" more
than once while their disk is nearly full) leaves one more orphaned, permanently
unreachable folder.
**Fix:** Wrap the `ensureRepo` + `commit` pair in the handler with the same
create-then-cleanup-on-failure pattern already used inside `createLocal()` for the seed
write, so a failure at any point before `setRoot()` removes the folder it just created:
```ts
const { root } = await vault.createLocal(name, baseDir)
try {
  await gitService.ensureRepo(root)
  await gitService.commit(root, 'Primera versión')
} catch (e) {
  await rm(root, { recursive: true, force: true }).catch(() => {})
  throw e
}
const info = await vault.setRoot(root)
```
(Requires importing `rm` from `node:fs/promises` in `main/index.ts`, or exposing a small
`vault.discard(root)` helper that does the same via `VaultService` to keep the raw fs call
inside the service layer, consistent with the rest of the file's conventions.)

## Info

### IN-04: `MAX_VAULT_NAME` clamp can split a UTF-16 surrogate pair

**File:** `src/main/fs/vaultName.ts:38`
**Issue:** `name.slice(0, MAX_VAULT_NAME)` operates on UTF-16 code units. If the sanitized
name contains an astral character (emoji, some CJK extension characters) whose surrogate
pair straddles index 100, the slice can leave a lone unpaired surrogate in the returned
string. Node's path handling on Windows may then produce a mangled folder name (replacement
character) or, in rarer cases, an OS-level path error that the caller has no specific
handling for (it would fall through to the generic `catch (e)` path in the IPC handler and
show the generic "revisá los permisos" message — misleading for this cause, same class of
issue as the original IN-01/WR-02 mismatch, just for a not-yet-covered input class).
**Fix:** Use `Array.from(name).slice(0, MAX_VAULT_NAME).join('')` (iterates by Unicode code
point, not UTF-16 code unit) instead of `String.prototype.slice`, or clamp with a
grapheme-aware library if one is already a dependency. Low priority given how narrow the
trigger is.

---

_Reviewed: 2026-07-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
