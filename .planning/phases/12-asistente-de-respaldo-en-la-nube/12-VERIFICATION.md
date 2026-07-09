---
phase: 12-asistente-de-respaldo-en-la-nube
verified: 2026-07-09T12:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Si algo falla en el camino de respaldo, el usuario ve un mensaje en lenguaje claro, nunca el mensaje crudo de la API (BACKUP-05, SC5)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Onboarding completo con cuenta GitHub real: crear primer cuaderno -> ver tarjeta -> 'Respaldar en la nube' -> 'Crear una gratis' -> crear cuenta en el navegador -> volver -> 'Conectar cuenta' -> confirmar que el repo privado se crea y el primer push sube 'Primera versión' sin ver repo/commit/push."
    expected: "El wizard nunca expone jerga git; el toast final dice 'Listo: tu cuaderno está a salvo en la nube.' solo tras el push real; el botón persistente pasa a 'Todo en la nube'."
    why_human: "Requiere una cuenta de GitHub real, red y el flujo completo de OAuth device flow + creación de cuenta en el navegador — no reproducible por grep/análisis estático."
  - test: "Con la app ya conectada, editar una nota y guardar (Ctrl+S o autosave) y observar la status bar."
    expected: "El botón de respaldo persistente pasa por 'Respaldando…' y vuelve a 'Todo en la nube' sin acción manual del usuario ni ver push/commit."
    why_human: "Requiere observar el timing real de un commit + auto-push contra un repo remoto real."
  - test: "Forzar un error de nombre de repo tomado (422): renombrar el cuaderno a un nombre cuyo slug ya exista como repo en la cuenta conectada y ejecutar el onboarding."
    expected: "El wizard muestra inline 'Ya tenés un respaldo con ese nombre. Probá con otro nombre de cuaderno.' sin texto crudo de la API."
    why_human: "Requiere provocar un 422 real contra la API de GitHub con una cuenta de prueba."
  - test: "Desconectar la red (o revocar el token en GitHub) y tocar el botón de respaldo persistente estando conectado (fuerza push)."
    expected: "El botón pasa a 'No se pudo respaldar' y el popover muestra una de las 4 frases humanas de mapBackupError (p.ej. 'No pudimos conectar. Revisá tu conexión a internet.' o 'Tu sesión de GitHub venció. Reconectá tu cuenta.'), NUNCA un window.alert ni texto crudo de la API/isomorphic-git."
    why_human: "Requiere provocar un fallo de red/auth real contra la API de GitHub; el código fuente ya confirma que el error se enruta por mapBackupError y se muestra inline (ver evidencia en el reporte), pero el timing/copy exacta en runtime real merece una pasada humana."
---

# Phase 12: Asistente de respaldo en la nube Verification Report

