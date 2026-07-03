# Codebase Concerns

**Analysis Date:** 2026-07-03

## Tech Debt

**Absence of Automated Test Coverage:**
- Issue: Zero test files exist in the codebase. No unit, integration, or E2E tests.
- Files: All source files in `src/` lack corresponding test files.
- Impact: Cannot verify regressions, cannot safely refactor complex logic (git service, merge logic), cannot CI/CD validate builds. High risk for silent breakage in git operations or data loss scenarios.
- Fix approach: Implement Jest or Vitest configuration; start with critical paths (git operations, vault file handling, merge/conflict scenarios). Add `test` script to package.json.

**Large Monolithic App Component:**
- Issue: `src/renderer/src/App.tsx` is 47KB with 40+ state variables and complex callback chains. Contains UI logic, state management, IPC orchestration.
- Files: `src/renderer/src/App.tsx`
- Impact: Difficult to reason about, high risk of prop threading bugs, state sync issues. Single point of failure for renderer logic.
- Fix approach: Extract domain logic into custom hooks (useGit, useVault, useTree). Consider React Context for frequently passed props (graph, githubCfg). Split into smaller focused components.

**Merge Operation Error Handling Gap:**
- Issue: `mergeBranch()` callback at line 481 in `App.tsx` lacks try-catch, while similar operations (doPush) have error handling. Errors in merge will be unhandled and UI state could become inconsistent.
- Files: `src/renderer/src/App.tsx` (line 481-492)
- Impact: If merge fails mid-operation (divergent branches, write errors), the UI won't alert user and may show stale git graph.
- Fix approach: Add try-catch with window.alert() error display, matching the doPush pattern. Test merge failures explicitly.

**SSH Not Supported in Git Operations:**
- Issue: isomorphic-git doesn't support SSH authentication. Workaround normalizes SSH URLs to HTTPS, but users expecting SSH will need conversion step.
- Files: `src/main/services/github.ts` (line 23-34), `src/main/index.ts` (line 373)
- Impact: Users with SSH keys or SSH-only remotes cannot push/clone directly. Adds friction for GitHub integration.
- Fix approach: Document SSH → HTTPS conversion in UI. Consider adding explicit UI step to detect/normalize SSH URLs during remote setup.

## Known Bugs

**Editor Focus Loss on Rename (Previously Fixed):**
- Issue: Previously, editor would remount by key on note rename, losing cursor/selection. Now fixed.
- Files: `src/renderer/src/EditorPane.tsx` (line 280)
- Current state: Using `reloadKey={...}` pattern with persistent component ref. Component mounts once per pane, doc content swapped via prop. Solution is stable and working.
- Workaround: None needed — already fixed.

## Security Considerations

**Secrets in Settings Files:**
- Risk: API keys (OpenRouter, GitHub token) stored in `settings.json`. Risk of accidental commit or file exposure if encryption fails.
- Files: `src/main/services/settings.ts`, `app.getPath('userData')/settings.json`
- Current mitigation: Using Electron's `safeStorage.encryptString()` for secrets. Encryption is OS-level (uses Data Protection API on Windows, Keychain on macOS).
- Recommendations: (1) Log warning if `safeStorage.isEncryptionAvailable()` returns false, prompting user to configure OS encryption. (2) Never read unencrypted secrets from disk. (3) Test encryption availability during app startup. (4) Never serialize secrets to stdout/logs.

**Plugin Code Execution:**
- Risk: External plugins (Phase A) are loaded and executed without sandboxing. A malicious plugin can access any IPC call exposed to renderer.
- Files: `src/renderer/src/plugins/loader.ts`, `src/main/services/plugins.ts`
- Current mitigation: Plugin discovery only; plugins don't have network/filesystem access (CSP blocks external requests). Plugins declared in manifest; missing/broken plugins are caught and shown in Settings.
- Recommendations: Phase B must implement permission model (docs/PLUGINS.md already reserves `permissions` field in manifest). Restrict IPC access per plugin. Sandbox plugin execution context.

