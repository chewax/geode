<!-- refreshed: 2026-07-03 -->
# Architecture

**Analysis Date:** 2026-07-03

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                      React Renderer (Sandboxed)                     │
│  `src/renderer/src/App.tsx` + Components + Plugin System (Renderer) │
├──────────────────────────────────────────────────────────────────────┤
│                    IPC Bridge (Typed Channels)                       │
│              `src/shared/ipc.ts` + `src/preload/index.ts`            │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ contextBridge.exposeInMainWorld('geode', api)
         ┌───────────────▼───────────────────────────┐
         │  Electron Main Process (Node.js trusted)  │
         │         `src/main/index.ts`               │
         │                                            │
         ├────────────────────────────────────────────┤
         │         Core Services (Main Process)       │
         │  ┌──────────────────────────────────────┐  │
         │  │ VaultService (file I/O, tree)        │  │
         │  │ `src/main/services/vault.ts`         │  │
         │  └──────────────────────────────────────┘  │
         │  ┌──────────────────────────────────────┐  │
         │  │ GitService (isomorphic-git wrapper)  │  │
         │  │ `src/main/services/git.ts`           │  │
         │  └──────────────────────────────────────┘  │
         │  ┌──────────────────────────────────────┐  │
         │  │ GithubService (device flow OAuth)    │  │
         │  │ `src/main/services/github.ts`        │  │
         │  └──────────────────────────────────────┘  │
         │  ┌──────────────────────────────────────┐  │
         │  │ AiService (OpenRouter API)           │  │
         │  │ `src/main/services/ai.ts`            │  │
         │  └──────────────────────────────────────┘  │
         │  ┌──────────────────────────────────────┐  │
         │  │ SettingsService (persistent storage) │  │
         │  │ `src/main/services/settings.ts`      │  │
         │  └──────────────────────────────────────┘  │
         │  ┌──────────────────────────────────────┐  │
         │  │ PluginsService (plugin discovery)    │  │
         │  │ `src/main/services/plugins.ts`       │  │
         │  └──────────────────────────────────────┘  │
         │                                            │
         └────────────────────────────────────────────┘
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

**Overall:** Three-tier Electron architecture with security-first design

**Key Characteristics:**
- **IPC-first**: All main-renderer communication through typed channels in `src/shared/ipc.ts`
- **Sandboxed renderer**: No Node.js access; contextIsolation=true, nodeIntegration=false
- **CommonJS preload**: Must be CommonJS (Electron sandbox requirement); built as .cjs
- **Vault = Folder + Git repo**: One-to-one mapping; markdown files are the source of truth
- **Isomorphic-git backend**: All versioning through isomorphic-git (no native git binary required)
- **Plugin system (Renderer-side)**: Extensible at runtime; built-in plugins + external CommonJS plugins
- **Pure domain interfaces**: `src/domain/index.ts` defines abstract contracts (StorageService, GitService, etc.) for future flexibility

## Layers

**Presentation (Renderer):**
- Purpose: React UI, user interaction, plugin host, modal dialogs
- Location: `src/renderer/src/`
- Contains: React components (App, FileTree, EditorPane, Modals, Panels), plugin infrastructure
- Depends on: IPC bridge (window.geode), React, CodeMirror, Lucide icons
- Used by: User interaction

**IPC Bridge (Typed Contract):**
- Purpose: Enforce type-safe communication between sandboxed renderer and Node.js main
- Location: `src/shared/ipc.ts` (shared between both sides)
- Contains: Channel names (geode:*), interface definitions (GeodeApi, VaultApi, GitApi, etc.)
- Depends on: TypeScript types
- Used by: Both main and renderer to implement/call services

**Preload (Bridge Implementation):**
- Purpose: Translate IPC calls into window.geode object, enforce single surface
- Location: `src/preload/index.ts` (built as CommonJS, required by sandbox)
- Contains: contextBridge.exposeInMainWorld('geode', api) with all IPC mappings
- Depends on: Electron contextBridge, ipcRenderer
- Used by: Renderer code via window.geode

**Core Services (Main Process):**
- Purpose: File I/O, Git versioning, GitHub sync, AI, settings, plugin management
- Location: `src/main/services/`
- Contains: VaultService, GitService, GithubService, AiService, SettingsService, PluginsService
- Depends on: Node.js fs/path, isomorphic-git, Electron dialog, persistent JSON storage
- Used by: IPC handlers in main/index.ts

