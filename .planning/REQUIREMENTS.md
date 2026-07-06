# Requirements: Geode — v1.2 Power-user y plataforma

**Defined:** 2026-07-06
**Core Value:** Non-destructive editing — nothing is ever lost and the git plumbing stays invisible to non-technical users.

## v1.2 Requirements

Control avanzado del versionado + apertura segura de la plataforma de plugins. La experiencia por defecto no cambia; lo nuevo vive en Modo Avanzado, Ajustes, o el subsistema de plugins.

### Versionado avanzado (Modo Avanzado)

- [ ] **VER-01**: El usuario puede deshacer/borrar una rama sin necesidad de mergearla, desde una superficie de Modo Avanzado, con confirmación; la rama base/protegida (`main`) no se puede borrar, y la operación no destruye trabajo de forma irrecuperable sin aviso.
- [ ] **CHG-01**: La status bar muestra el recuento de líneas sin commitear del vault como `+N`/`-N` (agregadas en verde, quitadas en rojo), actualizado al editar/guardar; se muestra solo cuando hay cambios pendientes.

### Snapshots automáticos con IA opcional

- [ ] **AISNAP-01**: El usuario puede activar (opt-in, configurable en Ajustes; por defecto APAGADO) que las snapshots automáticas usen IA para título/descripción. Cuando está activo, la IA solo se invoca al generar una snapshot automática que realmente tiene cambios y tras un período de inactividad (idle) — nunca por tiempo transcurrido y nunca si no hay cambios. Con la opción apagada, el comportamiento actual (marcador sin IA) se mantiene intacto.

### Plataforma de plugins

- [ ] **PLUG-01**: El usuario puede activar/desactivar plugins internos (built-in) desde Ajustes, igual que los externos, con el estado persistido; desactivar uno lo quita de comandos/paneles/status/extensiones.
- [ ] **PLUG-02**: Los plugins de terceros (no confiables) corren aislados (Fase B, MVP): no acceden a `window.geode`, a Node, ni a globals del renderer; solo reciben el `PluginContext` a través de un puente; los permisos declarados en `plugin.json` se hacen cumplir para las capacidades sensibles (lectura/escritura de notas, red); y se retira `unsafe-eval` del CSP del host.

## Future Requirements

Diferidos a hitos futuros (del ToDo del usuario / diseño):

- **PLUG-marketplace**: distribución/instalación desde un registro, firma de plugins, `minAppVersion` enforcement, migración de la API de editor a async completa — Fase B "completa" más allá del MVP de aislamiento (PLUG-02).
- **EDIT-xx**: edición Markdown enriquecida (toolbar, tablas, imágenes, hiperlinks/block links, Mermaid en preview, pantalla de ayuda).
- **VOICE-xx**: dictado por voz (speech-to-text con hook global).
- **CAPA1-01** / **CONF-01**: Capa 1 (try/keep/discard) y conflictos en lenguaje humano (diferidos de v1.0).

## Out of Scope

Excluido explícitamente de v1.2 para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Marketplace / instalación remota / firma de plugins | PLUG-02 cubre el AISLAMIENTO (lo que habilita terceros de forma segura); la distribución es un incremento posterior |
| Hot enable/disable de plugins sin reiniciar | PLUG-01 puede requerir reinicio (limitación conocida de Fase A); volverlo hot es mejora aparte |
| IA en snapshots por cadencia de tiempo | AISNAP-01 es solo-idle + solo-con-cambios, para no disparar costo por tiempo transcurrido (invariante de costo v1.0) |
| Rebase/cherry-pick/DAG surgery arbitraria | Fuera del alcance; VER-01 es solo borrar una rama |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VER-01 | Phase 8 | Pending |
| CHG-01 | Phase 8 | Pending |
| AISNAP-01 | Phase 9 | Pending |
| PLUG-01 | Phase 10 | Pending |
| PLUG-02 | Phase 11 | Pending |

**Coverage:**

- v1.2 requirements: 5 total
- Mapped to phases: 5/5 ✓ (no orphans, no duplicates)
- Phase 8: VER-01, CHG-01 · Phase 9: AISNAP-01 · Phase 10: PLUG-01 · Phase 11: PLUG-02

---
*Requirements defined: 2026-07-06*
