---
phase: 05-advanced-mode-capa-0-polish
plan: 04
subsystem: uat-signoff
tags: [advanced-mode, save-status, diff-readability, uat]

# Dependency graph
requires:
  - "05-01: flag Modo Avanzado persistido + sección General"
  - "05-02: visor de diff humanizado (props date/label, sin @@/No-newline/hash)"
  - "05-03: gating git en App.tsx (toolbar + paleta) + STAT-01 + wiring del diff"
provides:
  - "Human UAT sign-off for ADV-01/02/03, STAT-01, DIFF-01/02"
affects: ["05-VERIFICATION (phase verify)"]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/05-advanced-mode-capa-0-polish/05-04-SUMMARY.md
  modified: []
  deleted: []

key-decisions:
  - "Sin harness de tests (consistente con Fases 1-4): garantía final = build verde (typecheck node+web + electron-vite build) + UAT humano §A–§E."
  - "Code-review deep aplicado antes del UAT: 0 críticos, WR-01 (fuga de confianza 'Todo en la nube') + 5 info corregidos."

requirements-completed: [ADV-01, ADV-02, ADV-03, STAT-01, DIFF-01, DIFF-02]

# Metrics
duration: ~UAT manual
completed: 2026-07-05
---

# Phase 5 Plan 04: UAT sign-off (Advanced Mode & Capa-0 Polish) Summary

**El modo default queda totalmente libre de git (toolbar, statusbar, popover, tooltips, diálogo de guardar y paleta de comandos), un toggle "Modo Avanzado" persistido revela/oculta el grafo, ramas, switcher y los comandos git de la paleta, el estado de guardado usa lenguaje humano honesto, y el diff es legible — verificado §A–§E en un build corriendo con sign-off del usuario.**

## Baseline Gate

- `npm run typecheck` (node + web) → exit 0.
- `npm run build` (electron-vite) → exit 0, artefactos en `out/`.
- App levantada con `env -u ELECTRON_RUN_AS_NODE npm run dev` (gotcha ELECTRON_RUN_AS_NODE=1).

## UAT Results (§A–§E)

| Check | Requisito | Resultado |
|-------|-----------|-----------|
| §A — Default sin jerga git ni hashes en toolbar/statusbar/popover/tooltips/diálogo y en la paleta de comandos (sin comandos git ni categoría "Git") | ADV-01 | ✅ |
| §B — Toggle "Modo Avanzado" (sección General) persiste al cerrar/reabrir en ambos estados | ADV-02 | ✅ |
| §C — Encendido revela grafo/ramas/switcher + comandos git de la paleta; apagado los oculta sin romper el layout | ADV-03 | ✅ |
| §D — Estado de guardado con las 4 frases humanas + icono Lucide, sin hora | STAT-01 | ✅ |
| §E — Diff legible: encabezado humano sin hash, sin `@@`/"No newline", leyenda agregado/quitado | DIFF-01/02 | ✅ |

Sign-off del usuario: **"approved"**.

## Code-review gap-closure (antes del UAT)

Code-review deep: **0 críticos**, 1 warning + 5 info. Corregidos:
- **WR-01** (`47f1418`): "Todo en la nube" sobreafirmaba seguridad en la nube para ediciones solo-en-disco. `statusLabel()` reestructurado: `saved` (autosave a disco, sin commitear) → "Guardado en este dispositivo"; "Todo en la nube" reservado a `clean` (árbol == HEAD) + GitHub conectado + `pushCount===0`. Preserva las 4 frases literales y los iconos Lucide. Honra "nunca perdés nada".
- **IN-01/02/03** (`273832a`): CSS muerto `.diff-oid` eliminado; `.diff-ln.hunk` reemplazado por `.diff-ln.divider` (el realmente renderizado); estilos del diff movidos de inline a clases kebab-case alineadas a los tokens.
- **IN-04** (`47e96ea`): label duplicado del toggle deduplicado.
- **IN-05** (`4d132fe`): `graphOpen` se resetea a false al apagar el Modo Avanzado (el modal del grafo no queda abierto tras salir).

## Non-Destructive / Cost Invariants

- **ADV-01/03**: las superficies git se ocultan Y se vuelven no invocables en default (los comandos de la paleta se registran solo con `advanced===true` vía `useEffect` con `dispose()`); nada de jerga git filtrada.
- **Sin costo de IA**: la fase no toca ningún path de IA; el gasto solo sube en guardado manual (invariante de Fases 3-4 intacto).
- **Racy-git**: detección de cambios por content-hash intacta; no se tocó.

## Verification

- Build verde (typecheck node+web + electron-vite build exit 0).
- §A–§E firmados por el usuario en un build corriendo (incluida la verificación de la paleta de comandos en §A y §C).

## Self-Check: PASSED
- FOUND: .planning/phases/05-advanced-mode-capa-0-polish/05-04-SUMMARY.md
- CONFIRMED: ADV-01/02/03, STAT-01, DIFF-01/02 aprobados por el usuario

---
*Phase: 05-advanced-mode-capa-0-polish*
*Completed: 2026-07-05*
