---
phase: 10-gesti-n-de-plugins-activar-desactivar-built-ins
reviewed: 2026-07-07T14:21:55Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/main/index.ts
  - src/renderer/src/plugins/types.ts
  - src/renderer/src/plugins/builtin/insertDate.ts
  - src/renderer/src/plugins/builtin/readingTime.tsx
  - src/renderer/src/plugins/builtin/outline.tsx
  - src/renderer/src/App.tsx
  - src/renderer/src/SettingsModal.tsx
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-07-07T14:21:55Z
**Depth:** deep
**Files Reviewed:** 9
**Status:** issues_found

## Summary

PLUG-01 makes built-in plugin activation configurable (default-ON) via a new read-only IPC channel `geode:plugins-get-enabled`, and adds a functional "Integrados" toggle group in Settings. The highest-risk area — the async activation effect in `App.tsx` — was traced carefully for React lifecycle/race correctness and is **sound**: it uses a check-then-assign pattern with no `await` between the `cancelled` guard and the `offPlugins` assignment, so no interleaving with cleanup is possible; StrictMode double-invoke does not double-register built-ins, and no Disposable can leak. The IPC contract is consistent across the three layers, read-only, and returns the raw map with default resolution correctly owned by the renderer (`?? true` for built-ins, matching the Settings `checked`). Persistence merges without clobbering (`setPluginEnabled` spreads; `toggleBuiltin` re-reads).

One robustness gap remains: the new built-in activation IIFE has no error handling, so an IPC rejection would drop **all** built-ins (wrong fail direction) and raise an unhandled rejection. Two minor cleanup items (orphaned CSS, stale comment) round out the findings.

### Verified clean (explicit)

- **Race / leak (item 1):** `if (cancelled) return; offPlugins = activatePlugins(...)` is check-then-assign with no `await` in between → cleanup (`cancelled = true`) cannot interleave. On fast unmount the guard prevents activation; if activation completed first, cleanup's `offPlugins?.dispose()` disposes it. No dangling registration in any interleaving.
- **StrictMode double-invoke:** setup1's async IIFE captures its own `cancelled`, which cleanup1 sets true → it returns before activating; only setup2 activates. Built-in commands/panels/status items register exactly once net. (`registerPanel`/`addStatusItem` are also `Map.set` keyed by id, so even a hypothetical double-register would overwrite, not duplicate.)
- **Default-ON semantics (item 2):** absent key `?? true` = ON; only explicit `false` disables. Settings `checked={builtinEnabled[p.id] ?? true}` uses the identical resolution → UI matches activation. Built-in ids (`insert-date`, `reading-time`, `outline`) don't collide with the externals' `?? false` path (externals resolve only against folder-scanned ids).
- **IPC contract (item 3):** channel `geode:plugins-get-enabled` consistent in ipc.ts / preload / main; handler returns `getPluginsEnabled()` with no mutation; `loadSettings` reparses fresh JSON so no shared mutable reference escapes.
- **Persistence loop (item 5):** `setPluginEnabled` merges via `{ ...settings.plugins?.enabled, [id]: enabled }`; `toggleBuiltin` re-reads via `getEnabled()` rather than optimistically overwriting → toggling one built-in never clobbers another.
- **Conventions (item 6):** Spanish strings/comments, Lucide icons (no emojis), explicit return types on `toggleBuiltin`/handlers, `Check` import still used elsewhere (no `noUnusedLocals` violation).

## Warnings

### WR-01: Built-in activation has no error handling — IPC failure drops all built-ins and leaks an unhandled rejection

**File:** `src/renderer/src/App.tsx:960-965`
**Issue:** The new async IIFE awaits `window.geode.plugins.getEnabled()` with no `try/catch` and the promise is fire-and-forget (`void (async () => {...})()`). If that IPC call ever rejects (transport failure, or a future change to `getPluginsEnabled`), two things happen: (1) an **unhandled promise rejection** surfaces, and (2) **no built-in plugins activate at all** — insert-date, reading-time and outline silently disappear. This inverts the intended fail-safe: built-ins are default-ON core functionality, so an error should activate them, not suppress them. The previous synchronous `activatePlugins(host, BUILTIN_PLUGINS)` could never fail this way. The pattern is also inconsistent with the rest of the codebase, which wraps IPC reads defensively (`refreshAdvanced` in App.tsx:303-314; `snapshots.get()`/`advanced.get()` in SettingsModal.tsx:96-108). Note `loadSettings()` swallows errors and returns `{}`, so the normal corrupt-settings path is safe today — but the renderer has no guarantee the channel won't reject, and defense here is cheap.
**Fix:**
```ts
void (async () => {
  let enabledMap: Record<string, boolean> = {}
  try {
    enabledMap = await window.geode.plugins.getEnabled()
  } catch {
    // Fail-safe: los built-ins son ON por defecto; ante error IPC se activan todos.
    enabledMap = {}
  }
  if (cancelled) return
  const enabledBuiltins = BUILTIN_PLUGINS.filter((p) => enabledMap[p.id] ?? true)
  offPlugins = activatePlugins(host, enabledBuiltins)
})()
```
(With `enabledMap = {}` on error, `?? true` activates every built-in — the correct fail direction.)

## Info

### IN-01: Orphaned CSS `.ps-on` after removing the static "Internos" block

**File:** `src/renderer/src/index.css:2524-2532`
**Issue:** The `.ps-on` rule (the "activo" badge with the green check) was only used by the removed static Internos list in SettingsModal. No `.tsx` references `ps-on` anymore — the new "Integrados" group uses `.ps-toggle` checkboxes instead. Dead CSS.
**Fix:** Remove the `.ps-on { ... }` block from `index.css`.

### IN-02: Stale comment references old "Internos" group name

**File:** `src/renderer/src/index.css:2533`
**Issue:** The comment `/* Encabezado de grupo (Instalados / Internos) con acciones a la derecha. */` still says "Internos", but the group was renamed to "Integrados" in this phase.
**Fix:** Update the comment to `(Instalados / Integrados)`.

---

_Reviewed: 2026-07-07T14:21:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
