<!-- GSD:project-start source:PROJECT.md -->

## Project

**Geode**

Geode is a local-first Markdown notes app (Electron + React + TypeScript) that uses **git as an automatic, invisible memory** — every meaningful change is versioned so nothing is ever lost and users can experiment without fear. It competes with Obsidian; its differentiator is **non-destructive editing** with a human UX layered over git (the user never needs to know git is the engine). Repo folder is named "Amethist"; the product is "Geode".

**Core Value:** **Non-destructive editing** — "you can never lose anything" and "you can experiment without fear." If everything else fails, this must hold: no user content is ever irrecoverable, and the git plumbing stays invisible to non-technical users.

### Constraints

- **Tech stack**: Electron + React + TypeScript; isomorphic-git (no native git binary) — local-first, no backend yet.
- **Security**: Sandboxed renderer (contextIsolation=true, nodeIntegration=false); preload MUST be CommonJS (`.cjs`) — do not convert to ESM.
- **Compatibility**: Racy-git landmine — commit/change detection must hash real content vs HEAD blobs, never revert to statusMatrix (loses same-size same-second edits).
- **UX**: Icons are Lucide (monochrome currentColor), never emojis. Code comments are in Spanish. UI strings are written in Spanish as the source text and wrapped in `t()` / `tx()` from `@shared/i18n` (English in `src/shared/i18n/en/*.ts`; `tests/i18n.test.ts` enforces it). Never call `t()` at module top level.
- **Cost**: AI (OpenRouter) inference cost is user-visible; auto-snapshots must not invoke AI so cost scales with manual saves, not elapsed time.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 6.0.3 - All source code (main process, preload, renderer, domain logic, shared utilities)
- HTML5 - Electron renderer window (`src/renderer/index.html`)
- CSS3 - Renderer styling (`src/renderer/src/index.css`)
- JSON - Configuration files and package manifests
- CommonJS - Preload scripts (compiled output format, required by Electron sandbox)

## Runtime

- Electron 43.0.0 - Desktop application framework providing Node.js main process and Chromium renderer
- Node.js 18+ (bundled with Electron)
- Chromium (bundled with Electron, determined by electron version)
- npm - Dependency management
- Lockfile: `package-lock.json` present

## Frameworks

- React 19.2.7 - UI component framework (renderer, `src/renderer/src/`)
- React DOM 19.2.7 - React DOM binding
- Vite 7.3.6 - Fast bundler for renderer assets
- electron-vite 5.0.0 - Build system for Electron (handles main, preload, renderer builds separately)
- electron-builder 26.15.3 - Packages Electron app into distributable installers
- CodeMirror 6.x - In-browser code/text editor
- marked 18.0.5 - Markdown to HTML parser
- isomorphic-git 1.38.6 - Pure JavaScript Git implementation (no system git required, local-first)
- diff 9.0.0 - Unified diff generation and parsing
- lucide-react 1.23.0 - Icon library (SVG icons)
- dompurify 3.4.11 - HTML sanitizer (prevents XSS in markdown preview)

## Key Dependencies

- isomorphic-git - Core versioning/git engine for the app; enables git operations without system git installation
- electron - Desktop app framework and process boundary (IPC)
- react - UI framework
- CodeMirror - Markdown editor (user writes notes in it)
- Electron's `safeStorage` module (native) - Encrypts API keys (GitHub token, OpenRouter API key)
- Electron's `ipcMain`/`contextBridge` - IPC communication between main and renderer processes
- Node.js filesystem APIs - Vault file access and management

## Configuration

- `electron.vite.config.ts` - Vite + Electron build configuration
- Path aliases configured: `@shared`, `@domain`, `@renderer` (see TypeScript configs)
- `tsconfig.json` - Root reference config
- `tsconfig.web.json` - Renderer (React, ES2022, ESNext module)
- `tsconfig.node.json` - Main process and preload (Node types, ES2022)
- Compiler options:
- `process.env.ELECTRON_RENDERER_URL` - Development server URL (set by electron-vite during dev)
- No .env file usage detected; secrets handled via Electron's safeStorage
- Content Security Policy (restrictive)

## Platform Requirements

