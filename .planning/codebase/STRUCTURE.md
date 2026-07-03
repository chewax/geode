# Codebase Structure

**Analysis Date:** 2026-07-03

## Directory Layout

```
geode/
├── src/
│   ├── domain/               # Pure domain contracts (abstract interfaces)
│   │   └── index.ts          # StorageService, GitService, SyncService, etc.
│   │
│   ├── main/                 # Electron main process (Node.js trusted)
│   │   ├── index.ts          # App entry, window creation, IPC handler registration
│   │   ├── fs/
│   │   │   └── atomic.ts     # Atomic write pattern (temp + fsync + rename)
│   │   └── services/
│   │       ├── vault.ts      # VaultService — file I/O, tree traversal, paths
│   │       ├── git.ts        # GitService — isomorphic-git wrapper, graph, history
│   │       ├── github.ts     # GithubService — device flow OAuth, push, repo mgmt
│   │       ├── ai.ts         # AiService — OpenRouter API integration
│   │       ├── settings.ts   # SettingsService — persistent JSON config
│   │       └── plugins.ts    # PluginsService — external plugin discovery
│   │
│   ├── preload/              # Electron preload (CommonJS, sandboxed bridge)
│   │   ├── index.ts          # contextBridge.exposeInMainWorld('geode', api)
│   │   └── index.d.ts        # TypeScript declarations for globals
│   │
│   ├── renderer/             # React app (sandboxed, no Node.js)
│   │   └── src/
│   │       ├── main.tsx      # React root entry
│   │       ├── App.tsx       # Main component: state, pane layout, plugin host
│   │       ├── index.css     # Global styles
│   │       ├── assets/       # Images (logo, etc.)
│   │       │
│   │       ├── editor/       # CodeMirror integration
│   │       │   ├── CodeMirrorEditor.tsx  # Editor component + extensions
│   │       │   └── extensions.ts         # CodeMirror-specific config
│   │       │
│   │       ├── plugins/      # Plugin system (host, loader, built-in, React integration)
│   │       │   ├── host.ts              # PluginHost — registry, event bus, external store
│   │       │   ├── types.ts             # Command, PanelDef, GeodeEvents, PluginContext, Workspace
│   │       │   ├── loader.ts            # loadExternalPlugins() — eval CommonJS plugins
│   │       │   ├── index.ts             # Re-exports, BUILTIN_PLUGINS, activatePlugins()
│   │       │   ├── react.tsx            # useGeode(), GeodeProvider, buildPluginContext()
│   │       │   ├── CommandPalette.tsx   # Ctrl+P command palette
│   │       │   ├── PluginPanels.tsx     # Sidebar plugin panels
│   │       │   ├── PluginStatusBar.tsx  # Status bar plugin items
│   │       │   └── builtin/
│   │       │       ├── insertDate.ts    # Built-in: date insertion
│   │       │       ├── outline.tsx      # Built-in: note outline
│   │       │       └── readingTime.tsx  # Built-in: reading time badge
│   │       │
│   │       ├── paneTree.ts           # Immutable tree model for editor panes (VSCode-style splits)
│   │       ├── PaneView.tsx           # Renders split/leaf panes recursively
│   │       ├── EditorPane.tsx         # Tab group component (open notes in a leaf)
│   │       │
│   │       ├── FileTree.tsx           # Left sidebar: vault file explorer
│   │       ├── VaultSwitcher.tsx      # Dropdown to switch between known vaults
│   │       ├── BranchSwitcher.tsx     # Git branch dropdown (current branch)
│   │       │
│   │       ├── VersionGraph.tsx       # Modal: commit graph visualization
│   │       ├── TimelineScrubber.tsx   # Modal: timeline scrubber for a note's versions
│   │       ├── DiffView.tsx           # Modal: unified diff viewer
│   │       │
│   │       ├── CommitDialog.tsx       # Modal: commit message input
│   │       ├── BranchDialog.tsx       # Modal: create/merge branches
│   │       ├── NewVaultDialog.tsx     # Modal: create or clone vault
│   │       ├── SettingsModal.tsx      # Modal: app settings (GitHub, AI, plugins)
│   │       ├── AiPromptModal.tsx      # Modal: AI assistant for commit/text generation
│   │       │
│   │       ├── MarkdownPreview.tsx    # Split view: rendered Markdown preview
│   │       ├── WindowControls.tsx     # Title bar: minimize/maximize/close buttons
│   │       │
│   │       └── vite-env.d.ts          # Vite environment types
│   │
│   └── shared/
│       └── ipc.ts            # ← Single source of truth for IPC contract
│                              # IPC channel names (geode:*), GeodeApi, all type definitions
│
├── docs/                     # Documentation
│   ├── PLUGINS.md           # Plugin development guide (Fase B: sandbox design)
│   └── ...
│
├── examples/
│   └── plugins/             # Example external plugins
│
├── resources/
│   ├── icon.png
│   └── icon.ico
│
├── out/                      # Compiled output (build artifacts)
│   ├── main/
│   ├── preload/
│   └── renderer/
│
├── dist/                     # Packaged app (electron-builder output)
│
├── package.json             # Dependencies, build scripts
├── tsconfig.json            # Base TypeScript config
├── tsconfig.node.json       # Main process TypeScript config
├── tsconfig.web.json        # Renderer TypeScript config
├── vite.config.ts           # Vite config for renderer (dev + build)
├── electron-builder.json    # Packaging config
│
└── .planning/
    └── codebase/            # ← You are here
        ├── ARCHITECTURE.md
        └── STRUCTURE.md
```

