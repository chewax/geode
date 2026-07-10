---
phase: 13-tour-interactivo-de-primera-vez
plan: 01
subsystem: onboarding-tour
tags: [ipc, settings, persistence, tour, tri-state]
requires: []
provides:
  - "window.geode.tour.get()/set() (TourApi tipado)"
  - "IPC channels geode:tour-get / geode:tour-set"
  - "settings.tour.state persistente (default 'unseen')"
  - "getTourState/setTourState en settings service"
affects:
  - src/shared/ipc.ts
  - src/main/services/settings.ts
  - src/main/index.ts
  - src/preload/index.ts
tech-stack:
  added: []
  patterns:
    - "IPC interface-first tri-state (mirror 1:1 de backup.onboarding)"
    - "Coerción enum defensiva en handler main (V5 Input Validation, ASVS L1)"
key-files:
  created: []
  modified:
    - src/shared/ipc.ts
    - src/main/services/settings.ts
    - src/main/index.ts
    - src/preload/index.ts
decisions:
  - "TourState es tri-state 'unseen'|'started'|'seen' con default 'unseen' (NUNCA null, a diferencia de BackupOnboarding) para modelar 'started' = interrumpido → reaparece una vez"
  - "El handler IPC.tourSet coerciona al enum via whitelist; input inválido no muta y devuelve el estado actual (nunca persiste el valor crudo del renderer)"
  - "settings.tour es bloque top-level hermano de settings.backup (per RESEARCH A2), merge por spread inmutable que preserva claves ajenas"
metrics:
  duration: 6min
  completed: 2026-07-09
  tasks: 2
  files: 4
---

# Phase 13 Plan 01: Backbone de persistencia del tour Summary

Backbone de persistencia del "tour visto" espejando 1:1 el patrón probado de `backup.onboarding` a través de las 4 capas (IPC contract → settings service → main handlers → preload bridge), con tri-state `'unseen'|'started'|'seen'`, default `'unseen'` y coerción enum defensiva en el handler del main.

## What Was Built

- **Contrato IPC (`src/shared/ipc.ts`):** canales `IPC.tourGet`/`IPC.tourSet` (`geode:tour-get`/`geode:tour-set`), tipo `TourState = 'unseen' | 'started' | 'seen'`, `TourSnapshot { state: TourState }` (nunca null), `TourApi { get(); set(state) }`, y `tour: TourApi` en `GeodeApi`.
- **Persistencia (`src/main/services/settings.ts`):** bloque `tour?: { state? }` top-level en el shape de `Settings`; `getTourState(): Promise<TourState>` (default `?? 'unseen'`) y `setTourState(state)` con merge por spread inmutable.
- **Handlers (`src/main/index.ts`):** `IPC.tourGet` devuelve `{ state }`; `IPC.tourSet` valida contra la whitelist `['unseen','started','seen']` (T-13-01) — input inválido no muta settings y retorna el estado actual.
- **Puente preload (`src/preload/index.ts`):** `tour: { get, set }` vía `ipcRenderer.invoke`, permanece CommonJS.

## Task Commits

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Contrato IPC del tour (interface-first) | c61f671 | src/shared/ipc.ts |
| 2 | Persistencia + handlers + puente preload | fbedcbd | src/main/services/settings.ts, src/main/index.ts, src/preload/index.ts |

## Verification

- **Task 1:** `npm run typecheck` — falla en aislamiento por diseño (interface-first): agregar `tour: TourApi` a `GeodeApi` exige la implementación del preload que llega en Task 2. El archivo `ipc.ts` en sí es correcto y completo.
- **Task 2:** `npm run build` en verde (typecheck node + web + bundle main/preload/renderer). Estado final del árbol: verde.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import de `TourState` en settings.ts**
- **Found during:** Task 2
- **Issue:** El plan indicaba "importar `TourState` desde `@shared/ipc` como hace el bloque backup", pero el bloque backup análogo NO importa el tipo — usa uniones literales inline y `settings.ts` no tenía ningún import de `@shared/ipc`.
- **Fix:** Se añadió `import type { TourState } from '@shared/ipc'` para tipar los retornos de las nuevas funciones de forma limpia; el alias resuelve correctamente en `tsconfig.node`. Build en verde.
- **Files modified:** src/main/services/settings.ts
- **Commit:** fbedcbd

### Note on interface-first ordering

La verificación de Task 1 (`npm run typecheck` en verde) no puede satisfacerse en aislamiento: declarar `tour: TourApi` en `GeodeApi` rompe el typecheck del preload hasta que Task 2 cablea el puente. Es el tradeoff inherente al split interface-first; el estado final tras Task 2 es verde. No se alteró el alcance de ningún task.

## Threat Model Compliance

- **T-13-01 (Tampering, mitigate):** implementado — whitelist enum `['unseen','started','seen']` en `IPC.tourSet`; input inválido no muta y retorna el estado actual. Nunca se persiste el valor crudo del renderer.
- **T-13-02 (Information Disclosure, accept):** sin mitigación adicional (flag de onboarding, no PII ni secreto).

## Known Stubs

Ninguno. Todas las funciones están cableadas end-to-end; el consumo del renderer llega en Plan 03 (fuera de alcance de este plan).

## Self-Check: PASSED

- FOUND: commit c61f671 (Task 1)
- FOUND: commit fbedcbd (Task 2)
- FOUND: `TourApi` en src/shared/ipc.ts
- FOUND: `getTourState`/`setTourState` en src/main/services/settings.ts
- FOUND: `IPC.tourGet`/`IPC.tourSet` handlers en src/main/index.ts
- FOUND: `tour:` bridge en src/preload/index.ts