**Phase Goal:** El usuario respalda su cuaderno en la nube guiado paso a paso —incluso creando una cuenta gratuita si no la tiene— sin toparse con jerga, y de ahí en más el respaldo es automático e invisible. Introduce el botón de respaldo que el tour usará como ancla.
**Verified:** 2026-07-09
**Status:** human_needed
**Re-verification:** Sí — tras cierre de gap (commit `a1111be`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tras crear el primer cuaderno, invitación no bloqueante (tarjeta, no modal) con "Hacerlo después" siempre disponible + punto persistente para retomarla | ✓ VERIFIED (regression check) | Sin cambios en `BackupCard.tsx`/`App.tsx` desde la verificación previa; el archivo tocado por el fix (`App.tsx`) no altera el gate de montaje ni `onLater`. |
| 2 | Usuario sin cuenta guiado a crear una gratis: la app abre la página de registro en el navegador + checklist que sobrevive el ida-y-vuelta; "GitHub" se nombra solo en ese paso | ✓ VERIFIED (regression check) | `BackupWizard.tsx` no fue tocado por el commit de cierre de gap; sin cambios. |
| 3 | Al conectar, el primer respaldo se sube solo (con una primera versión ya incluida para que nunca quede vacío) sin ver repo/subir/versiones | ✓ VERIFIED (regression check) | `vaultEnableBackup` (src/main/index.ts:846-895) intacto: sigue devolviendo solo `GithubConfig`; el fix solo tocó el handler `gitPush` (líneas 809-833), no este orquestador. |
| 4 | Tras conectar, cada guardado se respalda solo, y "Todo en la nube" solo cuando de verdad está todo subido (STAT-01) | ✓ VERIFIED (regression check) | `statusLabel` (App.tsx:1815-1837) sin cambios: `pushCount === 0 && status==='clean' && githubConnected` → "Todo en la nube". `BackupButton` deriva `kind` con la misma prioridad (`backingUp > failed > connected&&pushCount===0 > connected > sin-respaldo`), sin alterar la condición "al-dia". El nuevo prop `failedMessage` solo afecta el contenido del popover en el estado `error`, no la lógica de estado. |
| 5 | Si algo falla en el camino de respaldo, el usuario ve un mensaje en lenguaje claro, nunca el mensaje crudo de la API (BACKUP-05, SC5) | ✓ VERIFIED — GAP CERRADO | Confirmado leyendo las 3 piezas reales tras el commit `a1111be`: (1) `src/main/index.ts:809-833` — el handler `IPC.gitPush` ahora envuelve `gitService.push(...)` en `try/catch` y relanza `mapBackupError(e)`, exactamente como `vaultEnableBackup`; el error crudo de isomorphic-git/fetch (y el token embebido en la URL) ya no cruza el IPC. (2) `src/renderer/src/App.tsx:351-368` — `doPush` eliminó `window.alert`; ahora limpia `backupFailMsg` al reintentar y, en el catch, hace `setBackupFailMsg(e instanceof Error ? e.message : 'No se pudo respaldar')` — un estado React puramente efímero (no persistido), consumido inline. (3) `src/renderer/src/BackupButton.tsx:96-104` — nueva prop `failedMessage: string \| null`; cuando `kind === 'error'` el popover renderiza `{failedMessage ?? 'No se pudo respaldar ahora...'}` en vez de la rama `connected`/genérica anterior — la copy humana (ya mapeada en el main) se ve directamente en la UI, nunca vía diálogo nativo. |

**Score:** 5/5 truths verified

### Required Artifacts

Sin cambios respecto de la verificación previa en los artefactos no tocados por el fix (ver tabla completa en el historial de este archivo / commit anterior). Artefactos tocados por el cierre de gap, re-verificados a 3 niveles:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/index.ts` (`IPC.gitPush`) | Envolver el push en try/catch → `mapBackupError`, igual que `vaultEnableBackup` | ✓ VERIFIED | Líneas 809-833; `mapBackupError` ya estaba importado (usado en `vaultEnableBackup`); ahora también usado aquí (3→4 usos totales en el archivo). |
| `src/renderer/src/App.tsx` (`doPush`) | Eliminar `window.alert`; mensaje humano efímero vía estado React | ✓ VERIFIED | Líneas 172-176 (nuevo `useState<string \| null>` `backupFailMsg`), 351-368 (`doPush` sin `window.alert`, con `setBackupFailMsg`), 1516 (`failedMessage={backupFailMsg}` pasado a `BackupButton`). |
| `src/renderer/src/BackupButton.tsx` | Prop `failedMessage`; popover del estado error muestra la copy humana | ✓ VERIFIED | Prop tipada y documentada (líneas 19, 29-32); rendering condicional `kind === 'error'` (líneas 96-103) antes de la rama `connected`; no altera la lógica de prioridad de `kind` (STAT-01 intacto). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `IPC.gitPush` catch | `mapBackupError` | try/catch alrededor de `gitService.push` | ✓ WIRED | Antes: `NOT_WIRED` (gap). Ahora: `throw mapBackupError(e)` en el catch, mismo patrón que `vaultEnableBackup`. |
| `App.tsx doPush` catch | `BackupButton failedMessage` | `setBackupFailMsg` → prop → popover | ✓ WIRED | `backupFailMsg` se limpia al reintentar, se setea en el catch con el mensaje ya humanizado (viene del main vía `mapBackupError`), y se pasa como prop; el popover lo consume cuando `kind==='error'`. |
| `statusLabel` | `pushCount===0` | condición LOCKED | ✓ WIRED (sin cambios) | Verificado que el fix no tocó esta función ni su lógica. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `BackupButton` popover (estado error) | `failedMessage` | `App.tsx backupFailMsg` ← `doPush` catch ← `window.geode.git.push()` reject ← `IPC.gitPush` catch ← `mapBackupError(e)` | Sí — cadena completa trazada desde el reject de IPC hasta el render; `mapBackupError` produce una de 4 frases LOCKED (no interpola `e.message`/`e.body`/token, confirmado en `backupErrors.ts`, sin cambios en este ciclo) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm run typecheck` (node + web) | `npm run typecheck` | Exit 0, sin errores (tsc --noEmit en ambos tsconfig) | ✓ PASS |
| `npm run build` (main+preload+renderer) | `npm run build` | `built in 4.91s`, exit 0 | ✓ PASS |
| Preload sigue siendo CommonJS | `head -c 200 out/preload/index.cjs` | `"use strict"; const electron = require("electron");` | ✓ PASS |
| `mapBackupError` ahora usado también en `gitPush` | `grep -n mapBackupError src/main/index.ts` | Uso confirmado dentro de `IPC.gitPush` (además de los 3 usos previos en `vaultEnableBackup`) | ✓ PASS (confirma el cierre del gap) |
| `window.alert` eliminado de `doPush` | `grep -n "window.alert" src/renderer/src/App.tsx` | 4 matches restantes (líneas 572, 869, 882, 935) — ninguno dentro de `doPush` (351-368); son alerts preexistentes no relacionados (quitar bóveda, crear rama, agregar etiqueta, config de IA faltante), fuera del alcance de BACKUP-05 | ✓ PASS |
| Sin marcadores de deuda reales (TBD/FIXME/XXX/HACK/PLACEHOLDER) en los 3 archivos tocados | grep dirigido | 0 matches reales; 2 falsos positivos de "TODO" (palabra española "todo/every", ej. "TODO fallo de git/API pasa por mapBackupError" y "traduce TODO error al español") — confirmados leyendo el comentario completo, no son marcadores de trabajo pendiente | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BACKUP-01 | 12-01, 12-04, 12-05 | Invitación no bloqueante + punto persistente | ✓ SATISFIED (sin cambios) | `BackupCard` + `BackupButton` siempre montado. |
| BACKUP-02 | 12-01, 12-03, 12-04 | Hand-off a signup + checklist + "GitHub" solo en ese paso | ✓ SATISFIED (sin cambios) | `backupOpenSignup` URL fija; checklist en `BackupWizard`. |
| BACKUP-03 | 12-01, 12-03 | createRepo→setRemote→push automático, nunca vacío | ✓ SATISFIED (sin cambios) | `vaultEnableBackup` + seed "Primera versión". |
| BACKUP-04 | 12-01, 12-03, 12-05 | Auto-push tras cada guardado, STAT-01 honesto | ✓ SATISFIED (sin cambios) | `autoPushAfterCommit` cableado en 2 puntos; `statusLabel` intacto. |
| BACKUP-05 | 12-01, 12-03, 12-04 | Errores en lenguaje humano, nunca crudo de la API | ✓ SATISFIED — antes BLOCKED (parcial) | Ahora cubierto en AMBOS caminos: onboarding (`vaultEnableBackup`) y push manual/forzado del botón persistente (`IPC.gitPush` → `mapBackupError` → `doPush` → `BackupButton.failedMessage`). |
| COPY-01 | 12-02, 12-05 | Reescritura de copy Capa 0 (Ajustes, NewVaultDialog, píldora) | ✓ SATISFIED (sin cambios) | No tocado por el fix. |

No hay requisitos huérfanos.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/main/index.ts` | 819 | Comentario `// ...: TODO fallo de git/API pasa por mapBackupError...` | ℹ️ Info | Falso positivo: palabra española "todo" ("cada/todo fallo"), no marcador de trabajo pendiente — confirmado leyendo la oración completa. |
| `src/main/index.ts` | 845 | Comentario `// ...traduce TODO error al español con mapBackupError...` | ℹ️ Info | Mismo falso positivo, preexistente de la verificación anterior. No es deuda técnica. |

El blocker anterior (`App.tsx:358`, `window.alert` con texto crudo) fue eliminado por el commit `a1111be`. No se encontraron nuevos blockers ni warnings en los archivos tocados por el fix.

### Human Verification Required

Ver `human_verification` en el frontmatter para el detalle completo. Resumen: 4 ítems, todos requieren una cuenta real de GitHub, red, y/o timing de eventos en runtime (OAuth device flow, auto-push tras guardado, 422 real, y ahora también confirmar en runtime la copy exacta de `mapBackupError` en el botón persistente cuando se fuerza un fallo real de red/auth). El código fuente ya demuestra que la ruta de datos está completa y correcta (Level 4 FLOWING); lo que falta es una pasada humana sobre el copy/UX real contra la API de GitHub, no una verificación de código adicional.

### Gaps Summary

Ninguno. El único gap de la verificación anterior (BACKUP-05: el push manual del botón persistente exponía el error crudo vía `window.alert`) está cerrado: el commit `a1111be` envuelve `IPC.gitPush` con `mapBackupError` (igual que `vaultEnableBackup`) y reemplaza el `window.alert` de `doPush` por un mensaje inline efímero (`backupFailMsg`) que el popover de `BackupButton` muestra en su estado de error. No se detectaron regresiones: `statusLabel`/STAT-01, el diseño de 4 estados del botón, y el comportamiento de éxito del push (`pushed[branch]`, retorno `{branch, oid}`) están intactos. `npm run typecheck` y `npm run build` están en verde. Las 5 verdades observables de la fase están ahora verificadas a nivel de código; lo único pendiente es UAT humano con una cuenta real de GitHub (ya requerido antes de este cierre de gap, sin cambios en su alcance).

---

_Verified: 2026-07-09_
_Verifier: Claude (gsd-verifier)_