- Node.js 18+
- npm/yarn for dependency installation
- TypeScript compiler (via devDependencies)
- Electron build tools
- Windows 10+ / macOS 11+ / Linux (x64, ARM64)
- Electron executable (packaged via electron-builder)
- Visual C++ Redistributable (Windows only, bundled by electron-builder)

## Build & Distribution

- Main process: `out/main/index.js` (entry point in package.json)
- Renderer: `out/renderer/` (static assets + bundled React app)
- Preload: `out/preload/index.cjs` (CommonJS, loaded by Electron sandbox)
- electron-builder 26.15.3 generates:

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Components: PascalCase (e.g., `App.tsx`, `CommitDialog.tsx`, `CodeMirrorEditor.tsx`)
- Services/modules: camelCase (e.g., `git.ts`, `vault.ts`, `atomic.ts`)
- Type definitions: camelCase (e.g., `ipc.ts`, `extensions.ts`)
- Directories: lowercase with hyphens where semantic (e.g., `src/renderer/src/plugins/`, `src/main/services/`)
- camelCase for all functions and methods
- Descriptive names indicating action: `pendingChanges()`, `sanitizeTagName()`, `assignLanes()`
- Private methods prefixed: `private async headBlobs()`
- camelCase for all local variables and constants
- Descriptive names reflecting content type: `headOid`, `branchMeta`, `paneHandles`
- Refs suffixed with `Ref`: `paneHandlesRef`, `openPathRef`, `hostRef`
- State variables prefixed with noun: `commitChanges`, `diffOid`, `editingPath`
- Boolean flags clearly named: `allExpanded`, `sortAsc`, `generating`, `connecting`
- PascalCase for all type names
- Prefixed by domain: `GitCommitNode`, `VaultInfo`, `TreeNode`
- API interfaces prefixed by service: `VaultApi`, `GitApi`, `AiApi`
- Props interfaces suffixed: `CommitDialogProps`, `CodeMirrorEditorProps`, `FileTreeProps`
- UPPER_SNAKE_CASE for true constants (e.g., `IGNORED_TOP`, `PROD = 'main'`, `GITHUB_CLIENT_ID`)
- IPC channel names prefixed with `geode:` (e.g., `'geode:vault-open'`, `'geode:git-commit'`)

## Code Style

- No explicit linter configured (no `.eslintrc`, `.prettierrc`, or `biome.json`)
- TypeScript strict mode enabled across all tsconfig files
- Target ES2022 for both renderer and node
- Module format: ESNext
- TypeScript strict mode enabled: `"strict": true`
- Unused locals/params flagged: `"noUnusedLocals": true`, `"noUnusedParameters": true`
- Consistent casing enforced: `"forceConsistentCasingInFileNames": true`
- No implicit any: strict mode prevents this
- Explicit return types on all exported functions and methods
- Interface parameters always typed with imported types
- JSX elements typed as `JSX.Element` or `JSX.ElementType`
- Callback types explicitly specified: `(cb: (maximized: boolean) => void) => () => void`

## Import Organization

- `@renderer/*`: Maps to `src/renderer/src/*` (React components, UI logic)
- `@shared/*`: Maps to `src/shared/*` (IPC contracts, shared types)
- `@domain/*`: Maps to `src/domain/*` (domain models)
- Use `import type` for type-only imports to avoid circular dependencies
- Named imports preferred: `import { useState, useCallback } from 'react'`
- Mix of named and default imports based on module export style
- No barrel exports (.index.ts) observed; imports target specific modules

## Error Handling

- Try-catch blocks for all async operations that might fail
- Error messages in Spanish (user-facing) and English (internal logging)
- Error state in component hooks: `const [error, setError] = useState<string | null>(null)`
- Explicit error type checks: `e instanceof Error ? e.message : 'fallback message'`
- Promise .catch() for fallback values without throwing:
- Cleanup in finally blocks (atomic write, resource management)
- Error propagation: explicit throws with descriptive messages

## Logging

- Informational: `console.log('[icon] cargado: ...')`
- Warnings: `console.warn('[icon] no se pudo cargar...')`
- Prefixed with context in brackets: `[icon]`, `[service]`
- Sparse logging - only critical paths (startup, errors)
- No structured logging; plain strings with interpolation

