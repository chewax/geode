---
phase: 12-sandbox-en-iframe-ui-del-panel-dentro-del-iframe-quitar-unsa
plan: 03
subsystem: plugins / seguridad (CSP)
tags: [csp, security, plugins, iframe-sandbox, unsafe-eval]
requires:
  - "12-01: eval de externos confinado al iframe de origen opaco"
  - "12-02: UI del panel del plugin dentro del iframe"
provides:
  - "CSP-01: renderer principal sin 'unsafe-eval' (script-src 'self' + frame-src 'self')"
affects:
  - "src/renderer/index.html (meta CSP del host)"
tech-stack:
  added: []
  patterns:
    - "CSP estricto del host: el renderer principal no evalúa código arbitrario; el eval de terceros vive solo en el iframe sandbox con CSP propia"
key-files:
  created: []
  modified:
    - src/renderer/index.html
    - docs/PLUGINS.md
decisions:
  - "UI bajo sandbox = opción (a): el panel del plugin vive dentro del iframe (resuelto en Fase 12)"
  - "Un iframe por plugin (máximo aislamiento) en lugar de uno compartido"
  - "frame-src 'self' asentado como criterio de aceptación (grep positivo) para que una regresión de carga del iframe se detecte en build/plan, no en el UAT"
metrics:
  duration: ~10m
  completed: 2026-07-08
---

# Phase 12 Plan 03: Quitar unsafe-eval del CSP del renderer principal (CSP-01) Summary

Se removió `'unsafe-eval'` del `script-src` del CSP del renderer principal (`index.html`), dejando `script-src 'self'`, y se agregó `frame-src 'self'` para que el iframe `srcdoc` del sandbox cargue como nested browsing context — el capstone de seguridad de la Fase 12: el host ya no puede evaluar código arbitrario y el eval de terceros queda confinado al iframe de origen opaco de los Planes 01/02.

## What Was Built

- **`src/renderer/index.html`** — CSP endurecido:
  - `script-src 'self'` (antes `'self' 'unsafe-eval'`).
  - `frame-src 'self'` agregado (directiva mínima para el iframe `srcdoc` del sandbox).
  - `default-src 'self'` intacto → garantiza `connect-src 'self'` para el `fetch` same-origin del bundle del runtime del host.
  - `style-src 'self' 'unsafe-inline'` e `img-src 'self' data:` sin cambios (React/CodeMirror inyectan estilos inline).
  - Comentario del bloque CSP reescrito: ahora documenta el modelo de Fase B (host con `script-src 'self'` + `frame-src 'self'`; terceros aislados en iframe con CSP propia) en lugar del `unsafe-eval` de Fase A.
- **`docs/PLUGINS.md`** — estado de migración Fase A → Fase B actualizado:
  - Paso 3 (sandbox iframe) y paso 5 (quitar `unsafe-eval`) marcados como **HECHO — Fase 12**.
  - Paso 4 (permisos) marcado pendiente para Fase 13.
  - "Decisiones abiertas" cerradas: UI bajo sandbox = opción (a) iframe con UI propia; un iframe por plugin.
  - Documentado el CSP del iframe (`connect-src 'none'`, red default-deny hasta Fase 13) y el CSP del host tras la fase (`script-src 'self'` + `frame-src 'self'`).
  - Línea "CSP relajado" de Fase A actualizada para reflejar la remoción.

## Verification

- **Grep (Task 1):** `index.html` NO contiene `unsafe-eval`; `script-src 'self'` presente; `frame-src` presente. ✅
- **Grep (Task 2):** `docs/PLUGINS.md` contiene `iframe|sandbox` y `connect-src 'none'`. ✅
- **Build:** `env -u ELECTRON_RUN_AS_NODE npm run build` en verde (typecheck node+web + electron-vite build) — **exit code 0**. El bundle del host no requiere `unsafe-eval`. ✅
- **Aislamiento del iframe intacto:** `src/renderer/src/plugins/iframeHost.ts` sin cambios — conserva `sandbox="allow-scripts"` (sin `allow-same-origin`) y su CSP propia con `script-src 'unsafe-inline' 'unsafe-eval'` + `connect-src 'none'`. Built-ins sin cambios. ✅
- **Salida construida:** `out/renderer/index.html` emite `script-src 'self'` (sin `unsafe-eval`). ✅

## Deviations from Plan

None - plan executed exactly as written.

## Validación funcional pendiente (UAT — Plan 04)

**Una violación de CSP solo se manifiesta en runtime.** Este plan confirma todo lo verificable sin arrancar la app (build verde + aserciones grep de CSP del host y del iframe). La confirmación funcional de que **la app arranca, los built-ins (insert-date / reading-time / outline) funcionan y el plugin de ejemplo aislado sigue operando bajo el CSP endurecido** queda para el UAT humano del Plan 12-04. No se lanzó la app (por indicación explícita).

## Self-Check: PASSED

- FOUND: src/renderer/index.html (modificado, `script-src 'self'` + `frame-src 'self'`, sin `unsafe-eval`)
- FOUND: docs/PLUGINS.md (pasos 3 y 5 marcados HECHO; decisiones cerradas)
- FOUND: .planning/phases/12-.../12-03-SUMMARY.md
- Commit: ver mensaje `feat(12-03): quitar unsafe-eval del CSP del renderer principal (CSP-01)`
