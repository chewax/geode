---
phase: quick
plan: 260710-jll
subsystem: git-versioning
tags: [performance, racy-git, workblobs, auto-push, vault-switch]
requires: [src/main/services/git.ts, src/main/index.ts]
provides:
  - "workBlobs con cache racy-safe (size+mtime) + concurrencia acotada"
  - "commit con git.add batcheado (array)"
  - "snapshotIfChanged con push parametrizable (awaitPush)"
affects: [vaultSwitch, vaultRemove, before-quit, cadencia de snapshots]
tech-stack:
  added: []
  patterns: ["cache de oids por (size, mtime) con guarda racy", "pool inline de workers para concurrencia acotada sin dependencias"]
key-files:
  created: []
  modified:
    - src/main/services/git.ts
    - src/main/index.ts
decisions:
  - "El cache de hashes es una optimización PURA: ante cualquier duda (sin entrada previa, cambió size/mtime, o cae en ventana racy) se re-hashea."
  - "Ventana racy = prev.hashedAt - prev.mtimeMs > 1000ms; espeja el 'racily clean' de git a 1s de resolución."
  - "Solo switch/baja de bóveda usan push fire-and-forget; cierre (before-quit) y cadencia conservan el await para que el race de 3s del cierre cubra el push."
metrics:
  duration: 8min
  completed: 2026-07-10
---

# Quick Task 260710-jll: Optimizar cambio/baja de bóveda con muchos archivos — Summary

Optimización del switch/baja de bóveda en bóvedas grandes: `workBlobs` reutiliza oids cacheados por (size, mtime) salvo en la ventana racy y paraleliza el re-hasheo con un pool acotado; `commit` batchea los `git.add` en una sola llamada; y el push de respaldo pasa a fire-and-forget en switch/baja (el cierre lo sigue esperando) — todo sin debilitar la garantía anti racy-git.

## What Was Built

### Task 1 — Cache racy-safe + paralelismo en `workBlobs`, `git.add` batcheado (`src/main/services/git.ts`)
- Nuevo campo privado `hashCache`: `Map<dir, Map<ruta, { size, mtimeMs, oid, hashedAt }>>`.
- `workBlobs` reescrito en fases: (1) recorrer solo la estructura de directorios (sin leer contenido) para juntar rutas; (2) `stat` de cada archivo; (3) reutilizar el oid cacheado SOLO si existe entrada previa, mismo `size`, mismo `mtimeMs`, y fuera de la ventana racy (`prev.hashedAt - prev.mtimeMs > 1000ms`); si falla cualquiera → `readFile` + `git.hashBlob`; (4) pool inline con índice compartido y 16 workers para acotar la concurrencia; (5) el cache se reemplaza por SOLO las entradas observadas en la corrida (no crece con borrados).
- `commit`: los `git.add` se batchean en una sola llamada `git.add({ fs, dir, filepath: rutas[] })` (isomorphic-git 1.38 acepta `string[]`); los `git.remove` quedan uno por borrado (no aceptan array).

### Task 2 — Push no-bloqueante en cambio/baja de bóveda (`src/main/index.ts`)
- `snapshotIfChanged(reason, allowAi, opts: { awaitPush?: boolean } = {})`; default `awaitPush=true` preserva el comportamiento actual (cierre + cadencia).
- Con `awaitPush===false` el push se dispara fire-and-forget (`void autoPushAfterCommit(...)`), que ya nunca lanza y tiene su propio try/catch.
- `vaultSwitch` y `vaultRemove` pasan `{ awaitPush: false }`; `before-quit` (race de 3s) y la cadencia conservan el default `await`.

## Racy-git Guarantee — Verificación

Escenario crítico: un archivo editado al MISMO tamaño en el MISMO segundo del escaneo que lo cacheó.
- Al cachearse, la entrada solo se reutiliza si estaba fuera de la ventana racy (`hashedAt - mtimeMs > 1000`).
- Para una edición futura: o cambia el `mtimeMs` (distinto del cacheado → re-hash), o cae en la ventana racy respecto de su propio hasheo (`hashedAt - mtimeMs <= 1000` → re-hash). En ambos casos la condición (d) obliga a re-leer y re-hashear, por lo que el cambio SIEMPRE se detecta. No se volvió a statusMatrix ni se confía ciegamente en stats. `pendingChanges`/`headBlobs`/`commit` siguen comparando oids reales de contenido vs HEAD.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit -p tsconfig.node.json` pasa (verde) tras cada tarea.
- Revisión manual de la lógica del cache contra el escenario racy (mismo tamaño, mismo segundo) → fuerza re-hash.
- La detección de cambios sigue siendo por content-hash vs blobs de HEAD; garantía core intacta.

## Ronda 2 — UAT "sigue demorando" (2026-07-10)

El UAT reveló la causa real midiendo sobre las bóvedas del usuario: `D:\Libros` es
una bóveda de 4.4 GB (580 PDFs, 330 EPUBs, 35 descargas parciales `.!qb` de
qBittorrent que mutan solas) con **HEAD sin nacer** (0 commits; los intentos de
commit inicial nunca terminaron y dejaron 3 GB de objetos huérfanos en `.git`).
Mediciones (bundle esbuild del GitService real):

- Escaneo frío por sesión (cache solo en memoria): **7.9 s** → con cache
  persistido en `.geode/hashcache.json`: **0.07 s**.
- `pendingLineStat`: **14 s** (leía jpg/epub enteros como utf8 y el blob de HEAD
  por cada cambio) → con cap de 5 MB + sniff binario de 8 KB: **0.47 s**.
- Garantía racy re-verificada end-to-end: edición mismo-tamaño con mtime clavado
  dentro de la ventana racy → re-hash → detectada.

Fixes ronda 2:
- `97d2575` hash-cache persistido (`.geode/hashcache.json`, best-effort,
  atomicWrite; la ventana racy viaja en `hashedAt`, tiempos absolutos).
- `c2f09b5` single-flight de snapshots por bóveda (dos commits concurrentes
  sobre el mismo `.git` pueden pisarse el index).
- `6fc7a55` (post-ronda-1) `vaultRemove` a papelera espera el push (última
  chance de respaldo; evita race push-vs-trashItem sobre `.git`).

**Pendiente de decisión de producto (fuera de alcance):** una bóveda con GBs de
binarios que mutan solos sigue commiteando GBs en cada snapshot (zlib en JS,
main thread). Opciones: reglas de ignore (`.gitignore` / extensiones tipo
`.!qb`), umbral de tamaño con aviso, o mover GitService a un worker thread.

## Commits

- `a79f694` perf(quick-260710-jll): cache racy-safe + paralelismo en workBlobs, git.add batcheado
- `f0cd714` perf(quick-260710-jll): push no-bloqueante en cambio/baja de boveda (quit conserva el await)
- `6fc7a55` fix(quick-260710-jll): esperar el push antes de mandar la boveda a la papelera
- `97d2575` perf(quick-260710-jll): hash-cache persistido en .geode + sniff binario de 8KB en lineStat
- `c2f09b5` fix(quick-260710-jll): single-flight de snapshots por boveda

## Self-Check: PASSED
- FOUND: src/main/services/git.ts (modified)
- FOUND: src/main/index.ts (modified)
- FOUND commit: a79f694
- FOUND commit: f0cd714