## Directory Purposes

**src/domain:**
- Purpose: Pure domain layer — abstract interfaces for services without coupling to Electron/React
- Contains: StorageService, GitService, SyncService, IndexService, etc. (contracts only, no implementation)
- Key files: `index.ts` (all abstractions)

**src/main:**
- Purpose: Electron main process — trusted, has Node.js access, manages window/IPC/services
- Contains: App startup, window lifecycle, IPC handler functions, service implementations
- Key files: `index.ts` (entry), `services/*` (VaultService, GitService, etc.)

**src/main/fs:**
- Purpose: Filesystem utilities with safety guarantees
- Contains: atomicWrite (temp + fsync + rename pattern to prevent corruption)
- Key files: `atomic.ts`

**src/main/services:**
- Purpose: Core business logic — all Node.js operations (file I/O, git, auth, etc.)
- Contains: Six services: Vault (files), Git (isomorphic-git), Github (OAuth), Ai (OpenRouter), Settings (storage), Plugins (discovery)
- Key files: `vault.ts`, `git.ts`, `github.ts`, `ai.ts`, `settings.ts`, `plugins.ts`

**src/preload:**
- Purpose: Electron preload script (MUST be CommonJS) — bridge between sandboxed renderer and main
- Contains: contextBridge.exposeInMainWorld() with typed GeodeApi surface
- Key files: `index.ts` (preload), `index.d.ts` (type declarations for globals)

**src/renderer:**
- Purpose: React app (sandboxed, no Node.js) — all UI, user interaction, plugins
- Contains: React components, plugin system, state management

**src/renderer/src:**
- Top-level components (App, dialogs, sidebars), plugin system, pane layout logic

**src/renderer/src/editor:**
- Purpose: CodeMirror integration
- Contains: CodeMirrorEditor component, editor configuration and extensions
- Key files: `CodeMirrorEditor.tsx` (component), `extensions.ts` (CM config)

**src/renderer/src/plugins:**
- Purpose: Plugin system infrastructure — host, loader, built-in plugins, React integration
- Contains: PluginHost (registry + event bus), Loader (eval CommonJS), Workspace API, built-in plugins
- Key files: `host.ts` (registry), `loader.ts` (runtime eval), `types.ts` (interfaces), `index.ts` (exports), `react.tsx` (useGeode hook), `builtin/*` (insertDate, outline, readingTime)

