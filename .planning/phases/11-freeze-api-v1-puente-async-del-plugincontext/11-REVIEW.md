---
phase: 11-freeze-api-v1-puente-async-del-plugincontext
reviewed: 2026-07-07T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/renderer/src/plugins/bridge.ts
  - src/renderer/src/plugins/types.ts
  - src/main/services/plugins.ts
  - src/renderer/src/plugins/index.ts
  - src/renderer/src/plugins/loader.ts
  - src/renderer/src/plugins/host.ts
  - src/renderer/src/App.tsx
  - src/shared/ipc.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-07
**Depth:** deep
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the frozen "API v1" contract (APIVER-01) and the async MessagePort bridge
for external plugins (BRIDGE-01), tracing the full RPC round-trip across both
endpoints, the host allowlist, subscription/command lifecycle, the compat gate, and
the loader skip path.

**The security boundary is sound.** `attachHostBridge` dispatches through an explicit
`switch` allowlist and any unknown method throws → `error` response; there is **no
path to reach the GitHub token, the OpenRouter/AI key, or arbitrary `window.geode.*`
/ fs**. The RPC id correlation is correct (monotonic per-channel ids, deleted before
resolve, orphan `result`/`error` dropped safely — no wrong-call resolution, no
double-resolve). Built-ins are genuinely untouched: `activatePlugins` +
`buildPluginContext` still run the sync v1 path; only the external branch in
`App.tsx` forks to `activateExternalViaBridge`. The compat gate correctly surfaces
`InstalledPlugin.error` and the loader `continue`s on `p.error` (incompatible plugins
are never eval'd). `unsafe-eval` and `index.html` are untouched (correctly deferred
to Phase 12).

No Critical issues. The findings below are teardown-cleanliness / boundary-hardening
gaps that Phase 12 will inherit if left as-is — worth fixing now since this is the
sandbox foundation.

## Warnings

### WR-01: Plugin-side bridge (`buildAsyncContext`) is never torn down — port1 listener + pending map leak, in-flight calls hang forever

**File:** `src/renderer/src/plugins/bridge.ts:145-254`, `263-279`
**Issue:** `attachHostBridge` returns a `Disposable` that removes its listener, disposes
all subs/cmds, and closes `port2`. `buildAsyncContext` returns **nothing** — the
`onMessage` listener on `port1`, the `pending` map, `handlers`, and `localCommands`
are never released, and `port1` is never `close()`d. `activateExternalViaBridge`'s
`dispose` only pushes `attachHostBridge(...)` and the plugin's own `cleanup`; the
plugin endpoint is orphaned. Consequences:
- Any RPC in flight at teardown (host disposes `port2` first, so its peer is gone)
  never receives a `result`/`error` → its promise **hangs forever** and its `pending`
  entry leaks.
- Dispose ordering: `disposables` = `[attachHostBridge, pluginCleanup]`, so
  `port2.close()` runs *before* the plugin's `cleanup` calls `sub.dispose()` /
  `cmd.dispose()`, which then `postMessage` to a port whose peer is already closed —
  silently dropped, leaking one `pending` entry each. (Harmless for ghost commands —
  the host self-cleans its `subs`/`cmds` in `attachHostBridge.dispose` regardless —
  but confirms the plugin side has no teardown.)

Runtime impact today is bounded because the owning `useEffect` has `[]` deps (fires
once per mount), so this is essentially once-per-session / per-HMR rather than
per-vault-switch. But it is exactly the "pending entries that never resolve" class
this bridge must not have, and Phase 12 (where port1 lives in a real iframe) inherits
it directly.
**Fix:** Have `buildAsyncContext` return a `Disposable` and include it in
`activateExternalViaBridge`'s disposables (disposed *before* the host side so pending
calls reject rather than hang):
```ts
// in buildAsyncContext, before the return:
const dispose = (): void => {
  port.removeEventListener('message', onMessage)
  pending.forEach((p) => p.reject(new Error('puente cerrado')))
  pending.clear()
  handlers.clear()
  localCommands.clear()
  port.close()
}
// expose it, e.g. return { ctx, dispose } or attach to the ctx wrapper.

// in activateExternalViaBridge:
const hostSide = attachHostBridge(host, ch.port2)
const { ctx, dispose: pluginSide } = buildAsyncContext(ch.port1)
const cleanup = plugin.activate(ctx as unknown as PluginContext)
// dispose order: plugin cleanup → plugin bridge → host bridge
disposables.push(cleanup ?? { dispose: () => {} }, { dispose: pluginSide }, hostSide)
```

### WR-02: Compat gate is bypassable by field type — a string `apiVersion` skips the version check entirely

