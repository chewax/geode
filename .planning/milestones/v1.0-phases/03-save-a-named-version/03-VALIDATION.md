---
phase: 3
slug: save-a-named-version
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test harness in this repo (out of scope this milestone, matches Phases 1–2) |
| **Config file** | none |
| **Quick run command** | `npm run typecheck` (tsc --noEmit sobre tsconfig.node.json + tsconfig.web.json) |
| **Full suite command** | `npm run typecheck && npm run build` |
| **Estimated runtime** | ~15 s (typecheck) + ~10 s (build) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run typecheck && npm run build`
- **Before `/gsd-verify-work`:** Full suite (typecheck + build) must exit 0
- **Max feedback latency:** ~25 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-*-* | * | * | SAVE-01/02/03 | — | Guardado no destructivo; sin exposición de key de IA (ya cifrada) | typecheck+build | `npm run typecheck && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Nota: sin harness de tests unitarios; la corrección de comportamiento (título/descripción discriminados, diff filtrado a .md, etiqueta de primera línea) se confirma por UAT manual + typecheck/build, como en Fases 1–2.*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — no test framework to install (none used this milestone).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| §A — Guardar pide un nombre opcional (título), sin mensaje obligatorio | SAVE-01 | Requiere interacción con el diálogo en la app corriendo | Abrí el diálogo de guardar con cambios pendientes: hay un campo "Nombre" opcional arriba con autofocus; se puede guardar dejándolo vacío. |
| §B — La IA genera título Y descripción discriminados | SAVE-02 | Requiere una key de IA válida y una llamada real al modelo | Con IA lista y cambios en notas, abrí el diálogo: el título (1ª línea) y la descripción (cuerpo) se autocompletan por separado, ambos editables. |
| §C — Con IA deshabilitada, la descripción queda vacía y el guardado procede | SAVE-02 | Depende del estado de config de IA | Deshabilitá la IA en Ajustes; abrí el diálogo: título y descripción vacíos, "Guardar" sigue habilitado. |
| §D — El diff de la IA solo describe notas (.md), no otros archivos del repo | SAVE-02 | Requiere observar la salida del modelo sobre un vault con archivos no-.md cambiados | Cambiá una nota y un archivo no-.md; generá con IA: la descripción habla solo del contenido de la nota. |
| §E — El flujo por defecto no muestra jerga git ni lista commit-framed; el título aparece como etiqueta en la timeline | SAVE-03 | Verificación visual del diálogo y de la timeline | El diálogo no dice "commit"/"ledger", muestra "N notas cambiadas" en vez de rutas; tras guardar con un nombre, la timeline muestra ese nombre como etiqueta (solo la 1ª línea). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify (typecheck+build) or are manual-UAT (documented above)
- [x] Sampling continuity: typecheck runs after every task
- [x] Wave 0 covers all MISSING references (none — no harness)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
