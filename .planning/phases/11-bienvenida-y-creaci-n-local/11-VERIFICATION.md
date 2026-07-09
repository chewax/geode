---
phase: 11-bienvenida-y-creaci-n-local
verified: 2026-07-09T02:20:56Z
status: passed
score: 5/5 must-haves verified (code-level) + human UAT passed 2026-07-09
human_uat_result: passed — welcome sin jerga, creación 1-click en ~/Documents/Geode, Bienvenida.md sembrada, colisión con sufijo (2), nombres ilegales/reservados sanitizados, "Elegir otra ubicación" cancelar/elegir OK (validado por el usuario en app real)
human_verification:
  - test: "Abrir la app sin vault (limpiar/renombrar lastVault en settings) y observar la pantalla de bienvenida."
    expected: "Se ve 'Escribí sin miedo a perder nada.', un input pre-rellenado 'Mi primer cuaderno' con el texto seleccionado, el CTA 'Crear mi primer cuaderno', y los links 'Elegir otra ubicación' / 'Abrir una carpeta existente'. Nada de jerga técnica visible; sin botón 'Clonar o crear en GitHub'."
    why_human: "Renderizado visual real y estado inicial del foco/selección del input no se puede confirmar solo leyendo código."
  - test: "Click en 'Crear mi primer cuaderno' con el nombre por defecto."
    expected: "Aparece 'Creando tu cuaderno…' con spinner, el cuaderno se crea en ~/Documents/Geode/Mi primer cuaderno, la app entra mostrando Bienvenida.md abierta en el editor (no vacío), y el historial de versiones muestra 1 commit ('Primera versión')."
    why_human: "Requiere ejecutar la app real (IPC, filesystem, isomorphic-git) — no verificable por grep estático."
  - test: "Repetir la creación con el mismo nombre por defecto una segunda vez."
    expected: "Se crea un segundo cuaderno en '~/Documents/Geode/Mi primer cuaderno (2)', sin sobreescribir ni tocar el primero."
    why_human: "Comportamiento de colisión en filesystem real; requiere ejecución."
  - test: "Probar un nombre con caracteres ilegales de Windows (p.ej. 'Notas: 2026') y con 'CON' como nombre."
    expected: "Ambos se crean sin error (sanitizados a 'Notas 2026' y 'Cuaderno' respectivamente), sin crashear la app."
    why_human: "Confirmación end-to-end en filesystem real de Windows, más allá de la prueba unitaria aislada de la función."
  - test: "Probar 'Elegir otra ubicación': cancelar el picker y luego elegir una carpeta."
    expected: "Cancelar no produce error ni cambio de pantalla (no-op silencioso). Elegir una carpeta crea el cuaderno ahí, con Bienvenida.md abierta igual que el happy path."
    why_human: "Depende del diálogo nativo del SO, no accesible desde análisis estático."
---

# Phase 11: Bienvenida y creación local Verification Report

