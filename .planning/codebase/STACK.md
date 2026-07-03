# Technology Stack

**Analysis Date:** 2026-07-03

## Languages

**Primary:**
- TypeScript 6.0.3 - All source code (main process, preload, renderer, domain logic, shared utilities)
- HTML5 - Electron renderer window (`src/renderer/index.html`)
- CSS3 - Renderer styling (`src/renderer/src/index.css`)

**Secondary:**
- JSON - Configuration files and package manifests
- CommonJS - Preload scripts (compiled output format, required by Electron sandbox)

## Runtime

**Environment:**
- Electron 43.0.0 - Desktop application framework providing Node.js main process and Chromium renderer
- Node.js 18+ (bundled with Electron)
- Chromium (bundled with Electron, determined by electron version)

**Package Manager:**
- npm - Dependency management
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- React 19.2.7 - UI component framework (renderer, `src/renderer/src/`)
- React DOM 19.2.7 - React DOM binding

**Build/Development:**
- Vite 7.3.6 - Fast bundler for renderer assets
- electron-vite 5.0.0 - Build system for Electron (handles main, preload, renderer builds separately)
- electron-builder 26.15.3 - Packages Electron app into distributable installers

**Markdown Editing:**
- CodeMirror 6.x - In-browser code/text editor
  - @codemirror/view 6.43.4 - Core editor UI
  - @codemirror/state 6.7.0 - State management
  - @codemirror/language 6.12.4 - Language plugin system
  - @codemirror/lang-markdown 6.5.0 - Markdown language support
  - @codemirror/commands 6.10.4 - Editor commands
  - @codemirror/language-data 6.5.2 - Language metadata
  - @codemirror/theme-one-dark 6.1.3 - Theme
- marked 18.0.5 - Markdown to HTML parser

**Versioning Engine:**
- isomorphic-git 1.38.6 - Pure JavaScript Git implementation (no system git required, local-first)
- diff 9.0.0 - Unified diff generation and parsing

**UI Components:**
- lucide-react 1.23.0 - Icon library (SVG icons)

**Security:**
- dompurify 3.4.11 - HTML sanitizer (prevents XSS in markdown preview)

## Key Dependencies

**Critical:**
- isomorphic-git - Core versioning/git engine for the app; enables git operations without system git installation
- electron - Desktop app framework and process boundary (IPC)
- react - UI framework
- CodeMirror - Markdown editor (user writes notes in it)

**Infrastructure:**
- Electron's `safeStorage` module (native) - Encrypts API keys (GitHub token, OpenRouter API key)
- Electron's `ipcMain`/`contextBridge` - IPC communication between main and renderer processes
- Node.js filesystem APIs - Vault file access and management

## Configuration

**Build Configuration:**
- `electron.vite.config.ts` - Vite + Electron build configuration
  - Main process build (Node target)
  - Preload script build (CommonJS format)
  - Renderer build (React target, ESM)
- Path aliases configured: `@shared`, `@domain`, `@renderer` (see TypeScript configs)

**TypeScript Configuration:**
- `tsconfig.json` - Root reference config
- `tsconfig.web.json` - Renderer (React, ES2022, ESNext module)
- `tsconfig.node.json` - Main process and preload (Node types, ES2022)
- Compiler options:
  - Target: ES2022
  - Module: ESNext (transpiled by Vite/electron-vite)
  - Strict mode: enabled
  - JSX: react-jsx (automatic imports)

**Environment:**
- `process.env.ELECTRON_RENDERER_URL` - Development server URL (set by electron-vite during dev)
- No .env file usage detected; secrets handled via Electron's safeStorage

**HTML/CSP:**
- Content Security Policy (restrictive)
  - `'self'` for scripts/styles/images
  - `'unsafe-eval'` enabled for plugin loader (Phase A: local plugins evaluated in-process)
  - No external script/style sources allowed
  - Image: data URIs allowed for embedded SVGs

## Platform Requirements

**Development:**
- Node.js 18+
- npm/yarn for dependency installation
- TypeScript compiler (via devDependencies)
- Electron build tools

**Production:**
- Windows 10+ / macOS 11+ / Linux (x64, ARM64)
- Electron executable (packaged via electron-builder)
- Visual C++ Redistributable (Windows only, bundled by electron-builder)

## Build & Distribution

**Build Process:**
```bash
npm run build           # TypeScript validation + electron-vite build
npm run dist           # Build + electron-builder package (creates installer/dmg/snap)
npm run pack           # Build + electron-builder --dir (no signing)
```

**Output:**
- Main process: `out/main/index.js` (entry point in package.json)
- Renderer: `out/renderer/` (static assets + bundled React app)
- Preload: `out/preload/index.cjs` (CommonJS, loaded by Electron sandbox)

**Packaging:**
- electron-builder 26.15.3 generates:
  - Windows: .exe installer + portable exe
  - macOS: .dmg + .zip
  - Linux: .snap, .deb, AppImage

---

*Stack analysis: 2026-07-03*
