# Testing Patterns

**Analysis Date:** 2026-07-03

## Test Framework

**Runner:**
- Not configured
- No test framework installed (no jest, vitest, mocha, or similar)
- No test dependencies in `package.json`

**Assertion Library:**
- Not applicable (no test framework present)

**Run Commands:**
```bash
npm run typecheck          # Full TypeScript typecheck (node + web)
npm run typecheck:node    # Node/main process typecheck only
npm run typecheck:web     # React/renderer typecheck only
npm run build             # Includes typecheck before build
```

**Quality Checks:**
- TypeScript strict mode is primary quality gate
- No linting configured (`eslint`, `prettier`, `biome` absent)
- Typecheck on every build ensures no runtime type errors

## Test File Organization

**Current State:**
- No test files found in `src/` directory
- All dependencies are production-only (no devDependencies for testing)
- Manual testing appears to be the current approach

**Proposed Location (if tests were added):**
- Co-located pattern recommended: `src/[domain]/[module].test.ts` next to implementation
- E.g., `src/main/services/git.test.ts` alongside `src/main/services/git.ts`
- Or separate `__tests__` directory per module if many tests per file

**Naming Convention (if tests added):**
- `*.test.ts` for unit/integration tests
- `*.spec.ts` alternative (not currently used)
- Pattern: `[module].test.ts` matching implementation file

## Test Structure

**Suite Organization (Future Reference):**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GitService } from './git'

describe('GitService', () => {
  let service: GitService
  let testDir: string

  beforeEach(async () => {
    service = new GitService()
    testDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(testDir)
  })

  describe('commit()', () => {
    it('should create a commit with message', async () => {
      const oid = await service.commit(testDir, 'Test message')
      expect(oid).toBeDefined()
    })

    it('should return null if no changes', async () => {
      const oid = await service.commit(testDir, 'No changes')
      expect(oid).toBeNull()
    })

    it('should be immune to racy git', async () => {
      // Test rapid file writes in same millisecond
    })
  })
})
```

**Patterns Observed (from implementation code):**
- Service methods are testable (pure functions, no global state)
- Dependency injection through constructor/parameters
- Async patterns throughout (Promises, async/await)
- Error cases explicit (typed throws, null returns)

## Mocking

**Framework:** Not yet configured (would use vitest or jest Mock/vi)

**What Would Be Mocked:**
- File system operations (fs/promises mocked via `memfs` or similar)
- Git operations (isomorphic-git can be mocked for read-only tests)
- IPC calls (mock `window.geode` API in React component tests)
- Network calls (AI/GitHub APIs mocked with fake responses)

**What NOT to Mock:**
- Core git logic in unit tests (test against real git operations in temp directories)
- Cryptographic operations (salt, hashing)
- File system atomicity guarantees (test with real fs if possible)

## Fixtures and Factories

**Test Data:**
- No existing fixtures found in codebase
- Service classes accept `dir` paths: tests should create temp dirs via `fs.mkdtemp()`
- Git repos created on-demand via `git.init()` for each test

**Suggested Location (if added):**
- `src/__fixtures__/` or `src/test-utils/`
- Factory functions: `createTestVault()`, `createTestRepo()`, `createTestCommit()`

Example pattern:
```typescript
async function createTestVault(tmpDir: string): Promise<string> {
  await mkdir(join(tmpDir, 'vault'))
  return join(tmpDir, 'vault')
}

