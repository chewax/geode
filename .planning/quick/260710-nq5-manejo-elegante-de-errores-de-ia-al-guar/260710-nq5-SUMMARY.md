---
phase: quick-260710-nq5
plan: 01
subsystem: ai-error-handling
tags: [ai, ux, error-handling, ipc, degradation]
requires:
  - src/main/services/ai.ts
  - src/main/index.ts
  - src/renderer/src/CommitDialog.tsx
  - src/renderer/src/AiPromptModal.tsx
provides:
  - "mapAiError: boundary de traducción de fallos de IA a español (proceso main)"
  - "friendlyAiError: helper que descarta el envoltorio de IPC (renderer)"
affects:
  - "Flujo de guardar versión (sugerencia de IA)"
  - "Asistente de escritura Ctrl+K"
tech-stack:
  added: []
  patterns:
    - "Boundary de traducción de errores a español (imita mapBackupError de v1.2)"
    - "Degradación grácil: la IA opcional nunca bloquea el flujo núcleo"
key-files:
  created:
    - src/renderer/src/ai/friendlyError.ts
  modified:
    - src/main/services/ai.ts
    - src/main/index.ts
    - src/renderer/src/CommitDialog.tsx
    - src/renderer/src/AiPromptModal.tsx
decisions:
  - "mapAiError clasifica por texto del error (los mensajes los generamos nosotros en chat()/listModels()) porque OpenRouter no expone un campo de status estructurado en el Error crudo"
  - "friendlyAiError usa regex para quitar el prefijo de Electron 'Error invoking remote method ...:' y el '<Tipo>Error:' que le sigue; el mensaje real ya viene traducido por mapAiError"
  - "El botón Guardar versión no recibe gates nuevos: sigue habilitado tras un fallo de IA (generating vuelve a false en finally)"
metrics:
  duration: 6min
  completed: 2026-07-10
  tasks: 2
  files: 5
---

# Quick 260710-nq5: Manejo elegante de errores de IA al guardar versión — Summary

Cuando la sugerencia de IA falla (caso real: OpenRouter devuelve 404 "No endpoints found" porque el modelo configurado fue dado de baja), guardar versión ahora degrada con elegancia: nunca se bloquea y muestra un aviso amigable en español que sugiere revisar el modelo en Ajustes → IA, en vez del crudo de IPC.

## What Was Built

- **`mapAiError(e: unknown): Error`** en `src/main/services/ai.ts` — boundary de traducción que clasifica el fallo del proveedor a partir del texto (404/"No endpoints found" → modelo inexistente; 401/403/auth → key rechazada; timeout/abort/red → sin conexión; resto → genérico) y devuelve SIEMPRE un `Error` nuevo con copy amigable, nunca el crudo. Imita el precedente de `mapBackupError` (v1.2).
- **Tres handlers de IA envueltos** en `src/main/index.ts` (`aiSuggestVersion`, `aiSuggestMessage`, `aiGenerateText`): el catch hace `throw mapAiError(e)`. `aiSnapshotMessage` quedó intacto (ya degrada al marcador con try/catch → null).
- **`friendlyAiError(e, fallback): string`** en `src/renderer/src/ai/friendlyError.ts` — descarta el envoltorio que Electron antepone a los rejects de IPC (`Error invoking remote method '<canal>': Error: <mensaje real>`) devolviendo solo el mensaje real ya traducido; cae al `fallback` si queda vacío o `e` no es Error.
- **`CommitDialog.tsx` y `AiPromptModal.tsx`** ahora hacen `setError(friendlyAiError(e, <fallback>))`. El aviso se muestra inline con `AlertTriangle` (Lucide, sin emojis) y el botón Guardar sigue habilitado.

## How It Works

`OpenRouterProvider.chat()` lanza `OpenRouter /chat devolvió 404: <body>` → el handler en main lo captura y `mapAiError` lo traduce a copy española → Electron serializa el reject al renderer envolviéndolo → `friendlyAiError` quita el envoltorio → el diálogo muestra la copy limpia. Doble red de seguridad: main traduce, renderer limpia el envoltorio de transporte.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run typecheck` — verde (node + web).
- `npm run build` — verde (built in 11.56s).
- Done criteria de ambas tasks cumplidos: `mapAiError` exportada y usada en los tres handlers; `aiSnapshotMessage` sin cambios; `friendlyAiError` descarta el prefijo de IPC; ambos diálogos lo usan; el botón Guardar versión no recibe gates nuevos.
- UAT humano pendiente (convención del repo: cero tests automatizados). Repro: configurar un modelo inexistente y abrir "Guardar versión".

## Commits

- `7764ccc`: feat(quick-260710-nq5): boundary mapAiError traduce fallos de IA a español
- `f33e471`: feat(quick-260710-nq5): descartar envoltorio IPC en avisos de IA de los diálogos

## Self-Check: PASSED

- FOUND: src/renderer/src/ai/friendlyError.ts
- FOUND: mapAiError en src/main/services/ai.ts
- FOUND: commit 7764ccc
- FOUND: commit f33e471
