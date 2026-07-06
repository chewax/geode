---
phase: 05-advanced-mode-capa-0-polish
plan: 03
subsystem: ui
tags: [react, electron, git, advanced-mode, command-palette, accessibility, typescript]

# Dependency graph
requires:
  - phase: 05-advanced-mode-capa-0-polish
    provides: "window.geode.advanced.get()/set() + AdvancedConfig (Plan 01)"
  - phase: 05-advanced-mode-capa-0-polish
    provides: "DiffView con props opcionales date?/label? (Plan 02)"
provides:
  - "Estado App `advanced` + `refreshAdvanced` (lee window.geode.advanced.get(), fallback false)"
  - "Gating advanced && de las 5 superficies git del toolbar (GitBranchPlus, GitMerge, boton arbol, VersionGraph, BranchSwitcher)"
  - "Comandos git de la paleta (toggleGraph/createBranch/merge/push) registrados solo en Modo Avanzado; categoria 'Git' ausente en default"
  - "statusLabel(status, githubConnected, pushCount) -> descriptor {text, Icon, spin} con las 4 frases STAT-01 y sin hora"
  - "Popover GitHub y boton de sincronizacion humanizados (sin 'commit'/'push')"
  - "<DiffView date label /> cableado desde graph.commits via entryLabel/relativeDate"