**Phase Goal:** Un usuario nuevo pasa de "abrir la app por primera vez" a "estar escribiendo en su primer cuaderno" en 1 click — sin cuenta, sin selector de carpeta y sin ver jerga.
**Verified:** 2026-07-09T02:20:56Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap Success Criteria) | Status | Evidence |
|---|---|---|---|
| 1 | Bienvenida con único CTA "Crear mi primer cuaderno", sin jerga; "abrir carpeta existente" como link secundario | ✓ VERIFIED (code) | `src/renderer/src/App.tsx:1116-1166` — bloque `if (!vault)` contiene exactamente el CTA, el input, y dos links secundarios (`FolderCog`/"Elegir otra ubicación", `FolderOpen`/"Abrir una carpeta existente"). `grep -niE "bóveda|github|repo|clonar|local-first"` sobre las líneas 1116-1167 → 0 hits. Botón "Clonar o crear en GitHub" y `<NewVaultDialog>` confirmados ausentes de este bloque (solo aparecen en el VaultSwitcher, fuera de la welcome, línea 1540). |
| 2 | 1 click crea el cuaderno bajo Documents/Geode por defecto, sin picker, sin cuenta; "elegir otra ubicación" como escape secundario | ✓ VERIFIED (code) | `src/main/index.ts:456-495` handler `IPC.vaultCreateLocal`: rama por defecto usa `baseDir = join(app.getPath('documents'), 'Geode')` sin picker; rama `useCustomLocation` sí abre `vault.pickFolder`. `src/renderer/src/App.tsx:475-492` `createLocalVault(useCustomLocation=false)` invoca `window.geode.vault.createLocal(vaultName, useCustomLocation)` — el CTA llama sin el flag (happy path), el link "Elegir otra ubicación" llama con `true`. Ningún flujo de login/cuenta involucrado. |
| 3 | El cuaderno abre con Bienvenida.md sembrada en español (nunca editor vacío), borrable | ✓ VERIFIED (code) | `src/main/fs/vaultName.ts:46-60` `SEED_BIENVENIDA` contiene `# Te damos la bienvenida`, tono español, menciona "copia de seguridad", no menciona "GitHub". `VaultService.createLocal` (`src/main/services/vault.ts:161-182`) siembra el seed vía `atomicWrite` antes de `setRoot`. El handler (`src/main/index.ts:478-483`) llama `ensureRepo` → `commit('Primera versión')` DESPUÉS de que el seed ya está en disco (orden load-bearing, comentado explícitamente para evitar que `commit` sea no-op). El renderer encadena `await openNote('Bienvenida.md')` inmediatamente después de `adoptVault(info)` en `createLocalVault` (`App.tsx:482-483`), compensando que `adoptVault` resetea a panel vacío. La nota es un archivo markdown normal — borrable como cualquier nota (no hay protección especial que lo impida). |
| 4 | Nombre libre (ilegales Windows / repetido) siempre crea bien, sin pisar cuadernos previos | ✓ VERIFIED (code + isolated test) | `sanitizeVaultName` (`src/main/fs/vaultName.ts:29-37`) ejecutado de forma aislada con los casos del plan: `'a/b:c*?'` → `'a b c'` (sin ilegales), `'CON'`/`'con.md'` → `'Cuaderno'`, `''`/`'   '`/`'...'` → `'Cuaderno'`, `'Mi primer cuaderno'` → sin cambios (espacios preservados), `'PRN'`/`'LPT1'`/`'COM9'` → `'Cuaderno'`. La función nunca lanza. Colisión: `VaultService.createLocal` (`vault.ts:167-171`) resuelve el sufijo ` (2)`, ` (3)`… con `pathExists` (stat sobre ruta absoluta bajo `baseDir` inyectado, NO `this.exists()` que ancla al vault actual) ANTES de `mkdir`, por lo que nunca se escribe sobre una carpeta existente. |
| 5 | Textos Capa 0 dicen "cuaderno"/"copia de seguridad", nunca "bóveda/GitHub/repo/clonar" | ✓ VERIFIED (code) | Confirmado en la Truth 1 (grep 0 hits sobre el bloque welcome). El seed `SEED_BIENVENIDA` usa "cuaderno" y "copia de seguridad", nunca "GitHub". `NewVaultDialog.tsx` y la sección de respaldo en Ajustes SÍ retienen jerga ("Nueva bóveda", "GitHub", "Clonar existente") — confirmado por diseño: el roadmap acota esta SC a "Capa 0" (la bienvenida), y estos dos artefactos están explícitamente diferidos a Fase 12 (BACKUP-01..05) según 11-02-SUMMARY.md §Next Phase Readiness y el Success Criteria #2 de la Fase 12 en ROADMAP.md. No se cuenta como gap de esta fase. |

