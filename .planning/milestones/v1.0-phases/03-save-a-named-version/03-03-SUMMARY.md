---
phase: 03-save-a-named-version
plan: 03
subsystem: uat-signoff
tags: [save-version, ai, uat, named-version]

# Dependency graph
requires:
  - "03-01: ai.suggestVersion round-trip, pendingDiff .md scope, entryLabel first-line"
  - "03-02: reframed two-field 'Guardar versión' dialog"
provides:
  - "Human UAT sign-off for SAVE-01/02/03 + AI message quality tuning"
affects: ["03-VERIFICATION (phase verify)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prompt de IA orientado al DELTA: explica el formato del diff (+/-/contexto) y pide describir solo lo que cambió, no la nota entera"
    - "Descripción de versión como punteo (una viñeta por cambio); título tipo encabezado conciso (3-6 palabras)"

key-files:
  created:
    - .planning/phases/03-save-a-named-version/03-03-SUMMARY.md
  modified:
    - src/main/services/ai.ts
    - src/main/services/git.ts
    - src/renderer/src/CommitDialog.tsx
  deleted: []

key-decisions:
  - "No fue un bug de scope: la queja 'la IA toma cambios del repo' era la IA resumiendo fielmente una nota cuyo contenido es un ToDo sobre Geode. git está correctamente acotado a la ruta de la bóveda (requireRoot → vault.root)."
  - "La calidad del mensaje escala con el modelo (BYOK); el código fuerza el ENFOQUE (delta, punteo, título conciso, sin rótulos, ToDo como pendiente), no la elocuencia."
  - "pendingDiff usa context:2 (solo para el diff que ve la IA) para reducir el ruido de líneas sin cambios; no afecta el visor de diferencias (commitDiff)."

requirements-completed: [SAVE-01, SAVE-02, SAVE-03]

# Metrics
duration: ~UAT en vivo con iteración de prompts
completed: 2026-07-04
---

# Phase 3 Plan 03: UAT sign-off (Save a Named Version) Summary

**El flujo de guardar como "nombrar un momento" pasó el UAT §1–§7 en un build corriendo: nombre opcional como título, descripción por IA en punteo enfocada en el delta, sin jerga git, y las correcciones (scope del diff a notas, etiqueta de primera línea) confirmadas — con varias iteraciones de pulido del prompt de IA hechas en vivo hasta que el usuario aprobó título + descripción.**

## Baseline Gate

- `npm run typecheck` → exit 0 tras cada cambio.
- `npm run build` → exit 0.
- App levantada con `env -u ELECTRON_RUN_AS_NODE npm run dev` (gotcha ELECTRON_RUN_AS_NODE=1 del Bash tool).

## UAT Results (§1–§7)

| Check | Requisito | Resultado |
|-------|-----------|-----------|
| §1 Nombre → etiqueta en Timeline (solo título) | SAVE-01 | ✅ |
| §2 Guardado sin nombre → fallback a fecha relativa | SAVE-01 | ✅ |
| §3 IA on: título+descripción autogenerados y editables | SAVE-02 | ✅ |
| §4 IA off: campos vacíos, guardar habilitado | SAVE-02 | ✅ |
| §5 Sin jerga git (título, "N notas cambiadas", sin ledger, ícono Lucide) | SAVE-03 | ✅ |
| §6 Fix de scope: la IA describe solo notas; el adjunto se sigue versionando | SAVE-02 | ✅ |
| §7 Descripción multilínea → Timeline muestra solo la primera línea | SAVE-01 | ✅ |

Sign-off del usuario: **"approved"**.

## Investigación "la IA toma cambios del repo" (no era bug)

La queja recurrente se diagnosticó en vivo con un log temporal + inspección del código:
- **Causa raíz:** la nota de prueba del usuario ES un ToDo sobre el desarrollo de Geode (borrar elementos del sidebar, deshacer ramas, status bar). La IA la resumía fielmente. No había fuga del repo: `git` se acota a `vault.root` (`requireRoot`), `pendingDiff` filtra a `.md`, y `workBlobs`/`headBlobs` filtran `IGNORED_TOP`.
- **Matiz que confundía:** en la primera versión de una nota (sin HEAD para ese archivo) el diff = toda la nota; en ediciones posteriores = solo el delta.

## Pulido de IA aplicado durante el UAT (gap-closure)

Todos con typecheck verde, sobre `src/main/services/ai.ts` (+ `git.ts`, `CommitDialog.tsx`):
1. **WR-01/WR-02** (`728ac60`): resumen "N archivos cambiados" para adjuntos-only; campos deshabilitados mientras la IA genera (no perder texto tipeado).
2. **Rótulos** (`0893824`): parse quita "Título:"/"Descripción:"; prompt pide no rotular ni asumir trabajo hecho.
3. **Delta, no nota entera** (`1eeebaa`): el prompt explica el formato del diff (+/-/contexto) y pide describir solo lo que cambió; `pendingDiff` con `context:2`.
4. **Punteo** (`b65f30a`): descripción como viñetas (una por cambio); parse deja de comerse la primera viñeta.
5. **Título conciso** (`b318286`): encabezado de 3-6 palabras (~40 chars), sin "algo: subtítulo".

## Verification

- Build verde (typecheck + build exit 0).
- §1–§7 firmados por el usuario en un build corriendo.
- No destructivo confirmado (§6): el adjunto no-.md se sigue versionando aunque la IA no lo describa.

## Self-Check: PASSED
- FOUND: .planning/phases/03-save-a-named-version/03-03-SUMMARY.md
- CONFIRMED: SAVE-01/02/03 aprobados por el usuario
- CONFIRMED: git acotado a la bóveda; no era bug de scope

---
*Phase: 03-save-a-named-version*
*Completed: 2026-07-04*
