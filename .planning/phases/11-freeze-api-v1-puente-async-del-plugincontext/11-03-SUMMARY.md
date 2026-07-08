---
phase: 11-freeze-api-v1-puente-async-del-plugincontext
plan: 03
subsystem: uat-signoff
tags: [plugins, bridge, messageport, async-api, apiversion, uat]

# Dependency graph
requires:
  - "11-01: freeze API v1 + apiVersion/HOST_API_VERSION + compat check (APIVER-01)"
  - "11-02: puente async por MessagePort (bridge.ts) + API v2 async + bifurcar carga de externos (BRIDGE-01)"
provides:
  - "Human UAT sign-off for APIVER-01/BRIDGE-01"
affects: ["11-VERIFICATION (phase verify)", "Fase 12 (iframe sandbox — solo cambia el endpoint del port)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plugins externos por un puente async (MessageChannel + RPC request/response con id); built-ins first-party siguen en la API v1 síncrona in-host."

key-files:
  created:
    - examples/plugins/hola-mundo-async/plugin.json
    - examples/plugins/hola-mundo-async/main.js
    - .planning/phases/11-freeze-api-v1-puente-async-del-plugincontext/11-03-SUMMARY.md
  modified:
    - examples/plugins/README.md
  deleted: []

key-decisions:
  - "MessagePort real ya en Fase 11 (in-window): la Fase 12 solo mueve un endpoint del port al iframe, sin cambiar la API async del plugin."
  - "Built-ins síncronos v1 SIN tocar (activatePlugins/buildPluginContext/host.ts/react.tsx intactos); la API async v2 es solo para externos."
  - "panels/statusBar/editorExtensions difieren a Fase 12 (Components/Extensions no serializables por el port); el ejemplo usa comandos + editor + eventos + activeNote."
  - "Code-review deep sin criticals (boundary de allowlist hermético, correlación RPC correcta); WR-01 (teardown del lado-plugin) + WR-02 (gate de compat robusto por tipo) arreglados antes del UAT."
  - "Recuperación de corte de luz: refs/heads/main quedó en ceros; restaurado con el SHA del reflog (d6624e1); objetos íntegros, sin pérdida."

requirements-completed: [APIVER-01, BRIDGE-01]

# Metrics
duration: ~UAT manual (con recuperación de corte de luz intermedia)
completed: 2026-07-08
---

# Phase 11 Plan 03: UAT sign-off (Freeze API v1 + puente async) Summary

**Un plugin externo recibe un PluginContext async (proxy) que habla con el host solo por un MessagePort real (RPC request/response con id); las APIs de editor son Promises; el manifiesto declara `apiVersion` y el host rechaza incompatibles con error visible en Ajustes; y los built-ins siguen intactos en la API v1 síncrona — verificado §A–§C en un build relanzado con sign-off del usuario.**

## Baseline Gate

- `npm run typecheck` (node + web) → exit 0.
- `npm run build` (electron-vite) → exit 0.
- App RELANZADA por completo (APIVER-01 toca el main process — compat check en `listPlugins`).

## UAT Results (§A–§C)

| Check | Requisito | Resultado |
|-------|-----------|-----------|
| §A — El plugin externo "Hola Mundo (async)" carga sin error; su comando "Insertar resumen (plugin async)" corre por el puente async: sin selección lee la nota activa con `await ctx.activeNote()` e inserta `> Nota "Nexo/notas.md" (233 caracteres)` (ambas llamadas cruzaron el MessagePort) | BRIDGE-01 (SC-2/SC-3) | ✅ |
| §B — Los built-ins (insert-date/reading-time/outline) siguen operativos (API v1 síncrona in-host, sin cambios) | BRIDGE-01 (SC-4) | ✅ |
| §C — Un plugin con `apiVersion`/`minAppVersion` incompatible queda rechazado con error legible en Ajustes y no se evalúa | APIVER-01 (SC-1) | ✅ |

Sign-off del usuario: **"approved"** (confirmó la inserción `> Nota "Nexo/notas.md" (233 caracteres)` como el ejemplo async funcionando por el puente).

## Code-review gap-closure (antes del UAT)

Code-review deep sobre el puente (contrato IPC + `bridge.ts` + compat + bifurcación de externos): **0 criticals**. Lo crítico resultó sólido: allowlist explícita en `attachHostBridge` (default → error; sin ruta al token de GitHub / API key / `window.geode` arbitrario), correlación RPC por id correcta (huérfanos descartados sin colgar), built-ins intactos, `port.start()` tras `addEventListener` (sin perder el primer mensaje). **2 warnings + 4 info**; los 2 warnings arreglados (commit `9330604`):
- **WR-01**: el lado-plugin (`buildAsyncContext`) no tenía teardown → fuga del listener/pending y llamadas colgadas al dispose (la Fase 12 lo heredaba). Fix: devuelve `{ ctx, dispose }`; el dispose rechaza los pending con "puente cerrado", limpia mapas y cierra el port; `activateExternalViaBridge` ordena teardown plugin → host.
- **WR-02**: el gate de compat era evitable por tipo (`"apiVersion":"2"` string se colaba; `minAppVersion` numérico daba error engañoso). Fix: validación de tipos explícita → errores claros en español vía `InstalledPlugin.error`, nunca throw.
- Info diferidos: IN-02 (split del módulo host/plugin para que el bundle del iframe no arrastre `PluginHost`/`window.geode`) es trabajo genuino de la **Fase 12**; IN-03 (eval in-window aún da `window.geode` ambiente) es esperado — el boundary real llega con el iframe.

## Recuperación de corte de luz (incidente operativo)

A mitad de la fase se cortó la luz durante una escritura de git → `refs/heads/main` quedó en ceros ("branch appears to be broken"). Diagnóstico: **solo el ref corrupto**; todos los objetos de commit íntegros (`git fsck`) y el reflog intacto. Recuperación: restaurar `refs/heads/main` al SHA del tip del reflog (`d6624e1`). Cero pérdida de trabajo (Wave 1 y Wave 2 ya estaban commiteadas). Commits respaldados con push inmediato.

## Non-Destructive / Scope Invariants

- **Built-ins intactos**: `git diff` confirma `builtin/`, `host.ts`, `react.tsx` sin tocar; solo el path de externos bifurca al puente.
- **Boundary de seguridad**: allowlist explícita; el sandbox real y quitar `unsafe-eval` son de la **Fase 12** (no se tocaron acá).
- **Fase 12 lista**: la API async del plugin no cambia al mover un endpoint del port al iframe (de-risk cumplido).

## Verification

- Build verde (typecheck node+web + electron-vite build exit 0).
- §A–§C firmados por el usuario en un build relanzado.
- 11-VERIFICATION.md: **status passed — 5/5 success criteria**.

## Self-Check: PASSED
- FOUND: .planning/phases/11-freeze-api-v1-puente-async-del-plugincontext/11-03-SUMMARY.md
- CONFIRMED: APIVER-01/BRIDGE-01 aprobados por el usuario

---
*Phase: 11-freeze-api-v1-puente-async-del-plugincontext*
*Completed: 2026-07-08*
