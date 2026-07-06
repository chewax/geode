---
phase: 07-tabs-de-preview-y-gestin-de-bvedas
plan: 02
subsystem: ui
tags: [electron, ipc, react, typescript, shell-trashitem, vaults]

# Dependency graph
requires:
  - phase: 07-01
    provides: VaultSwitcher (selector de bóvedas) donde cuelga la acción de baja
provides:
  - Canal IPC geode:vault-remove + VaultApi.remove(root, { fromDisk })
  - Backend de baja de bóveda (settings.forgetVault, vault.clearRoot, handler validado)
  - Diálogo ConfirmRemoveVaultDialog (seguro por teclado, checkbox escalante)
  - Acción de baja por bóveda (Trash2 al hover) en el VaultSwitcher
affects: [gestión de bóvedas, FILE-05, hito v1.1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Borrado de disco solo vía shell.trashItem (papelera recuperable), nunca rm/rmSync permanente"
    - "Validación de ruta contra knownVaults en el main ANTES de operar sobre disco (anti-tampering)"
    - "Diálogo destructivo seguro por teclado: Cancelar autoFocus, solo Escape, sin Enter→confirmar"

key-files:
  created:
    - src/renderer/src/ConfirmRemoveVaultDialog.tsx
  modified:
    - src/shared/ipc.ts
    - src/preload/index.ts
    - src/main/services/settings.ts
    - src/main/services/vault.ts
    - src/main/index.ts
    - src/renderer/src/VaultSwitcher.tsx
    - src/renderer/src/App.tsx
    - src/renderer/src/index.css

key-decisions:
  - "El disco solo se toca detrás de un checkbox default-OFF y siempre a la papelera del SO (recuperable)"
  - "Si shell.trashItem falla, la bóveda NO se quita de la lista y se surface el error en español"
  - "Dar de baja la bóveda activa hace snapshot de seguridad, adopta la restante o resetea a la pantalla sin bóveda"

patterns-established:
  - "forgetVault como inversa exacta de rememberVault (quita de knownVaults + reasigna lastVault)"
  - "Acción por-ítem revelada al hover/focus reutilizando el patrón .sidebar-section-actions .icon-btn"

requirements-completed: [FILE-05]

# Metrics
duration: 20 min
completed: 2026-07-06
---

# Phase 7 Plan 2: Baja de bóveda (FILE-05) Summary

**Baja de bóveda end-to-end vía nuevo IPC geode:vault-remove: "Quitar de la lista" nunca toca el disco y un checkbox default-OFF escala a envío a la papelera del SO (recuperable) con `shell.trashItem`, validando la ruta contra knownVaults en el main.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-06T12:05:00Z
- **Completed:** 2026-07-06T12:25:00Z
- **Tasks:** 3
- **Files modified:** 8 (1 creado, 7 modificados)

## Accomplishments
- Nuevo canal IPC `geode:vault-remove` + `VaultApi.remove(root, { fromDisk })` tipado end-to-end (ipc → preload → main).
- Backend seguro: `settings.forgetVault` (inversa de `rememberVault`), `vault.clearRoot`, y handler que valida `root` contra `knownVaults` ANTES de `shell.trashItem`; borrado solo a papelera (recuperable), nunca permanente. Si la papelera falla, no se quita nada de la lista.
- Baja de la bóveda activa: snapshot de seguridad, adopta la más reciente restante o resetea a la pantalla sin bóveda; reinicia el timer de snapshots.
- Diálogo `ConfirmRemoveVaultDialog` (FolderX, checkbox default-OFF que escala a botón `danger`) seguro por teclado: Cancelar con autoFocus, solo Escape cancela, sin binding Enter→confirmar.
- Acción `Trash2` por bóveda al hover en el VaultSwitcher, con `stopPropagation` para no cambiar de bóveda.

## Task Commits

Each task was committed atomically:

1. **Task 1: Contrato IPC + backend de baja de bóveda** - `4d801f8` (feat)
2. **Task 2: Diálogo ConfirmRemoveVaultDialog + acción en VaultSwitcher + CSS** - `38bbfb2` (feat)
3. **Task 3: Wiring en App (estado + removeVault + baja de la activa)** - `876bc57` (feat)

## Files Created/Modified
- `src/shared/ipc.ts` - Canal `vaultRemove` + `VaultApi.remove(root, { fromDisk })`.
- `src/preload/index.ts` - Bridge `vault.remove`.
- `src/main/services/settings.ts` - `forgetVault(root)`: quita de knownVaults y reasigna lastVault.
- `src/main/services/vault.ts` - `clearRoot()`: deja la app sin bóveda activa.
- `src/main/index.ts` - Handler `vaultRemove`: valida contra knownVaults, snapshot de seguridad, `shell.trashItem` opcional, gestión de la bóveda activa.
- `src/renderer/src/ConfirmRemoveVaultDialog.tsx` - Diálogo de confirmación español, seguro por teclado, checkbox escalante.
- `src/renderer/src/VaultSwitcher.tsx` - Prop `onRemove` + acción `Trash2` por bóveda al hover.
- `src/renderer/src/App.tsx` - Estado `removeVaultTarget`, callback `removeVault`, render del diálogo, wire `onRemove`.
- `src/renderer/src/index.css` - `.vault-menu-remove` (oculto→visible al hover/focus) y `.remove-vault-check`.

## Decisions Made
- El borrado de disco exige intención explícita (checkbox default-OFF) y siempre va a la papelera del SO (recuperable), nunca `rm`/`rmSync` — respeta el valor central "nada se pierde".
- La validación `root ∈ knownVaults` ocurre en el main antes de cualquier operación de disco (mitiga T-07-05-01: el renderer no puede trashear rutas arbitrarias).
- Fallo de `shell.trashItem` = estado consistente: no se quita de la lista y se surface el error en español (T-07-05-04).

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Compliance
- T-07-05-01 (tampering ruta): mitigado — validación contra knownVaults antes de trashItem.
- T-07-05-02 (data loss): mitigado — solo papelera; borrado detrás de checkbox default-OFF; "Quitar de la lista" jamás toca disco.
- T-07-05-03 (teclado reflejo): mitigado — Cancelar autoFocus, solo Escape, sin Enter→confirmar.
- T-07-05-04 (estado inconsistente): mitigado — fallo de papelera no altera knownVaults.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- FILE-05 cerrado a nivel de código; `npm run typecheck` (node+web) en verde.
- Pendiente: UAT 07-03 (relaunch completo) para verificar el borrado real a papelera, el switch de la bóveda activa y la apariencia/hover — cambios en el main process requieren relaunch.

## Self-Check: PASSED

- `src/renderer/src/ConfirmRemoveVaultDialog.tsx` — FOUND
- Commits `4d801f8`, `38bbfb2`, `876bc57` — FOUND
- `npm run typecheck` (node+web) — PASSED

---
*Phase: 07-tabs-de-preview-y-gestin-de-bvedas*
*Completed: 2026-07-06*
