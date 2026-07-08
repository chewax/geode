# Roadmap: Geode

## Milestones

- ✅ **v1.0 Capa 0 / Modo Avanzado** — Phases 1-5 (shipped 2026-07-05)
- ✅ **v1.1 Explorador y gestión de archivos** — Phases 6-7 (shipped 2026-07-06)
- ✅ **v1.2 Power-user y plataforma** — Phases 8-10 (shipped 2026-07-07)
- 🚧 **v1.3 Aislamiento de plugins (Fase B)** — Phases 11-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 Capa 0 / Modo Avanzado (Phases 1-5) — SHIPPED 2026-07-05</summary>

Full detail archived at [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md).

- [x] Phase 1: Sidebar Sections (2/2 plans) — completed 2026-07-04
- [x] Phase 2: Go Back in Time (6/6 plans) — completed 2026-07-04
- [x] Phase 3: Save a Named Version (3/3 plans) — completed 2026-07-04
- [x] Phase 4: Automatic Snapshots (3/3 plans) — completed 2026-07-05
- [x] Phase 5: Advanced Mode & Capa-0 Polish (4/4 plans) — completed 2026-07-05

</details>

<details>
<summary>✅ v1.1 Explorador y gestión de archivos (Phases 6-7) — SHIPPED 2026-07-06</summary>

Full detail archived at [`milestones/v1.1-ROADMAP.md`](milestones/v1.1-ROADMAP.md).

- [x] Phase 6: Operaciones del árbol lateral — Del/Supr, F2, refresh (3/3 plans) — completed 2026-07-06
- [x] Phase 7: Tabs de preview y gestión de bóvedas — preview tabs + baja de bóveda (3/3 plans) — completed 2026-07-06

</details>

<details>
<summary>✅ v1.2 Power-user y plataforma (Phases 8-10) — SHIPPED 2026-07-07</summary>

Full detail archived at [`milestones/v1.2-ROADMAP.md`](milestones/v1.2-ROADMAP.md).

- [x] Phase 8: Versionado avanzado — borrar rama + contador +N/-N (3/3 plans) — completed 2026-07-06
- [x] Phase 9: Snapshots automáticos con IA opcional (3/3 plans) — completed 2026-07-07
- [x] Phase 10: Gestión de plugins — activar/desactivar built-ins (3/3 plans) — completed 2026-07-07

**Diferido:** PLUG-02 (aislamiento de plugins de terceros — Fase B MVP) se movió a un hito dedicado al cierre de v1.2.

</details>

### 🚧 v1.3 Aislamiento de plugins (Fase B) — Phases 11-13

MVP de la Fase B (pasos 1-5 de `docs/PLUGINS.md`): los plugins de terceros no confiables dejan de evaluarse en el renderer principal y pasan a un iframe sandboxed detrás de un puente async por postMessage, con permisos declarados y aplicados, y el renderer recupera un CSP sin `unsafe-eval`. Los built-ins siguen first-party en el host; la experiencia por defecto no cambia.

- [ ] **Phase 11: Freeze API v1 + puente async del PluginContext** — congelar API v1 + `apiVersion`/`minAppVersion`, convertir el `PluginContext` en un proxy async por postMessage contra el host actual (transporte in-host, sin iframe todavía)
- [ ] **Phase 12: Sandbox en iframe + UI del panel dentro del iframe + quitar unsafe-eval** — mover la ejecución de terceros a un iframe sandboxed, renderizar el panel dentro del iframe, y quitar `'unsafe-eval'` del CSP del renderer principal
- [ ] **Phase 13: Permisos — declarar + consentir + aplicar** — enum de `permissions` en el manifiesto, consentimiento al activar (y re-consentir en cambios), enforcement en el borde del puente

## Phase Details

### Phase 11: Freeze API v1 + puente async del PluginContext
**Goal**: Todo plugin externo habla con el host a través de un puente async request/response por postMessage (transporte in-host, sin iframe aún), y la API v1 queda congelada como contrato público versionado. Se des-riesga el cambio a API async por separado del sandbox.
**Depends on**: Phase 10 (plataforma de plugins v1 — built-ins gestionables)
**Requirements**: APIVER-01, BRIDGE-01
**Success Criteria** (qué debe ser VERDAD):
  1. El manifiesto de un plugin declara `apiVersion` (y `minAppVersion`); al cargar, el host **rechaza o avisa** de forma visible cuando son incompatibles y no evalúa la API v2 sobre un plugin marcado para otra versión.
  2. La API v1 (`PluginContext`) queda **documentada y congelada** como contrato: cualquier cambio de forma exige un bump a v2 con capa de compatibilidad (no se rompe silenciosamente un plugin v1).
  3. El `PluginContext` que recibe un plugin externo es un **proxy** que serializa cada llamada como un mensaje request/response con id; el host responde y el proxy resuelve la promesa correspondiente (mensajes huérfanos o con id desconocido se descartan sin colgar).
  4. Las APIs de editor antes síncronas (`getSelection`, `insertAtCursor`) se exponen como **`Promise`** en el borde del plugin; un plugin de ejemplo externo migrado al proxy async sigue funcionando (registra su comando/panel y opera sobre el editor a través del puente).
  5. Los built-ins (insert-date/reading-time/outline) siguen funcionando sin cambios (siguen first-party en el host, sin pasar por el puente); typecheck + build en verde.
