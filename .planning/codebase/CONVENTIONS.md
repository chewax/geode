# Coding Conventions

**Analysis Date:** 2026-07-03

## Naming Patterns

**Files:**
- Components: PascalCase (e.g., `App.tsx`, `CommitDialog.tsx`, `CodeMirrorEditor.tsx`)
- Services/modules: camelCase (e.g., `git.ts`, `vault.ts`, `atomic.ts`)
- Type definitions: camelCase (e.g., `ipc.ts`, `extensions.ts`)
- Directories: lowercase with hyphens where semantic (e.g., `src/renderer/src/plugins/`, `src/main/services/`)

**Functions:**
- camelCase for all functions and methods
- Descriptive names indicating action: `pendingChanges()`, `sanitizeTagName()`, `assignLanes()`
- Private methods prefixed: `private async headBlobs()`

**Variables:**
- camelCase for all local variables and constants
- Descriptive names reflecting content type: `headOid`, `branchMeta`, `paneHandles`
- Refs suffixed with `Ref`: `paneHandlesRef`, `openPathRef`, `hostRef`
- State variables prefixed with noun: `commitChanges`, `diffOid`, `editingPath`
- Boolean flags clearly named: `allExpanded`, `sortAsc`, `generating`, `connecting`

**Types/Interfaces:**
- PascalCase for all type names
- Prefixed by domain: `GitCommitNode`, `VaultInfo`, `TreeNode`
- API interfaces prefixed by service: `VaultApi`, `GitApi`, `AiApi`
- Props interfaces suffixed: `CommitDialogProps`, `CodeMirrorEditorProps`, `FileTreeProps`

**Constants:**
- UPPER_SNAKE_CASE for true constants (e.g., `IGNORED_TOP`, `PROD = 'main'`, `GITHUB_CLIENT_ID`)
- IPC channel names prefixed with `geode:` (e.g., `'geode:vault-open'`, `'geode:git-commit'`)

## Code Style

**Formatting:**
- No explicit linter configured (no `.eslintrc`, `.prettierrc`, or `biome.json`)
- TypeScript strict mode enabled across all tsconfig files
- Target ES2022 for both renderer and node
- Module format: ESNext

**Linting Rules Observed:**
- TypeScript strict mode enabled: `"strict": true`
- Unused locals/params flagged: `"noUnusedLocals": true`, `"noUnusedParameters": true`
- Consistent casing enforced: `"forceConsistentCasingInFileNames": true`
- No implicit any: strict mode prevents this

**Type Annotations:**
- Explicit return types on all exported functions and methods
- Interface parameters always typed with imported types
- JSX elements typed as `JSX.Element` or `JSX.ElementType`
- Callback types explicitly specified: `(cb: (maximized: boolean) => void) => () => void`

## Import Organization

**Order:**
1. Node/stdlib modules (`import fs from 'node:fs'`, `import path from 'node:path'`)
2. Third-party packages (`import react`, `import { lucide-react }`, `import isomorphic-git`)
3. Type imports from third-party (`import type { JSX } from 'react'`)
4. Local absolute imports (via path aliases)
5. Local relative imports (rare; avoid in favor of aliases)

**Path Aliases:**
- `@renderer/*`: Maps to `src/renderer/src/*` (React components, UI logic)
- `@shared/*`: Maps to `src/shared/*` (IPC contracts, shared types)
- `@domain/*`: Maps to `src/domain/*` (domain models)

Example usage:
```typescript
import type { VaultInfo, GitGraph } from '@shared/ipc'
import { FileTree } from '@renderer/FileTree'
import { atomicWrite } from '../fs/atomic'  // Relative when needed
```

**Import Style:**
- Use `import type` for type-only imports to avoid circular dependencies
- Named imports preferred: `import { useState, useCallback } from 'react'`
- Mix of named and default imports based on module export style
- No barrel exports (.index.ts) observed; imports target specific modules

## Error Handling

**Patterns:**
- Try-catch blocks for all async operations that might fail
- Error messages in Spanish (user-facing) and English (internal logging)
- Error state in component hooks: `const [error, setError] = useState<string | null>(null)`
- Explicit error type checks: `e instanceof Error ? e.message : 'fallback message'`
- Promise .catch() for fallback values without throwing:
  ```typescript
  const out = await git.readBlob({ ... }).catch(() => null)
  ```
- Cleanup in finally blocks (atomic write, resource management)
- Error propagation: explicit throws with descriptive messages

Example from `git.ts`:
```typescript
try {
  const st = await stat(join(dir, '.git'))
  return
} catch {
  // no es repo todavía
}
await git.init({ fs, dir, defaultBranch: 'main' })
```

## Logging

**Framework:** Console methods (`console.log`, `console.warn`) - no external logger

**Patterns:**
- Informational: `console.log('[icon] cargado: ...')`
- Warnings: `console.warn('[icon] no se pudo cargar...')`
- Prefixed with context in brackets: `[icon]`, `[service]`
- Sparse logging - only critical paths (startup, errors)
- No structured logging; plain strings with interpolation

## Comments

**When to Comment:**
- Complex algorithms (see `assignLanes()` in `git.ts` - explains lane assignment strategy)
- Non-obvious business logic (racy git prevention, branch base metadata)
- High-level architecture decisions (see `@shared/ipc.ts` header explaining IPC boundary)
- Security considerations (path traversal prevention in `vault.ts`)

