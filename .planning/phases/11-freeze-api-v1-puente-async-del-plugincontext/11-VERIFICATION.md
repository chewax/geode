---
phase: 11-freeze-api-v1-puente-async-del-plugincontext
verified: 2026-07-08T00:15:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
---

# Phase 11: Freeze API v1 + puente async del PluginContext — Verification Report

**Phase Goal:** Congelar la API v1 + `apiVersion`/`minAppVersion`, y convertir la API de los plugins externos en un proxy async por un MessagePort real (in-window, sin iframe), sin tocar los built-ins.
**Requirements:** APIVER-01, BRIDGE-01
**Verified:** 2026-07-08T00:15:00Z
**Status:** passed
**Re-verification:** No — initial verification (human UAT PASSED / "approved")

## Goal Achievement

### Observable Truths (ROADMAP Phase 11 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Manifest declares `apiVersion`/`minAppVersion`; host rejects/warns visibly on incompatible and does NOT eval v2 on a plugin marked for another version | ✓ VERIFIED | `src/shared/ipc.ts:400` `export const HOST_API_VERSION = 1`, `:416` `minAppVersion?`, `:418` `apiVersion?: number`. `src/main/services/plugins.ts:49-74` `compatibilityError()` sets `InstalledPlugin.error` when `apiVersion > HOST_API_VERSION` (:59) or `minAppVersion > app.getVersion()` (:69), applied at `:109-115`. `src/renderer/src/plugins/loader.ts:64` `if (!p.enabled || p.error) continue` — flagged plugin never eval'd. |
| 2 | API v1 (`PluginContext`) documented and frozen as versioned contract | ✓ VERIFIED | `src/renderer/src/plugins/types.ts:49-88` block header "Contrato API v1 congelado" over `Workspace`; `:90-100` `PluginContext` marked "contrato API v1 congelado"; v1 editor.* signatures unchanged (sync). Async v2 added separately (`:121-178`) without altering v1. |
| 3 | External PluginContext is a proxy serializing each call as request/response with `id`; host responds, proxy resolves; orphan/unknown ids discarded without hanging | ✓ VERIFIED | `src/renderer/src/plugins/bridge.ts:164-170` `call()` uses `nextId++`, `pending` map, posts `{type:'call',id,method,args}`. `:172-199` onMessage resolves `result`/rejects `error` by id; `:177-178` `if (!p) return` discards orphan without throw (T-11-03). Host side `attachHostBridge` `:108-116` replies `result`/`error` per id. Real `new MessageChannel()` per plugin at `:290`. |
| 4 | Editor sync APIs exposed as `Promise`; example external plugin migrated to async proxy works (registers command, operates editor via bridge) | ✓ VERIFIED | `bridge.ts:231-235` editor.insertAtCursor/getSelection/revealRange return `Promise`; vault/git/activeNote/runCommand/notify also cross bridge (`:222-250`). Example `examples/plugins/hola-mundo-async/main.js:19-38` registers command using `await ctx.editor.getSelection()`, `await ctx.activeNote()`, `await ctx.editor.insertAtCursor()`, `await ctx.notify()`, and `ctx.events.on('note:open', ...)`. **Human UAT PASSED** — command inserted `> Nota "Nexo/notas.md" (233 caracteres)` via the bridge (matches format at main.js:32). |
| 5 | Built-ins (insert-date/reading-time/outline) unchanged, first-party in-host, not through bridge; typecheck + build green | ✓ VERIFIED | `git diff 6cd112b..HEAD` shows `src/renderer/src/plugins/builtin/`, `host.ts`, `react.tsx` UNTOUCHED. `App.tsx:973-974` built-ins via `activatePlugins(host, enabledBuiltins)`; `:985` externals forked to `activateExternalViaBridge`. `index.ts:26-38` `activatePlugins`/`buildPluginContext` sync path intact. typecheck (node+web) green; build green (main/preload/renderer emitted). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/shared/ipc.ts` | `apiVersion?` on PluginManifest + `HOST_API_VERSION=1` | ✓ VERIFIED | Lines 400, 418; documented freeze semantics |
| `src/main/services/plugins.ts` | compat gate (apiVersion + minAppVersion) → `InstalledPlugin.error`, type-robust | ✓ VERIFIED | `compatibilityError` + `compareSemver`; WR-02 type validation at :54-66 |
| `src/renderer/src/plugins/types.ts` | frozen v1 header + `BridgeMessage` + `AsyncPluginContext` | ✓ VERIFIED | 5-member RPC union (:114-119); AsyncWorkspace/AsyncPluginContext (:132-178) |
| `src/renderer/src/plugins/bridge.ts` | attachHostBridge allowlist + buildAsyncContext + activateExternalViaBridge | ✓ VERIFIED | 313 lines; exports activateExternalViaBridge (:287) |
| `src/renderer/src/plugins/index.ts` + `App.tsx` | external path forked; built-ins unchanged | ✓ VERIFIED | index.ts:14 re-export; App.tsx:985 fork; :974 built-ins intact |
| `src/renderer/src/plugins/loader.ts` | skips `p.error` plugins | ✓ VERIFIED | `:64` `if (!p.enabled || p.error) continue` |
| `examples/plugins/hola-mundo-async/` | apiVersion:1, permissions, async command + events.on | ✓ VERIFIED | plugin.json apiVersion:1, minAppVersion 0.4.0, permissions; main.js async command |
| `src/renderer/index.html` | CSP still has unsafe-eval (Phase 12 removes) | ✓ VERIFIED | `:14` `script-src 'self' 'unsafe-eval'` present — correct scope discipline |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| bridge.ts | host.ts | `host.editorInsertAtCursor/getSelection/revealRange/on/runCommand/notify/activeNote/registerCommand` | ✓ WIRED (:48-101) |
| bridge.ts | window.geode.vault/git | `vault.readNote/tree`, `git.graph` via IPC | ✓ WIRED (:50-55) |
| App.tsx | activateExternalViaBridge | replaces activatePlugins for externals | ✓ WIRED (:985) |
| plugins.ts | HOST_API_VERSION | import + `apiVersion > HOST_API_VERSION` | ✓ WIRED (:4, :59) |
| plugins.ts | app.getVersion() | compareSemver vs minAppVersion | ✓ WIRED (:68-69) |

### Boundary & Scope Discipline

| Check | Status | Evidence |
|-------|--------|----------|
| attachHostBridge routes ONLY explicit allowlist; default → error | ✓ VERIFIED | `bridge.ts:103-104` `default: throw new Error('método no soportado por el puente...')` — no path to GitHub token/AI key/arbitrary window.geode |
| unsafe-eval NOT removed (deferred to Phase 12) | ✓ VERIFIED | `index.html:14` retains `'unsafe-eval'` |
| panels/statusBar/editorExtensions throw deferred error (Phase 12) | ✓ VERIFIED | `bridge.ts:218-220,269-274` `deferred()` throws "no soportado en Fase 11 (llega en Fase 12 UI-01)" |
| WR-01: plugin-side teardown rejects pending + closes port | ✓ VERIFIED | `bridge.ts:207-214` dispose() rejects pending with "puente cerrado", closes port; `:302` pluginSide disposed before hostSide |
| WR-02: type-robust compat gate | ✓ VERIFIED | `plugins.ts:54-66` validates typeof number/integer/≥1 and typeof string before comparing |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| typecheck node+web | `npm run typecheck` | green (both projects) | ✓ PASS |
| electron-vite build | `npm run build` | main/preload/renderer emitted, ✓ built in 5.53s | ✓ PASS |
| build outputs fresh | `ls out/main/index.js out/preload/index.cjs out/renderer/index.html` | all present, dated 2026-07-08 | ✓ PASS |
| example plugin bridge run (SC-3/SC-4) | Human UAT | inserted `> Nota "Nexo/notas.md" (233 caracteres)` via MessagePort with no selection | ✓ PASS (human) |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| APIVER-01 | 11-01, 11-03 | ✓ SATISFIED | apiVersion/HOST_API_VERSION + compat gate + frozen v1 contract |
| BRIDGE-01 | 11-02, 11-03 | ✓ SATISFIED | AsyncPluginContext over real MessageChannel; RPC id correlation; editor.* Promises |

### Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX debt markers in phase-modified files. `deferred()`/Phase-12 references are intentional scope boundaries with a named follow-up phase, not unresolved debt.

### Human Verification Required

None outstanding — end-of-phase UAT already PASSED (user approved: async example plugin command ran via bridge, read active note through `activeNote()`, inserted text across the MessagePort; built-ins intact).

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are observably true in the codebase, all artifacts exist/substantive/wired, all key links connected, boundary allowlist enforced, WR-01/WR-02 fixes present, scope discipline held (unsafe-eval retained for Phase 12, UI surfaces deferred), and typecheck + build are green. Human UAT confirmed the bridge works end-to-end without touching built-ins.

---

_Verified: 2026-07-08T00:15:00Z_
_Verifier: Claude (gsd-verifier)_
