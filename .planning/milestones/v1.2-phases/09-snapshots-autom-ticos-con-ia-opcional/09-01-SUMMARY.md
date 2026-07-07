---
phase: 09-snapshots-autom-ticos-con-ia-opcional
plan: 01
subsystem: main/snapshots
tags: [snapshots, ai, ipc, settings]
requires: []
provides:
  - "Settings.snapshots.aiTitles + setSnapshotAiTitles (settings.ts)"
  - "SnapshotsConfig.aiTitles + canal snapshotsSetAiTitles + SnapshotsApi.setAiTitles (ipc.ts)"
  - "bridge snapshots.setAiTitles (preload)"
  - "resolveAiTitles + aiSnapshotMessage + snapshotIfChanged(reason, allowAi) + handler snapshotsSetAiTitles (main/index.ts)"
affects:
  - src/main/services/settings.ts
  - src/shared/ipc.ts
  - src/preload/index.ts
  - src/main/index.ts
tech-stack:
  added: []
  patterns:
    - "Opt-in persistido con default seguro OFF (resolveAiTitles: raw === true)"
    - "Promise.race con timeout de 10s + fallback al marcador (invariante de no-pérdida)"
key-files:
  created: []
  modified:
    - src/main/services/settings.ts
    - src/shared/ipc.ts
    - src/preload/index.ts
    - src/main/index.ts
decisions:
  - "La IA en snapshots SOLO se intenta en el path de cadencia (allowAi=true); los tres callers de ciclo de vida pasan allowAi=false para no hacer red en la salida."
  - "aiSnapshotMessage nunca lanza: cualquier falta de key/modelo, ausencia de cambios .md, timeout o error devuelve null → cae al marcador snapshotMessage()."
metrics:
  duration: "~10 min"
  completed: 2026-07-07
---

# Phase 9 Plan 1: IA opcional en auto-snapshots — backend (AISNAP-01) Summary

Backend del opt-in de IA para snapshots automáticos: flag persistido `snapshots.aiTitles` (default OFF), superficie IPC/preload, y motor `snapshotIfChanged(reason, allowAi)` que —solo en cadencia y solo con el opt-in ON y cambios .md reales— nombra la snapshot con IA (mismo formato `[title, description].filter(Boolean).join('\n\n')` que el guardado manual), cayendo siempre al marcador v1.0 ante falta de key/modelo, timeout (~10s) o cualquier error.

## What Changed

- **src/main/services/settings.ts**: `Settings.snapshots` extendido con `aiTitles?: boolean` (ausente/false = OFF). Nuevo setter `setSnapshotAiTitles(enabled): Promise<void>` que preserva `cadenceMinutes` (mismo patrón que `setSnapshotCadence`).
- **src/shared/ipc.ts**: canal `snapshotsSetAiTitles: 'geode:snapshots-set-ai-titles'`; `SnapshotsConfig.aiTitles: boolean` (no opcional); `SnapshotsApi.setAiTitles(enabled): Promise<SnapshotsConfig>`. Comentario de sección actualizado (ya no afirma "sin IA").
- **src/preload/index.ts**: bridge `snapshots.setAiTitles` invocando `IPC.snapshotsSetAiTitles`.
- **src/main/index.ts**:
  - `resolveAiTitles(raw): boolean` = `raw === true` (defensa T-09-02: settings corrupto → OFF).
  - `snapshotsGet` devuelve también `aiTitles: resolveAiTitles(...)`; `snapshotsSet` ahora devuelve el `SnapshotsConfig` completo con `aiTitles`.
  - Nuevo handler `snapshotsSetAiTitles`: coerción `!!enabled` (T-09-01), persiste vía `setSnapshotAiTitles`, devuelve config completa releyendo cadencia; NO reinicia el timer.
  - `aiSnapshotMessage(root): Promise<string | null>`: lee key + `ai.model` (null si falta); `pendingDiff` (null si vacío); `Promise.race` con timeout de 10s → null; arma mensaje con `[title, description].filter(Boolean).join('\n\n')`; todo en try/catch (nunca lanza).
  - `snapshotIfChanged(reason, allowAi)`: si `allowAi` Y opt-in ON, usa `aiSnapshotMessage(info.root) ?? snapshotMessage()`; si no, marcador directo. Un solo `gitService.commit`. Sigue sin lanzar.
  - Callers: `setInterval` de cadencia → `('cadencia', true)` (único con IA); `cambio-de-boveda`, `baja-de-boveda`, `cierre` → `false`.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npm run typecheck` (node + web): EXIT 0 (verde).
- `npm run build` (electron-vite): EXIT 0 (verde).
- grep confirma: `snapshotIfChanged('cadencia', true)` único con IA; los tres callers de ciclo de vida con `false`.
- `generateNamedVersion` invocado solo desde `aiSnapshotMessage` (además del handler manual preexistente `aiSuggestVersion`).

## Notes for Next Plan

- El timer (`restartSnapshotTimer` / `setInterval`) no cambió salvo el argumento `true` — locked-design respetado.
- Cambios en el MAIN process: la UAT requiere relanzar la app (no hay hot-reload de main). Falta el frontend del toggle (opt-in en Ajustes) — es el plan siguiente de la fase.

## Self-Check: PASSED
