---
phase: 10-gesti-n-de-plugins-activar-desactivar-built-ins
verified: 2026-07-07T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 10: Gestión de plugins (activar/desactivar built-ins) — Verification Report

**Phase Goal:** Los plugins internos se gestionan desde Ajustes igual que los externos, con su estado persistido.
**Requirement:** PLUG-01
**Verified:** 2026-07-07
**Status:** passed
**Re-verification:** No — initial verification (human UAT approved)

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth (SC) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Los built-ins (insert-date, reading-time, outline) aparecen en Ajustes con control activar/desactivar, igual que externos | ✓ VERIFIED | `SettingsModal.tsx:384` `<h3>Integrados</h3>` encima de `Instalados` (`:414`); `:391` `BUILTIN_PLUGINS.map` renderiza filas `.plugin-settings-row` con `.ps-toggle` checkbox (`:399-407`). Bloque estático viejo eliminado: `<h3>Internos</h3>`==0, `ps-on`==0 (tsx y css). |
| 2 | Desactivar un built-in lo quita de comandos/paneles/status bar/extensiones (aplica al reiniciar) | ✓ VERIFIED | `App.tsx:972` `BUILTIN_PLUGINS.filter((p) => enabledMap[p.id] ?? true)` antes de `activatePlugins(host, enabledBuiltins)` (`:973`). Un built-in con entrada `false` no se activa → no registra nada (teardown "gratis"). Apply-on-restart: no hay dispose en vivo; copy en `SettingsModal.tsx:387-388` "el cambio se aplica al reiniciar la app". |
| 3 | El estado activado/desactivado de cada built-in se persiste entre sesiones en `settings.plugins.enabled` | ✓ VERIFIED | Toggle: `SettingsModal.tsx:121` `toggleBuiltin`→`window.geode.plugins.setEnabled(id, enabled)`. Persistencia: `settings.ts:176-181` `setPluginEnabled` mergea en `settings.plugins.enabled` y `saveSettings`. Lectura: `settings.ts:171-172` `getPluginsEnabled` → `plugins?.enabled ?? {}`, expuesta por IPC read-only. |
| 4 | Reactivar un built-in previamente desactivado restaura sus comandos/paneles/extensiones | ✓ VERIFIED | Misma ruta de gating: al reiniciar, `enabledMap[p.id]` vuelve a `true` (o ausente ⇒ `?? true`) → el built-in entra en `enabledBuiltins` y `activatePlugins` lo registra de nuevo. Simétrico con SC-2. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/shared/ipc.ts` | Canal + método getEnabled | ✓ VERIFIED | `:73` `pluginsGetEnabled: 'geode:plugins-get-enabled'`; `:432` `getEnabled(): Promise<Record<string, boolean>>` |
| `src/preload/index.ts` | Puente getEnabled | ✓ VERIFIED | `:93` `getEnabled: () => ipcRenderer.invoke(IPC.pluginsGetEnabled)` |
| `src/main/index.ts` | Handler read-only → getPluginsEnabled | ✓ VERIFIED | `:629` `ipcMain.handle(IPC.pluginsGetEnabled, async () => getPluginsEnabled())`; sin setPluginEnabled en el handler |
| `src/renderer/src/plugins/types.ts` | `description?` en GeodePlugin | ✓ VERIFIED | `:93` `description?: string` |
| built-ins (3) | Descripciones en español | ✓ VERIFIED | `insertDate.ts:15`, `readingTime.tsx:41`, `outline.tsx:74`; ids intactos (`insert-date`/`reading-time`/`outline`) |
| `src/renderer/src/App.tsx` | Activación gateada async-safe | ✓ VERIFIED | `:960-974` IIFE con try/catch fail-open, guarda `cancelled` (`:971`), filtro `?? true` (`:972`), dispose en cleanup (`:1003`) |
| `src/renderer/src/SettingsModal.tsx` | Grupo Integrados con toggles | ✓ VERIFIED | `:58` `builtinEnabled` state, `:120` `toggleBuiltin`, `:384-411` grupo Integrados |
| `src/main/services/settings.ts` | get/setPluginsEnabled | ✓ VERIFIED | `:171-181` |
| `src/main/services/plugins.ts` | externals `?? false` UNCHANGED | ✓ VERIFIED | `:55` `enabled: enabledMap[manifest.id] ?? false` intacto (no tocado en esta fase) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| App.tsx | plugins.getEnabled | await antes de filtrar BUILTIN_PLUGINS | ✓ WIRED | `:967` `await window.geode.plugins.getEnabled()` |
| SettingsModal | plugins.getEnabled | pinta toggles + relee tras toggle | ✓ WIRED | `:61`, `:122` |
| SettingsModal | plugins.setEnabled | onChange del toggle built-in | ✓ WIRED | `:121` |
| main handler | getPluginsEnabled() | canal pluginsGetEnabled | ✓ WIRED | `main/index.ts:629` |
| setPluginEnabled | settings.plugins.enabled | merge + saveSettings | ✓ WIRED | `settings.ts:178-180` |

### Design-invariant checks (phase-specific)

| Invariant | Status | Evidence |
| --- | --- | --- |
| Default ON — `?? true` en filtro de activación Y en `checked` de Ajustes | ✓ VERIFIED | `App.tsx:972` filtro; `SettingsModal.tsx:404` `checked={builtinEnabled[p.id] ?? true}` (idéntica resolución) |
| Fresh install (mapa vacío) ⇒ los 3 built-ins activos | ✓ VERIFIED | `enabledMap={}` ⇒ `?? true` incluye los 3 en `enabledBuiltins` |
| Fail-open — rechazo de getEnabled ⇒ `{}` ⇒ todos activan; sin unhandled rejection | ✓ VERIFIED | `App.tsx:966-970` try/catch → `enabledMap = {}` |
| Race-safety — `cancelled` chequeado antes de asignar Disposable; sin await entre guarda y asignación | ✓ VERIFIED | `App.tsx:971` `if (cancelled) return` inmediatamente antes de `:973` asignación (check-then-assign, sin await intermedio) |
| Cleanup dispone built-ins Y externos | ✓ VERIFIED | `App.tsx:1003` `offPlugins?.dispose()`, `:1004` `offExternal?.dispose()` |
| externals `?? false` en plugins.ts sin cambios | ✓ VERIFIED | `plugins.ts:55` intacto |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Typecheck (node + web) | `npm run typecheck` | sin errores | ✓ PASS |
| Build (electron-vite) | `npm run build` | `✓ built in 9.00s`, sin errores | ✓ PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | Ninguno | — | "TODO" hits son "TODOS" (español, "all"); "placeholder" son atributos HTML `<input>` legítimos. Sin debt markers reales. CSS huérfano `.ps-on` y comentario "Internos" ya limpiados en commit 34bd93a (0 en index.css). |

### Human Verification

Human UAT already completed and **approved** for this phase — no further human verification required.

## Gaps Summary

Ninguno. Los 4 criterios de éxito de PLUG-01 están implementados y cableados en el código enviado: el grupo "Integrados" reemplaza el bloque estático "Internos" con toggles funcionales default-ON; la activación de built-ins en App.tsx está gateada por el mapa persistido (fail-open, race-safe, dual-dispose); la persistencia va a `settings.plugins.enabled` vía `setPluginEnabled` y se lee por el IPC read-only `geode:plugins-get-enabled`; la semántica opt-in de externos (`?? false`) queda intacta. Typecheck y build en verde. El warning WR-01 del code-review (fail-open ausente) fue corregido en commit 34bd93a y está presente en el código verificado.

---

_Verified: 2026-07-07_
_Verifier: Claude (gsd-verifier)_
