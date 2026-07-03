# External Integrations

**Analysis Date:** 2026-07-03

## APIs & External Services

**GitHub:**
- GitHub REST API - Vault sync and cloud backup
  - OAuth Device Flow (no client secret needed)
  - Endpoints:
    - `https://github.com/login/device/code` - Request device code
    - `https://github.com/login/oauth/access_token` - Poll for access token
    - `https://api.github.com/user` - Get authenticated user info
    - `https://api.github.com/user/repos` - List user's repositories
    - `https://api.github.com/user/repos` (POST) - Create new repository
  - SDK/Client: None (uses native `fetch` API)
  - Auth: OAuth 2.0 Device Flow with public client ID `Ov23liOW1wfZr6QhxLVY`
  - Scope: `repo` (read/write access to public and private repos)
  - Implementation: `src/main/services/github.ts`

**OpenRouter (AI Gateway):**
- OpenRouter API - AI-powered commit message generation and writing assistance
  - Base URL: `https://openrouter.ai/api/v1`
  - Endpoints:
    - `/chat/completions` - Generate text (commit messages, writing assistance)
    - `/models` - List available models and pricing
    - `/auth/key` - Check API key usage/balance
  - SDK/Client: None (uses native `fetch` API)
  - Auth: Bearer token (OpenRouter API key)
  - Implementation: `src/main/services/ai.ts` (OpenRouterProvider class)
  - Features:
    - Commit message generation from unified diffs (SYSTEM_PROMPT at `src/main/services/ai.ts:16`)
    - Writing assistance (WRITER_PROMPT at `src/main/services/ai.ts:28`)
    - Model listing and usage tracking
    - Max token limits: 300 for commit messages, 1000 for writing assistance

## Data Storage

**Local File System:**
- Vault folders (user-specified location)
  - Contains: Git repository (.git directory), markdown notes (.md files)
  - Location: User-specified during vault creation (see `src/main/services/vault.ts`)
  - Version control: Managed by isomorphic-git (pure JavaScript, no system git required)
  - Ignored directories: `.git`, `.geode`, `node_modules`, `.obsidian`

**App Settings:**
- `settings.json` in `app.getPath('userData')`
  - Platform-specific locations:
    - Windows: `%APPDATA%\Geode\`
    - macOS: `~/Library/Application Support/Geode/`
    - Linux: `~/.config/Geode/`
  - Contents:
    - Last vault path
    - Known vaults list
    - AI configuration (model, encrypted key)
    - GitHub configuration (encrypted token, login, remote URL, auto-push setting)
    - Plugin enabled status
  - Storage: JSON file on disk

**Encryption:**
- Electron's `safeStorage` module (native OS credentials storage)
  - Encrypts sensitive keys when writing to `settings.json`
  - GitHub OAuth tokens
  - OpenRouter API keys
  - Fallback: Plain text if OS encryption unavailable (flagged with `tokenEncrypted`/`keyEncrypted` boolean)
  - Implementation: `src/main/services/settings.ts`

## Authentication & Identity

**GitHub:**
- OAuth 2.0 Device Flow
  - User receives a code in the app, types it at `https://github.com/login/device`
  - App polls GitHub until authorization completes
  - No client secret transmitted (public client ID only)
  - Token stored encrypted with Electron's safeStorage
  - User login cached for display purposes
  - Implementation:
    - Start flow: `requestDeviceCode()` → `src/main/services/github.ts:39`
    - Poll loop: `pollForToken()` → `src/main/services/github.ts:58`
    - Get user: `getLogin()` → `src/main/services/github.ts:93`

**OpenRouter:**
- API key authentication (Bearer token)
  - User provides API key in Settings modal
  - Token stored encrypted with Electron's safeStorage
  - Validated by attempting `/models` request
  - Implementation: `src/main/services/ai.ts` (OpenRouterProvider)

**App-Level:**
- No built-in user accounts
- Vault ownership determined by filesystem access
- GitHub authentication is optional (for sync only)
- AI features optional (require OpenRouter key)

## Monitoring & Observability

**Error Tracking:**
- Not detected. Errors logged to console.

**Logs:**
- Console logging in development
- Main process errors visible in Electron DevTools
- Renderer errors visible in browser console (Electron DevTools)
- No persistent error log file detected

**Telemetry:**
- Not detected. No analytics or tracking.

## CI/CD & Deployment

**Hosting:**
- Distributed as Electron desktop app
- Self-signed or unsigned (configurable via electron-builder)
- No auto-update mechanism detected

**Build & Packaging:**
- electron-builder (CI-agnostic)
  - Configured in `package.json` scripts
  - Targets: Windows (exe, msi), macOS (dmg, zip), Linux (AppImage, deb, snap)

**CI Pipeline:**
- Not detected (no GitHub Actions, GitLab CI, etc.)

## Environment Configuration

**Required environment variables:**
- None for runtime (all secrets managed via OS credentials via safeStorage)
- Development only:
  - `ELECTRON_RENDERER_URL` - Set by electron-vite dev server

**Secrets location:**
- GitHub OAuth token: Encrypted in `settings.json` (via safeStorage)
- OpenRouter API key: Encrypted in `settings.json` (via safeStorage)
- GitHub client ID: Hardcoded in `src/main/index.ts:50` (public, no secret required)

**Configuration files:**
- `settings.json` (generated at first run)
- Vault-level config: `.git` directory (isomorphic-git metadata)
- No `.env` files used

## Webhooks & Callbacks

**Incoming:**
- Not detected. The app does not expose an HTTP server.

**Outgoing:**
- GitHub: No webhooks. Polling-based for OAuth device flow only.
- OpenRouter: No webhooks. Standard REST API requests.

## Network Requirements

**Required Connectivity:**
- GitHub OAuth flow: HTTPS to github.com and api.github.com
- OpenRouter AI: HTTPS to openrouter.ai
- isomorphic-git: HTTPS to any configured GitHub/git remote (via `normalizeRemoteUrl()`)

**Offline Capability:**
- Full offline editing: Yes
- Commit/history browsing: Yes (git operations are local)
- GitHub sync: No (requires network)
- AI features: No (requires network + OpenRouter connection)

## API & Library Integration Details

**isomorphic-git:**
- Version: 1.38.6
- HTTP adapter: `isomorphic-git/http/node` (Node.js http/https backend)
- Used for:
  - Commit management (`gitCommit()`, `gitCheckout()`)
  - Graph visualization (`gitGraph()`)
  - Branch/tag operations (`gitCreateBranch()`, `gitMergeBranch()`)
  - Remote push (`gitPush()` with GitHub OAuth token)
- All git state stored in vault's `.git` directory

**CodeMirror:**
- Version: 6.x
- Mode: Markdown (via `@codemirror/lang-markdown`)
- Theme: One Dark (via `@codemirror/theme-one-dark`)
- Extensions configured in `src/renderer/src/editor/extensions.ts`
- Used in: `src/renderer/src/editor/CodeMirrorEditor.tsx`

**Marked:**
- Version: 18.0.5
- Purpose: Parse Markdown to HTML for preview pane
- Used in: `src/renderer/src/MarkdownPreview.tsx`
- Sanitized with dompurify to prevent XSS

---

*Integration audit: 2026-07-03*
