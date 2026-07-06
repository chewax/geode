# Roadmap: Geode

## Milestones

- ✅ **v1.0 Capa 0 / Modo Avanzado** — Phases 1-5 (shipped 2026-07-05)
- ✅ **v1.1 Explorador y gestión de archivos** — Phases 6-7 (shipped 2026-07-06)
- 🚧 **v1.2 Power-user y plataforma** — Phases 8-11 (in progress)

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

### 🚧 v1.2 Power-user y plataforma (Phases 8-11)

- [ ] **Phase 8: Versionado avanzado — borrar rama + contador de cambios** — En Modo Avanzado se borra una rama sin mergear (con protección de `main` y aviso) y la status bar muestra `+N`/`-N` sin commitear
- [ ] **Phase 9: Snapshots automáticos con IA opcional** — Opt-in en Ajustes (default OFF) para que las auto-snapshots usen IA solo en idle y solo con cambios, sin romper el invariante de costo
- [ ] **Phase 10: Gestión de plugins — activar/desactivar built-ins** — Los plugins internos se activan/desactivan desde Ajustes igual que los externos, con estado persistido
- [ ] **Phase 11: Aislamiento de plugins de terceros (Fase B, MVP)** — Terceros corren aislados (iframe + puente postMessage), con permisos declarados aplicados y sin `unsafe-eval` en el CSP

## Phase Details

### Phase 8: Versionado avanzado — borrar rama + contador de cambios
**Goal**: Los usuarios de Modo Avanzado ganan dos superficies de control del versionado: borrar una rama sin mergear de forma segura, y ver cuánto han cambiado sin guardar.
**Depends on**: Phase 7 (v1.1 shipped); reutiliza Modo Avanzado (Phase 5) y las ops de rama de `git.ts`
**Requirements**: VER-01, CHG-01
**Success Criteria** (what must be TRUE):
  1. En Modo Avanzado, el usuario puede borrar una rama que no ha mergeado desde una superficie visible (grafo o branch switcher), con un diálogo de confirmación en español (Lucide, sin jerga cruda).
  2. La rama base/protegida (`main`) nunca se puede borrar: el intento queda bloqueado con un mensaje claro.
  3. Si la rama a borrar contiene trabajo sin mergear, el usuario recibe un aviso explícito antes de perderlo — nada se elimina en silencio (valor central: nada se pierde).
  4. La status bar muestra el recuento de líneas sin commitear del vault como `+N`/`-N` (agregado en verde, quitado en rojo), actualizándose al editar y al guardar.
  5. El contador aparece solo cuando hay cambios pendientes y desaparece cuando el vault está limpio; en modo default no filtra jerga git.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Snapshots automáticos con IA opcional
**Goal**: El usuario puede optar por que las snapshots automáticas lleven título/descripción por IA, sin reintroducir costo por tiempo transcurrido.
**Depends on**: Phase 8; modifica el motor de auto-snapshots (Phase 4) y reusa el servicio de IA (Phase 3)
**Requirements**: AISNAP-01
**Success Criteria** (what must be TRUE):
  1. En Ajustes existe una opción, por defecto APAGADA, para que las snapshots automáticas usen IA en título/descripción.
  2. Con la opción apagada, las snapshots automáticas conservan exactamente el marcador sin IA actual (comportamiento v1.0 intacto).
  3. Con la opción activada, la IA solo se invoca cuando una snapshot automática realmente tiene cambios y tras un período de inactividad (idle) — nunca por tiempo transcurrido ni con el vault sin cambios.
  4. Una snapshot automática con IA activa aparece en la línea de tiempo con título/descripción legibles, igual que un guardado manual con IA.
**Plans**: TBD

### Phase 10: Gestión de plugins — activar/desactivar built-ins
**Goal**: Los plugins internos se gestionan desde Ajustes igual que los externos, con su estado persistido.
**Depends on**: Phase 9; extiende `plugins.ts` / `host.ts` / sección Plugins de `SettingsModal.tsx`
**Requirements**: PLUG-01
**Success Criteria** (what must be TRUE):
  1. En Ajustes, los plugins internos (insert-date, reading-time, outline) aparecen en la lista con un control de activar/desactivar, igual que los externos.
  2. Desactivar un plugin interno lo quita de comandos, paneles, status bar y extensiones de editor (tras aplicar el cambio; puede requerir reinicio como los externos hoy).
  3. El estado activado/desactivado de cada built-in se persiste entre sesiones en `settings.plugins.enabled`.
  4. Reactivar un built-in previamente desactivado restaura sus comandos/paneles/extensiones.
**Plans**: TBD
**UI hint**: yes

### Phase 11: Aislamiento de plugins de terceros (Fase B, MVP)
**Goal**: Los plugins de terceros no confiables corren aislados con permisos aplicados, y el host recupera un CSP sin `unsafe-eval`.
**Depends on**: Phase 10; sigue el orden de migración de `docs/PLUGINS.md` (freeze API v1 → bridge async → iframe → permisos → quitar unsafe-eval)
**Requirements**: PLUG-02
**Success Criteria** (what must be TRUE):
  1. Un plugin de terceros corre en un contexto aislado (iframe sandboxed) y no accede a `window.geode`, a Node ni a globals del renderer — solo recibe el `PluginContext` a través de un puente por `postMessage`.
  2. Las capacidades sensibles (lectura/escritura de notas, red) solo funcionan si el plugin las declaró en `plugin.json`; una llamada sin permiso declarado se rechaza en el borde del host.
  3. El CSP del renderer principal ya no incluye `'unsafe-eval'` y la app sigue funcionando (los plugins ya no se evalúan en el host).
  4. Un plugin existente (built-in o de ejemplo) sigue funcionando a través del puente, incluyendo la API de editor migrada a async (`getSelection`/`insertAtCursor` como promesas).
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
| 8. Versionado avanzado — borrar rama + contador | v1.2 | 0/? | Not started | - |
| 9. Snapshots automáticos con IA opcional | v1.2 | 0/? | Not started | - |
| 10. Gestión de plugins — built-ins | v1.2 | 0/? | Not started | - |
| 11. Aislamiento de plugins de terceros (Fase B) | v1.2 | 0/? | Not started | - |