**Score:** 5/5 truths verified at the code level (static analysis + isolated function execution + green typecheck/build). All 5 remain subject to human UAT for full runtime confirmation (see below) — this is expected given the project has no automated test runner (established pattern since v1.0).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/fs/vaultName.ts` | `sanitizeVaultName` + `SEED_BIENVENIDA` | ✓ VERIFIED | Exists, both exports present, logic matches all acceptance criteria (tested in isolation). |
| `src/main/services/vault.ts` | `createLocal(name, baseDir): Promise<VaultInfo>` | ✓ VERIFIED | Present at line 161; collision via private `pathExists` (not `this.exists()`); `mkdir` after suffix resolution; seed written with `atomicWrite`; returns `this.setRoot(dir)`. |
| `src/shared/ipc.ts` | Channel `vaultCreateLocal` + `VaultApi.createLocal` | ✓ VERIFIED | `IPC.vaultCreateLocal = 'geode:vault-create-local'` (line 24); `createLocal(name, useCustomLocation?): Promise<VaultInfo | null>` in `VaultApi` (line 152). |
| `src/main/index.ts` | Handler wired `createLocal → ensureRepo → commit → rememberVault → restartSnapshotTimer` | ✓ VERIFIED | Handler at line 456-495; exact order confirmed; EACCES/EPERM caught and translated to Spanish human message, other errors re-thrown raw. |
| `src/preload/index.ts` | `createLocal` surface, CommonJS | ✓ VERIFIED | Line 31-32, invokes `IPC.vaultCreateLocal`; file remains `.cjs`/CommonJS (no ESM import/export added). |
| `src/renderer/src/App.tsx` | Welcome block rewritten + wiring | ✓ VERIFIED | Block at 1116-1166 matches UI-SPEC literals exactly; `createLocalVault` handler at 475-492 wires `createLocal → adoptVault → openNote('Bienvenida.md')`; Creating/Error states present (`RefreshCw .spin`, `modal-error`). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/main/index.ts` handler | `vault.createLocal` | `await vault.createLocal(name, baseDir)` | ✓ WIRED | Line 478. |
| `src/main/index.ts` handler | `gitService.commit` | `gitService.commit(info.root, 'Primera versión')` after `ensureRepo` | ✓ WIRED | Line 480, after seed already on disk (load-bearing order preserved). |
| `src/main/services/vault.ts createLocal` | `atomicWrite(Bienvenida.md)` | `atomicWrite(join(dir, 'Bienvenida.md'), SEED_BIENVENIDA)` | ✓ WIRED | Line 179. |
| `App.tsx` CTA / Enter | `window.geode.vault.createLocal` | `onClick` / `onKeyDown` → `createLocalVault()` | ✓ WIRED | Lines 1134, 1137, calling into handler at 475-492. |
| `App.tsx` create flow | `openNote('Bienvenida.md')` | chained after `adoptVault(info)` | ✓ WIRED | Line 482-483, only in the create flow (not in `openVault`, confirmed `openVault` at line 459-462 does not call `openNote`). |
| preload `createLocal` | `ipc.createLocal` | `ipcRenderer.invoke(IPC.vaultCreateLocal, ...)` | ✓ WIRED | Line 31-32. |

### Data-Flow Trace (Level 4)

