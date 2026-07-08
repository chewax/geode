---
phase: 12-sandbox-en-iframe-ui-del-panel-dentro-del-iframe-quitar-unsa
reviewed: 2026-07-08T00:00:00Z
depth: deep
files_reviewed: 14
files_reviewed_list:
  - src/renderer/src/plugins/pluginRuntime.ts
  - src/renderer/iframe-runtime/index.ts
  - src/renderer/src/plugins/iframeHost.ts
  - src/renderer/src/plugins/bridge.ts
  - src/renderer/src/plugins/loader.ts
  - src/renderer/src/plugins/types.ts
  - src/renderer/src/plugins/host.ts
  - src/renderer/src/plugins/PluginPanels.tsx
  - src/renderer/src/plugins/PluginStatusBar.tsx
  - src/renderer/src/plugins/iconByName.tsx
  - src/renderer/src/App.tsx
  - src/renderer/index.html
  - vite.iframe.config.ts
  - examples/plugins/hola-mundo-async/main.js
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-08
**Depth:** deep
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 12 introduces the iframe sandbox isolation boundary for third-party plugins
(ISO-01), moves the panel UI inside the iframe (UI-01), and strips `unsafe-eval`
from the host CSP (CSP-01). I reviewed isolation, the RPC allowlist, the panel
overlay, resource teardown, both CSPs, and the build wiring.

**The security boundary is CLEAN.** I found no way to break isolation and no path
to an un-allowlisted host capability. Specifically verified:

- **Opaque origin holds.** `sandbox="allow-scripts"` is set once in `iframeHost.ts`
  and NOWHERE in the tree is `allow-same-origin` (or any second sandbox token)
  added. The iframe is opaque-origin, so `window.parent` property access throws for
  the plugin.
- **No host reference reaches the plugin.** The compiled runtime bundle
  (`runtime.iife.js`, 448 KB) contains zero occurrences of `window.geode`,
  `window.parent`, `localStorage`, or `allow-same-origin`; `pluginRuntime.ts` and
  the bootstrap import only TYPES + React/CodeMirror. The plugin's only channel is
  the transferred `MessagePort`.
- **No host-side `window` message listener exists.** The host talks exclusively over
  `port2` (`attachHostBridge`). A plugin calling `window.parent.postMessage(...)`
  (the one cross-origin call the sandbox permits) hits no host handler — dead end.
- **`new Function` eval lives ONLY in the iframe** (`iframe-runtime/index.ts:133`);
  `loader.ts` no longer evals and no longer imports React/CodeMirror. Host CSP is
  now `script-src 'self'` (no `unsafe-eval`).
- **Network is sealed inside the iframe.** iframe CSP is `connect-src 'none'`; the
  bundle contains no `fetch`/`XMLHttpRequest`/`WebSocket`/`RTCPeerConnection`
  primitives. The one `fetch()` of the runtime bundle runs in the HOST
  (`App.tsx:993`), allowed by the host's `connect-src 'self'`.
- **RPC allowlist is airtight.** `bridge.ts route()` is an explicit `switch` with a
  `default: throw` — panels/statusBar cases only accept serializable data
  (`{id,title,icon}`, `{id,text,tooltip,icon}`), never a Component or executable
  code; the external command `run()` posts an `invoke` back rather than executing
  plugin code host-side. Icons render via an allowlisted `iconByName` map, no
  `dangerouslySetInnerHTML`.
- **`init` handling is guarded.** The iframe validates `msg.type === 'init'`, honors
  a one-shot `started` flag, and takes the port from `event.ports[0]`.

The remaining findings are UI/overlay correctness, a teardown gap on a dead plugin,
and quality/DX notes. None weaken isolation.

## Warnings

### WR-01: Panel-iframe overlay drifts when the panel-body moves without resizing

**File:** `src/renderer/src/plugins/PluginPanels.tsx:42-64`
**Issue:** `sync()` repositions the fixed iframe from `body.getBoundingClientRect()`
and is triggered only by `ResizeObserver(body)`, `window 'resize'`, and
`window 'scroll'` (capture). None of these fire when the observed `plugin-panel-body`
**moves but keeps its own size** — the concrete repro is multiple external panels
stacked in the `.plugin-dock`: closing or opening a sibling panel above shifts the
others up/down, but the sibling's body size is unchanged, no window resize/scroll
occurs, and the `ExternalPanel` effect has deps `[iframe, def.id]` so it does not
re-run on the store re-render. Result: the opaque iframe stays at stale `top`/`left`
and visually detaches from its own header. Same class of drift on any dock reflow
that doesn't resize the body (built-in panel toggling above an external one, status
bar height change).
**Fix:** Realign on layout changes, not just size/scroll. Options: also
`ro.observe(panelDockElement)` so sibling insert/remove fires `sync`; or drive
`sync` from a `requestAnimationFrame` loop while the panel is visible; or add a
`MutationObserver` on the dock; or, simplest, re-run `sync()` on every host version
bump by moving it out of the size-only observer and calling it from the render path.

### WR-02: Fixed `z-index:5` opaque iframe can capture clicks over host UI in the same region

