---
phase: 11-bienvenida-y-creaci-n-local
plan: 01
subsystem: vault-lifecycle
tags: [electron, isomorphic-git, ipc, vault, onboarding, windows-fs]

# Dependency graph
requires:
  - phase: 10 (v1.2 close)
    provides: "VaultService (setRoot/pickFolder), GitService.commit racy-safe, ensureRepo, atomicWrite, patrón IPC tipado end-to-end, rememberVault/restartSnapshotTimer"
provides:
  - "Util sanitizeVaultName(raw): limpieza de nombre de carpeta Windows (ilegales + reservados + trailing dots, fallback 'Cuaderno')"
  - "Constante SEED_BIENVENIDA: contenido canónico fijo de Bienvenida.md (sin interpolar el nombre)"
  - "VaultService.createLocal(name, baseDir): crea el cuaderno con sufijo anti-colisión y siembra atómica del seed"
  - "Canal IPC geode:vault-create-local expuesto en window.geode.vault.createLocal(name, useCustomLocation?)"
  - "Handler main con orden load-bearing createLocal → ensureRepo → commit('Primera versión') → rememberVault → restartSnapshotTimer"
affects: [11-02 (renderer welcome consume window.geode.vault.createLocal), 13 (tour recorre el cuaderno sembrado)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sanitizador de nombre de carpeta Windows como util puro/total (anti-analog de sanitizeTagName)"
    - "Seed constante fijo (no interpolado) para evitar inyección markdown vía nombre (T-11-04)"
    - "Resolución de colisión con sufijo ' (2)' ANTES de mkdir sobre ruta absoluta bajo baseDir inyectado"

key-files:
  created:
    - src/main/fs/vaultName.ts
  modified:
    - src/main/services/vault.ts
    - src/shared/ipc.ts
    - src/preload/index.ts
    - src/main/index.ts

key-decisions:
  - "createLocal hace SOLO el lado FS; ensureRepo/commit/rememberVault/restartSnapshotTimer viven en el handler (separación de responsabilidades como en vaultOpen)"
  - "Colisión chequeada con un helper privado pathExists(absPath) vía stat, NO con this.exists() (que se ancla al vault actual vía resolveInside — base equivocada para una carpeta fresca)"
  - "El happy path nunca devuelve null; solo el escape useCustomLocation con picker cancelado devuelve null"
  - "Boundary de error: EACCES/EPERM se traduce a mensaje humano en español; cualquier otro error se re-lanza tal cual"

patterns-established:
  - "IPC 4-point edit: canal + VaultApi + preload CommonJS + handler, en orden"
  - "Primer commit del seed racy-safe reutilizando GitService.commit (nunca copiar createWithRepo, que no commitea)"

requirements-completed: [ONB-02, ONB-03, ONB-04]

# Metrics
duration: 5min
completed: 2026-07-09
---

# Phase 11 Plan 01: Backbone de creación local del cuaderno Summary

**Creación de cuaderno LOCAL en 1 click sin GitHub ni picker: util de sanitización Windows, `VaultService.createLocal` (colisión por sufijo + siembra atómica de Bienvenida.md) y el canal `geode:vault-create-local` cableado end-to-end con commit del seed como primera versión.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-09T01:55:58Z
- **Completed:** 2026-07-09T02:00:07Z
- **Tasks:** 3
- **Files modified:** 4 (1 creado + 3 modificados... 5 archivos tocados en total)

## Accomplishments
- `sanitizeVaultName` cubre ilegales de Windows (`< > : " / \ | ? *`), control chars, nombres reservados (CON/PRN/AUX/NUL/COM1-9/LPT1-9 incl. `CON.md`), vacío y trailing dots, con fallback `"Cuaderno"`; nunca lanza.
- `SEED_BIENVENIDA` con el contenido canónico textual de la nota de bienvenida (2ª persona, cálido, menciona "copia de seguridad", sin "GitHub"); constante fija no interpolada.
- `VaultService.createLocal(name, baseDir)` resuelve la colisión con sufijo ` (2)`, ` (3)`… ANTES de `mkdir` (nunca pisa datos — core value), siembra `Bienvenida.md` con `atomicWrite` y fija el cuaderno con `setRoot`.
- Canal `geode:vault-create-local` disponible en `window.geode.vault.createLocal(name, useCustomLocation?)`; el handler encadena el orden load-bearing y commitea el seed como primera versión con mensaje fijo en español (sin IA).

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: Util sanitizeVaultName + constante del seed** - `fbd227c` (feat)
2. **Task 2: VaultService.createLocal (colisión + siembra atómica)** - `064ee67` (feat)
3. **Task 3: Cablear geode:vault-create-local end-to-end** - `cfbd59f` (feat)

## Files Created/Modified
- `src/main/fs/vaultName.ts` (nuevo) - `sanitizeVaultName` (limpieza Windows, fallback "Cuaderno") + `SEED_BIENVENIDA` (seed canónico fijo).
- `src/main/services/vault.ts` - método `createLocal(name, baseDir)` + helper privado `pathExists`; import de `../fs/vaultName`.
- `src/shared/ipc.ts` - canal `vaultCreateLocal` + firma `VaultApi.createLocal(name, useCustomLocation?)` con JSDoc en español.
- `src/preload/index.ts` - superficie CommonJS `createLocal` invocando `IPC.vaultCreateLocal`.
- `src/main/index.ts` - handler `ipcMain.handle(IPC.vaultCreateLocal)` con orden load-bearing + boundary EACCES/EPERM.

## Decisions Made
- **Colisión vía `pathExists(absPath)` (nuevo helper), no `this.exists()`:** `this.exists()` enruta por `resolveInside`, anclado al vault ACTUAL; para una carpeta fresca bajo `baseDir` inyectado la base sería la equivocada.
- **`createLocal` solo hace FS; el git-init/commit/persistencia son del handler:** consistente con `vaultOpen`, mantiene el método de servicio testeable y sin dependencias del ciclo de vida del timer.
- **Escape "Elegir otra ubicación" resuelto en el handler:** `useCustomLocation` → `vault.pickFolder` devuelve el PADRE (o null si se cancela = no-op); se reusa la misma sanitización+colisión bajo esa base (consistencia con el happy path, RESEARCH Open Q2 A3).
- **Mensaje de commit fijo "Primera versión" en español, sin IA:** coherente con CLAUDE.md (la creación y los auto-snapshots no invocan IA).

## Deviations from Plan

None - plan executed exactly as written. Las tres tasks se ejecutaron con las firmas, el orden load-bearing y las mitigaciones (T-11-01..05) tal como el plan las especificó; typecheck y build en verde tras cada task.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Listo para Plan 11-02 (renderer):** `window.geode.vault.createLocal(name, useCustomLocation?)` está expuesto y tipado. El renderer debe: reemplazar el bloque welcome `if (!vault)` (App.tsx:1079-1105) con el mini-campo de nombre + CTA; encadenar `await openNote('Bienvenida.md')` DESPUÉS de `adoptVault(info)` (adoptVault resetea a panel vacío — RESEARCH Pitfall #2); usar los íconos `NotebookPen` (16) / `FolderCog` (14), confirmados en lucide-react 1.23.0.
- **Verificación pendiente (end-of-phase UAT, junto con Plan 02):** crear un cuaderno real y confirmar `~/Documents/Geode/<nombre>`, `Bienvenida.md` presente y 1 commit en el historial; probar nombre con `:` (sanitizado) y repetir el mismo nombre (sufijo ` (2)`, sin pisar).
- **Sin blockers.** El repo sigue sin tests automatizados (blocker de proyecto conocido); `sanitizeVaultName` es puro/total y quedó aislado para un futuro vitest.

## Self-Check: PASSED

- Archivos verificados en disco: `src/main/fs/vaultName.ts`, `src/main/services/vault.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts` — todos FOUND.
- Commits verificados en git log: `fbd227c`, `064ee67`, `cfbd59f` — todos FOUND.
- Gates: `npm run typecheck` (node + web) en verde tras cada task; `npm run build` en verde al cierre del plan.

---
*Phase: 11-bienvenida-y-creaci-n-local*
*Completed: 2026-07-09*
