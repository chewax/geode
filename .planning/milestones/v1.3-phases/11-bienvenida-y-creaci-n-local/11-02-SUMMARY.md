---
phase: 11-bienvenida-y-creaci-n-local
plan: 02
subsystem: renderer-welcome
tags: [electron, react, renderer, onboarding, welcome, lucide, ipc]

# Dependency graph
requires:
  - phase: 11-01
    provides: "window.geode.vault.createLocal(name, useCustomLocation?) (canal geode:vault-create-local): crea el cuaderno local, siembra Bienvenida.md y commitea la primera versión; null solo si se cancela el picker de 'Elegir otra ubicación'"
provides:
  - "Pantalla de bienvenida sin jerga en App.tsx (bloque if (!vault)): tagline 'Escribí sin miedo a perder nada.', input de nombre pre-rellenado, CTA 'Crear mi primer cuaderno', links secundarios"
  - "Flujo de creación local end-to-end en el renderer: createLocal → adoptVault → openNote('Bienvenida.md') con estados idle/creando/error"
affects: [12 (reconstruye el flujo GitHub/respaldo removido de esta pantalla), 13 (el tour recorre el cuaderno abierto con Bienvenida.md)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Callback ref estable (useCallback + guard ref) para seleccionar el texto del input una sola vez al montar, sin re-seleccionar en cada tecla"
    - "Cast puntual '{ WebkitAppRegion: 'no-drag' } as CSSProperties' porque -webkit-app-region no está tipado en csstype/React.CSSProperties"
    - "Boundary de error UI: catch muestra texto humano fijo (no el e.message crudo del main) — evita filtrar rutas/stack (T-11-07)"

key-files:
  created: []
  modified:
    - src/renderer/src/App.tsx

key-decisions:
  - "El flujo de creación fuerza openNote('Bienvenida.md') DESPUÉS de adoptVault (que resetea a panel vacío); el flujo 'Abrir una carpeta existente' NO lo fuerza"
  - "El escape 'Elegir otra ubicación' reusa el mismo handler con createLocal(name, true); un retorno null (picker cancelado) es un no-op silencioso sin error ni cambio de estado visible"
  - "Doble-submit mitigado deshabilitando CTA + input + links durante creating (T-11-08)"
  - "NewVaultDialog/newVaultOpen NO se eliminaron del módulo: siguen usados por el VaultSwitcher (onNew) — solo se removieron del bloque welcome"

requirements-completed: [ONB-01, ONB-02, ONB-03, COPY-01]

# Metrics
duration: 3min
completed: 2026-07-09
---

# Phase 11 Plan 02: Bienvenida sin jerga + flujo de creación local (renderer) Summary

**Reescritura del bloque `if (!vault)` de `App.tsx` como la nueva pantalla de bienvenida sin jerga (tagline "Escribí sin miedo a perder nada.", input pre-rellenado, CTA único y links secundarios) cableada end-to-end contra `window.geode.vault.createLocal`, encadenando `openNote('Bienvenida.md')` tras `adoptVault` para que el cuaderno abra SIEMPRE con la nota sembrada, con estados idle/creando/error.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-09T02:08:17Z
- **Completed:** 2026-07-09T02:11:xxZ
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Bloque welcome reescrito: se conservan `.welcome`/`.welcome-drag`/`<WindowControls/>`/`<h1>Geode</h1>`; nueva tagline "Escribí sin miedo a perder nada."; input `.text-input` (320px, `aria-label`, `autoFocus`, texto seleccionado al montar); CTA `.primary` "Crear mi primer cuaderno" con `NotebookPen`; links `.link-btn` "Elegir otra ubicación" (`FolderCog`) y "Abrir una carpeta existente" (`FolderOpen`). Enter en el input equivale al CTA.
- Eliminados de esta pantalla el botón "Clonar o crear en GitHub" y el render de `<NewVaultDialog>` (pasan a Fase 12). El módulo conserva `NewVaultDialog`/`newVaultOpen` porque el VaultSwitcher los sigue usando.
- Flujo de creación cableado: `createLocal(vaultName)` (happy path) → `adoptVault(info)` → `openNote('Bienvenida.md')`. El escape usa `createLocal(vaultName, true)` y trata `null` (picker cancelado) como no-op.
- Estados de interacción según UI-SPEC: Creating (CTA/input/links deshabilitados, `RefreshCw .spin` + "Creando tu cuaderno…") y Error (`.modal-error` con el texto humano fijo, CTA re-habilitado para reintentar).
- Íconos Lucide `NotebookPen` y `FolderCog` confirmados presentes en lucide-react 1.23.0 antes de importarlos; `RefreshCw`/`FolderOpen` reutilizados.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: Reescribir el bloque welcome (copy sin jerga + input + CTA + links)** - `eea80da` (feat)
2. **Task 2: Cablear el flujo de creación local (createLocal → adoptVault → openNote + estados)** - `fe77cbf` (feat)

## Files Created/Modified
- `src/renderer/src/App.tsx` (modificado) - imports `NotebookPen`/`FolderCog` + type `CSSProperties`; estado `vaultName`/`creating`/`createError`; callback ref `welcomeInputRef` (select una vez); handler `createLocalVault(useCustomLocation)`; bloque welcome reescrito con estados.

## Decisions Made
- **`openNote('Bienvenida.md')` solo en el flujo de creación:** `adoptVault` resetea a un panel vacío (RESEARCH Pitfall #2), así que la creación encadena `openNote` explícito; "Abrir una carpeta existente" (`openVault`) NO lo fuerza, respetando su comportamiento previo.
- **`null` del escape = no-op silencioso:** `createLocal(name, true)` devuelve `null` solo si el usuario cancela el picker → no se muestra error ni se cambia de pantalla; solo se limpia `creating` en el `finally`.
- **Boundary de error humano:** el `catch` no expone `e.message` (evita filtrar rutas/stack del main, T-11-07); muestra el texto fijo de UI-SPEC.
- **`WebkitAppRegion` vía cast inline:** `-webkit-app-region` no está tipado en csstype, y `.welcome` es una región `drag` completa; el input y la fila de links llevan `{ WebkitAppRegion: 'no-drag' } as CSSProperties` para ser interactivos (el CTA ya hereda `.welcome .primary { no-drag }`). Sin CSS nuevo, solo estilos inline puntuales (ancho 320px + no-drag), como preveía el plan.

## Deviations from Plan

None - plan executed exactly as written. Las dos tasks se ejecutaron con los literales exactos, el encadenamiento `adoptVault → openNote`, el manejo de `null` del escape y las mitigaciones (T-11-06/07/08). typecheck (node+web) en verde tras cada task y `npm run build` en verde al cierre.

## Issues Encountered
None. El grep de jerga sobre el bloque welcome dio 0 hits de "bóveda/github/repo/clonar/local-first" (los hits de "vault" son identificadores internos de código, no copy user-facing).

## Known Stubs
Ninguno. El stub `no-op` de `createLocalVault` introducido en Task 1 fue reemplazado por el handler real en Task 2.

## User Setup Required
None - no requiere configuración de servicios externos (flujo 100% local).

## Verification Notes
- `npm run typecheck` (node + web) y `npm run build` en verde.
- Wiring end-to-end confirmado: `preload.createLocal(name, useCustomLocation)` → `ipc.createLocal(name, useCustomLocation?)` → handler `vaultCreateLocal` que ramifica en `useCustomLocation` (pickFolder, null si cancela).
- **UAT humano pendiente (end-of-phase, human_verify_mode=end-of-phase):** crear un cuaderno real → ver "Creando tu cuaderno…" y entrar con `Bienvenida.md` abierta (editor NO vacío) + 1 versión en el historial; repetir el mismo nombre → sufijo ` (2)` sin pisar; "Elegir otra ubicación" (cancelar = no-op, elegir = crea ahí); nombre con `:` → sanitizado.

## Next Phase Readiness
- **Fase 12 (BACKUP-01..05):** debe reconstruir el flujo GitHub/respaldo que se removió de esta pantalla (botón "Clonar o crear en GitHub" + `NewVaultDialog` en la welcome) como tarjeta no bloqueante fuera de la bienvenida, honrando STAT-01.
- **Fase 13 (TOUR-01..03):** el tour ya cuenta con el escenario garantizado (cuaderno recién creado abierto en `Bienvenida.md`).
- **Sin blockers.** Repo sigue sin tests automatizados (blocker de proyecto conocido); la validación fue typecheck + build + UAT.

## Self-Check: PASSED

- Archivo verificado en disco: `src/renderer/src/App.tsx` — FOUND.
- Commits verificados en git log: `eea80da`, `fe77cbf` — ambos FOUND.
- Literales clave presentes: `openNote('Bienvenida.md')` y `vault.createLocal(vaultName, ...)` — FOUND.
- Gates: `npm run typecheck` (node + web) en verde tras cada task; `npm run build` en verde al cierre del plan.

---
*Phase: 11-bienvenida-y-creaci-n-local*
*Completed: 2026-07-09*
