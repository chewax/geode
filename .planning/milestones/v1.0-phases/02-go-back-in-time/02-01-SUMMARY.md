---
phase: 02-go-back-in-time
plan: 01
subsystem: infra
tags: [isomorphic-git, electron-ipc, git, typescript, atomic-write]

# Dependency graph
requires:
  - phase: 01-sidebar-sections
    provides: "Sidebar container that the later Timeline section slots into (not consumed by this plan)"
provides:
  - "GitService.treeAt(dir, oid) → TreeNode[] (past commit tree, .md + IGNORED_TOP filtered)"
  - "GitService.restoreTree(dir, oid) → soft materialize a past tree without moving HEAD"
  - "GitService.changedFiles(dir, oid) → commit-vs-first-parent changed note basenames"
  - "atomicWrite widened to string | Uint8Array (binary-safe)"
  - "window.geode.git.treeAt/restoreTree/changedFiles typed IPC surface (unconsumed)"
affects: [02-03, 02-04, 02-05, "renderer preview/timeline waves"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Soft linear restore: write changed blobs + delete IGNORE-filtered absent files, never git.checkout / HEAD move"
    - "Delete set derived exclusively from workBlobs (IGNORE-filtered), never from treeBlobs"
    - "buildTree: pure reconstruction of vault.tree() shape from a flat .md path list"

key-files:
  created: []
  modified:
    - src/main/fs/atomic.ts
    - src/main/services/git.ts
    - src/shared/ipc.ts
    - src/main/index.ts
    - src/preload/index.ts

key-decisions:
  - "atomicWrite drops hardcoded 'utf8' so Node writeFile handles both string and Uint8Array"
  - "changedFiles is commit-vs-first-parent (git.readCommit → parent[0] + two-tree walk), NOT commitDiff (tree-vs-HEAD)"
  - "rm import added in the task that uses it (Task 2), not Task 1, to keep noUnusedLocals typecheck green per commit"

patterns-established:
  - "restoreTree never calls git.checkout(); no HEAD/ref/index mutation — only working-dir writes/deletes"
  - "Racy-safe: skip-unchanged and delete-set both driven by workBlobs content-hashing, never statusMatrix"

requirements-completed: [SOFT-01, SOFT-02, SOFT-06, TIME-04]

# Metrics
duration: 8min
completed: 2026-07-04
---

# Phase 2 Plan 01: Main-process git primitives + IPC surface Summary

**treeAt / restoreTree / changedFiles added to GitService and exposed across the typed geode:git-* IPC boundary, with atomicWrite widened to binary — the read/restore engine for "Go Back in Time", unconsumed and behavior-neutral.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-04T12:15:00-03:00
- **Completed:** 2026-07-04T12:18:15-03:00
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `atomicWrite` accepts `string | Uint8Array` (drops hardcoded `'utf8'`), so `restoreTree` can materialize binary git blobs crash-safely.
- Three new `GitService` methods plus a pure `buildTree` helper: `treeAt` (past tree as `TreeNode[]`, `.md` + `IGNORED_TOP` filtered, same shape/sort as `vault.tree()`), `changedFiles` (commit-vs-first-parent changed note basenames), and `restoreTree` (soft materialize without moving HEAD).
- Full typed IPC wiring across all four layers: 3 `geode:git-*` channels + `GitApi` signatures → `requireRoot()`-gated `ipcMain.handle` handlers → preload arrows → `window.geode.git.*`.
- `restoreTree` honors both landmines: racy-safe skip/delete via `workBlobs` content-hashing, and no `git.checkout()` / HEAD move / branch / detached-HEAD.

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen atomicWrite + add treeAt/changedFiles** - `e57fc5e` (feat)
2. **Task 2: Add restoreTree — soft, IGNORE-safe materialize** - `812e68c` (feat)
3. **Task 3: Expose the three primitives across the typed IPC boundary** - `568462c` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `src/main/fs/atomic.ts` - `atomicWrite` signature widened to `string | Uint8Array`; `'utf8'` dropped from `handle.writeFile`; doc comment updated for binary blobs.
- `src/main/services/git.ts` - Added `rm` + `TreeNode` imports; new public `treeAt`, `changedFiles`, `restoreTree`; private pure `buildTree` helper.
- `src/shared/ipc.ts` - 3 channel constants (`gitTreeAt`/`gitRestoreTree`/`gitChangedFiles`) + 3 `GitApi` method signatures.
- `src/main/index.ts` - 3 `ipcMain.handle` handlers, each gated by `requireRoot()`.
- `src/preload/index.ts` - 3 arrows in the `git:` block exposing the methods on `window.geode.git`.

## Decisions Made
- **`changedFiles` uses `git.readCommit` → `commit.parent[0]` + a two-tree `git.walk`** (or single-tree for a root commit = everything added), emitting `.md` basenames whose blob oid differs from (or is absent in) the parent. Deliberately NOT `commitDiff` (which is tree-vs-HEAD).
- **`buildTree` is pure** and reproduces `VaultService.readDir`'s folders-first/alphabetical sort exactly, so `treeAt` output is a drop-in for `vault.tree()` — the renderer's `FileTree` needs zero changes.
- **`restoreTree` writes via `atomicWrite(join(dir, filepath), Buffer.from(blob))`** and derives its delete set from `workBlobs.keys()` (already IGNORE-filtered), so `.git`/`.geode`/`node_modules`/`.obsidian` are structurally unreachable for deletion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deferred the `rm` import from Task 1 to Task 2**
- **Found during:** Task 1 (widen atomicWrite + read primitives)
- **Issue:** The plan places the `rm` import addition in Task 1, but `rm` is only consumed by `restoreTree` in Task 2. With `noUnusedLocals` ON and `npm run typecheck` as the per-task gate, importing `rm` in Task 1 fails typecheck (`TS6133: 'rm' is declared but its value is never read`) at the Task 1 commit.
- **Fix:** Added `TreeNode` in Task 1 (used immediately by `treeAt`) but moved the `rm` import into Task 2, where `restoreTree` uses it. End state is identical to the plan's intended imports; only the commit in which `rm` lands changed.
- **Files modified:** src/main/services/git.ts
- **Verification:** `npm run typecheck` exits 0 after both Task 1 and Task 2 commits.
- **Committed in:** `812e68c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Purely a commit-ordering adjustment forced by `noUnusedLocals` + per-task typecheck gate. Final imports and behavior match the plan exactly. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The main-process read/restore engine and its typed IPC surface exist and are green; the app behaves exactly as before (surface is unconsumed).
- Renderer waves (02-02..02-05) can now call `window.geode.git.treeAt/restoreTree/changedFiles`.
- Manual non-destructive verification (HEAD unchanged, no detached-HEAD, no new branch after `restoreTree`) is deferred to the phase UAT in plan 02-06 per the plan's verification note.

## Self-Check: PASSED

---
*Phase: 02-go-back-in-time*
*Completed: 2026-07-04*
