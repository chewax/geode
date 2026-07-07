---
phase: 10-gesti-n-de-plugins-activar-desactivar-built-ins
plan: 03
subsystem: uat-signoff
tags: [plugins, builtins, settings-toggle, default-on, uat]

# Dependency graph
requires:
  - "10-01: IPC plugins.getEnabled (lectura del mapa de habilitados)"
  - "10-02: gating de built-ins en App.tsx (default ON) + grupo 'Integrados' en Ajustes"
provides:
  - "Human UAT sign-off for PLUG-01"
affects: ["10-VERIFICATION (phase verify)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Built-ins gestionados como los externos: mismo settings.plugins.enabled, pero resueltos default ON (?? true) vs externos default OFF (?? false); aplicación al reiniciar (sin dispose en vivo)."

key-files:
  created:
    - .planning/phases/10-gesti-n-de-plugins-activar-desactivar-built-ins/10-03-SUMMARY.md
  modified: []
  deleted: []

key-decisions:
  - "Aplicación al reiniciar (paridad con externos): el toggle persiste y el cambio se aplica al relanzar; App.tsx filtra BUILTIN_PLUGINS por el mapa antes de activar. Sin activación/desactivación en vivo."
  - "Default ON para built-ins (?? true): instalación nueva con mapa vacío mantiene los 3 activos. Externos siguen ?? false (opt-in), intactos."
  - "Grupo 'Integrados' aparte, encima de 'Instalados'; se eliminó el bloque estático 'Internos' (activo fijo sin control)."
  - "Code-review deep sin criticals; WR-01 (activación fail-open: si getEnabled falla, se activan todos los built-ins) + 2 info (CSS .ps-on huérfano, comentario stale) arreglados antes del UAT."

requirements-completed: [PLUG-01]

# Metrics
duration: ~UAT manual
completed: 2026-07-07
---

# Phase 10 Plan 03: UAT sign-off (Gestión de plugins built-in) Summary

**Los plugins internos (insert-date, reading-time, outline) se gestionan desde Ajustes → Plugins igual que los externos: aparecen en un grupo "Integrados" con toggle, su estado se persiste en `settings.plugins.enabled`, desactivar uno lo excluye de comandos/paneles/status/extensiones tras reiniciar, y reactivarlo lo restaura — con default ON y activación fail-open. Verificado §A–§C en un build relanzado con sign-off del usuario.**

## Baseline Gate

- `npm run typecheck` (node + web) → exit 0.
- `npm run build` (electron-vite) → exit 0.
- App RELANZADA por completo (PLUG-01 toca el main process — nuevo handler IPC `pluginsGetEnabled`).

## UAT Results (§A–§C)

| Check | Requisito | Resultado |
|-------|-----------|-----------|
| §A — Grupo "Integrados" en Ajustes → Plugins con los 3 built-ins + descripción + toggle, todos activados por defecto; el bloque estático "Internos" (activo fijo) ya no existe | PLUG-01 (SC-1) + persistencia (SC-3) | ✅ |
| §B — Desactivar outline (panel+comando) y reading-time (status bar), reiniciar → desaparecen; el copy aclara "se aplica al reiniciar" | PLUG-01 (SC-2) | ✅ |
| §C — Reactivar los desactivados, reiniciar → vuelven sus paneles/comandos/status | PLUG-01 (SC-4) | ✅ |

Sign-off del usuario: **"approved"**.

## Code-review gap-closure (antes del UAT)

Code-review deep sobre los 9 archivos de la fase (contrato IPC main↔preload↔renderer + el effect de activación async de App.tsx + semántica default-ON): **0 criticals**. El área de mayor riesgo —el effect async— resultó limpia: patrón check-then-assign (sin `await` entre el guard `cancelled` y la asignación del Disposable), sin doble registro bajo StrictMode, cleanup que dispone ambos Disposables. **1 warning + 2 info**, arreglados (commit 34bd93a):
- **WR-01**: la IIFE de activación de built-ins no tenía try/catch → si `getEnabled()` rechazara, tiraba TODOS los built-ins (dirección de falla equivocada para una feature default-ON core). Fix: try/catch con `enabledMap = {}` por defecto → el `?? true` reactiva todos (falla **abierto**), sin unhandled rejection.
- **IN-01**: regla CSS `.ps-on` huérfana (el bloque "Internos" que la usaba se eliminó). Removida.
- **IN-02**: comentario stale "Internos" → "Integrados".

## Non-Destructive / Semantics Invariants

- **Default ON**: `map[id] ?? true` en el filtro de activación (App.tsx) Y en el `checked` del toggle (SettingsModal) — instalación nueva mantiene los 3 built-ins activos.
- **Externos intactos**: `plugins.ts` `listPlugins` sigue con `?? false` (opt-in) — sin cambios.
- **Aplicación al reiniciar**: sin dispose en vivo; un built-in desactivado simplemente no se activa (teardown "gratis").
- **Fail-open**: un error de IPC nunca deja al usuario sin funcionalidad core.

## Verification

- Build verde (typecheck node+web + electron-vite build exit 0).
- §A–§C firmados por el usuario en un build relanzado.
- 10-VERIFICATION.md: **status passed — 4/4 must-haves**.

## Self-Check: PASSED
- FOUND: .planning/phases/10-gesti-n-de-plugins-activar-desactivar-built-ins/10-03-SUMMARY.md
- CONFIRMED: PLUG-01 aprobado por el usuario

---
*Phase: 10-gesti-n-de-plugins-activar-desactivar-built-ins*
*Completed: 2026-07-07*
