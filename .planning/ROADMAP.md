# Roadmap: Geode

## Milestones

- ✅ **v1.0 Capa 0 / Modo Avanzado** — Phases 1-5 (shipped 2026-07-05)
- ✅ **v1.1 Explorador y gestión de archivos** — Phases 6-7 (shipped 2026-07-06)
- ✅ **v1.2 Power-user y plataforma** — Phases 8-10 (shipped 2026-07-07)
- 🚧 **v1.3 Onboarding guiado** — Phases 11-13 (in progress)

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

### 🚧 v1.3 Onboarding guiado (In Progress)

**Milestone Goal:** Que un usuario que no sabe qué es GitHub llegue solo, guiado, desde "abrir la app por primera vez" hasta "escribí una nota, la guardé y la respaldé en la nube" — sin toparse nunca con jerga (bóveda/Git/clonar/repo/commit/push). Local primero, nube después: empezar a escribir es 1 click sin cuenta; el respaldo nunca es peaje de entrada.

**Orden fijado por una dependencia dura:** el paso "respaldar" del tour se ancla (vía `data-tour`) a un botón de respaldo en la nube que solo existe una vez construido el asistente de respaldo. Por eso el tour (Fase 13) va después del asistente (Fase 12), y ambos después de la creación local (Fase 11).

- [ ] **Phase 11: Bienvenida y creación local** — Bienvenida sin jerga + cuaderno local en 1 click, nota sembrada y reescritura de strings.
- [ ] **Phase 12: Asistente de respaldo en la nube** — Tarjeta no bloqueante que guía cuenta + primer push automático, con errores humanizados.
- [ ] **Phase 13: Tour interactivo de primera vez** — TourOverlay propio de ≤5 pasos, disparado tras el primer cuaderno, re-lanzable y con degradación grácil.

## Phase Details

### Phase 11: Bienvenida y creación local
**Goal**: Un usuario nuevo pasa de "abrir la app por primera vez" a "estar escribiendo en su primer cuaderno" en 1 click — sin cuenta, sin selector de carpeta y sin ver jerga.
**Depends on**: Nothing (primera fase del hito; construye sobre la app existente)
**Requirements**: ONB-01, ONB-02, ONB-03, ONB-04, COPY-01
**Success Criteria** (what must be TRUE):
  1. Al abrir la app por primera vez, el usuario ve una bienvenida con un único botón claro "Crear mi primer cuaderno" y ningún término técnico; "abrir una carpeta existente" queda como link secundario.
  2. Con un solo click, el usuario tiene un cuaderno listo para escribir, guardado en su carpeta Geode por defecto (dentro de Documentos), sin haber elegido carpeta ni creado cuenta; "elegir otra ubicación" existe solo como escape secundario.
  3. El cuaderno recién creado abre mostrando una nota de bienvenida en español (nunca un editor en blanco), que el usuario puede borrar.
  4. El usuario puede nombrar el cuaderno con cualquier texto —incluso caracteres que Windows no permite o un nombre repetido— y siempre se crea bien, sin errores y sin pisar un cuaderno anterior.
  5. Los textos de cara al usuario en Capa 0 dicen "cuaderno" y "copia de seguridad / respaldo en la nube", nunca "bóveda / GitHub / repo / clonar".
**Plans**: TBD
**UI hint**: yes

### Phase 12: Asistente de respaldo en la nube
**Goal**: El usuario respalda su cuaderno en la nube guiado paso a paso —incluso creando una cuenta gratuita si no la tiene— sin toparse con jerga, y de ahí en más el respaldo es automático e invisible. Introduce el botón de respaldo que el tour usará como ancla.
**Depends on**: Phase 11 (necesita un cuaderno local existente al que engancharle el respaldo)
**Requirements**: BACKUP-01, BACKUP-02, BACKUP-03, BACKUP-04, BACKUP-05
**Success Criteria** (what must be TRUE):
  1. Después de crear su primer cuaderno, el usuario ve una invitación no bloqueante (tarjeta, no modal) para respaldarlo en la nube, con "Hacerlo después" siempre disponible y un punto persistente para retomarlo más tarde.
  2. Un usuario sin cuenta es guiado a crear una gratis: la app abre la página de registro en el navegador y muestra una checklist que sobrevive el ida-y-vuelta; "GitHub" se nombra solo en ese paso, presentado como "servicio gratuito y seguro (gratis + privado)".
  3. Al conectar, el primer respaldo se sube solo —con una primera versión ya incluida para que nunca quede vacío— sin que el usuario vea nada de repo/subir/versiones.
  4. Tras conectar, cada vez que el usuario guarda, su cuaderno se respalda solo, y el indicador dice "Todo en la nube" únicamente cuando de verdad está todo subido (honra STAT-01: nunca "a salvo" antes de un respaldo real).
  5. Si algo falla en el camino de respaldo, el usuario ve un mensaje en lenguaje claro (p.ej. "Ya tenés un respaldo con ese nombre"), nunca el mensaje crudo de la API.
**Plans**: TBD
**UI hint**: yes

### Phase 13: Tour interactivo de primera vez
**Goal**: Tras crear su primer cuaderno, un recorrido guiado y liviano le muestra al usuario los gestos esenciales (escribir → guardar → respaldar → ver historial) señalando botones reales, sin poder atascarlo, sin repetirse solo y sin exponer superficies de Modo Avanzado.
**Depends on**: Phase 12 (el paso "respaldar" se ancla al botón de respaldo que introduce la Fase 12)
**Requirements**: TOUR-01, TOUR-02, TOUR-03
**Success Criteria** (what must be TRUE):
  1. Después de crear el primer cuaderno (no al arrancar la app), aparece un recorrido propio (spotlight + cartel) de ≤5 pasos que resalta botones reales y explica escribir → guardar → respaldar → ver historial.
  2. El recorrido muestra "Paso N de M", se puede saltar en cualquier momento y se puede volver a lanzar desde Ayuda.
  3. Una vez visto, el recorrido queda marcado como visto y no vuelve a aparecer solo en arranques posteriores.
  4. Si un botón del paso todavía no está en pantalla (p.ej. el de nube antes de conectar), el paso se adapta sin romperse (sin spotlight sobre la nada), y el recorrido nunca resalta funciones de Modo Avanzado (rama/merge/grafo).
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 11 → 12 → 13

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
| 11. Bienvenida y creación local | v1.3 | 0/TBD | Not started | - |
| 12. Asistente de respaldo en la nube | v1.3 | 0/TBD | Not started | - |
| 13. Tour interactivo de primera vez | v1.3 | 0/TBD | Not started | - |