**File:** `src/main/services/plugins.ts:49-60`
**Issue:** `plugin.json` is untrusted external JSON. `compatibilityError` guards with
`typeof manifest.apiVersion === 'number'`, so a manifest declaring `"apiVersion": "2"`
(string) fails the `typeof` check, skips the gate, and is treated as compatible v1 —
an incompatible declaration is **false-accepted**. Symmetrically, a numeric
`minAppVersion` (e.g. `"minAppVersion": 5`) passes the `if (manifest.minAppVersion)`
truthiness check and then `compareSemver(5, appVersion)` calls `(5).split(...)` →
`TypeError`, which is swallowed by the outer `catch` in `listPlugins` and surfaces the
misleading error `No se pudo leer plugin.json: a.split is not a function` (the manifest
parsed fine). Today `HOST_API_VERSION = 1` and all externals get the async proxy, so
neither case breaks behavior yet — but the gate's contract ("`apiVersion` > supported
→ reject") is the thing a future v2 host relies on, and it is type-bypassable.
**Fix:** Coerce/validate types before comparing, and reject non-numeric `apiVersion`
explicitly:
```ts
if (manifest.apiVersion !== undefined) {
  const v = typeof manifest.apiVersion === 'number' ? manifest.apiVersion : NaN
  if (!Number.isFinite(v) || v > HOST_API_VERSION) {
    return `Requiere API de plugins v${manifest.apiVersion}; esta versión de Geode soporta v${HOST_API_VERSION}`
  }
}
if (typeof manifest.minAppVersion === 'string') {
  if (compareSemver(manifest.minAppVersion, app.getVersion()) > 0) { /* ... */ }
}
```

## Info

### IN-01: External command `isEnabled()` is silently dropped

**File:** `src/renderer/src/plugins/bridge.ts:85-96`, `229-245`
**Issue:** `commands.register` only forwards the serializable subset
`{id,title,category,shortcut}`; the host registers a `run()` that posts `invoke` but
supplies **no `isEnabled`**. So `host.runCommand` (`host.ts:76`) never consults the
plugin's `isEnabled()` — an external command that returns `false` from `isEnabled`
still shows enabled and runs. This is an intentional serialization boundary, but the
capability silently disappears vs. the v1 contract.
**Fix:** Either document that `isEnabled` is unsupported for external commands in v2,
or round-trip it: cache enabled state pushed from the plugin, or expose an async
`isEnabled` query over the port and reflect it in the palette.

### IN-02: `bridge.ts` couples host-side and plugin-side in one module — Phase 12 iframe bundle will drag `PluginHost`/`window.geode`

**File:** `src/renderer/src/plugins/bridge.ts:1-11`, `37`, `145`
**Issue:** The design note claims "Phase 12 just swaps one port endpoint to the
iframe." The RPC protocol (`BridgeMessage`) is indeed portable and `buildAsyncContext`
closes over only `port` (no host refs) — good. But `buildAsyncContext` (which must run
*inside* the iframe in Phase 12) lives in the same module as `attachHostBridge`, which
imports `PluginHost` and touches `window.geode`. Bundling the plugin endpoint for the
iframe will pull host-only code into the sandbox bundle. This is structural coupling
that forces a split (not just an endpoint swap) in Phase 12.
**Fix:** Split into `bridge.host.ts` (`attachHostBridge`, imports `PluginHost` /
`window.geode`) and `bridge.plugin.ts` (`buildAsyncContext`, imports only `types` +
the `BridgeMessage` envelope) now, so Phase 12 can bundle the plugin side in isolation.

### IN-03: In-window plugins retain ambient `window.geode` access — bridge isolation is not enforced until Phase 12

**File:** `src/renderer/src/plugins/loader.ts:34-41`, `bridge.ts:26-28` (header note)
**Issue:** The bridge correctly hands the plugin *only* the `AsyncPluginContext` (no
host ref, no `window.geode`) and structured-clone across the `MessagePort` prevents
leaking live objects — the boundary discipline of the bridge itself is clean. However
the external plugin is still `new Function(...)`-eval'd in the renderer window
(`unsafe-eval`), so it can reach `window.geode.*` directly regardless of the bridge.
This is the acknowledged Fase 11 limitation, but it means the bridge is *not yet* a
real security boundary — it becomes one only when Phase 12 moves the eval into the
sandboxed iframe. Ensure this is explicitly tracked so the async API isn't mistaken
for enforced isolation before Phase 12 lands.
**Fix:** No code change this phase; keep the header note and confirm Phase 12
(iframe + drop `unsafe-eval`) is the gating item before any "plugins are sandboxed"
claim.

### IN-04: Fire-and-forget `void call(...)` / `void run()` have no rejection handling

**File:** `src/renderer/src/plugins/bridge.ts:184`, `218`, `224`, `233`, `242`
**Issue:** Several calls are voided (`void call('events.off', ...)`,
`void call('commands.register', ...)`, `void call('commands.dispose', ...)`, and
`void localCommands.get(msg.commandId)?.run()`). For the allowlisted methods the host
never rejects, so no unhandled rejection occurs today; and `run()` mirrors the existing
`host.runCommand`'s `void cmd.run()` pattern. But a plugin command that throws async,
or a future host route for these methods that throws, becomes an unhandled promise
rejection with no diagnostic. Low severity / consistent with the codebase.
**Fix:** Attach a `.catch` that logs in the `[plugins]` prefix, e.g.
`call(...).catch((e) => console.error('[plugins] puente:', e))` for the fire-and-forget
sites and around the local command `run()`.

---

_Reviewed: 2026-07-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
