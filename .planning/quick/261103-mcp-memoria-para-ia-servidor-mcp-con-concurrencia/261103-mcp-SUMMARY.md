---
phase: quick-261103-mcp
plan: 01
subsystem: main / servidor MCP + GitService + renderer
tags: [mcp, ia, memoria, concurrencia, non-destructive]
provides:
  - "Servidor MCP por stdio (out/main/mcp.js): list/search/read/write/edit/append/note_history/read_note_version"
  - "withVaultLock: candado entre procesos por bóveda (.geode/write.lock), reentrante"
  - "GitService.commitPaths: commit acotado a rutas con autor propio"
  - "IPC geode:vault-external-change + geode:mcp-info; Ajustes → Memoria para IA"
key-files:
  created:
    - "src/main/fs/vaultLock.ts"
    - "src/main/mcp/index.ts"
    - "src/main/mcp/memory.ts"
    - "src/main/mcp/server.ts"
    - "src/renderer/src/McpSettings.tsx"
    - "tests/mcp.test.ts"
    - "docs/MCP.md"
---

# Quick 261103-mcp: Memoria para IA (servidor MCP)

Geode expone la bóveda como memoria de un LLM vía MCP. Concurrencia: candado
entre procesos (un escritor a la vez) + concurrencia optimista en write_note
(expected_version) + versionado previo de cambios del usuario sin guardar +
commits acotados a la nota tocada. La app sondea .geode/external-change.json,
recarga y respalda. Detalle y alternativas descartadas en docs/MCP.md.

Verificación: typecheck OK, electron-vite build OK (mcp.js sin dependencia de
electron), 71/71 tests, prueba por stdio con node contra una bóveda temporal.
Pendiente de verificar en un paquete real: ELECTRON_RUN_AS_NODE leyendo
out/main/mcp.js desde app.asar.
