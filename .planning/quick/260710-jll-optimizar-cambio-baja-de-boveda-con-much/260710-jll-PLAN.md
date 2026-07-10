---
phase: quick
plan: 260710-jll
type: execute
wave: 1
depends_on: []
files_modified:
  - src/main/services/git.ts
  - src/main/index.ts
autonomous: true
requirements: [PERF-VAULT-SWITCH]
must_haves:
  truths:
    - "Cambiar de bóveda con muchos archivos y sin cambios reales no re-hashea todo el contenido: reutiliza oids cacheados por (size, mtime) salvo en la ventana racy."
    - "Una edición del mismo tamaño en el mismo segundo que el escaneo que pobló el cache SIEMPRE se re-hashea y se detecta (garantía anti racy-git intacta)."
    - "El cambio/baja de bóveda no bloquea la UI esperando el push de respaldo (fire-and-forget), pero el path de cierre (before-quit) sigue esperando el push dentro de su race de 3s."
    - "El commit agrega los archivos modificados en una sola llamada a git.add (array), no uno por uno."
  artifacts:
    - path: "src/main/services/git.ts"
      provides: "workBlobs con cache racy-safe + concurrencia acotada; commit con git.add batcheado"
    - path: "src/main/index.ts"
      provides: "snapshotIfChanged con push parametrizable; switch/remove no bloquean con push"
  key_links:
    - from: "GitService.workBlobs"
      to: "hashCache por dir"
      via: "stat + guarda racy (hashedAt - mtimeMs > margen)"
    - from: "snapshotIfChanged"
      to: "autoPushAfterCommit"
      via: "await condicional según opts.awaitPush"
---

<objective>
Optimizar el cambio/baja de bóveda en Geode cuando hay muchos archivos. Hoy cada
switch/baja corre `snapshotIfChanged` → `GitService.commit` → `pendingChanges` →
`workBlobs`, que lee y hashea el contenido COMPLETO de cada archivo EN SERIE
(O(bytes totales)) aunque no haya cambios; además espera el push por red y hace
`git.add` archivo por archivo.

Purpose: bajar la latencia del switch/baja de segundos a ~instantáneo en bóvedas
grandes SIN debilitar la garantía core anti racy-git ("nunca se pierde contenido").
Output: `workBlobs` con cache racy-safe + paralelismo acotado, `commit` con
`git.add` batcheado, y push no-bloqueante en switch/baja (quit sigue esperándolo).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@src/main/services/git.ts
@src/main/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cache racy-safe + paralelismo en workBlobs, y git.add batcheado</name>
  <files>src/main/services/git.ts</files>
  <action>
En `GitService`, agregar un campo privado `hashCache` (Map de `dir` → Map de
`ruta` → `{ size: number; mtimeMs: number; oid: string; hashedAt: number }`).
El cache es una optimización PURA: ante cualquier duda, re-hashear.

Reescribir `private async workBlobs(dir: string): Promise<Map<string, string>>`:
1. Recorrer el árbol recursivamente (readdir con withFileTypes) SOLO para juntar la
   lista de rutas de archivo (saltando IGNORED_TOP igual que hoy). Recorrer
   directorios es barato; no leer contenido en esta fase.
2. Para cada archivo hacer `stat` (de node:fs/promises, ya importado) y obtener
   size + mtimeMs. Buscar la entrada previa en el cache de este `dir`.
3. Reutilizar el oid cacheado SOLO si se cumplen TODAS: (a) existe entrada previa,
   (b) `size === prev.size`, (c) `mtimeMs === prev.mtimeMs`, y (d) la entrada NO cae
   en la ventana racy: `prev.hashedAt - prev.mtimeMs > RACY_MARGIN_MS` (constante
   local = 1000, espeja el manejo "racily clean" de git a 1s de resolución). Si
   falla cualquiera → re-leer con readFile + re-hashear con git.hashBlob, y registrar
   la nueva entrada con `hashedAt: Date.now()`.
   CRÍTICO (landmine de CLAUDE.md): la condición (d) fuerza a re-hashear cualquier
   archivo que fue (o pudo ser) escrito dentro de la ventana del escaneo que lo
   cacheó — así una edición del mismo tamaño en el mismo segundo NO se pierde. NO
   volver a statusMatrix ni confiar ciegamente en stats.