## Comments

- Complex algorithms (see `assignLanes()` in `git.ts` - explains lane assignment strategy)
- Non-obvious business logic (racy git prevention, branch base metadata)
- High-level architecture decisions (see `@shared/ipc.ts` header explaining IPC boundary)
- Security considerations (path traversal prevention in `vault.ts`)
- Block comments for public functions/methods (always include)
- Parameter documentation rare unless non-obvious
- Return type hints included in signature, not comment
- One-line summaries for simple functions

## Function Design

- Service methods: 20-50 lines typical (git operations encapsulated)
- React components: 100-300 lines (complex UI state management acceptable)
- Helper functions: 5-30 lines (utility functions kept lean)
- Large algorithms: Inline comments explaining logic (see `workBlobs()`, `pendingChanges()`)
- Positional parameters for required arguments (up to 2-3)
- Options objects for optional/configuration params: `{ base?: string; noCheckout?: boolean }`
- Callback functions as parameters for React handlers
- Destructuring in function signature for props: `{ changes, aiReady, onConfirm, onClose }`
- Explicit types on all exported functions
- Promises always typed: `Promise<VaultInfo | null>`
- Nullable returns clearly typed: `string | null`, `TreeNode[]` (never undefined, use null)
- Union types for success/failure: `{ branch: string; oid: string } | null`

## Module Design

- Named exports for functions and types (no default exports except components)
- Type exports with `export type` to avoid circular dependencies
- Services exported as classes: `export class GitService`, `export class VaultService`
- React components exported as named exports: `export function App()`
- Not used; imports target specific modules directly
- Exception: plugin host re-exports (`src/renderer/src/plugins/index.ts`)
- Main process services use class instances (e.g., `const gitService = new GitService()`)
- Instance methods (not static) for stateful operations
- Private helper methods for internal logic

## React Patterns

- All components are functional using hooks
- No class components in codebase
- `forwardRef` for imperative handles (see `CodeMirrorEditor`)
- `useImperativeHandle` to expose DOM methods to parent
- `useState` for local component state
- `useCallback` for stable event handler references (always use with dependency array)
- `useEffect` for side effects (sync data, setup listeners, cleanup)
- `useMemo` for expensive computations or memoized values
- `useRef` for mutable instance variables (editor, handlers, persistent state)
- Used for uncontrolled editor state (CodeMirror, selection, insertion)
- Always combined with `useImperativeHandle` for consumer API
- Ref callbacks kept in `.current` for stable access across renders

## IPC Communication

- TypeScript contract defined in `@shared/ipc.ts`
- Main process implements handlers via `ipcMain.handle()`
- Renderer consumes through `window.geode` API
- Preload bridge exposes typed surface only

## UI & Styling

- kebab-case for class names: `.modal-overlay`, `.settings-nav`, `.key-row`
- Semantic class names: `.text-input`, `.primary`, `.icon-btn`
- State classes: `.active`, `.error`, `.spin` (animation class)
- BEM-like structure for component scoping: `.settings-body`, `.settings-content`
- Lucide React exclusively (no emojis)
- Imported by name: `import { Save, GitBranch, Settings as SettingsIcon } from 'lucide-react'`
- Sized with `size` prop: `<Save size={16} />`
- Used in buttons and UI indicators

## Spanish Language Conventions

