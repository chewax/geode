---
phase: 09-snapshots-autom-ticos-con-ia-opcional
plan: 03
subsystem: uat-signoff
tags: [auto-snapshots, ai-opt-in, cost-invariant, no-loss, uat]

# Dependency graph
requires:
  - "09-01: backend (settings.aiTitles + IPC + snapshotIfChanged(reason, allowAi) con IA en cadencia, timeout y fallback)"
  - "09-02: toggle 'Nombrar con IA' en Ajustes → Guardado automático"
provides:
  - "Human UAT sign-off for AISNAP-01"
affects: ["09-VERIFICATION (phase verify)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opt-in de IA en auto-snapshots: mismo snapshotIfChanged, gateado por allowAi (solo cadencia) + flag persistido; fallback siempre al marcador."

key-files:
  created:
    - .planning/phases/09-snapshots-autom-ticos-con-ia-opcional/09-03-SUMMARY.md
  modified: []
  deleted: []

key-decisions:
  - "Sin detector de idle ni cambios al timer (decisión del usuario): el 'idle' es emergente — árbol limpio = no-op = sin IA. El costo escala con edición real, no con tiempo transcurrido."
  - "La misma snapshot de seguridad usa IA (no un path paralelo); los snapshots de ciclo de vida (cierre/cambio/baja de bóveda) quedan sin IA (allowAi=false) para no meter red en la salida."
  - "Code-review deep sin criticals; 2 warnings (higiene de timeout WR-01, guard de re-entrancia WR-02) arreglados antes del UAT."

requirements-completed: [AISNAP-01]

# Metrics
duration: ~UAT manual
completed: 2026-07-07
---

# Phase 9 Plan 03: UAT sign-off (Snapshots automáticos con IA opcional) Summary

**El usuario puede activar (opt-in en Ajustes → Guardado automático, por defecto APAGADO) que las snapshots automáticas lleven título/descripción por IA; con la opción activada la IA solo corre en el path de cadencia cuando realmente hay cambios .md, cae siempre al marcador v1.0 si falta key o la IA falla, y los snapshots de ciclo de vida nunca invocan IA — verificado §A–§B en un build relanzado con sign-off del usuario.**

## Baseline Gate

- `npm run typecheck` (node + web) → exit 0.
- `npm run build` (electron-vite) → exit 0.
- App RELANZADA por completo (AISNAP-01 toca el main process — `snapshotIfChanged`, `aiSnapshotMessage`, handler IPC nuevo).

## UAT Results (§A–§B)

| Check | Requisito | Resultado |
|-------|-----------|-----------|
| §A — Toggle "Nombrar con IA" en Ajustes → Guardado automático, por defecto APAGADO, con copy de costo/condición; con la opción OFF la snapshot de cadencia conserva el marcador "Instantánea automática — …" (v1.0 intacto) | AISNAP-01 (SC-1/SC-2) | ✅ |
| §B — Con la opción ON + cambios .md, la snapshot de cadencia aparece en la timeline con título/descripción legibles (como el guardado manual con IA); sin cambios no crea snapshot ni llama IA; si la IA falla/no hay key, la snapshot igual se guarda con el marcador; los snapshots de cierre/cambio de bóveda quedan instantáneos sin IA | AISNAP-01 (SC-3/SC-4) | ✅ |

Sign-off del usuario: **"approved"**.

## Code-review gap-closure (antes del UAT)

Code-review deep sobre los 6 archivos de la fase (contrato IPC main↔preload↔renderer + motor de auto-snapshots + invariantes de costo y no-pérdida): **0 criticals**. Los invariantes clave se confirmaron sólidos — `snapshotIfChanged` nunca lanza y siempre cae al marcador; la IA solo se alcanza por 'cadencia' con `pendingDiff` no vacío; racy-git content-hash intacto; sin wrong-root en concurrencia. **2 warnings**, ambos arreglados (commit e4b3b56):
- **WR-01**: el timeout de 10s no limpiaba su timer ni abortaba el fetch perdedor. Fix: `AbortController` + `clearTimeout` en `finally` (patrón de `getOpenRouterUsage`); `generateNamedVersion(diff, signal?)` acepta la señal.
- **WR-02**: sin guard de re-entrancia, una llamada de IA de cadencia (~10s) podía solaparse con un cambio de bóveda/cierre u otro tick → título IA facturado y descartado + commit concurrente redundante. Fix: guard `cadenceSnapshotInFlight` que solo aplica al path de IA (los callers de ciclo de vida siguen sin guard, instantáneos), liberado en `finally`.
- **IN-01/02/03**: informativos (race-loser ya seguro; doble `loadSettings`; reset cosmético) — no accionados.

## Non-Destructive / Cost Invariants

- **No-pérdida**: `snapshotIfChanged` nunca lanza; toda falla de IA (sin key/modelo, `pendingDiff` vacío, rechazo de `generateNamedVersion`, timeout) resuelve a `null` y commitea con `snapshotMessage()`. La snapshot de seguridad nunca se pierde por un problema de IA.
- **Costo**: la IA solo se invoca en 'cadencia' con opt-in ON y cambios .md reales (`&&` con corto-circuito ⇒ los paths de ciclo de vida ni leen settings ni tocan la red); árbol limpio = no-op = sin IA. Sin costo por tiempo transcurrido. El timer/`setInterval` no cambió su período (sin detector de idle).
- **Racy-git**: `pendingDiff` (content-hash vs HEAD), nunca statusMatrix.

## Verification

- Build verde (typecheck node+web + electron-vite build exit 0).
- §A–§B firmados por el usuario en un build relanzado.
- 09-VERIFICATION.md: **status passed — 4/4 must-haves**.

## Self-Check: PASSED
- FOUND: .planning/phases/09-snapshots-autom-ticos-con-ia-opcional/09-03-SUMMARY.md
- CONFIRMED: AISNAP-01 aprobado por el usuario

---
*Phase: 09-snapshots-autom-ticos-con-ia-opcional*
*Completed: 2026-07-07*