**Path Traversal in Vault Operations:**
- Risk: User input for file paths could escape vault directory (e.g., `../../../etc/passwd`).
- Files: `src/main/services/vault.ts` (lines 63-71), `src/main/services/plugins.ts` (lines 86-90)
- Current mitigation: `resolveInside()` validates all paths against vault root. Plugin main entry point checked to not be absolute or contain `..`. No symlink traversal check.
- Recommendations: Test edge cases (symlinks into parent dirs, unicode path tricks). Consider lstat checks for symlinks if vault may contain them.

## Performance Bottlenecks

**Git Graph Generation on Large Repos:**
- Problem: `graph()` method walks all commits from all branches and re-indexes on every refresh. For repos with 1000+ commits, this becomes slow.
- Files: `src/main/services/git.ts` (lines 304-404)
- Cause: No caching. Full tree walk and lane assignment on every call. `assignLanes()` is O(n) but runs for every refresh.
- Improvement path: Cache graph result; invalidate only on `commit()` or `checkout()`. Add index of commits by branch for faster tip lookup. Consider pagination/lazy loading for large repos.

**Note History Generation:**
- Problem: `noteHistory()` loads all commits across all branches, filters by filepath. For a single note with 100+ versions, this scans 1000+ commits.
- Files: `src/main/services/git.ts` (lines 534-607)
- Cause: No index of note changes. Full commit walk + blob OID comparison for each.
- Improvement path: Build sparse index (commit tree → note path → OID hash) during first graph load. Cache per note. Invalidate on commit.

**Workspace Walker (workBlobs):**
- Problem: Walks entire file tree on every `commit()` call to detect changes, hashing each file.
- Files: `src/main/services/git.ts` (lines 763-781)
- Cause: Necessary for racy-git immunity, but no incremental detection. Every commit rehashes every file.
- Improvement path: Keep mtime/size cache from last scan, only rehash if changed (with racy-git fallback to hash on collision).

## Fragile Areas

**Merge Rebase Logic:**
- Files: `src/main/services/git.ts` (lines 234-280)
- Why fragile: Single-device rebase assumes no 3-way conflicts. If branches diverge, commits are replayed on target but merge conflicts are NOT detected/handled. User sees a completed merge that may have silently overwritten content.
- Safe modification: Add `try-catch` around commit replay loop. On conflict, roll back merge and report error. Test divergent branch scenarios. Document as single-device only.
- Test coverage: Zero tests for merge divergence, rebase edge cases.

**Editor State Sync Between Panes:**
- Files: `src/renderer/src/App.tsx` (content/paneContentRef), `src/renderer/src/EditorPane.tsx` (pendingRef)
- Why fragile: Pending edits cached in useRef across pane switches. If editor renders twice or state mismatch, pending content could be lost or written to wrong note.
- Safe modification: Add invariant checks in flushAll() to verify pending path matches active note. Log warnings on mismatch.
- Test coverage: No tests for multiPane content sync, tab switch sequences.

**Force Checkouts Overwrite Working Dir:**
- Files: `src/main/services/git.ts` (lines 220, 276, 301, 436)
- Why fragile: `git.checkout(..., force: true)` will silently overwrite uncommitted changes. While UI shows confirmation dialog, if user force-closes app during checkout, uncommitted state is lost.
- Safe modification: flushAll() before checkout is correct. Add atomic txn marker to prevent crash-during-checkout corruption. Or use `noCheckout + atomic walk` for safety.
- Test coverage: No tests for interrupted checkout scenarios.

**Plugin Error Swallowing:**
- Files: `src/renderer/src/plugins/loader.ts`
- Why fragile: Plugins that fail to load/init silently get error marker but don't prevent app startup. User may not notice broken plugins until they try to use them.
- Safe modification: Show plugin load errors in app startup toast, not just in Settings. Add "plugins with errors" indicator in UI.
- Test coverage: No tests for plugin load failures.

## Scaling Limits