**Plans**: TBD

### Phase 12: Sandbox en iframe + UI del panel dentro del iframe + quitar unsafe-eval
**Goal**: Un plugin de terceros corre aislado en un iframe sandboxed sin acceso a `window.geode`/Node/globals del host; su panel renderiza dentro del iframe; y el renderer principal recupera un CSP estricto sin `'unsafe-eval'`. Solo cambia el transporte del puente (in-host → iframe), no la API del plugin.
**Depends on**: Phase 11 (el puente async ya existe; aquí se swapea el transporte)
**Requirements**: ISO-01, UI-01, CSP-01
**Success Criteria** (qué debe ser VERDAD):
  1. Un plugin de terceros se ejecuta dentro de un iframe con `sandbox="allow-scripts"` **sin** `allow-same-origin`: contexto JS/DOM propio y origen opaco; desde el plugin, `window.geode`, Node y los globals del renderer principal **no son accesibles** (solo llega el `PluginContext` por el puente).
  2. El **panel** de un plugin de terceros **renderiza dentro del iframe**: el host reserva un rectángulo en el dock y le pasa tamaño y tema por mensaje; el panel se ve y responde correctamente al redimensionar y al cambiar de tema.
  3. Comandos y status-items del plugin externo se **proxyan por el puente** (aparecen en la paleta / barra de estado del host y su ejecución cruza el puente al iframe).
  4. El CSP del renderer principal (`index.html`) ya **no incluye `'unsafe-eval'`**; la app arranca, los built-ins funcionan y el plugin de ejemplo sandboxed sigue operando (nada se evalúa en el host).
  5. Un plugin externo que falla o entra en bucle **no rompe ni cuelga** la app principal (el fallo queda aislado en su iframe); la experiencia por defecto (sin plugins de terceros) es idéntica. Typecheck + build en verde.
**Plans**: TBD
**UI hint**: yes

### Phase 13: Permisos — declarar + consentir + aplicar
**Goal**: Los plugins de terceros declaran los permisos que necesitan, el usuario los consciente explícitamente al activar (y re-consiente si cambian entre versiones), y el host hace cumplir esos permisos en el borde del puente — único lugar que ejecuta acciones reales.
**Depends on**: Phase 12 (el puente atraviesa el sandbox; el enforcement vive en ese borde)
**Requirements**: PERM-01, PERM-02
**Success Criteria** (qué debe ser VERDAD):
  1. El manifiesto declara `permissions` como **enum cerrado**: `notes:read`, `notes:write`, `editor:read`, `editor:write`, `git:read`, `network`, `clipboard`; un permiso fuera del enum se rechaza/avisa al cargar.
  2. Al **activar** un plugin, el host muestra en la UI los permisos solicitados y **pide consentimiento** explícito; sin consentimiento el plugin no queda activo.
  3. Un **cambio de permisos entre versiones** del plugin **re-pide** consentimiento (el consentimiento previo no se hereda para un set de permisos distinto).
  4. El host **hace cumplir** los permisos en el **borde del puente**: una llamada sensible (`vault.readNote`/`notes:read`, `editor.insertAtCursor`/`editor:write`, `network`, etc.) **sin el permiso declarado y consentido se rechaza antes de ejecutarse** (el sandbox nunca ejecuta la acción real).
  5. `network` es **todo-o-nada** en el MVP (sin allowlist de hosts); un plugin sin `network` no puede hacer `fetch` a través del puente. Built-ins siguen sin requerir permisos (first-party). Typecheck + build en verde.
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Sidebar Sections | v1.0 | 2/2 | Complete | 2026-07-04 |
| 2. Go Back in Time | v1.0 | 6/6 | Complete | 2026-07-04 |
| 3. Save a Named Version | v1.0 | 3/3 | Complete | 2026-07-04 |
| 4. Automatic Snapshots | v1.0 | 3/3 | Complete | 2026-07-05 |
| 5. Advanced Mode & Capa-0 Polish | v1.0 | 4/4 | Complete | 2026-07-05 |
| 6. Operaciones del árbol lateral | v1.1 | 3/3 | Complete | 2026-07-06 |
| 7. Tabs de preview y gestión de bóvedas | v1.1 | 3/3 | Complete | 2026-07-06 |
| 8. Versionado avanzado — borrar rama + contador | v1.2 | 3/3 | Complete | 2026-07-06 |
| 9. Snapshots automáticos con IA opcional | v1.2 | 3/3 | Complete | 2026-07-07 |
| 10. Gestión de plugins — built-ins | v1.2 | 3/3 | Complete | 2026-07-07 |
| 11. Freeze API v1 + puente async del PluginContext | v1.3 | 0/? | Not started | - |
| 12. Sandbox en iframe + UI + quitar unsafe-eval | v1.3 | 0/? | Not started | - |
| 13. Permisos — declarar + consentir + aplicar | v1.3 | 0/? | Not started | - |
