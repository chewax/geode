---
phase: quick-260908-syn
plan: 01
subsystem: main / GitService + respaldo en la nube
tags: [sync, push, fetch, merge, github, non-destructive]
requires:
  - "isomorphic-git fetch/merge/checkout (ya en uso)"
  - "diff3 (merge 3-way por líneas; dependencia transitiva de isomorphic-git, ahora explícita)"
provides:
  - "GitService.sync(dir, url, token): trae e integra la rama remota y después pushea"
  - "Evento IPC geode:git-pulled + GitApi.onPulled para recargar la UI tras traer cambios"
  - "push() del contrato devuelve { branch, oid, pulled }"
affects:
  - "src/main/services/git.ts"
  - "src/main/index.ts"
  - "src/shared/ipc.ts"
  - "src/preload/index.ts"
  - "src/renderer/src/App.tsx"
  - "src/main/types/diff3.d.ts"
  - "package.json"
tech-stack:
  added: ["diff3@0.0.3 (explícita)"]
  patterns:
    - "fetch de una sola rama + merge-base para decidir no-op / fast-forward / merge 3-way"
    - "commit de lo pendiente ANTES de checkout force (edición no destructiva)"
    - "mergeDriver custom: diff3, conflictos a favor de local + copia '(versión de la nube)' versionada"
    - "fallback conservador (árbol local, dos padres) cuando isomorphic-git no puede mergear"
key-files:
  created:
    - "src/main/types/diff3.d.ts"
  modified:
    - "src/main/services/git.ts"
    - "src/main/index.ts"
    - "src/shared/ipc.ts"
    - "src/preload/index.ts"
    - "src/renderer/src/App.tsx"
    - "package.json"
decisions:
  - "Se sincroniza solo la rama actual (no fetchAll): es lo que se pushea y evita traer ramas de trabajo de otros dispositivos"
  - "Conflicto en la misma línea: la nota conserva lo local (más lo limpio de la nube) y la versión completa de la nube queda como '<nota> (versión de la nube).md'; no hay UI de resolución 3-way todavía"
  - "delete/modify y criss-cross: merge conservador (gana lo local, la nube queda como ancestro en el historial) en vez de fallar para siempre"
  - "El auto-respaldo también sincroniza; si trajo cambios avisa al renderer por evento (el disco cambió por debajo de los editores)"
metrics:
  duration: 45 min
  completed: 2026-09-08
---

# Quick 260908-syn: Sincronizar con la nube: traer e integrar antes de pushear Summary

El respaldo en la nube ahora **trae e integra** lo que haya en el remoto antes de subir. Antes, `push` a secas era rechazado (non-fast-forward) apenas otro dispositivo había pusheado, y el cuaderno quedaba trabado con "No se pudo respaldar ahora".

## What Was Built

**`GitService.sync` (`git.ts`)**
- `fetchBranchTip`: fetch de SOLO la rama actual (sin tags). `NotFoundError` = la rama no existe en la nube → null (repo vacío o rama nueva); red/auth se propagan.
- Decisión por merge-base: nube igual/atrás → solo push; local ancestro de la nube → fast-forward (`writeRef`); divergencia → `mergeRemote`.
- Antes de tocar el working dir se commitea lo pendiente ("Cambios antes de sincronizar"); luego `checkout force` materializa el tip nuevo.
- `mergeRemote`: `git.merge` con `mergeDriver` custom sobre `diff3` — hunks limpios de ambos lados se combinan; en conflicto gana local y la versión completa de la nube se escribe como `<nota> (versión de la nube).md` (numerada si ya existe) y se versiona en un commit propio. Si isomorphic-git lanza `MergeNotSupportedError`/`MergeConflictError` (criss-cross, delete/modify), merge conservador: árbol local con padres `[local, nube]`.
- Devuelve `{ branch, oid, pulled, cloudCopies }`.

**Main (`index.ts`)**
- `IPC.gitPush` y `autoPushAfterCommit` llaman a `sync`. Si `pulled` y la bóveda sincronizada sigue abierta, se emite `IPC.gitPulled` a las ventanas vivas.

**Contrato y preload (`ipc.ts`, `preload/index.ts`)**
- `push()` → `{ branch, oid, pulled }`; nuevo `git.onPulled(cb)` (mismo patrón que `window.onMaximizeChange`).

**Renderer (`App.tsx`)**
- `reloadAfterPull`: `refreshTree` + `keepOnly` de panes + `bumpAll` (cada panel persiste lo pendiente antes de releer) + toast "Se trajeron cambios de la nube".
- `doPush` hace `flushAll` antes (lo tipeado se versiona antes de integrar) y recarga si `pulled`; suscripción a `onPulled` para el auto-respaldo.

## Verification

- `npm run typecheck` — verde (node + web).
- `npm run build` — verde.
- Prueba de integración sin red (scratch, `sync.test.cjs` sobre el bundle esbuild de `git.ts`, stub de fetch/push con un repo copia como "nube"): 7 escenarios verdes — nube vacía, local adelante, nube adelante (ff), nube adelante + borrador sin versionar (sobrevive), divergencia limpia (diff3 combina), conflicto misma línea (copia de la nube + segundo sync no-op), borrada local/editada en nube (fallback sin lanzar).
- Pendiente de validación en vivo contra GitHub (fetch/push reales con token): no se ejecutó para no pushear al repo del usuario sin pedirlo.

## Deviations from Plan

None.

## Commits

- (sin commit: cambios entregados en el working tree)
