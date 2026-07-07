---
phase: 08-versionado-avanzado-borrar-rama-contador-de-cambios
plan: 03
subsystem: uat-signoff
tags: [branch-delete, uncommitted-counter, advanced-mode, uat]

# Dependency graph
requires:
  - "08-01: ConfirmDeleteBranchDialog + wiring (VER-01)"
  - "08-02: git.pendingLineStat + IPC + contador +N/-N (CHG-01)"
provides:
  - "Human UAT sign-off for VER-01/CHG-01"
affects: ["08-VERIFICATION (phase verify)"]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/08-versionado-avanzado-borrar-rama-contador-de-cambios/08-03-SUMMARY.md
  modified: []
  deleted: []

key-decisions:
  - "Sin harness de tests: garantía = build verde (typecheck node+web + electron-vite) + UAT humano §A–§B en un build relanzado (cambio de main process en CHG-01)."
  - "Ajustes de UAT: contador +N/-N movido a la derecha; opción de borrar rama hecha descubrible (color rojo, título del menú, chevron de dropdown)."

requirements-completed: [VER-01, CHG-01]

# Metrics
duration: ~UAT manual
completed: 2026-07-06
---

# Phase 8 Plan 03: UAT sign-off (Versionado avanzado) Summary

**El usuario de Modo Avanzado puede borrar/descartar una rama sin mergearla desde el menú "Ramas" del grafo (con diálogo estilizado, protección de `main`, aviso ante trabajo sin mergear y seguridad de teclado), y ve un contador +N/-N de líneas sin commitear siempre visible en la status bar — verificado §A–§B en un build relanzado con sign-off del usuario.**

## Baseline Gate

- `npm run typecheck` (node + web) → exit 0.
- `npm run build` (electron-vite) → exit 0.
- App RELANZADA por completo (CHG-01 toca el main process — nuevo `pendingLineStat` + IPC).

## UAT Results (§A–§B)

| Check | Requisito | Resultado |
|-------|-----------|-----------|
| §A — Borrar rama desde el menú "Ramas" del grafo (Modo Avanzado): diálogo estilizado, rojo + aviso si no mergeada; `main` protegida; rama actual se descarta cambiando a su base; Enter no borra | VER-01 | ✅ |
| §B — Contador +N/-N (verde/rojo) en la status bar, siempre visible, todos los pendientes; se va a 0 al "Guardar versión"; oculto con vault limpio y durante el viaje en el tiempo | CHG-01 | ✅ |

Sign-off del usuario: **"approved"**.

## Code-review gap-closure (antes del UAT)

Code-review deep: la matemática git resultó limpia (racy-git-safe, sin statusMatrix, salta binarios, sin IA; diálogo con la seguridad de teclado de Fase 6). **1 crítico + 3 warnings**, todos en la cadencia de refresco del contador:
- **CR-01**: `doCommit` no recomputaba el contador → mostraba +N/-N viejo tras "Guardar versión". Fix: `refreshLineStat()` tras el commit.
- **WR-01**: refresh por tecla leía disco antes del flush del autosave (contenido viejo + race). Fix: recomputar en `onPaneSaved`/`refreshTree`/`doCommit`, no por tecla.
- **WR-02**: el contador se mostraba durante el viaje en el tiempo. Fix: gateado en `previewOid == null`.
- **WR-03**: `confirmDeleteBranch` sin guarda de in-flight. Fix: `deletingBranchRef` + try/finally.
- **IN-01/02**: return type explícito; `deleteBranch` devuelve void.

## UAT-driven fixes

- **Ubicación del contador**: movido de `status-left` a `status-right` (preferencia del usuario).
- **Descubribilidad de borrar rama**: el usuario no encontraba la opción. Se hizo el botón "Borrar" siempre visible (rojo tenue, antes atenuado a opacity 0.7 muted); el título del botón "Ramas" ahora menciona borrar; y se le agregó un **chevron** (`ChevronDown` que rota) + `aria-haspopup`/`aria-expanded` para que se lea como menú desplegable. Nota: el menú "Ramas" solo aparece con >1 rama (con solo `main` no hay nada que borrar) — comportamiento correcto.

## Non-Destructive / Cost Invariants

- **VER-01**: `main` nunca borrable; aviso explícito antes de perder trabajo sin mergear; la rama actual se descarta cambiando a su base (nada se pierde en silencio). Enter nunca borra.
- **CHG-01**: `pendingLineStat` usa content-hash vs blobs de HEAD (nunca statusMatrix); no invoca IA; lee solo la bóveda activa; oculto en preview.

## Verification

- Build verde (typecheck node+web + electron-vite build exit 0).
- §A–§B firmados por el usuario en un build relanzado.

## Self-Check: PASSED
- FOUND: .planning/phases/08-versionado-avanzado-borrar-rama-contador-de-cambios/08-03-SUMMARY.md
- CONFIRMED: VER-01/CHG-01 aprobados por el usuario

---
*Phase: 08-versionado-avanzado-borrar-rama-contador-de-cambios*
*Completed: 2026-07-06*
