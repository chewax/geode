---
phase: quick-260710-ovf
plan: 01
subsystem: renderer / FileTree
tags: [drag-and-drop, filetree, ux, vault]
requires:
  - "window.geode.vault.rename (canal existente: mueve entre carpetas, valida colisión, racy-safe)"
  - "renameNode remap de pestañas/panes/selección (App.tsx)"
provides:
  - "Drag & drop nativo HTML5 en el árbol lateral: mover notas/carpetas a otra carpeta o a la raíz"
  - "prop FileTree.onMoveNode(fromPath, toDir)"
  - "App.moveNode con guardas de no-op y aviso de colisión en español"
affects:
  - "src/renderer/src/FileTree.tsx"
  - "src/renderer/src/App.tsx"
  - "src/renderer/src/index.css"
tech-stack:
  added: []
  patterns:
    - "dataTransfer 'text/geode-path' como transporte de la ruta origen (sin estado compartido entre TreeItems)"
    - "stopPropagation en el drop de carpeta para no burbujear a la zona raíz"
    - "reuso de vault.rename como motor de move (sin canal IPC nuevo)"
key-files:
  created: []
  modified:
    - "src/renderer/src/FileTree.tsx"
    - "src/renderer/src/App.tsx"
    - "src/renderer/src/index.css"
decisions:
  - "Solo carpetas y la raíz son drop targets; los archivos son solo origen de arrastre (según el pedido)"
  - "El move reusa vault.rename: colisión rechazada con 'Ya existe: <ruta>' → toast en español, sin sobrescribir"
  - "Guardas anti-descendencia evitan corromper el árbol al mover una carpeta dentro de sí misma o de una hija"
metrics:
  duration: 8 min
  completed: 2026-07-10
---

# Quick 260710-ovf: Arrastrar documentos a otras carpetas Summary

Drag & drop nativo HTML5 en el árbol lateral: arrastrar una nota o carpeta y soltarla sobre otra carpeta la mueve dentro; soltarla en el área vacía la mueve a la raíz de la bóveda. Reusa `vault.rename` (sin canal IPC nuevo) y el remap de pestañas de `renameNode`.

## What Was Built

**Task 1 — Drag & drop en FileTree (`FileTree.tsx`)**
- Nueva prop `onMoveNode(fromPath, toDir)` (`toDir === ''` = raíz), documentada en español.
- Filas de archivo (`<li className="tree-file">`) y de carpeta (`<div className="tree-dir">`) son `draggable` (excepto durante el rename inline) y transportan la ruta origen vía `dataTransfer.setData('text/geode-path', node.path)` con `effectAllowed = 'move'`.
- Solo las carpetas son drop targets: `onDragOver` habilita el drop y activa el estado local `dragOver` (resaltado `drop-target`), `onDragLeave` lo desactiva, `onDrop` hace `preventDefault + stopPropagation` (load-bearing: evita el doble move hacia la raíz), lee la ruta origen y llama `onMoveNode(from, node.path)`.

**Task 2 — moveNode + zona raíz + estilos (`App.tsx`, `index.css`)**
- `moveNode(fromPath, toDir)` con `useCallback([refreshTree])`: calcula `base`/`toRel`, aplica guardas de no-op (mismo destino, ya en esa carpeta, auto-descendencia de carpetas), llama `vault.rename` dentro de try/catch (colisión → `setToast` en español, sin reintento ni sobrescritura) y en éxito aplica el mismo remap que `renameNode` (tabs, active, preview de cada leaf; selección; `refreshTree`).
- El `<div className="tree-scroll">` es zona de drop raíz: `onDragOver`/`onDragLeave` con estado `rootDragOver` (solo cuando el mouse está sobre el área vacía, `e.target === e.currentTarget`), `onDrop` mueve a la raíz con `moveNode(from, '')`.
- `FileTree` recibe `onMoveNode={(from, toDir) => void moveNode(from, toDir)}`.
- CSS sobrio consistente con la selección: `.tree-dir.drop-target` (fondo `--panel-2` + `box-shadow: inset 0 0 0 1px var(--accent)`) y `.tree-scroll.root-drop-target` (mismo contorno inset).

## Verification

- `npm run typecheck` — verde (node + web).
- `npm run build` — verde (`✓ built in 6.66s`).

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- `1573d3c` feat(quick-260710-ovf): drag & drop nativo en FileTree con drop sobre carpetas
- `8338483` feat(quick-260710-ovf): moveNode en App, zona de drop raíz y estilos de drop

## Self-Check: PASSED

- FOUND: src/renderer/src/FileTree.tsx (commit 1573d3c)
- FOUND: src/renderer/src/App.tsx (commit 8338483)
- FOUND: src/renderer/src/index.css (commit 8338483)
- FOUND commit: 1573d3c
- FOUND commit: 8338483