- All user-facing text in Spanish (dialogs, buttons, labels, help text)
- Titles use capital letters at start only: "Guardar versión", "Nueva nota"
- Button labels: verb+noun format ("Guardar versión", "Crear rama", "Quitar")
- All comments in Spanish
- Docstrings explain intent in Spanish
- Technical terms often kept in English (git, commit, merge, etc.) within Spanish sentences
- Spanish user-facing errors
- Specific and actionable: "Ya existe una rama "nombre"", "No hay vault abierto"
- Spanish naming: `vault`, `nota`, `rama`, `versión`, `árbol`, `cambios`
- Mixed with English technical terms: `commit`, `blob`, `oid`, `remoto`
- No artificial anglicization; natural mix based on context

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Renderer (React)** | UI, user interaction, plugin host, pane layout | `src/renderer/src/App.tsx` |
| **Preload Bridge** | Type-safe IPC surface, exposes `window.geode` | `src/preload/index.ts` |
| **Main Process** | Electron window, IPC handler registration | `src/main/index.ts` |
| **VaultService** | File I/O, tree traversal, atomic writes | `src/main/services/vault.ts` |
| **GitService** | Versioning via isomorphic-git, commit graph, history | `src/main/services/git.ts` |
| **GithubService** | OAuth device flow, push, repo management | `src/main/services/github.ts` |
| **AiService** | OpenRouter API for commit message generation | `src/main/services/ai.ts` |
| **SettingsService** | Persistent JSON storage (vault list, auth tokens, config) | `src/main/services/settings.ts` |
| **PluginsService** | External plugin discovery and code delivery | `src/main/services/plugins.ts` |
| **PluginHost** | Event bus, command/panel registry, workspace API | `src/renderer/src/plugins/host.ts` |
| **PluginLoader** | Runtime eval of CommonJS plugins | `src/renderer/src/plugins/loader.ts` |
| **PaneTree** | Immutable tree model for VSCode-like splits | `src/renderer/src/paneTree.ts` |

## Pattern Overview

- **IPC-first**: All main-renderer communication through typed channels in `src/shared/ipc.ts`
- **Sandboxed renderer**: No Node.js access; contextIsolation=true, nodeIntegration=false
- **CommonJS preload**: Must be CommonJS (Electron sandbox requirement); built as .cjs
- **Vault = Folder + Git repo**: One-to-one mapping; markdown files are the source of truth
- **Isomorphic-git backend**: All versioning through isomorphic-git (no native git binary required)
- **Plugin system (Renderer-side)**: Extensible at runtime; built-in plugins + external CommonJS plugins
- **Pure domain interfaces**: `src/domain/index.ts` defines abstract contracts (StorageService, GitService, etc.) for future flexibility

## Layers

- Purpose: React UI, user interaction, plugin host, modal dialogs
- Location: `src/renderer/src/`
- Contains: React components (App, FileTree, EditorPane, Modals, Panels), plugin infrastructure
- Depends on: IPC bridge (window.geode), React, CodeMirror, Lucide icons
- Used by: User interaction
- Purpose: Enforce type-safe communication between sandboxed renderer and Node.js main
- Location: `src/shared/ipc.ts` (shared between both sides)
- Contains: Channel names (geode:*), interface definitions (GeodeApi, VaultApi, GitApi, etc.)
- Depends on: TypeScript types
- Used by: Both main and renderer to implement/call services
- Purpose: Translate IPC calls into window.geode object, enforce single surface
- Location: `src/preload/index.ts` (built as CommonJS, required by sandbox)
- Contains: contextBridge.exposeInMainWorld('geode', api) with all IPC mappings
- Depends on: Electron contextBridge, ipcRenderer
- Used by: Renderer code via window.geode
- Purpose: File I/O, Git versioning, GitHub sync, AI, settings, plugin management
- Location: `src/main/services/`
- Contains: VaultService, GitService, GithubService, AiService, SettingsService, PluginsService
- Depends on: Node.js fs/path, isomorphic-git, Electron dialog, persistent JSON storage
- Used by: IPC handlers in main/index.ts
- Purpose: Atomic writes to prevent corruption; path resolution with traversal protection
- Location: `src/main/fs/atomic.ts`
- Contains: atomicWrite (temp + fsync + rename pattern)
- Used by: VaultService for all writes

## Data Flow

### Primary Request Path: User edits a note → Save to disk

### Git Commit Flow

### State Management

- **VaultService.root**: Current vault path (singleton, stateful)
- **GitService**: Ephemeral (per-repo state computed on demand from isomorphic-git)
- **SettingsService**: Persistent JSON file (`~/.geode/settings.json` or app config dir)
- **pendingDeviceCode**: Transient OAuth state (line 56 in `src/main/index.ts`)
- **App.tsx vault/tree/panes**: React state synchronized via IPC
- **PluginHost**: External store (useSyncExternalStore) for command/panel registries
- **activeNote**: Mirrored from PluginHost, broadcasted to plugins via events

