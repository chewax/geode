---
phase: quick-260710-ol2
plan: 01
subsystem: renderer-timeline
tags: [timeline, tooltip, ux, a11y]
requires: []
provides:
  - "Tooltip nativo con la descripción completa del commit sobre la etiqueta de cada entrada de la timeline"
affects:
  - src/renderer/src/Timeline.tsx
tech-stack:
  added: []
  patterns: ["title nativo (sin CSS custom) para tooltips, coherente con el resto de la app"]
key-files:
  created: []
  modified:
    - src/renderer/src/Timeline.tsx
decisions:
  - "Usar el atributo `title` nativo en `.tl-entry-label` en lugar de un tooltip CSS custom: mismo patrón que el resto de la app, sin CSS nuevo, envuelve texto largo por el SO y es accesible."
  - "El `title` del span anida sobre el `title` del `<li>` (basenames): el navegador prioriza el elemento más interno, así hover sobre la etiqueta muestra el mensaje completo y hover sobre el resto de la fila sigue mostrando qué notas cambiaron."
metrics:
  duration: 3min
  completed: 2026-07-10
---

# Quick 260710-ol2: Hover en item de la timeline muestra descripción completa — Summary

Hover sobre la etiqueta truncada de una entrada de la timeline ahora muestra, vía tooltip nativo `title`, el mensaje completo del commit/versión (título + cuerpo) en vez de la primera línea truncada con ellipsis.

## What Was Built

- **Task 1 (commit `52a7be5`):** En `src/renderer/src/Timeline.tsx`, dentro del `.map` de commits se computa `const textoCompleto = c.message.trim() || label` y se aplica como `title={textoCompleto}` sobre el `<span className="tl-entry-label">`. La etiqueta se trunca con `text-overflow: ellipsis` en `index.css`; el `title` expone el texto completo al pasar el mouse. Si el mensaje del commit está vacío, cae a `label` (que ya resuelve tag → primera línea → fecha relativa vía `entryLabel`).

El `title` del `<li>` (que muestra los basenames de las notas cambiadas) quedó intacto: el navegador prioriza el elemento más interno, así que hover sobre la etiqueta muestra la descripción completa y hover sobre el resto de la fila sigue mostrando qué cambió.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run typecheck` (node + web) en verde.
- Diff acotado a `Timeline.tsx`: se agrega `title` en el span de la etiqueta; no se altera el `title` del `<li>`; sin CSS nuevo; comentarios en español, sin emojis.

## Self-Check: PASSED

- FOUND: src/renderer/src/Timeline.tsx (title={textoCompleto} en tl-entry-label)
- FOUND: commit 52a7be5