async function createTestCommit(dir: string, message: string): Promise<string> {
  const git = new GitService()
  return git.commit(dir, message)
}
```

## Coverage

**Requirements:** None enforced currently

**View Coverage:** Not applicable (no test framework to generate coverage)

**Recommended Targets (if testing added):**
- Services: 80%+ (git.ts, vault.ts, plugins.ts are critical)
- Utilities: 90%+ (atomic.ts, extensions.ts)
- React components: 70%+ (UI integration tests more valuable than coverage %)
- E2E: 100% for critical paths (new vault → commit → push)

## Test Types

**Unit Tests:**
- Scope: Individual functions, service methods
- Approach: Isolated test of pure logic
- Example: `GitService.assignLanes()` with mock commit data
- Framework: vitest or jest recommended

**Integration Tests:**
- Scope: Service + file system interaction
- Approach: Real temp directories, real git operations
- Example: Create vault → write file → commit → check graph
- Framework: vitest with temp-dir fixture

**E2E Tests:**
- Scope: Full app workflow
- Approach: Electron app launch, UI interaction, GitHub integration
- Example: Open vault → clone from GitHub → edit note → auto-commit
- Framework: Playwright + Electron launch, or Spectron
- Status: Not configured; recommended for critical user journeys

**Racy Git Tests:**
- Special case: Verify commit detection is immune to "racy git" (files edited in same millisecond)
- Approach: Create files, immediately commit without sleep, verify detection works
- Implementation: `GitService.workBlobs()` hashes all files to avoid stat cache (line 761-781 in git.ts)
- Test would verify that fast writes don't get missed:
  ```typescript
  it('should detect changes immune to racy git', async () => {
    // Rapid writes without delay
    await writeFile(join(testDir, 'note1.md'), 'content')
    await writeFile(join(testDir, 'note2.md'), 'content')
    
    const changes = await gitService.pendingChanges(testDir)
    expect(changes).toHaveLength(2) // Not missed due to mtime caching
  })
  ```

## Common Patterns

**Async Testing:**
- All service methods return Promises
- Test pattern: async/await with try-catch or expect().rejects
- Cleanup critical: temp files/dirs must be removed in afterEach()

```typescript
it('should handle network errors', async () => {
  await expect(
    service.clone(testDir, badUrl, token)
  ).rejects.toThrow('Network error')
})
```

**Error Testing:**
- Services throw with descriptive messages
- Test pattern: expect().rejects.toThrow() or .toThrow('message')
- Validation errors explicit: "Ya existe...", "Ruta fuera del vault", etc.

```typescript
it('should prevent path traversal', async () => {
  await expect(
    vault.readNote('../../../etc/passwd')
  ).rejects.toThrow('Ruta fuera del vault')
})
```

**Mocking IPC (React component tests):**
```typescript
// Mock window.geode API for component tests
const mockGeodeApi = {
  git: {
    commit: vi.fn().mockResolvedValue('abc123'),
    graph: vi.fn().mockResolvedValue({ commits: [], branches: [] })
  }
}

global.window = { geode: mockGeodeApi } as any
```

## Recommended Testing Strategy

**Phase 1: Critical Path Tests**
- Focus on `git.ts` (commit, checkout, branch, merge)
- Focus on `vault.ts` (file operations, tree traversal)
- Focus on `atomic.ts` (durability guarantees)
- Tool: vitest (light, fast, TypeScript-native)

**Phase 2: Component Tests**
- Focus on complex React components (App.tsx, EditorPane.tsx, VersionGraph.tsx)
- Tool: vitest + React Testing Library
- Mock IPC surface, test UI logic

**Phase 3: E2E Tests**
- Full workflow: create vault → write notes → commit → branch → merge
- Tool: Playwright with Electron launch
- Run nightly on CI

**Phase 4: Visual Regression**
- Graph rendering (ensure lane assignment visible)
- Pane layout (ensure resize/split works)
- Tool: Chromatic or Percy

## TypeScript as Test Coverage

**Current Quality Gate:**
- `npm run typecheck` enforces type safety
- Strict mode flags unreachable code, unused variables
- All functions have explicit return types
- All IPC contracts typed at boundary (`@shared/ipc.ts`)

**Equivalence to Tests:**
- Type system catches: null dereferences, incorrect argument types, missing properties
- Does NOT catch: logic errors, off-by-one bugs, race conditions in async flows

**Not Replaced by TypeScript:**
- Business logic (commit detection, DAG lane assignment)
- State management (pane tree mutations, editor state)
- Integration boundaries (IPC serialization, file system atomicity)

---

*Testing analysis: 2026-07-03*