**File:** `src/renderer/src/plugins/PluginPanels.tsx:37`
**Issue:** The overlay is `position:fixed; z-index:5` in the root stacking context.
A cross-origin iframe always captures pointer events inside its box, so any host UI
that paints in that viewport region with z-index < 5 becomes unclickable. Today the
dock sits on the right and modals/palette are 50–210 (safe), but `.sidebar-resizer`
is also `z-index:5` and `.psplit-resizer` is `z-index:4`; a CodeMirror
autocomplete/tooltip or a future popup rendered near the right edge under the dock
rectangle would be occluded and swallow clicks. The value is hardcoded with no
layering scheme.
**Fix:** Verify no interactive/transient host layer (editor tooltips, autocomplete,
context menus, toasts) can render under the dock rectangle; give the overlay a
z-index below transient popups, or ensure those popups exceed it. At minimum,
document the layering contract so `z-index:5` isn't accidentally shadowed.

### WR-03: A plugin whose iframe never boots leaks its host bridge + ports; user sees no error

**File:** `src/renderer/src/plugins/iframeHost.ts:85-89` (and `bridge.ts:206-240`)
**Issue:** The `INIT_TIMEOUT_MS` path only `console.warn`s. If the iframe never
fires `load`, or the runtime bundle fails to parse (so it never posts anything back),
the host side stays fully alive: `attachHostBridge` on `port2` keeps its listener
and open port, the `MessageChannel` and the `<iframe>` are never disposed, and —
unlike the load-then-eval-fail path, which posts a visible `error` — the user gets
no toast. The comment promises "no debe colgar la app," but resources dangle and the
failure is silent. It is a one-time-per-broken-plugin leak (not per enable/disable
cycle, since the activation effect runs once with deps `[]`), hence Warning not
Blocker.
**Fix:** On timeout, tear down: remove the iframe, `hostSide.dispose()`, close the
channel, and surface a Spanish toast (e.g. `El plugin "X" no arrancó`). Track the
per-plugin `dispose` so the timeout callback can invoke it.

## Info

### IN-01: iframe `message` listener does not validate `event.source`/`event.origin`

**File:** `src/renderer/iframe-runtime/index.ts:186-202`
**Issue:** The listener accepts `init` from any sender. It is safe TODAY only because
the opaque-origin iframe's `contentWindow` is unreachable by sibling frames and
`window.parent` is cross-origin, so nothing but the host can post a forged
`init`+port. This is an implicit dependency on the sandbox model; if
`allow-same-origin` were ever added or the runtime embedded elsewhere, an
unauthenticated `init` would hand the plugin a forged port.
**Fix:** Defense-in-depth: capture and verify `event.source === window.parent` for
`init` (already guarded by the one-shot `started` flag, so this is cheap hardening).

### IN-02: External panel body height hardcoded to 240px

**File:** `src/renderer/src/plugins/PluginPanels.tsx:94`
**Issue:** Every external plugin panel is locked to 240px tall regardless of content
or dock height; the plugin's React UI inside the iframe is clipped/scrolled to that
box, while built-in panels flex naturally. Intentional per the comment ("altura fija
para darle un rectángulo real al observer"), but inconsistent UX.
**Fix:** Let the body flex (or be user-resizable) and let the ResizeObserver track
the resulting rectangle, so the observer still has a real box without pinning height.

### IN-03: External vs built-in panel id collision renders two panels sharing one open-state

**File:** `src/renderer/src/plugins/host.ts:104-108` and `PluginPanels.tsx:104-134`
**Issue:** `panels` and `externalPanels` are separate maps; `togglePanel` flips one
shared `openPanels` entry keyed by id. An external plugin registering a panel id
equal to a built-in's would render BOTH panels in the dock and toggle them in
lockstep. Low likelihood (built-ins use known `core.*`-style ids) but there is no
namespacing or collision guard.
**Fix:** Namespace external ids (e.g. prefix with `pluginId:`) or reject a
registration whose id already exists in either registry.

### IN-04: `dev` builds the iframe runtime once, no watch

**File:** `package.json` (`"dev": "npm run build:iframe && electron-vite dev"`)
**Issue:** The runtime bundle is compiled a single time before `electron-vite dev`.
Edits to `src/renderer/iframe-runtime/**` or `pluginRuntime.ts` during a dev session
are not reflected until dev is restarted, unlike the HMR'd host. DX papercut, not a
runtime bug; easy to get confused debugging the plugin side.
**Fix:** Add a `build:iframe --watch` concurrently, or document that the iframe
runtime requires a dev restart.

### IN-05: Runtime bundle inlined into `srcdoc` is fragile to a stray `</script>`

**File:** `src/renderer/src/plugins/iframeHost.ts:63-66`
**Issue:** The runtime text is inlined as `` `<script>${runtimeSource}</script>` ``.
I verified the current bundle contains no `</script>` sequence, so it's fine today,
but if any future dependency's minified output ever emits the literal `</script>`
(e.g. inside a string), the `srcdoc` breaks and ALL external plugins silently die.
The plugin `source` itself is safely passed via `postMessage` (not inlined), so only
the app's own bundle is the exposure.
**Fix:** Cheap insurance: escape `</` → `<\/` in `runtimeSource` before injection, or
inject the runtime via a Blob URL instead of inline text.

---

_Reviewed: 2026-07-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
