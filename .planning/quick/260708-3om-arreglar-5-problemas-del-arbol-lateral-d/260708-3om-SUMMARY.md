---
phase: quick-260708-3om
plan: 01
subsystem: renderer + main (explorador de archivos / vault)
tags: [filetree, ipc, vault, ux]
requires: []
provides:
  - "IPC geode:vault-reveal (revealInExplorer) y geode:vault-duplicate (duplicate)"
  - "VaultService.absPath y VaultService.duplicate"
  - "Helper pathExistsInTree en App.tsx"
affects:
  - src/renderer/src/App.tsx
  - src/renderer/src/FileTree.tsx
  - src/shared/ipc.ts
  - src/main/services/vault.ts
  - src/main/index.ts
  - src/preload/index.ts
tech-stack:
  added: []
  patterns:
    - "IPC-first: canales geode:* tipados; rutas del renderer validadas con resolveInside"
    - "atomicWrite para copiar notas; cp recursivo para carpetas"
key-files:
  created: []
  modified:
    - src/renderer/src/App.tsx
    - src/renderer/src/FileTree.tsx
    - src/shared/ipc.ts
    - src/main/services/vault.ts
    - src/main/index.ts
    - src/preload/index.ts
decisions:
  - "pathExistsInTree se agrega aparte de flattenPaths (que solo recorre notas) para no romper la reconciliación de tabs de syncPanesToTree/keepOnly"
  - "El foco del input inline se reclama por requestAnimationFrame para ganarle al montaje del editor CodeMirror que roba el foco al crear una nota"
  - "El menú de zona vacía (menu.node === null) NO ofrece Mostrar/Duplicar; solo crear en raíz"
metrics:
  completed: 2026-07-08
  tasks: 2
  files: 6
---

# Phase quick-260708-3om Plan 01: Arreglar 5 problemas del árbol lateral Summary

Arreglados los 5 problemas del explorador de archivos (FileTree) de Geode: borrar carpetas, crear en raíz (deselección + menú de zona vacía), "Mostrar en el explorador", "Duplicar" y foco garantizado del input al crear — con dos IPC nuevas (reveal/duplicate) end-to-end validadas con resolveInside.

## What Was Built

**Task 1 — Fixes de renderer (problemas 1, 2 y 5)** — commit `8ffbefe`
- **Problema 1 (borrar carpetas):** nuevo helper `pathExistsInTree(nodes, target)` que recorre notas Y carpetas; `confirmDelete` reemplaza el guard `flattenPaths(...).includes` por `pathExistsInTree(...)` para validar también el borrado de carpetas. `flattenPaths` se dejó intacto (lo usan syncPanesToTree/keepOnly para reconciliar tabs, que son solo notas).
- **Problema 2 (crear en raíz):** el `<FileTree>` se envuelve en un `<div className="tree-scroll" style={{ flex: 1 }}>` que (a) deselecciona con `onClick` cuando el click cae en la zona vacía (`e.target === e.currentTarget`), y (b) abre un menú contextual de raíz con `onContextMenu`. El estado `menu` pasó a aceptar `node: TreeNode | null`.
- **Problema 5 (foco del input al crear):** `NameInput` (FileTree.tsx) reclama el foco por `requestAnimationFrame` tras el montaje (con `ref` al input + `focus()`/`select()`), ganándole al editor CodeMirror que roba el foco al crear una nota. Se mantiene `autoFocus` y el `onFocus` select.

**Task 2 — IPC "Mostrar en el explorador" y "Duplicar" (problemas 3 y 4)** — commit `e1c2ac3`
- **IPC:** canales `vaultReveal: 'geode:vault-reveal'` y `vaultDuplicate: 'geode:vault-duplicate'`; métodos `revealInExplorer(path)` y `duplicate(path)` en `VaultApi`.
- **VaultService:** `absPath(rel)` (ruta absoluta validada por resolveInside, para el shell) y `duplicate(rel)` (nombre libre estilo "copia"; notas copiadas por `atomicWrite`, carpetas por `cp` recursivo; origen y destino validados con resolveInside).
- **main:** handlers `vaultReveal` (`shell.showItemInFolder(vault.absPath(path))`) y `vaultDuplicate` (`vault.duplicate(path)`).
- **preload:** entradas CommonJS `revealInExplorer` y `duplicate` en el objeto `vault`.
- **App.tsx:** iconos Lucide `FolderOpen` y `Copy`; `duplicateNode` (useCallback, deps `[refreshTree]`) que duplica, refresca, revela y selecciona la copia sin abrir editor; items "Mostrar en el explorador" y "Duplicar" en el bloque de nodo del menú contextual.

## Deviations from Plan

None - plan ejecutado tal como está escrito.

Nota de secuenciación: en Task 1 el bloque del menú contextual se reestructuró para distinguir raíz (`menu.node === null`) vs nodo, dejando el bloque de nodo sin los items Mostrar/Duplicar (aún inexistentes) para que Task 1 pasara `tsc` de forma atómica; Task 2 los agregó junto con sus dependencias, como indica el plan.

## Verification

- Task 1: `npx tsc --noEmit -p tsconfig.web.json` — PASÓ sin errores.
- Task 2: `npm run build` (main + preload + renderer, TS strict) — PASÓ (`✓ built in 5.75s`).
- Ambos comandos con `env -u ELECTRON_RUN_AS_NODE`.
- Manual (fuera del alcance automatizable): borrar carpeta, crear en raíz por deselección y por menú de zona vacía, revelar en explorador, duplicar nota y carpeta, foco del input al crear.

## Threat Surface

Sin superficie nueva fuera del threat_model del plan. Las dos IPC nuevas (vaultReveal/vaultDuplicate) validan toda ruta del renderer con `resolveInside` antes de leer/escribir/copiar o resolver la ruta absoluta para el shell (T-3om-01/02 mitigados).

## Self-Check: PASSED

- FOUND: src/renderer/src/App.tsx (pathExistsInTree, duplicateNode, FolderOpen/Copy)
- FOUND: src/renderer/src/FileTree.tsx (rAF focus en NameInput)
- FOUND: src/shared/ipc.ts (vaultReveal, vaultDuplicate, revealInExplorer, duplicate)
- FOUND: src/main/services/vault.ts (absPath, duplicate)
- FOUND: src/main/index.ts (handlers)
- FOUND: src/preload/index.ts (bridge CommonJS)
- FOUND commit: 8ffbefe (Task 1)
- FOUND commit: e1c2ac3 (Task 2)