**Single Vault in Memory:**
- Current capacity: One vault open at a time. Git graph for 1000+ commits starts to slow down.
- Limit: Repos with 5000+ commits will block UI during graph refresh. WorkBlobs walk gets slow for 10000+ files.
- Scaling path: (1) Implement graph caching/incremental updates. (2) Paginate graph display. (3) Move git operations off main thread (Worker) for large repos.

**Local-First Storage:**
- Current capacity: Entire vault tree in memory (tree walk on every refresh). Editor content per open note.
- Limit: Vaults with 10000+ markdown files will slow down tree UI. File system limits per OS.
- Scaling path: Lazy load file tree subtrees. Cache tree indices. Consider SQLite FTS5 for search scaling.

## Dependencies at Risk

**isomorphic-git v1.38.6 (Racy Git Mitigation Working):**
- Risk: isomorphic-git has known racy-git issues with stat-based detection.
- Impact: File edits of same size in same second were lost (now mitigated by hashBlob workaround).
- Current state: Workaround is in place (`workBlobs` uses hashBlob, not index). **Do not revert to statusMatrix.**
- Migration path: If isomorphic-git adds proper racy-git detection, can remove hashBlob workaround after testing.

**Electron v43.0.0:**
- Risk: New Electron versions occasionally break preload/IPC model or sandbox behavior.
- Impact: App depends on sandbox: true + contextIsolation for security.
- Monitoring: Test preload output (must be CommonJS .cjs file). Monitor Electron release notes for IPC changes.

## Missing Critical Features

**No Conflict/Merge 3-Way Support:**
- Problem: If main and working branch diverge (e.g., multi-device sync attempted), merge does rebase but can silently overwrite.
- Blocks: Multi-device sync, collaborative editing safety nets.
- Dependency: Phase 2 roadmap (see docs/ARCHITECTURE.md).

**No Restore-to-Version (Selective Restoration):**
- Problem: Only full checkout supported. Can't restore a single note from old version without checking out entire vault.
- Blocks: Partial rollback, "undo to version X" workflow.

**No Test Coverage:**
- Problem: Critical paths untested (git commit, merge, push, checkout, file I/O, plugin loading).
- Blocks: Safe refactoring, regression detection, CI pipeline.
- Dependency: Before scaling to 2+ users or adding multi-device sync, tests are mandatory.

## Test Coverage Gaps

**Git Operations (High Priority):**
- What's not tested: commit(), mergeBranch(), checkout(), createBranch(), push(), clone()
- Files: `src/main/services/git.ts` (entire file)
- Risk: Silent data loss on merge divergence. Racy-git regression if hashBlob logic changes.
- Recommendation: Unit tests for each method. Integration tests for branch/merge scenarios (divergence, fast-forward, rebase edge cases).

**File I/O and Atomicity:**
- What's not tested: atomicWrite() crash recovery, vault.rename(), vault.deletePath()
- Files: `src/main/fs/atomic.ts`, `src/main/services/vault.ts`
- Risk: Partial writes on crash could corrupt notes.
- Recommendation: Test atomicWrite with simulated ENOSPC, unlink failures. Test path traversal blocking.

**Editor State Sync:**
- What's not tested: Pane focus/tab switch sequences, pending edits flush, reloadKey edge cases.
- Files: `src/renderer/src/App.tsx`, `src/renderer/src/EditorPane.tsx`
- Risk: Lost edits on rapid tab switches or component remount.
- Recommendation: React Testing Library tests for EditorPane. Scenario tests for multi-pane workflows.

**Plugin Loading:**
- What's not tested: Malformed plugin.json, missing main entry, plugin errors during init.
- Files: `src/main/services/plugins.ts`, `src/renderer/src/plugins/loader.ts`
- Risk: Plugin errors crash app or break plugin system.
- Recommendation: Mock plugins with broken manifests. Test error display in UI.

**GitHub OAuth:**
- What's not tested: Device code expiry, slow_down backoff, authorization_pending loop.
- Files: `src/main/services/github.ts`
- Risk: Edge case timeout handling could hang UI or leak promise.
- Recommendation: Mock fetch, simulate timeout/error responses, verify cleanup.

---

*Concerns audit: 2026-07-03*
