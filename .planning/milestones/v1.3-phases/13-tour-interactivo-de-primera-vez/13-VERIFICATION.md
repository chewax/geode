---
phase: 13-tour-interactivo-de-primera-vez
verified: 2026-07-09T00:00:00Z
status: passed
human_uat_result: passed — human UAT passed 2026-07-09 (tour de primera vez: spotlight, velo no-cierra, re-lanzar, no reaparece)
score: 4/4 must-haves verified (source-level)
overrides_applied: 0
human_verification:
  - test: "Crear un cuaderno nuevo (flujo Fase 11) y confirmar que el recorrido aparece automáticamente tras entrar al cuaderno, no al arrancar la app."
    expected: "El TourOverlay se monta con el paso 1 ('Escribí sin miedo') apenas se crea el primer cuaderno; en un arranque posterior de la app (con el cuaderno ya existente) el tour NO aparece solo."
    why_human: "Timing de disparo y comportamiento post-reinicio; requiere ejecutar la app real (Electron) y reiniciarla, no verificable por grep estático."
  - test: "Recorrer los 4 pasos (escribir → guardar → respaldar → historial) verificando que el spotlight recorta visualmente el control real y el cartel se posiciona sin solaparse ni salirse de pantalla (auto-flip)."
    expected: "Cada paso muestra 'Paso N de M' correcto, el anillo de acento rodea el botón real correspondiente (editor, Guardar versión, botón de respaldo, Timeline), y el cartel hace auto-flip si no entra en el viewport."
    why_human: "Posicionamiento visual (getBoundingClientRect, cálculo de auto-flip/clamp) solo se confirma renderizando en un viewport real."
  - test: "Probar Saltar, Anterior, Siguiente, Listo y Esc en distintos puntos del recorrido."
    expected: "Saltar y Esc cierran el tour y lo marcan visto en cualquier paso; Anterior/Siguiente navegan sin trabarse; 'Listo' aparece solo en el último paso y cierra marcando visto."
    why_human: "Interacción de teclado/mouse en tiempo real; el código está correctamente cableado (verificado por lectura) pero el comportamiento en vivo no se prueba por grep."
  - test: "Tras saltar o terminar el tour, reiniciar la app y confirmar que no vuelve a aparecer solo. Luego relanzarlo manualmente desde la paleta ('Ver el recorrido guiado') y desde el botón HelpCircle de la ActivityBar."
    expected: "El tour queda 'seen' y no se auto-repite; ambas superficies de re-lanzamiento reproducen el recorrido completo desde el paso 1 sin resetear el estado 'seen'."
    why_human: "Persistencia cruzando reinicios reales de la app; requiere cerrar/reabrir Electron."
  - test: "Colapsar manualmente la sección 'LÍNEA DE TIEMPO' del sidebar y luego correr el tour hasta el paso 'historial'."
    expected: "El paso expande automáticamente la sección colapsada (o ancla a su cabecera) antes de mostrar el spotlight, sin crashear ni mostrar un spotlight vacío."
    why_human: "Requiere estado de UI en vivo (colapso persistido en localStorage) y observar el re-render/expand en tiempo real."
  - test: "Cerrar la app (o simular cierre) a mitad del tour (por ejemplo tras el paso 2) y reabrirla con el cuaderno ya creado."
    expected: "El tour reaparece EXACTAMENTE una vez desde el paso 1; si se vuelve a cerrar a mitad, ya no reaparece solo (queda 'seen')."
    why_human: "Requiere simular el ciclo de vida real de la app (proceso main relanzado) para observar la recuperación tri-state en la práctica."
  - test: "Con Modo Avanzado activado, correr el tour completo y confirmar visualmente que ningún paso resalta los botones de rama/merge/árbol de versiones."
    expected: "El spotlight solo recorre editor, Guardar versión, botón de respaldo y Timeline; los controles de Modo Avanzado nunca reciben anillo ni cartel."
    why_human: "Confirmación visual en runtime; el código fuente ya demuestra por grep que ningún data-tour vive dentro de un bloque `advanced &&`, pero la verificación visual completa el gate humano."
---

# Phase 13: Tour interactivo de primera vez Verification Report