**src/shared:**
- Purpose: Shared types and constants between main and renderer
- Contains: IPC channel names, all TypeScript interfaces for communication
- Key files: `ipc.ts` (THE SOURCE OF TRUTH for main-renderer contract)

**docs/:**
- Purpose: User/developer documentation
- Key files: `PLUGINS.md` (plugin development, Fase B sandbox design)

**examples/plugins/:**
- Purpose: Example external plugins demonstrating plugin API
- Contains: Sample plugin implementations

**resources/:**
- Purpose: Static assets
- Contains: App icon (PNG for runtime, ICO for packaging)

**out/:**
- Purpose: Compiled output
- Generated by: electron-vite build process
- Structure: main/, preload/, renderer/ (mirroring src/ structure)

**dist/:**
- Purpose: Packaged app
- Generated by: electron-builder
- Contains: Platform-specific installers, unpacked executable

## Key File Locations

**Entry Points:**
- `src/main/index.ts`: Electron main process entry (createWindow, IPC handlers)
- `src/preload/index.ts`: Preload bridge (exposes window.geode)
- `src/renderer/src/main.tsx`: React root (mounts App)
- `src/renderer/src/App.tsx`: Main React component (state, UI layout, plugin host)

**Configuration:**
- `src/shared/ipc.ts`: IPC contract (channels, types) — SINGLE SOURCE OF TRUTH
- `package.json`: Dependencies, build scripts
- `tsconfig.node.json`: Main process TypeScript config
- `tsconfig.web.json`: Renderer TypeScript config
- `vite.config.ts`: Vite build config (renderer)
- `electron-builder.json`: Packaging config

**Core Logic:**
- `src/main/services/vault.ts`: File I/O, tree, paths (with traversal protection)
- `src/main/services/git.ts`: Git operations, commit graph, history
- `src/main/services/github.ts`: OAuth device flow, push, repo mgmt
- `src/main/fs/atomic.ts`: Atomic writes (safe from corruption)

**UI Components:**
- `src/renderer/src/App.tsx`: Main layout, state management
- `src/renderer/src/FileTree.tsx`: Vault file browser
- `src/renderer/src/EditorPane.tsx`: Tab-based editor (one per pane)
- `src/renderer/src/PaneView.tsx`: Recursive split/leaf renderer

**Plugin System:**
- `src/renderer/src/plugins/host.ts`: Registry, event bus, external store
- `src/renderer/src/plugins/loader.ts`: Runtime eval of CommonJS plugins
- `src/renderer/src/plugins/types.ts`: Command, PanelDef, Workspace, PluginContext interfaces
- `src/renderer/src/plugins/react.tsx`: useGeode() hook, GeodeProvider

**Utilities:**
- `src/renderer/src/paneTree.ts`: Immutable tree operations for pane layout

## Naming Conventions

**Files:**
- **camelCase**: `vault.ts`, `gitService.ts`, `EditorPane.tsx`, `CodeMirrorEditor.tsx`
- **Exception**: React components use PascalCase (convention) even though file would be camelCase if it were a module
- **Actually**: File is PascalCase if exporting one React component (e.g., `EditorPane.tsx` exports `EditorPane`)
- **Service files**: camelCase (e.g., `vault.ts` exports VaultService)

**Directories:**
- **lowercase, dash-separated**: `src/main/services/`, `src/renderer/src/plugins/builtin/`
- **No underscores** (except tech stack names like `vite-env.d.ts`)

**Exports:**
- **Functions**: camelCase (e.g., `loadExternalPlugins()`, `atomicWrite()`, `openInLeaf()`)
- **Classes**: PascalCase (e.g., `VaultService`, `GitService`, `PluginHost`)
- **Types/Interfaces**: PascalCase (e.g., `GeodeApi`, `TreeNode`, `PluginContext`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `PROD = 'main'`, `BUILTIN_PLUGINS`)
- **React components**: PascalCase (e.g., `App`, `EditorPane`, `FileTree`)

