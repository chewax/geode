---
phase: 07-tabs-de-preview-y-gestin-de-bvedas
plan: 03
subsystem: uat-signoff
tags: [preview-tabs, vault-removal, uat]

# Dependency graph
requires:
  - "07-01: preview field en paneTree + single/double click + itálica (FILE-04)"
  - "07-02: IPC geode:vault-remove + shell.trashItem + ConfirmRemoveVaultDialog (FILE-05)"
provides:
  - "Human UAT sign-off for FILE-04/05"
affects: ["07-VERIFICATION (phase verify)", "milestone v1.1 lifecycle"]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/07-tabs-de-preview-y-gestin-de-bvedas/07-03-SUMMARY.md
  modified: []
  deleted: []

key-decisions:
  - "Sin harness de tests (consistente con el proyecto): garantía = build verde + UAT humano §A–§B en un build relanzado (cambio de main process)."
  - "Code-review deep atajó un crítico (la preview nunca se fijaba/quedaba por el onChange del load programático) resuelto con anotación de transacción en CodeMirror."

requirements-completed: [FILE-04, FILE-05]

# Metrics
duration: ~UAT manual
completed: 2026-07-06
---

# Phase 7 Plan 03: UAT sign-off (Tabs de preview y gestión de bóvedas) Summary

**El usuario navega notas con tabs de preview estilo VSCode (1 click = preview en itálica reutilizable; doble click/edición/doble-click-en-tab = fija) y da de baja bóvedas — quitándolas de la lista sin tocar disco, o enviándolas a la papelera del SO (recuperable) tras un aviso explícito con seguridad de teclado — verificado §A–§B en un build relanzado con sign-off del usuario.**

## Baseline Gate

- `npm run typecheck` (node + web) → exit 0.
- `npm run build` (electron-vite) → exit 0.
- App RELANZADA por completo con `env -u ELECTRON_RUN_AS_NODE npm run dev` (obligatorio: la fase toca el main process — electron-vite dev no reinicia el main al guardar).

## UAT Results (§A–§B)

| Check | Requisito | Resultado |
|-------|-----------|-----------|
| §A — 1 click abre preview en itálica reutilizable (reemplaza, no acumula); NO se fija sola; doble click / edición / doble-click-en-tab la fija; tab permanente solo se activa con 1 click | FILE-04 | ✅ |
| §B — Papelera al hover en el VaultSwitcher; "Quitar de la lista" no toca disco; opción explícita "Eliminar del disco" va a la papelera del SO (recuperable); Enter no borra (Cancelar autofocus); baja de la bóveda activa cambia a otra / estado sin bóveda sin perder lo tipeado | FILE-05 | ✅ |

Sign-off del usuario: **"approved"**.

## Code-review gap-closure (antes del UAT)

Code-review deep: **1 crítico + 2 warnings + 3 info**. Corregidos:
- **CR-01** (crítico): la preview no funcionaba — el load programático de la nota disparaba `onChange` (via el updateListener de CodeMirror) → `pinTab`, fijando la tab en el mismo load que la creaba (misma clase que el CR-01 de la Fase 2). Resuelto con una **anotación de transacción** (`programmaticReload`) que marca las recargas programáticas; el `updateListener` solo propaga `onChange` en ediciones reales del usuario. Ahora la preview queda en itálica hasta que se edita.
- **WR-01**: el aviso de "se envía a la papelera" se mostraba siempre; ahora solo con la opción de borrado de disco tildada. "Quitar de la lista" ya no dice que se borran archivos.
- **WR-02**: `removeVault` no hacía `flushAll()` antes del snapshot → se perdían los últimos ~600ms tipeados (y en el path de disco el flush de desmontaje escribía en una carpeta ya enviada a papelera). Ahora hace `flushAll()` antes de `vault.remove`.
- **IN-01**: `pinTab` en `onPaneNoteChange` solo se llama si el panel tiene una preview que fijar.
- **IN-02/IN-03** diferidos (debounce single/double click de bajo riesgo; migración de `window.alert`→toast como cambio uniforme aparte).

## Non-Destructive / Safety Invariants

- **FILE-05**: "Quitar de la lista" NUNCA toca el disco; el borrado de disco valida `root ∈ knownVaults` antes de `shell.trashItem` (papelera del SO, recuperable) y NUNCA usa `rm`/`rmSync`; si la papelera falla, la bóveda queda en la lista. `flushAll()` antes de dar de baja evita pérdida de lo tipeado.
- **FILE-04**: `paneTree` mantiene pureza e ids de hoja estables (se preserva el montaje del editor); una sola preview por panel.
- Seguridad de teclado (lección CR-01 Fase 6): Enter nunca dispara el borrado destructivo; Cancelar autofocus; Escape cancela.
- Sin costo de IA: la fase no toca ningún path de IA.

## Verification

- Build verde (typecheck node+web + electron-vite build exit 0).
- §A–§B firmados por el usuario en un build relanzado.

## Self-Check: PASSED
- FOUND: .planning/phases/07-tabs-de-preview-y-gestin-de-bvedas/07-03-SUMMARY.md
- CONFIRMED: FILE-04/05 aprobados por el usuario

---
*Phase: 07-tabs-de-preview-y-gestin-de-bvedas*
*Completed: 2026-07-06*