Not applicable in the classic sense (no dashboard/list rendering pre-existing data), but the create-flow data path was traced end-to-end: `App.tsx` CTA → `window.geode.vault.createLocal` (preload) → IPC → `main/index.ts` handler → `VaultService.createLocal` (writes real files: `mkdir` + `atomicWrite`) → `gitService.ensureRepo`/`commit` (isomorphic-git, real repo state) → `VaultInfo` returned up the chain → `adoptVault` (real IPC calls to refresh tree/graph) → `openNote('Bienvenida.md')` (real `vault.readNote` IPC call). No stubs, no hardcoded static returns found anywhere in this chain.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `sanitizeVaultName` handles Windows-illegal chars | isolated node execution of the exact regex logic with plan's test cases | All 8 cases (`'a/b:c*?'`, `'CON'`, `'con.md'`, `''`, `'   '`, `'...'`, `'Mi primer cuaderno'`, plus `PRN`/`LPT1`/`COM9`) produced expected output | ✓ PASS |
| `npm run typecheck` (node+web) | `npm run typecheck` | exit 0, no errors | ✓ PASS |
| `npm run build` | `npm run build` | exit 0, `✓ built in 7.70s` | ✓ PASS |
| No debt markers in modified files | grep TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | 0 hits across all 5 modified/created files | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` conventional probes exist in this repo, and neither PLAN nor SUMMARY reference any probe script. Skipped — project's verification model is typecheck+build+UAT (established since v1.0), consistent with `verification_notes` guidance.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ONB-01 | 11-02 | Bienvenida sin jerga, CTA único, link secundario | ✓ SATISFIED | Welcome block truth #1 above. |
| ONB-02 | 11-01, 11-02 | Creación local en 1 click bajo Documents/Geode por defecto | ✓ SATISFIED | Truth #2 above. |
| ONB-03 | 11-01, 11-02 | Cuaderno abre con Bienvenida.md sembrada, nunca editor vacío | ✓ SATISFIED | Truth #3 above. |
| ONB-04 | 11-01 | Sanitización de nombre + colisión sin pisar | ✓ SATISFIED | Truth #4 above. |
| COPY-01 | 11-02 | Textos Capa 0 sin jerga (bienvenida, NewVaultDialog, Ajustes) | ✓ SATISFIED for Phase 11 scope (welcome/Capa 0) — NewVaultDialog and Settings backup copy remain jargon-laden but are explicitly deferred to Phase 12 per ROADMAP.md Phase 12 SC#2 and 11-02-SUMMARY.md | Truth #5 above. |

No orphaned requirements found — REQUIREMENTS.md maps exactly ONB-01..04 and COPY-01 to Phase 11, and all appear in plan frontmatter (`11-01-PLAN.md`: ONB-02/03/04; `11-02-PLAN.md`: ONB-01/02/03/COPY-01).

### Anti-Patterns Found

None. Scanned all 6 modified/created files (`vaultName.ts`, `vault.ts`, `ipc.ts`, `index.ts`, `preload/index.ts`, `App.tsx` welcome+handler region) for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER, empty-return stubs, and hardcoded-empty patterns. No hits.

### Human Verification Required

See YAML frontmatter `human_verification` — 5 items covering: welcome screen visual/copy confirmation, 1-click creation happy path (seed note opens, 1 commit), collision suffix on repeat creation, illegal/reserved name handling end-to-end on real Windows filesystem, and the "Elegir otra ubicación" escape (cancel + choose). These require running the packaged/dev app because they depend on Electron IPC, real filesystem writes under the user's actual `Documents` folder, isomorphic-git state, and native OS dialogs — none of which are exercisable via static analysis, and this project has no automated test runner (consistent with v1.0/v1.1/v1.2 precedent).

### Gaps Summary

No code-level gaps found. All 5 roadmap Success Criteria are backed by source-verified, correctly-wired implementation (traced from renderer click through IPC through main-process filesystem/git operations and back). `npm run typecheck` and `npm run build` are green. The one deliberate scope narrowing (COPY-01 not yet applied to `NewVaultDialog.tsx`/Settings) is an explicit, roadmap-confirmed deferral to Phase 12, not an unaddressed gap of Phase 11.

Status is `human_needed` rather than `passed` solely because the phase's behavioral guarantees (actual 1-click creation, seeded note opening with content, git commit count, collision suffix behavior, native picker cancel/choose) can only be fully confirmed by running the app — this is expected under this project's established verification model and does not indicate a defect.

---

_Verified: 2026-07-09T02:20:56Z_
_Verifier: Claude (gsd-verifier)_
