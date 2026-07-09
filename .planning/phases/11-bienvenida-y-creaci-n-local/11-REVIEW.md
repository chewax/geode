---
phase: 11-bienvenida-y-creaci-n-local
reviewed: 2026-07-09T02:28:23Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/main/fs/vaultName.ts
  - src/main/services/vault.ts
  - src/shared/ipc.ts
  - src/main/index.ts
  - src/preload/index.ts
  - src/renderer/src/App.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-09T02:28:23Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the new purely-local vault creation path (`geode:vault-create-local`): name
sanitization (`vaultName.ts`), filesystem/collision handling (`VaultService.createLocal`),
the IPC contract/handler, the preload bridge, and the renderer welcome-screen flow.

The core security property holds: `sanitizeVaultName` strips every Windows-illegal
character and all path separators (`/`, `\`) before the string is ever used as a path
segment, so a malicious `name` (`../../etc`, `C:\Windows`, `CON`, all-illegal, empty)
cannot escape the chosen base directory or collide with a reserved device name — it
either becomes a harmless literal folder-name token or falls back to `"Cuaderno"`.
Collision resolution correctly uses an absolute-path `pathExists` check anchored at the
caller-supplied `baseDir` (not `VaultService.exists()`, which is anchored at the
*current* vault), and it runs before `mkdir`, matching the stated "never overwrite"
invariant. The load-bearing write order (mkdir → seed → ensureRepo → commit) is
implemented correctly, so the first commit is never a no-op. The renderer flow correctly
chains `openNote('Bienvenida.md')` after `adoptVault()` only on the create path, and
`openVault()` (existing folder) does not auto-open anything.

However, three correctness/robustness gaps were found, mostly around partial-failure
handling: `VaultService.createLocal()` mutates the active-vault singleton (`setRoot`)
*before* the caller's `ensureRepo`/`commit` steps succeed — the opposite order used by
the sibling flows `vaultCreateWithRepo` and `vaultCloneFromGithub` in the same file —
which can leave the main process pointing at a git-less orphan folder while the renderer
still believes creation failed. Separately, the renderer's bare `catch {}` around
`createLocalVault` discards the error object entirely, which means the human-friendly
EACCES/EPERM message deliberately crafted in `main/index.ts` never reaches the user (it's
effectively dead code) and every failure — permissions, disk full, path too long,
anything — shows the exact same "revisá los permisos" text.

## Warnings

### WR-01: `createLocal()` sets the active vault before git init/commit succeed (inconsistent with sibling flows)

**File:** `src/main/services/vault.ts:161-182`, `src/main/index.ts:456-495`
**Issue:** `VaultService.createLocal()` calls `this.setRoot(dir)` as its last statement
(vault.ts:181) and returns the resulting `VaultInfo` to the IPC handler. The handler then
does `await gitService.ensureRepo(info.root)` and `await gitService.commit(info.root, ...)`
(index.ts:479-480) — both AFTER the singleton's `this.root` has already been mutated. If
either call throws (disk fills up between the seed write and the commit, an AV/indexer
locks the fresh `.git` folder, a permissions change mid-operation, an unexpected
isomorphic-git error, etc.), the thrown error propagates to the renderer as a rejection,
but `VaultService.root` is left pointing at the new, half-initialized (no `.git`, not in
`knownVaults`, no snapshot timer bound) folder. The renderer still shows the welcome
screen (`vault === null`), so main's and renderer's notion of "the active vault" have
diverged. A retry from the welcome screen creates a sibling `"<name> (2)"` folder next to
the orphaned `"<name>"` one, and the orphan is never cleaned up.

Contrast with the two other vault-creation flows in the very same file, which
deliberately defer `setRoot()` until AFTER the git side succeeds:
```ts
// vaultCreateWithRepo (index.ts:437-454) — ensureRepo runs BEFORE setRoot:
await gitService.ensureRepo(dir)
const repo = await createRepo(token, name, isPrivate)
const info = await vault.setRoot(dir)

// vaultCloneFromGithub (index.ts:415-435) — clone runs BEFORE setRoot:
await gitService.clone(dir, url, token)
const info = await vault.setRoot(dir)
```
`createLocal()` breaks that established pattern by doing the equivalent of `setRoot`
first and the git work second.

**Fix:** Move the `setRoot()` call out of `VaultService.createLocal()` — have it return
the resolved `{ root, name }` (or just the absolute path) without mutating state, and let
the IPC handler call `vault.setRoot(dir)` only after `ensureRepo` + `commit` succeed,
mirroring `vaultCreateWithRepo`:
```ts
// vault.ts: createLocal() returns the path but does NOT call setRoot()
async createLocal(name: string, baseDir: string): Promise<{ root: string }> {
  // ...mkdir + atomicWrite as today...
  return { root: dir }
}

// index.ts handler:
const { root } = await vault.createLocal(name, baseDir)
await gitService.ensureRepo(root)
await gitService.commit(root, 'Primera versión')
const info = await vault.setRoot(root) // only now becomes "active"
await rememberVault(info.root)
await restartSnapshotTimer()
return info
```

---

### WR-02: Renderer's bare `catch {}` makes the main-crafted EACCES/EPERM message unreachable

**File:** `src/renderer/src/App.tsx:475-492`, `src/main/index.ts:484-493`
**Issue:** `main/index.ts` deliberately distinguishes EACCES/EPERM and throws a
specific, translated message ("No se pudo crear el cuaderno. Revisá que tengas permiso de
escritura...") while rethrowing every other error verbatim (`throw e`), with a comment
explaining this avoids leaking raw stack/paths for the permission case. But the only
caller, `createLocalVault` in App.tsx, uses a bare `catch { ... }` that never binds or
reads the error at all:
```ts
} catch {
  // No exponemos el error crudo del main (evita filtrar rutas/stack); texto humano fijo.
  setCreateError(
    'No se pudo crear el cuaderno. Revisá que tengas permiso de escritura en tu carpeta de Documentos e intentá de nuevo.'
  )
}
```
Because the message is hardcoded independent of what was thrown, the EACCES/EPERM
branch in main is dead code from the user's perspective — it can never influence what's
displayed — and *every* failure (permissions, `ENOSPC` disk-full, `ENAMETOOLONG` from an
overlong name, an unrelated isomorphic-git error) shows the same "revisá los permisos"
copy, which is actively misleading for non-permission causes.

**Fix:** Either drop the special-casing in main (since it has no observable effect), or
have the renderer read `e.message` for the cases where main deliberately produced a safe,
translated string (and keep a generic fallback for anything else):
```ts
} catch (e) {
  setCreateError(
    e instanceof Error && e.message.startsWith('No se pudo crear el cuaderno')
      ? e.message
      : 'No se pudo crear el cuaderno. Revisá que tengas permiso de escritura en tu carpeta de Documentos e intentá de nuevo.'
  )
}
```

---

### WR-03: TOCTOU between collision check and `mkdir` can silently reuse a folder that appeared in between

**File:** `src/main/services/vault.ts:161-182`
**Issue:** The inline comment claims resolving the suffix before `mkdir` is "la garantía
dura del core value 'nada se pisa'" (the hard guarantee that nothing gets overwritten).
That's true for the common case (folder already existed when the check ran), but the
check-then-create is not atomic:
```ts
let candidate = safe
let n = 2
while (await this.pathExists(join(baseDir, candidate))) {
  candidate = `${safe} (${n++})`
}
const dir = join(baseDir, candidate)
await mkdir(dir, { recursive: true }) // no error if `dir` now exists
await atomicWrite(join(dir, 'Bienvenida.md'), SEED_BIENVENIDA)
```
If some other process (e.g. a second Geode window/instance, or the OS/File Explorer)
creates a folder at exactly `dir` between the `pathExists` check and the `mkdir` call,
`mkdir({ recursive: true })` does **not** throw — it silently succeeds against the
now-existing folder, and `atomicWrite` then writes/overwrites `Bienvenida.md` inside it.
This is a narrow race in a single-user desktop app, but it does contradict the "hard
guarantee" the comment claims, and the failure mode (silently seeding into someone else's
folder) is exactly the kind of surprise the core value is meant to prevent.
**Fix:** Use `mkdir(dir, { recursive: false })` (throws `EEXIST` if `dir` already exists)
instead of `{ recursive: true }` for the leaf `candidate` folder — only the parent
(`baseDir`) needs `recursive: true`, which can be ensured separately (e.g.
`mkdir(baseDir, { recursive: true })` once, then `mkdir(dir)` non-recursively) — so a
genuine race surfaces as a caught error and can retry the suffix loop instead of silently
reusing the folder.

## Info

### IN-01: `sanitizeVaultName` does not cap output length

**File:** `src/main/fs/vaultName.ts:29-37`
**Issue:** A pasted name of a few hundred characters passes through untouched (only
illegal characters and trailing dots/spaces are stripped, nothing is truncated). On
Windows this can produce `ENAMETOOLONG`/path-length failures in `mkdir`, which — per
WR-02 above — get reported to the user as a generic "revisá los permisos" message that
doesn't match the actual cause.
**Fix:** Clamp the sanitized name to a reasonable length (e.g. 100 chars) before
returning, trimming again afterward in case truncation lands mid-space/dot run.

### IN-02: Orphaned empty directory left behind if `atomicWrite` fails after `mkdir` succeeds

**File:** `src/main/services/vault.ts:175-179`
**Issue:** If `mkdir(dir, { recursive: true })` succeeds but the subsequent
`atomicWrite(join(dir, 'Bienvenida.md'), SEED_BIENVENIDA)` throws (e.g. disk fills up
between the two calls), `setRoot` is never reached (state stays consistent), but the
empty `dir` is left on disk. A retry with the same name will see it via `pathExists` and
permanently skip to the `" (2)"` suffix, leaving the empty `"<name>"` folder as litter
forever.
**Fix:** Wrap the `mkdir` + `atomicWrite` pair in a try/catch that `rm(dir, { recursive:
true, force: true })`s the just-created directory on failure before rethrowing.

### IN-03: `createLocalVault`'s Enter-key handler ignores `useCustomLocation`, harmless but worth a comment

**File:** `src/renderer/src/App.tsx:1133-1134`
**Issue:** Not a bug — `onKeyDown` correctly calls `createLocalVault()` (default
location) rather than the custom-location variant, and the input's `disabled={creating}`
prevents a second Enter from double-submitting while a create is in flight. Flagging only
because the two call sites (button click vs. Enter key) diverge in an easy-to-miss way if
a future edit adds a third trigger; a one-line comment noting "Enter always targets the
default location, never the custom-location picker" would help future maintainers avoid
introducing a mismatch.

---

_Reviewed: 2026-07-09T02:28:23Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