4. Ejecutar los stats+hash de los archivos con concurrencia ACOTADA (~16 en vuelo)
   en vez del loop serial: implementar un pool inline (índice compartido + N workers
   con Promise.all sobre la lista de rutas); no agregar dependencias.
5. Reemplazar el cache de este `dir` por SOLO las entradas observadas en esta corrida
   (reusadas conservan su hashedAt/mtimeMs/oid; re-hasheadas llevan hashedAt=ahora),
   para que el cache no crezca con archivos borrados.
Devolver el mismo Map ruta→oid que hoy (headBlobs y pendingChanges quedan iguales).

En `commit`, batchear los adds: recolectar las rutas de `changes` con `deleted===false`
y, si hay al menos una, hacer UNA sola llamada `git.add({ fs, dir, filepath: rutas })`
(isomorphic-git 1.38 acepta `filepath: string[]`). Los `git.remove` NO aceptan array:
dejarlos en el loop, uno por archivo borrado.

Comentarios en español; tipos de retorno explícitos en métodos.
  </action>
  <verify>
    <automated>cd /d/dev/Amethist && npx tsc --noEmit -p tsconfig.node.json</automated>
  </verify>
  <done>
`workBlobs` reutiliza oids cacheados por (size, mtime) fuera de la ventana racy y
re-hashea dentro de ella; corre con concurrencia acotada; `commit` hace un solo
`git.add` con array. Typecheck pasa. Revisado contra el escenario racy: archivo
editado al mismo tamaño en el mismo segundo del escaneo que lo cacheó → condición
(d) obliga re-hash → cambio detectado.
  </done>
</task>

<task type="auto">
  <name>Task 2: Push no-bloqueante en cambio/baja de bóveda (quit conserva el await)</name>
  <files>src/main/index.ts</files>
  <action>
Parametrizar `snapshotIfChanged` para no bloquear la UI con el push en los paths
de switch/baja, sin romper el path de cierre (que necesita el push dentro de su
race de 3s).

1. Cambiar la firma a `snapshotIfChanged(reason: string, allowAi: boolean, opts: { awaitPush?: boolean } = {})`.
   Default `awaitPush` = true (preserva el comportamiento actual del cierre y la cadencia).
2. En el cuerpo, donde hoy hace `if (oid) await autoPushAfterCommit(info.root)`:
   si `opts.awaitPush` es false, disparar fire-and-forget: `void autoPushAfterCommit(info.root)`
   (autoPushAfterCommit YA nunca lanza y tiene su propio try/catch, así que no
   necesita catch extra). Si es true, mantener el `await`.
3. En el handler `vaultSwitch` (~L417): `await snapshotIfChanged('cambio-de-boveda', false, { awaitPush: false })`.
4. En el handler `vaultRemove` (~L441): `await snapshotIfChanged('baja-de-boveda', false, { awaitPush: false })`.
5. NO tocar el path `before-quit` (~L1086) ni el de cadencia (~L309): siguen usando
   el default `awaitPush: true`, así el race de 3s del cierre sigue cubriendo el push.

Comentarios en español; actualizar el comentario de `snapshotIfChanged` para
documentar que switch/baja usan push fire-and-forget mientras el cierre lo espera.
  </action>
  <verify>
    <automated>cd /d/dev/Amethist && npx tsc --noEmit -p tsconfig.node.json</automated>
  </verify>
  <done>
switch y baja de bóveda commitean y devuelven sin esperar el push (UI no bloqueada
por red); before-quit y la cadencia mantienen el push awaited (race de 3s intacto).
Typecheck pasa.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p tsconfig.node.json` pasa (main + preload).
- Revisión manual de la lógica del cache contra el escenario racy (mismo tamaño,
  mismo segundo del escaneo) → debe forzar re-hash y detectar el cambio.
- La garantía core no se debilita: `pendingChanges`/`headBlobs`/`commit` siguen
  comparando oids reales de contenido vs HEAD.
</verification>

<success_criteria>
- Cambiar/dar de baja una bóveda grande sin cambios reales ya no re-hashea todo el
  contenido en serie: reutiliza el cache y paraleliza los que sí re-hashea.
- El switch/baja no espera al push por red.
- El commit agrega archivos con una sola llamada `git.add`.
- Cero regresión en la detección de cambios racy-git.
</success_criteria>

<output>
Create `.planning/quick/260710-jll-optimizar-cambio-baja-de-boveda-con-much/260710-jll-SUMMARY.md` when done
</output>