**Phase Goal:** Tras crear su primer cuaderno, un recorrido guiado y liviano le muestra al usuario los gestos esenciales (escribir → guardar → respaldar → ver historial) señalando botones reales, sin poder atascarlo, sin repetirse solo y sin exponer superficies de Modo Avanzado.
**Verified:** 2026-07-09
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap Success Criteria) | Status | Evidence |
|---|---|---|---|
| 1 | Después de crear el primer cuaderno (no al arrancar), aparece un recorrido propio (spotlight + cartel) de ≤5 pasos que resalta botones reales y explica escribir → guardar → respaldar → ver historial. | ✓ VERIFIED (source) | `App.tsx:502-538` `createLocalVault` calls `tour.startFirstRun()` only when `tour.tourState === 'unseen'`, AFTER `adoptVault`/`openNote`. `tour/steps.ts` defines exactly 4 `TOUR_STEPS` (escribir/guardar/respaldo/historial) with LOCKED copy. `TourOverlay.tsx` is a real `createPortal` spotlight+card. No trigger exists at app boot (`useTour` init effect only auto-relaunches on 'started' recovery, gated by `vaultReady`, never on fresh 'unseen'). |
| 2 | El recorrido muestra "Paso N de M", se puede saltar en cualquier momento y se puede volver a lanzar desde Ayuda. | ✓ VERIFIED (source) | `TourOverlay.tsx:224-226` renders `Paso {stepIndex+1} de {total}`; "Saltar" button rendered on all steps except last (`!isLast`), wired to `onSkip`. Re-launch wired from TWO surfaces: palette command `core.tour` (`App.tsx:1120`, category "Ayuda") and `ActivityBar.tsx` `HelpCircle` button (now enabled, `onClick={onShowTour}` → `tour.launch()`, `App.tsx:1372`). |
| 3 | Una vez visto, el recorrido queda marcado como visto y no vuelve a aparecer solo en arranques posteriores. | ✓ VERIFIED (source) | `useTour.ts` `close()` persists `'seen'` via `window.geode.tour.set('seen')` on skip/finish/Esc, idempotent (`tourStateRef.current !== 'seen'` guard). Main handler `IPC.tourSet` (`main/index.ts:972-983`) whitelists `['unseen','started','seen']`, never persists raw renderer input. `getTourState`/`setTourState` (`settings.ts:293-302`) persist to `settings.json` under `tour.state`, default `'unseen'`, survives restarts (file-backed, not in-memory). |
| 4 | Si un botón del paso todavía no está en pantalla, el paso se adapta sin romperse (sin spotlight sobre la nada), y el recorrido nunca resalta funciones de Modo Avanzado (rama/merge/grafo). | ✓ VERIFIED (source) | `TourOverlay.tsx` `readAnchorRect`/measurement effect: null or 0-area rect → `centered = !rect \|\| isHuge(rect)` → card renders centered, no `.tour-spotlight` div at all (conditional `{spotlightStyle && ...}`), never crashes on null rect. Collapsed Timeline section: auto-click of `.sidebar-section-toggle[aria-expanded="false"]` + `requestAnimationFrame` re-measure. Grep confirms zero `data-tour` attributes inside any `advanced &&` block in `App.tsx` (branch/merge/graph buttons at lines 1303, 1313, 1332, 1486, 1538 have no `data-tour`); only `escribir`/`guardar`/`historial`/`respaldo` anchors exist, all in Capa 0 surfaces. |