affects: [05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Efecto keyed en `advanced` que registra/dispone comandos git de la paleta (gating por registro, no por isEnabled)"
    - "statusLabel devuelve descriptor icono+texto (Lucide) en vez de string con glyph"
    - "Resolucion de metadata humana (fecha+nombre) por oid en el render de DiffView, con fallback sin hash"

key-files:
  created: []
  modified:
    - src/renderer/src/App.tsx

key-decisions:
  - "Comandos git de la paleta salen del montaje unico y viven en un useEffect deps [advanced, host]: en default no estan registrados ni son invocables y la categoria 'Git' no existe"
  - "Gating por registro (no por isEnabled) porque CommandPalette lista los comandos deshabilitados y renderiza su category como texto visible"
  - "statusLabel firma cambiada a (status, githubConnected, pushCount); se elimino el estado savedAt (ya sin lectura) para respetar noUnusedLocals"
  - "DiffView date usa relativeDate(commit.timestamp) (fecha humana relativa) y label usa entryLabel(commit, graph.tags)"

patterns-established:
  - "Fail-safe de configuracion: refreshAdvanced cae a false en catch (T-05-06), nunca revela superficies git ante error IPC"

requirements-completed: [ADV-01, ADV-03, STAT-01, DIFF-01, DIFF-02]

# Metrics
duration: 15 min
completed: 2026-07-05
---

# Phase 5 Plan 3: Integracion del Modo Avanzado en App Summary

**App.tsx consume el flag `advanced` (Plan 01) para ocultar todas las superficies git en el default — botones del toolbar, VersionGraph, BranchSwitcher Y los comandos git de la paleta de comandos (que dejan de estar registrados/invocables y sin categoria 'Git') — humaniza las fugas residuales del popover/tooltip, reescribe el indicador de guardado a las 4 frases STAT-01 con icono Lucide sin hora, y cablea fecha+nombre humanos al DiffView (Plan 02).**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-05
- **Completed:** 2026-07-05
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- **ADV-03 (toolbar):** cinco render-guards `advanced &&` sobre GitBranchPlus (Crear rama), GitMerge (Integrar rama), el boton "Árbol de versiones" (antes siempre visible), el modal `VersionGraph` y el `BranchSwitcher` de la statusbar; todos conservan sus guards previos (`hasHead`, `canMerge`, `graphOpen && graph`, `graph && graph.head.oid`).
- **ADV-03 (paleta):** los comandos de superficie git `core.toggleGraph`/`core.createBranch`/`core.merge`/`core.push` salieron del array de montaje `cmds` (deps `[]`) y se registran en un `useEffect` dedicado con deps `[advanced, host]` que hace `dispose()` al apagar el flag o desmontar. En default no estan registrados ni listados y la categoria literal 'Git' no aparece en la paleta.
- **ADV-01:** popover GitHub reescrito (`Sin pushear · N commit(s)` → `Cambios sin subir · N`; `Auto-push` → `Subida automática`) y boton de sincronizacion (`title`/`aria-label` `Push a GitHub` → `Subir cambios a la nube`), conservando icono `UploadCloud` y `push-badge`. Cero fugas visibles en modo default.
- **STAT-01:** `statusLabel` reescrito a `(status, githubConnected, pushCount)` devolviendo `{ text, Icon, spin }` con las 4 frases exactas (`Guardando…`/`Todo en la nube`/`Guardado en este dispositivo`/`Guardado`), iconos Lucide `Loader2`(.spin)/`Cloud`/`HardDrive`/`Check`, color heredado `--muted`, sin `toLocaleTimeString`. Se elimino el estado muerto `savedAt`.
- **DIFF-01/02:** `<DiffView>` recibe `date={relativeDate(commit.timestamp)}` y `label={entryLabel(commit, graph.tags)}` resueltos por `diffOid` desde `graph.commits`; si el commit no esta en el grafo no se pasan props y DiffView usa su fallback humano sin hash.
- **Carga del flag:** estado `advanced` + `refreshAdvanced` (useCallback con try/catch → false), invocado en el useEffect de montaje (deps actualizadas) y en el `onClose` de `<SettingsModal>`, replicando el patron de `aiConfig`/`githubCfg`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Cargar flag advanced y gatear superficies git (toolbar + paleta)** - `673951f` (feat)
2. **Task 2: Humanizar fugas git residuales del modo default (ADV-01)** - `cb6fb66` (feat)
3. **Task 3: Estado de guardado humano (STAT-01) + wiring de metadata al DiffView** - `43c56a4` (feat)

**Plan metadata:** (docs commit for this SUMMARY)

## Files Created/Modified

- `src/renderer/src/App.tsx` - Estado/carga de `advanced`, gating de 5 superficies del toolbar, efecto keyed que registra los comandos git de la paleta solo en avanzado, humanizacion del popover GitHub y del boton de sincronizacion, reescritura de `statusLabel` a descriptor icono+texto, eliminacion del estado `savedAt`, y wiring de `date`/`label` humanos al `<DiffView>`.

## Decisions Made

- **Gating de la paleta por registro, no por `isEnabled`:** `CommandPalette.tsx` lista los comandos deshabilitados (con clase `.disabled`) y renderiza `cmd.category` como texto visible, por lo que `isEnabled` no basta para ocultarlos ni para esconder la categoria 'Git'. Se sacan del registro por completo cuando `advanced === false`.
- **`relativeDate` para la fecha del diff:** el UI-SPEC deja el formato de fecha "a discrecion, humano y sin hash". Se eligio `relativeDate(commit.timestamp)` (p. ej. "hace 2 horas") por coherencia con el `TimeTravelBanner`, que ya lo usa.
- **Eliminacion de `savedAt`:** al quitar la hora literal del indicador, el estado `savedAt` quedaba sin ninguna lectura. Con `noUnusedLocals` activo eso rompe el typecheck, asi que se removio la declaracion y su `setSavedAt`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Humanizada la fila "Auto-push" del popover GitHub**
- **Found during:** Task 2 (barrido de fugas ADV-01)
- **Issue:** El plan afirmaba que la fila `Auto-push` del popover ya estaba "libre de jerga", pero `Auto-push` es texto VISIBLE en modo default (el status-item Cloud no se gatea) y contiene la palabra git `push`. Esto viola el criterio duro de ADV-01 ("ningun hit puede ser texto visible en modo default").
- **Fix:** `<span>Auto-push</span>` → `<span>Subida automática</span>`.
- **Files modified:** `src/renderer/src/App.tsx`
- **Verification:** `grep` de fugas visibles/title/aria-label en default = 0.
- **Commit:** `cb6fb66`

**Total deviations:** 1 auto-fixed (1 x Rule 2). **Impact:** cierra una fuga ADV-01 que el plan pasaba por alto; sin cambio arquitectonico ni de alcance.

## Leak Audit — Clasificacion (ADV-01)

`grep -rniE "\b(commit|branch|merge|push|HEAD)\b" src/renderer/src/App.tsx` → **37 hits totales**.

**Hits de TEXTO VISIBLE / `title` / `aria-label` renderizados en modo default: 0.** (Verificado con filtro adicional sobre `<span>`/`<b>`/`title=`/`aria-label=` con palabra git → sin resultados.)

Los 37 hits restantes se clasifican como:
- **(a) Identificadores de codigo / API no visibles:** llamadas `window.geode.git.commit()`/`git.push()`, `hasHead`, `headOidRef`, `canMerge`, claves del `commandApi` (`createBranch`/`merge`/`push`), y `out.push(...)` (metodo de Array).
- **(a) Clases CSS:** `tb-btn icon push`, `push-badge` (no son texto renderizado).
- **(a) Comentarios en espanol:** describen la logica (commit/checkout/merge/HEAD como terminos tecnicos), no se renderizan.
- **(b) Render gateado por `advanced`:** el `BranchSwitcher` (`advanced && graph && graph.head.oid`) y los titulos de los comandos git de la paleta (`Push a GitHub`, `Integrar rama a su base`) que solo se registran dentro del `useEffect` con deps `[advanced, host]` — nunca presentes en default.

## Issues Encountered
None.

## Deferred Issues
None de esta ejecucion. (El plan 02 dejo anotada la regla CSS muerta `.diff-ln.hunk`, fuera de scope aqui.)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04 (UAT) debe verificar manualmente: default sin jerga git incluida la paleta Ctrl+P; toggle on revela grafo/ramas/switcher y los comandos git de la paleta; indicador con las 4 frases; diff con encabezado humano.
- El flag se recarga al cerrar Ajustes (`onClose` de `<SettingsModal>`), asi que el toggle del Plan 01 surte efecto sin reiniciar.

## Self-Check: PASSED
- `src/renderer/src/App.tsx` existe en disco (modificado).
- Commits presentes: `673951f` (Task 1), `cb6fb66` (Task 2), `43c56a4` (Task 3).
- `npm run typecheck` (node + web) pasa sin errores.
- `refreshAdvanced` presente; 5 render-guards `advanced &&`; comandos git en efecto keyed `[advanced, host]`.
- Leak audit: 0 hits de texto visible/title/aria-label en modo default.

---
*Phase: 05-advanced-mode-capa-0-polish*
*Completed: 2026-07-05*