## Key Abstractions

- Purpose: Identify a vault by its root path and display name
- Examples: `{ root: '/home/user/my-vault', name: 'my-vault' }`
- Pattern: Immutable, sent over IPC
- Purpose: Hierarchical representation of vault contents (folders and .md files)
- Examples: `{ name: 'notes', path: 'folder/notes', isDir: true, children: [...] }`
- Pattern: Recursive, built by VaultService.tree() from fs.readdir
- Purpose: Complete commit history and branch topology for visualization
- Contains: commits (with lanes for drawing), branches, tags, HEAD position, pushed refs
- Pattern: Immutable snapshot, regenerated on demand
- Purpose: Single surface exposed to renderer; gates all capabilities
- Location: `src/shared/ipc.ts:366`
- Pattern: Namespace (api.vault, api.git, api.ai, api.github, api.plugins) matching service structure
- Purpose: Central registry for commands, panels, status items, editor extensions; event bus
- Location: `src/renderer/src/plugins/host.ts`
- Pattern: External store (useSyncExternalStore for React), event emitter, active note cache
- Purpose: Immutable tree model for editor panes (VSCode-like splits)
- Types: LeafPane (group of tabs) | SplitPane (recursive split)
- Pattern: Pure transformations (mapLeaves, updateLeaf, openInLeaf), stable IDs

## Entry Points

- Location: `src/main/index.ts:88`
- Triggers: app.on('ready') → createWindow()
- Responsibilities: 
- Location: `src/preload/index.ts:9`
- Triggers: Electron loads preload before renderer
- Responsibilities: 
- Location: `src/renderer/src/main.tsx:6`
- Triggers: HTML loads via window.loadURL() or loadFile()
- Responsibilities: 
- Location: `src/renderer/src/App.tsx:72`
- Triggers: Main.tsx mounts App
- Responsibilities: 
- Location: `src/renderer/src/plugins/index.ts:25`
- Triggers: App.tsx after plugin host is created
- Responsibilities: 

## Architectural Constraints

- **Threading:** Single-threaded JavaScript (both main and renderer). Long-running Git operations may block UI; no worker threads currently used.
- **Global state:** 
- **Circular imports:** None enforced. Preload is carefully isolated (no back-reference to ipcRenderer internals).
- **IPC message size:** Limited by Electron internals (~100MB practical limit); structure notes as individual files
- **Plugin eval:** Renderer evals CommonJS plugin code (requires `unsafe-eval` in CSP); Fase B will sandbox to iframes
- **Security model:** Renderer can only call whitelisted functions in GeodeApi. Main process validates all IPC arguments (e.g., path traversal in VaultService.resolveInside).

## Anti-Patterns

### Synchronous IPC Calls in Renderer

### Direct Filesystem Access in Renderer

### Plugin Code Assuming Synchronous Git

### Mutating PaneLayout Tree

## Error Handling

- **IPC handlers throw:** Main process throws descriptive Error; ipcMain.handle() serializes to rejected Promise in renderer
- **User-facing errors:** Caught in App.tsx, shown as toast via `notify()` from PluginHost
- **Path traversal:** VaultService.resolveInside() validates all paths; throws if outside vault root
- **Plugin load errors:** Accumulated in LoadResult.errors, shown in UI without breaking other plugins
- **Git operations:** Wrapped in try-catch, return null on no-op (no commits to make), throw on real errors (merge conflict, auth)

## Cross-Cutting Concerns

- IPC: Type safety via TypeScript (src/shared/ipc.ts contracts)
- Paths: VaultService.resolveInside() prevents traversal
- Plugins: isPlugin() helper checks for id + activate (src/renderer/src/plugins/loader.ts:43)
- GitHub: Device flow (OAuth without client secret)
- AI: API key stored encrypted in settings file (src/main/services/settings.ts)
- No centralized session; each service manages its own tokens
- Vault path: Remembered in settings.knownVaults[]
- GitHub config: Stored in settings.github (token, remote, autoPush)
- AI config: Stored in settings.ai (key, model, enabled)
- Plugins: Enabled state stored in settings.pluginsEnabled[id]

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
