---
phase: 09-snapshots-autom-ticos-con-ia-opcional
plan: 02
subsystem: renderer-settings
tags: [settings, snapshots, ai, ui, toggle]
requires: ["09-01"]
provides:
  - "Toggle 'Nombrar con IA' en Ajustes → Guardado automático (superficie de AISNAP-01/SC-1)"
affects:
  - src/renderer/src/SettingsModal.tsx
tech-stack:
  added: []
  patterns: [".toggle-row (checkbox etiquetado, reutilizado de la sección IA)"]
key-files:
  created: []
  modified:
    - src/renderer/src/SettingsModal.tsx
decisions:
  - "Se reusó el patrón .toggle-row (mismo que el toggle de la sección IA) por coherencia semántica: ambos toggles habilitan uso de IA."
  - "La lectura de snapshots.get() se envolvió en try/catch: si falla, aiTitles queda en false sin romper la carga de Ajustes."
metrics:
  duration: "~4 min"
  completed: 2026-07-07
---

# Phase 9 Plan 2: Toggle 'Nombrar con IA' en Ajustes Summary

Toggle opt-in en Ajustes → Guardado automático que activa el nombrado por IA de las auto-snapshots (default APAGADO), leyendo/escribiendo vía `snapshots.get()` / `snapshots.setAiTitles()` expuestos en 09-01, con copy que aclara el costo (API key de IA) y la condición "solo con cambios".

## What Was Built

Se cableó la única superficie de usuario pendiente de AISNAP-01 (SC-1) en `SettingsModal.tsx`:

- **Estado** `const [aiTitles, setAiTitles] = useState(false)` junto a `cadence` (default OFF).
- **Carga** en el `useEffect` de apertura: ahora lee `cadenceMinutes` y `aiTitles` del mismo `snapshots.get()`, envuelto en try/catch para que un fallo deje `aiTitles` en `false` sin bloquear el resto de la carga.
- **Handler** `changeAiTitles(value: boolean): Promise<void>` que invoca `window.geode.snapshots.setAiTitles(value)` y refleja `cfg.aiTitles`.
- **Sección snapshots**: se reescribió el `modal-sub` (se eliminó "No usa IA (no tiene costo)") y se agregó, debajo del `<select>` de cadencia, un toggle `.toggle-row` "Nombrar las snapshots automáticas con IA" con `checked={aiTitles}` / `onChange → changeAiTitles`, más un `<p className="hint">` que aclara que usa la API key de IA (tiene costo) y que la IA solo se invoca cuando una snapshot automática realmente tiene cambios — nunca por tiempo transcurrido.

## Key Decisions

- **Patrón `.toggle-row`**: se eligió el mismo patrón que el toggle de la sección IA (no `.ps-toggle` de plugins) por coherencia semántica — ambos controlan uso de IA — y visual dentro del flujo de la sección.
- **Fallback robusto**: `snapshots.get()` se envolvió en try/catch propio, cumpliendo el constraint "si `snapshots.get()` fallara, el estado queda en `false` (sin romper)".

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `env -u ELECTRON_RUN_AS_NODE npm run build` → verde, exit code 0 (typecheck node + web + electron-vite build).
- Grep confirma `snapshots.setAiTitles` cableado en `changeAiTitles` y ausencia de "No usa IA (no tiene costo)" en la sección snapshots.

## Self-Check: PASSED

- FOUND: src/renderer/src/SettingsModal.tsx (modificado con aiTitles/changeAiTitles/toggle)
- Build verde (exit 0)