**Score:** 4/4 truths verified at source level (typecheck + build green; all wiring traced by reading actual code, not SUMMARY claims).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/shared/ipc.ts` | `TourState`, `TourSnapshot`, `TourApi`, `tour: TourApi` in `GeodeApi`, `IPC.tourGet`/`tourSet` channels | ✓ VERIFIED | Lines 84-85, 347-367, 521. Tri-state `'unseen'\|'started'\|'seen'`, never null (unlike `BackupOnboarding`). |
| `src/main/services/settings.ts` | `settings.tour.state` block + `getTourState`/`setTourState` | ✓ VERIFIED | Lines 73-80 (Settings shape), 292-302 (functions). Default `?? 'unseen'`; immutable spread merge preserves sibling keys. |
| `src/main/index.ts` | Handlers for `IPC.tourGet`/`tourSet` with enum coercion | ✓ VERIFIED | Lines 967-983. Whitelist `['unseen','started','seen']`; invalid input returns current state unmutated. |
| `src/preload/index.ts` | `tour: { get, set }` CommonJS bridge | ✓ VERIFIED | Lines 79-82. File remains `.cjs`-compiled CommonJS per project constraint. |
| `src/renderer/src/tour/steps.ts` | `TourStep` interface + `TOUR_STEPS` (4 steps, LOCKED copy, Lucide icons) | ✓ VERIFIED | 60 lines. Copy verbatim matches UI-SPEC lines 104-111 (title/body per step). Icons `PencilLine/Save/Cloud/History`. |
| `src/renderer/src/TourOverlay.tsx` | Portal spotlight + coach-mark card, degradation | ✓ VERIFIED | 255 lines. `createPortal` to `document.body`; `readAnchorRect`, `isHuge` (70% viewport threshold), `computeCardPos` with auto-flip + clamp. No `data-tour=` literal (uses `ANCHOR_ATTR` constant + `anchorSelector()` helper) — confirms TourOverlay only reads anchors, doesn't define them. |
| `src/renderer/src/tour/useTour.ts` | Tri-state hook: launch/startFirstRun/next/prev/skip/finish, recovery, Esc | ✓ VERIFIED | 133 lines. `oneShotRef` guards recovery from double-firing; `tourStateRef` mirror for stable callbacks; global `Escape` keydown listener gated on `active`. |
| `src/renderer/src/App.tsx` | Trigger in `createLocalVault`, `!tour.active` gate on BackupCard, palette command, anchors, TourOverlay mount | ✓ VERIFIED | Trigger: 502-538. Gate: 1359 (`!tour.active`). Palette: 1120 (`id: 'core.tour'`, via `tourRef.current()`). Anchors: 1327 (guardar), 1422 (historial, inside SidebarSection for auto-expand), 1462 (escribir, `.pane-root`). Mount: 1778-1787 (`{tour.active && <TourOverlay .../>}`). |
| `src/renderer/src/ActivityBar.tsx` | `onShowTour` prop + enabled `HelpCircle` button | ✓ VERIFIED | `disabled` removed; `title`/`aria-label` = "Ver el recorrido guiado"; `onClick={onShowTour}`. |
| `src/renderer/src/BackupButton.tsx` | `data-tour="respaldo"` reused, always mounted | ✓ VERIFIED | Line 90, unconditional (Fase 12 artifact, not re-implemented). |
| `src/renderer/src/index.css` | `.tour-overlay`/`.tour-spotlight`/`.tour-card*`/`.tour-progress`/`.tour-actions` classes | ✓ VERIFIED | Lines 3092-3166. z-index 300 (overlay/spotlight) / 301 (card), reuses `--panel-2`/`--border`/`--accent`/`--muted`, radius 8px, shadow `0 8px 24px rgba(0,0,0,0.45)`, backdrop `rgba(0,0,0,0.55)` — no new tokens introduced. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `preload/index.ts` | `main/index.ts` | `ipcRenderer.invoke(IPC.tourGet/tourSet)` | ✓ WIRED | Direct match, handlers registered. |
| `main/index.ts` | `main/services/settings.ts` | `getTourState`/`setTourState` | ✓ WIRED | Imported and called in both handlers. |
| `TourOverlay.tsx` | `tour/steps.ts` | `import type { TourStep } from './tour/steps'` | ✓ WIRED | Confirmed import line 4. |
| `TourOverlay.tsx` | `document.body` | `createPortal` | ✓ WIRED | `createPortal(overlay, document.body)` line 254, 3 total `createPortal`-related references (import + 2 usages incl. component body). |
| `App.tsx` | `tour/useTour.ts` | `useTour(!!vault)` | ✓ WIRED | Line 96. |
| `App.tsx` | `window.geode.tour` | via `useTour` internals (`get`/`set`) | ✓ WIRED | `useTour.ts` calls `window.geode.tour.get()`/`.set()` directly; App only consumes the hook's public surface. |
| `App.tsx` | `TourOverlay.tsx` | conditional mount on `tour.active` | ✓ WIRED | Line 1778. |
| `App.tsx` (BackupCard) | `useTour` state | `!tour.active` gate | ✓ WIRED | Line 1359, confirmed alongside `backupOnboarding === 'invitado'` condition — tour and BackupCard never render simultaneously. |
| `ActivityBar.tsx` | `App.tsx` | `onShowTour` prop → `tour.launch()` | ✓ WIRED | Prop required in `ActivityBarProps`; passed at call site line 1372. |

### Data-Flow Trace (Level 4)

Not applicable in the DB/API sense — this phase is pure client-side state (settings.json persistence + DOM measurement), already traced end-to-end above (IPC round-trip → file write → re-read on next `get()`). No hollow-prop or static-fallback pattern found: `TourOverlay` receives `steps={TOUR_STEPS}` (real 4-item array, not `[]`), and anchor rects come from live `getBoundingClientRect()` calls, not hardcoded coordinates.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| TypeScript compiles clean (node + web) | `npm run typecheck` | 0 errors | ✓ PASS |
| Full electron-vite build (main+preload+renderer bundles) | `npm run build` | `✓ built in 5.17s`, no errors | ✓ PASS |
| No `data-tour=` inside `advanced &&` blocks | manual grep of `App.tsx` around each `advanced &&` occurrence | 0 matches | ✓ PASS |
| Commits referenced in SUMMARYs exist in history | `git log --oneline -1 <hash>` for all 7 commits | All 7 found | ✓ PASS |

This project has no test runner (per CLAUDE.md/PROJECT.md); typecheck+build green is the automated verification ceiling. Visual/interactive behavior (spotlight positioning, auto-flip, timing of the trigger, tri-state recovery across real app restarts) cannot be exercised by static analysis and is deferred to human UAT below.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| TOUR-01 | 13-02, 13-03 | TourOverlay propio, ≤5 pasos, dispara tras crear el primer cuaderno | ✓ SATISFIED | 4 steps, trigger in `createLocalVault`, no boot-time trigger. |
| TOUR-02 | 13-01, 13-03 | Progreso "Paso N de M", Saltar, re-lanzable desde Ayuda, persiste visto, no auto-repite | ✓ SATISFIED | Progress label, Saltar button, palette + HelpCircle re-launch, tri-state persistence with 'seen' terminal state. |
| TOUR-03 | 13-02, 13-03 | Degradación grácil sin romper; nunca ancla Modo Avanzado | ✓ SATISFIED | Null/0-rect → centered card, no spotlight div; grep confirms zero `data-tour` inside `advanced &&` blocks. |

REQUIREMENTS.md marks all three as `[x]` complete and maps them to Phase 13 in the requirements table — consistent with source evidence, not merely trusted.

### Anti-Patterns Found

No `TODO`/`FIXME`/`XXX`/`HACK`/`TBD`/placeholder markers found in any of the 10 files created/modified by this phase (`ipc.ts`, `settings.ts`, `index.ts`, `preload/index.ts`, `tour/steps.ts`, `TourOverlay.tsx`, `tour/useTour.ts`, `App.tsx`, `ActivityBar.tsx`, `BackupButton.tsx`). Three pre-existing `TODO` comments exist in `main/index.ts` (lines 787, 873, 897) but belong to the Fase 12 backup-error-mapping surface, not touched by this phase's tour work.

No empty-implementation patterns (`return null`/`{}`/`[]`/`=> {}`), no hardcoded-empty props, no console.log-only handlers found in the tour surfaces.

### Human Verification Required

The tour is an inherently visual/interactive first-run flow. Source-level verification confirms all wiring is correct and complete, but the following require running the actual Electron app (per project's typecheck+build+UAT model — no test runner exists):

1. **Disparo tras crear cuaderno, no al arrancar** — crear un cuaderno nuevo y confirmar que el tour aparece; reiniciar la app y confirmar que NO reaparece solo.
2. **Recorrido visual de los 4 pasos** — spotlight cae sobre el control correcto en cada paso, cartel se posiciona con auto-flip sin salirse de pantalla.
3. **Controles Saltar/Anterior/Siguiente/Listo/Esc** — nunca se traba, cierra siempre.
4. **Re-lanzamiento** — desde la paleta y desde HelpCircle, sin resetear "visto".
5. **Timeline colapsada** — se expande automáticamente en el paso "historial".
6. **Recuperación "reaparece una vez"** — cierre a mitad del tour, reabrir la app, confirmar reaparición única.
7. **Modo Avanzado ON** — confirmar visualmente que ningún paso resalta rama/merge/grafo.

Full test scripts are in the frontmatter above and mirror `13-VALIDATION.md`'s "Manual-Only Verifications" table.

### Gaps Summary

No gaps found at the source level. All 4 roadmap Success Criteria, all 3 requirements (TOUR-01/02/03), and all must-haves declared across the three PLAN frontmatters are backed by real, wired, non-stub code — verified by reading the actual files (not SUMMARY.md narrative). `npm run typecheck` and `npm run build` are both green. The phase is code-complete; what remains is the human UAT pass that this project's process (no test runner) always requires as the final gate before merging a UI-heavy phase.

---

*Verified: 2026-07-09*
*Verifier: Claude (gsd-verifier)*
