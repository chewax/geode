# Requirements: Geode — v1.3 Aislamiento de plugins (Fase B)

**Defined:** 2026-07-07
**Core Value:** Non-destructive editing — nothing is ever lost and the git plumbing stays invisible to non-technical users.

## v1.3 Requirements

Abrir la plataforma de plugins a **terceros no confiables** de forma segura: los plugins externos dejan de evaluarse en el renderer principal y pasan a un **iframe sandboxed** detrás de un **puente async por postMessage**, con un **modelo de permisos** declarado y aplicado, y el renderer principal recupera un **CSP sin `unsafe-eval`**. Es la Fase B (MVP) del ecosistema de plugins descrito en `docs/PLUGINS.md`. La experiencia por defecto no cambia; los built-ins (first-party) siguen corriendo confiables en el host.

**Decisiones de alcance (fijadas en el discuss 2026-07-07):**
- **MVP = pasos 1-5 de `docs/PLUGINS.md`** (congelar API v1 + apiVersion, bridge async, iframe sandbox, permisos, quitar unsafe-eval). **Diferido:** hot-reload sin reiniciar e instalación desde zip/URL (paso 6) → Future.
- **Solo los plugins de terceros (externos) se aíslan** en el iframe. Los 3 built-ins (insert-date/reading-time/outline) siguen first-party en el host (acceso directo, sin permisos). Al menos un plugin de ejemplo se migra al bridge para validarlo.
- **UI de panel:** el plugin renderiza su UI **dentro del iframe**; el host le reserva un rectángulo y le pasa tamaño/tema por mensaje.
- **Permisos:** enum cerrado simple; `network` es todo-o-nada (sin allowlist de hosts en el MVP).

### Versionado y contrato de la API

- [x] **APIVER-01**: El manifiesto declara `apiVersion` (y `minAppVersion`); el host **rechaza o avisa** si son incompatibles antes de cargar el plugin. La API v1 (`PluginContext`) queda **congelada** como contrato público (cambios → v2 con capa de compatibilidad).

### Puente async (transporte-agnóstico)

- [x] **BRIDGE-01**: Toda la API del plugin pasa por un **protocolo async request/response** (`postMessage` con id). El `PluginContext` que recibe el plugin es un **proxy** que serializa llamadas al host. Las APIs de editor hoy síncronas (`getSelection`, `insertAtCursor`) se exponen como **`Promise`** (API async v2 en el borde). Un plugin de ejemplo existente sigue funcionando a través del puente.

### Aislamiento (sandbox)

- [ ] **ISO-01**: Un plugin de terceros corre en un **iframe sandboxed** (`sandbox="allow-scripts"`, sin `allow-same-origin`): contexto JS/DOM propio, origen opaco. **No accede** a `window.geode`, a Node, ni a globals del renderer principal — solo recibe el `PluginContext` a través del puente (BRIDGE-01).
- [ ] **UI-01**: El **panel** de un plugin de terceros renderiza **dentro del iframe**; el host solo le reserva el espacio en el dock y le pasa tamaño/tema por mensaje. Comandos y status-items del plugin se proxyan por el puente.

### Permisos

- [ ] **PERM-01**: El manifiesto declara `permissions` (enum cerrado: `notes:read`, `notes:write`, `editor:read`, `editor:write`, `git:read`, `network`, `clipboard`). Al **activar** un plugin, el host muestra los permisos solicitados y **pide consentimiento**; un cambio de permisos entre versiones **re-pide** consentimiento.
- [ ] **PERM-02**: El host **hace cumplir** los permisos en el **borde del puente** (único lugar que ejecuta acciones reales): una llamada sensible (`vault.readNote`, `editor.insertAtCursor`, `network`, etc.) **sin el permiso declarado se rechaza antes de ejecutarse**. El sandbox nunca tiene acceso directo a nada.

### CSP endurecido

- [ ] **CSP-01**: El CSP del **renderer principal** ya **no incluye `'unsafe-eval'`** (los plugins de terceros ya no se evalúan en el host). La app y los built-ins siguen funcionando; el iframe del sandbox mantiene su propio contexto para ejecutar el plugin.

## Future Requirements

Diferidos a hitos futuros:

- **PLUG-hotreload**: activar/desactivar/recargar plugins en caliente sin reiniciar (instanciar/destruir el sandbox + `activate`/cleanup) — paso 6 de la migración; queda para después del MVP de aislamiento.
- **PLUG-marketplace**: instalación desde `.zip`/URL/registro, verificación de integridad (hash), firma de plugins, allowlist de hosts en `network`, SDK/template de autor publicado — Fase B "completa" más allá del MVP.
- **EDIT-xx**: edición Markdown enriquecida (toolbar, tablas, imágenes, hiperlinks/block links, Mermaid en preview, ayuda).
- **VOICE-xx**: dictado por voz (speech-to-text con hook global).
- **CAPA1-01** / **CONF-01**: Capa 1 (try/keep/discard) y conflictos en lenguaje humano (diferidos de v1.0).

## Out of Scope

Excluido explícitamente de v1.3 para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Hot-reload de plugins sin reiniciar | Paso 6; el MVP aplica cambios de activación al reiniciar (paridad con Fase A / PLUG-01) |
| Instalación desde zip/URL/registro, firma, marketplace | Distribución es un incremento posterior al aislamiento; el MVP instala copiando la carpeta (como Fase A) |
| Allowlist de hosts en `network` | El MVP trata `network` como todo-o-nada; la granularidad por host es una mejora aparte |
| Mover los built-ins al sandbox | Los built-ins son first-party/confiables; migrarlos (outline usa revealRange en el host) es trabajo/riesgo sin beneficio de seguridad |
| UI declarativa (host renderiza la UI del plugin) | Se eligió UI dentro del iframe (más flexible para empezar); la UI declarativa queda como alternativa futura |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| APIVER-01 | Phase 11 | Complete |
| BRIDGE-01 | Phase 11 | Complete |
| ISO-01 | Phase 12 | Pending |
| UI-01 | Phase 12 | Pending |
| CSP-01 | Phase 12 | Pending |
| PERM-01 | Phase 13 | Pending |
| PERM-02 | Phase 13 | Pending |

**Coverage:**

- v1.3 requirements: 7 total
- Mapped to phases: 7/7 (propuesta; el roadmapper confirma)
- Phase 11 (bridge async + API freeze): APIVER-01, BRIDGE-01 · Phase 12 (iframe sandbox + UI + quitar unsafe-eval): ISO-01, UI-01, CSP-01 · Phase 13 (permisos): PERM-01, PERM-02

---
*Requirements defined: 2026-07-07 — Fase B MVP (docs/PLUGINS.md pasos 1-5)*