**IPC Channels:**
- **Prefix**: `geode:` (to avoid collisions)
- **Format**: `geode:noun-verb` (e.g., `geode:vault-open`, `geode:git-commit`, `geode:ai-suggest-message`)

## Where to Add New Code

**New Feature (e.g., Sync to iCloud):**
- **Main service**: `src/main/services/icloud.ts` — implement service class with methods
- **IPC handlers**: Add to `src/main/index.ts` — call ipcMain.handle(IPC.icloudSync, ...)
- **IPC contract**: Add to `src/shared/ipc.ts` — add channel names, interface (ICloudApi), add to GeodeApi
- **Preload**: Add to `src/preload/index.ts` — add icloud methods to api object
- **UI**: Add React component(s) in `src/renderer/src/` (e.g., ICloudModal.tsx, ICloudSettings.tsx)
- **Renderer call**: Renderer calls `window.geode.icloud.sync()` (or whatever the API is)

**New Component/Modal:**
- **File**: `src/renderer/src/[ComponentName].tsx` (PascalCase)
- **Pattern**: Use useState for local state, useCallback for handlers, window.geode.* for side effects
- **Integration**: Import in `App.tsx`, add state (showModal, setShowModal), render conditionally
- Example: `src/renderer/src/CommitDialog.tsx` (commit modal)

**New Plugin Panel/Command (Renderer-side):**
- **Built-in plugin**: Add to `src/renderer/src/plugins/builtin/[plugin].ts`
  - Export a GeodePlugin object with id, name, activate()
  - In activate(), register commands via ctx.commands.register(), panels via ctx.panels.register()
  - Export from `index.ts` and add to BUILTIN_PLUGINS array
  - See `src/renderer/src/plugins/builtin/outline.tsx` for full example
- **External plugin**: Create in `~/.geode/plugins/[plugin-id]/` as CommonJS module
  - Exports default: { id, name, activate(ctx) { ... } }
  - Main discovers via PluginsService, loader evals at runtime in renderer
  - See `docs/PLUGINS.md` for development guide

**New Utility/Helper:**
- **If used in both main and renderer**: `src/shared/utils/[name].ts`
- **If main only**: `src/main/utils/[name].ts` (or just add to existing service)
- **If renderer only**: `src/renderer/src/utils/[name].ts` or inline in component

**New Test:**
- **Pattern**: `*.test.ts` or `*.spec.ts` (co-located with code)
- **Framework**: Not yet configured (no test runner in place)
- **When adding**: Set up Jest or Vitest in package.json

## Special Directories

**out/:**
- Purpose: Compiled JavaScript (emitted by electron-vite)
- Generated: Yes (by build process)
- Committed: No (.gitignore'd)
- Structure: Mirrors src/ (out/main/, out/preload/, out/renderer/)

**dist/:**
- Purpose: Packaged app (executable + dependencies)
- Generated: Yes (by electron-builder)
- Committed: No (.gitignore'd)
- Contents: Platform-specific (Windows .exe, macOS .app, Linux .AppImage)

**.geode/ (home directory):**
- Purpose: User data directory (outside the app package)
- Location: Platform-dependent (Electron's app.getPath('userData'))
- Contains: settings.json (vault list, auth tokens, config)
- Committed: No (user-specific)

**node_modules/:**
- Purpose: Dependencies
- Generated: Yes (by npm install)
- Committed: No (.gitignore'd)

**src/domain/:**
- Purpose: Define contracts for future flexibility (Fase B: multi-device sync, CRDTs, etc.)
- Status: Incomplete (interfaces defined, not all implemented)
- Note: Services implement these interfaces over time

---

*Structure analysis: 2026-07-03*
