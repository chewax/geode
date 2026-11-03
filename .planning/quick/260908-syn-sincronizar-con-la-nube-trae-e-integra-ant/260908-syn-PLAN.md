---
phase: quick-260908-syn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/services/git.ts
  - src/main/types/diff3.d.ts
  - src/main/index.ts
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/renderer/src/App.tsx
  - package.json
autonomous: true
requirements: [SYNC-01]
must_haves:
  truths:
    - "Si otro dispositivo pusheó commits, el respaldo trae e integra esos cambios y después sube: el push ya no se rechaza (non-fast-forward)"
    - "Si la nube está adelante y lo local no cambió, la rama avanza por fast-forward sin commit extra y el disco refleja lo de la nube"
    - "Si divergieron, se integra con merge 3-way por líneas (diff3); los cambios en distintas partes de una misma nota se combinan"
    - "Si una nota cambió en el mismo lugar en los dos lados, la nota conserva lo local y la versión de la nube queda al lado como '<nota> (versión de la nube).md' — ninguna de las dos se pierde"
    - "Lo que había sin versionar se commitea ANTES de tocar el working dir; nada sin commit se pierde en la integración"
    - "Tras traer cambios (manual o auto-respaldo), la UI recarga árbol y notas abiertas y avisa con un toast"
  artifacts:
    - path: "src/main/services/git.ts"
      provides: "GitService.sync (fetch → integrar (ff / merge diff3 / fallback conservador) → push) + fetchBranchTip + mergeRemote"
      contains: "async sync("
    - path: "src/main/index.ts"
      provides: "gitPush y autoPushAfterCommit usan sync; evento geode:git-pulled al renderer cuando el disco cambió"
      contains: "gitService.sync"
    - path: "src/renderer/src/App.tsx"
      provides: "reloadAfterPull (árbol + panes + editores + toast), suscripción a git.onPulled, flushAll antes del push manual"
      contains: "reloadAfterPull"
  key_links:
    - from: "src/main/index.ts"
      to: "src/main/services/git.ts"
      via: "gitService.sync(root, url, token)"
    - from: "src/main/index.ts"
      to: "src/renderer/src/App.tsx"
      via: "webContents.send(IPC.gitPulled) → window.geode.git.onPulled"
---

# Quick 260908-syn: Sincronizar con la nube: traer e integrar antes de pushear

## Problema

`GitService.push` hacía `git.push` a secas. Apenas otro dispositivo (u otra edición en GitHub) avanzaba la rama remota, GitHub rechazaba el push como non-fast-forward y el respaldo quedaba trabado para siempre con "No se pudo respaldar ahora".

## Tareas

1. **`GitService.sync`** (git.ts): fetch de la rama actual (solo esa, sin tags) → decidir por merge-base: nada que traer / fast-forward / merge 3-way → `checkout force` para materializar → push. Antes de tocar el working dir se commitea lo pendiente. Conflictos por línea: gana local, copia completa de la nube al lado + commit propio. Si isomorphic-git no puede mergear (varias bases, delete/modify), merge conservador con el árbol local y ambos padres.
2. **Main** (index.ts): `gitPush` y `autoPushAfterCommit` pasan a `sync`; si `pulled`, se emite `geode:git-pulled` a las ventanas vivas.
3. **Contrato + preload** (ipc.ts, preload): `push()` devuelve `pulled`; nuevo `git.onPulled(cb)`.
4. **Renderer** (App.tsx): `reloadAfterPull` (refreshTree + keepOnly + bumpAll + toast), suscripción a `onPulled`, `flushAll` antes del push manual.
5. **Dependencia**: `diff3@0.0.3` explícita (ya era transitiva de isomorphic-git) + `src/main/types/diff3.d.ts`.