**JSDoc/TSDoc Style:**
- Block comments for public functions/methods (always include)
- Parameter documentation rare unless non-obvious
- Return type hints included in signature, not comment
- One-line summaries for simple functions

Example:
```typescript
/**
 * Asigna una columna (lane) a cada commit según la topología del DAG, para
 * dibujar un grafo estilo git (ramas paralelas + merges). ...
 */
function assignLanes(
  commits: { oid: string; parents: string[] }[],
  seedTips: string[] = []
): Map<string, number> {
```

## Function Design

**Size:** 
- Service methods: 20-50 lines typical (git operations encapsulated)
- React components: 100-300 lines (complex UI state management acceptable)
- Helper functions: 5-30 lines (utility functions kept lean)
- Large algorithms: Inline comments explaining logic (see `workBlobs()`, `pendingChanges()`)

**Parameters:**
- Positional parameters for required arguments (up to 2-3)
- Options objects for optional/configuration params: `{ base?: string; noCheckout?: boolean }`
- Callback functions as parameters for React handlers
- Destructuring in function signature for props: `{ changes, aiReady, onConfirm, onClose }`

**Return Values:**
- Explicit types on all exported functions
- Promises always typed: `Promise<VaultInfo | null>`
- Nullable returns clearly typed: `string | null`, `TreeNode[]` (never undefined, use null)
- Union types for success/failure: `{ branch: string; oid: string } | null`

## Module Design

**Exports:**
- Named exports for functions and types (no default exports except components)
- Type exports with `export type` to avoid circular dependencies
- Services exported as classes: `export class GitService`, `export class VaultService`
- React components exported as named exports: `export function App()`

**Barrel Files:**
- Not used; imports target specific modules directly
- Exception: plugin host re-exports (`src/renderer/src/plugins/index.ts`)

**Class-Based Services:**
- Main process services use class instances (e.g., `const gitService = new GitService()`)
- Instance methods (not static) for stateful operations
- Private helper methods for internal logic

Example pattern:
```typescript
export class GitService {
  private author(): { name: string; email: string } {
    // Implementation
  }

  async commit(dir: string, message: string): Promise<string | null> {
    // Public method using private helpers
  }
}
```

## React Patterns

**Functional Components:**
- All components are functional using hooks
- No class components in codebase
- `forwardRef` for imperative handles (see `CodeMirrorEditor`)
- `useImperativeHandle` to expose DOM methods to parent

**Hooks Usage:**
- `useState` for local component state
- `useCallback` for stable event handler references (always use with dependency array)
- `useEffect` for side effects (sync data, setup listeners, cleanup)
- `useMemo` for expensive computations or memoized values
- `useRef` for mutable instance variables (editor, handlers, persistent state)

Example pattern:
```typescript
const [message, setMessage] = useState('')
const [generating, setGenerating] = useState(false)
const [error, setError] = useState<string | null>(null)

const generate = useCallback(async () => {
  setGenerating(true)
  setError(null)
  try {
    const msg = await window.geode.ai.suggestMessage()
    setMessage(msg)
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Error')
  } finally {
    setGenerating(false)
  }
}, [])

useEffect(() => {
  if (aiReady) void generate()
}, [aiReady, generate])
```

**Imperative Handles:**
- Used for uncontrolled editor state (CodeMirror, selection, insertion)
- Always combined with `useImperativeHandle` for consumer API
- Ref callbacks kept in `.current` for stable access across renders

## IPC Communication

**Pattern:**
- TypeScript contract defined in `@shared/ipc.ts`
- Main process implements handlers via `ipcMain.handle()`
- Renderer consumes through `window.geode` API
- Preload bridge exposes typed surface only

Example handler:
```typescript
ipcMain.handle(IPC.gitCommit, async (_e, message: string) => {
  const dir = requireRoot()
  return gitService.commit(dir, message)
})
```

Consumer:
```typescript
const oid = await window.geode.git.commit(message)
```

## UI & Styling

**CSS Classes:**
- kebab-case for class names: `.modal-overlay`, `.settings-nav`, `.key-row`
- Semantic class names: `.text-input`, `.primary`, `.icon-btn`
- State classes: `.active`, `.error`, `.spin` (animation class)
- BEM-like structure for component scoping: `.settings-body`, `.settings-content`

**Icons:**
- Lucide React exclusively (no emojis)
- Imported by name: `import { Save, GitBranch, Settings as SettingsIcon } from 'lucide-react'`
- Sized with `size` prop: `<Save size={16} />`
- Used in buttons and UI indicators

Example:
```typescript
<button className="primary" onClick={...}>
  <RefreshCw size={12} /> {generating ? 'generando…' : 'regenerar'}
</button>
```

## Spanish Language Conventions

**UI Strings:**
- All user-facing text in Spanish (dialogs, buttons, labels, help text)
- Titles use capital letters at start only: "Guardar versión", "Nueva nota"
- Button labels: verb+noun format ("Guardar versión", "Crear rama", "Quitar")

**Comments:**
- All comments in Spanish
- Docstrings explain intent in Spanish
- Technical terms often kept in English (git, commit, merge, etc.) within Spanish sentences

**Error Messages:**
- Spanish user-facing errors
- Specific and actionable: "Ya existe una rama "nombre"", "No hay vault abierto"

**Variable Names:**
- Spanish naming: `vault`, `nota`, `rama`, `versión`, `árbol`, `cambios`
- Mixed with English technical terms: `commit`, `blob`, `oid`, `remoto`
- No artificial anglicization; natural mix based on context

---

*Convention analysis: 2026-07-03*