**Filesystem Layer (Main Process):**
- Purpose: Atomic writes to prevent corruption; path resolution with traversal protection
- Location: `src/main/fs/atomic.ts`
- Contains: atomicWrite (temp + fsync + rename pattern)
- Used by: VaultService for all writes

## Data Flow

### Primary Request Path: User edits a note → Save to disk

1. User types in editor (Renderer) — `src/renderer/src/EditorPane.tsx`
2. React state updates (content)
3. User clicks "Guardar" or auto-save triggers
4. Renderer calls `window.geode.vault.writeNote(path, content)`
5. Preload sends IPC invoke on channel `geode:vault-write-note` with (path, content)
6. Main process handler (line ~240 in `src/main/index.ts`) receives
7. Calls `vault.writeNote(path, content)` — `src/main/services/vault.ts:109`
8. Path validated with `resolveInside()` (traversal protection)
9. atomicWrite called (`src/main/fs/atomic.ts`) — writes temp file, fsyncs, renames
10. IPC promise resolves to renderer
11. React updates UI to show "Guardado"

### Git Commit Flow

1. User enters message in CommitDialog, clicks "Commitear"
2. Renderer calls `window.geode.git.commit(message)`
3. IPC invoke on `geode:git-commit` with message
4. Main handler calls `gitService.commit(requireRoot(), message)`
5. GitService (`src/main/services/git.ts:160+`) stages all changes, creates commit via isomorphic-git
6. Returns OID (commit hash) or null if no changes
7. Renderer receives OID, updates graph view

### State Management

**Main Process:**
- **VaultService.root**: Current vault path (singleton, stateful)
- **GitService**: Ephemeral (per-repo state computed on demand from isomorphic-git)
- **SettingsService**: Persistent JSON file (`~/.geode/settings.json` or app config dir)
- **pendingDeviceCode**: Transient OAuth state (line 56 in `src/main/index.ts`)

**Renderer:**
- **App.tsx vault/tree/panes**: React state synchronized via IPC
- **PluginHost**: External store (useSyncExternalStore) for command/panel registries
- **activeNote**: Mirrored from PluginHost, broadcasted to plugins via events

## Key Abstractions

**VaultInfo:**
- Purpose: Identify a vault by its root path and display name
- Examples: `{ root: '/home/user/my-vault', name: 'my-vault' }`
- Pattern: Immutable, sent over IPC

**TreeNode:**
- Purpose: Hierarchical representation of vault contents (folders and .md files)
- Examples: `{ name: 'notes', path: 'folder/notes', isDir: true, children: [...] }`
- Pattern: Recursive, built by VaultService.tree() from fs.readdir

**GitGraph:**
- Purpose: Complete commit history and branch topology for visualization
- Contains: commits (with lanes for drawing), branches, tags, HEAD position, pushed refs
- Pattern: Immutable snapshot, regenerated on demand

**GeodeApi:**
- Purpose: Single surface exposed to renderer; gates all capabilities
- Location: `src/shared/ipc.ts:366`
- Pattern: Namespace (api.vault, api.git, api.ai, api.github, api.plugins) matching service structure

**PluginHost:**
- Purpose: Central registry for commands, panels, status items, editor extensions; event bus
- Location: `src/renderer/src/plugins/host.ts`
- Pattern: External store (useSyncExternalStore for React), event emitter, active note cache

**PaneLayout:**
- Purpose: Immutable tree model for editor panes (VSCode-like splits)
- Types: LeafPane (group of tabs) | SplitPane (recursive split)
- Pattern: Pure transformations (mapLeaves, updateLeaf, openInLeaf), stable IDs

## Entry Points

**Main Process:**
- Location: `src/main/index.ts:88`
- Triggers: app.on('ready') → createWindow()
- Responsibilities: 
  - Create BrowserWindow with preload + sandbox
  - Register all IPC handlers (lines 137+)
  - Load dev server or built renderer

**Preload Bridge:**
- Location: `src/preload/index.ts:9`
- Triggers: Electron loads preload before renderer
- Responsibilities: 
  - Build GeodeApi object with all IPC wrappers
  - Expose via contextBridge.exposeInMainWorld('geode', api)

**Renderer Entry:**
- Location: `src/renderer/src/main.tsx:6`
- Triggers: HTML loads via window.loadURL() or loadFile()
- Responsibilities: 
  - Mount React App component to #root

**App Component:**
- Location: `src/renderer/src/App.tsx:72`
- Triggers: Main.tsx mounts App
- Responsibilities: 
  - Initialize vault, tree, git graph, panes
  - Set up plugin host, load builtin + external plugins
  - Manage global state (vault, panes, activeNote, modals)
  - Render main UI layout (sidebar, editor area, panels)

**PluginHost Activation:**
- Location: `src/renderer/src/plugins/index.ts:25`
- Triggers: App.tsx after plugin host is created
- Responsibilities: 
  - Call activate(ctx) on each plugin (built-in + external)
  - Collect disposables for cleanup on vault switch or reload

## Architectural Constraints

- **Threading:** Single-threaded JavaScript (both main and renderer). Long-running Git operations may block UI; no worker threads currently used.
- **Global state:** 
  - Main: `VaultService.root` (singleton), `pendingDeviceCode` (transient)
  - Renderer: `App.tsx` state is canonical; `PluginHost` mirrors activeNote
- **Circular imports:** None enforced. Preload is carefully isolated (no back-reference to ipcRenderer internals).
- **IPC message size:** Limited by Electron internals (~100MB practical limit); structure notes as individual files
- **Plugin eval:** Renderer evals CommonJS plugin code (requires `unsafe-eval` in CSP); Fase B will sandbox to iframes
- **Security model:** Renderer can only call whitelisted functions in GeodeApi. Main process validates all IPC arguments (e.g., path traversal in VaultService.resolveInside).

## Anti-Patterns

### Synchronous IPC Calls in Renderer

**What happens:** Code calls `ipcRenderer.sendSync()` expecting instant response
**Why it's wrong:** Blocks renderer thread, freezes UI during long operations (e.g., git clone)
**Do this instead:** Use `ipcRenderer.invoke()` (async) and await, show progress modal if needed. See `src/renderer/src/App.tsx` for examples of loading states.

### Direct Filesystem Access in Renderer

**What happens:** Code tries to read/write files in renderer via `fs` or `path`
**Why it's wrong:** Sandboxed renderer has no access to Node.js. All file I/O must go through IPC.
**Do this instead:** Call `window.geode.vault.readNote()` / `writeNote()` instead. Preload will route to VaultService.

### Plugin Code Assuming Synchronous Git

**What happens:** Plugin calls `geode.git.graph()` expecting instant result
**Why it's wrong:** Git graph is computed from isomorphic-git each time; slow for large repos
**Do this instead:** Plugins should cache graph in state or use event subscriptions (note:change, sync:after) to know when to refetch. See `src/renderer/src/plugins/builtin/outline.tsx` for async pattern.

### Mutating PaneLayout Tree

**What happens:** Code modifies pane tree in place (e.g., `panes.children.push(...)`)
**Why it's wrong:** React can't detect change if reference is same. Editor unmounts/remounts unexpectedly.
**Do this instead:** Use pure transformations: `openInLeaf()`, `splitLeaf()`, `updateLeaf()`, etc. from `src/renderer/src/paneTree.ts`. All return new tree.

## Error Handling

**Strategy:** Typed errors via IPC, null/error returns, toast notifications

**Patterns:**
- **IPC handlers throw:** Main process throws descriptive Error; ipcMain.handle() serializes to rejected Promise in renderer
- **User-facing errors:** Caught in App.tsx, shown as toast via `notify()` from PluginHost
- **Path traversal:** VaultService.resolveInside() validates all paths; throws if outside vault root
- **Plugin load errors:** Accumulated in LoadResult.errors, shown in UI without breaking other plugins
- **Git operations:** Wrapped in try-catch, return null on no-op (no commits to make), throw on real errors (merge conflict, auth)

## Cross-Cutting Concerns

**Logging:** Console.log/error in both processes. No structured logging framework; useful for debugging in dev + packaged app console.

**Validation:** 
- IPC: Type safety via TypeScript (src/shared/ipc.ts contracts)
- Paths: VaultService.resolveInside() prevents traversal
- Plugins: isPlugin() helper checks for id + activate (src/renderer/src/plugins/loader.ts:43)

**Authentication:** 
- GitHub: Device flow (OAuth without client secret)
- AI: API key stored encrypted in settings file (src/main/services/settings.ts)
- No centralized session; each service manages its own tokens

**Persistence:**
- Vault path: Remembered in settings.knownVaults[]
- GitHub config: Stored in settings.github (token, remote, autoPush)
- AI config: Stored in settings.ai (key, model, enabled)
- Plugins: Enabled state stored in settings.pluginsEnabled[id]

---

*Architecture analysis: 2026-07-03*
