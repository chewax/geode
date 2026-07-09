# Requirements: Geode — v1.3 Onboarding guiado

**Defined:** 2026-07-08
**Core Value:** Non-destructive editing — nada se pierde y el plumbing de git queda invisible para usuarios no técnicos.

## v1 Requirements

Requisitos del milestone v1.3. Cada uno mapea a una fase del roadmap.

### Bienvenida y creación local (ONB)

- [x] **ONB-01**: El usuario ve una bienvenida sin jerga con un único CTA primario "Crear mi primer cuaderno"; abrir una carpeta existente queda como link secundario (sin "vault/Git/clonar/local-first" en la copy).
- [x] **ONB-02**: El usuario crea un cuaderno local en 1 click en una carpeta Geode por defecto (`~/Documents/Geode/<nombre>`), sin selector de carpeta y sin cuenta; "Elegir otra ubicación" existe como escape secundario fuera del happy path.
- [x] **ONB-03**: El cuaderno recién creado arranca con una nota de bienvenida sembrada en español (nunca un editor vacío), borrable, que además sirve de escenario para el tour.
- [x] **ONB-04**: El nombre del cuaderno se sanitiza como antes garantizaba el diálogo del SO (caracteres ilegales de Windows `< > : " / \ | ? *` + nombres reservados `CON`/`PRN`/`AUX`/`NUL`/`COM1`…) y las colisiones de carpeta se resuelven con sufijo, sin fallar ni pisar datos.

### Respaldo en la nube (BACKUP)

- [ ] **BACKUP-01**: El asistente de respaldo es no bloqueante (tarjeta, no modal), con "Hacerlo después" siempre presente y un punto de re-entrada persistente para retomarlo más tarde.
- [ ] **BACKUP-02**: El usuario sin cuenta es guiado a crearla: hand-off a la página de registro en el navegador + checklist en la app que sobrevive el ida-y-vuelta; "GitHub" se nombra solo en ese paso, enmarcado como "servicio gratuito y seguro", con refuerzo "gratis + privado".
- [ ] **BACKUP-03**: Al conectar (reusando el device flow existente) se crea el repo privado y se hace el primer push automáticamente, con la primera versión sembrada para que el push nunca sea vacío, sin exponer repo/commit/push al usuario.
- [ ] **BACKUP-04**: Tras conectar, el respaldo es automático e invisible ("cada vez que guardás, se respalda solo"), respetando el invariante de honestidad STAT-01 ("Todo en la nube" solo cuando el árbol está limpio y pusheado).
- [ ] **BACKUP-05**: Los errores del camino de respaldo se muestran en lenguaje humano sin jerga (p.ej. nombre de repo tomado → "Ya tenés un respaldo con ese nombre"), nunca el mensaje crudo de la API.

### Tour interactivo de primera vez (TOUR)

- [ ] **TOUR-01**: Un `TourOverlay` propio (spotlight + cartel anclado a botones reales vía `data-tour`) recorre ≤5 pasos (escribir → guardar → respaldar → historial) y se dispara tras crear el primer cuaderno, no al arrancar la app.
- [ ] **TOUR-02**: El tour muestra progreso ("Paso N de M"), tiene "Saltar", es re-lanzable desde Ayuda, persiste "tour visto" y nunca se auto-repite en arranques posteriores.
- [ ] **TOUR-03**: Los pasos degradan con gracia cuando el ancla no está montada (evita `getBoundingClientRect` null del botón de nube antes de conectar) y nunca anclan superficies de Modo Avanzado (rama/merge/grafo).

### Reescritura de jerga (COPY)

- [x] **COPY-01**: Se reescriben los strings de cara al usuario en Capa 0 para reemplazar "GitHub/repo/clonar/bóveda" por "respaldo en la nube / copia de seguridad / cuaderno" (bienvenida, NewVaultDialog, sección de respaldo en Ajustes).

## v2 Requirements

Reconocidos pero diferidos; no entran en el roadmap de v1.3.

### Onboarding avanzado (ONBX)

- **ONBX-01**: Coach marks just-in-time al primer uso de features más profundos (tags, diff, volver-atrás) en vez de sumar pasos al tour.
- **ONBX-02**: Checklist de onboarding multi-sesión ("2 de 3 pasos listos") si las métricas muestran que los usuarios difieren el respaldo y no vuelven.
- **ONBX-03**: Contenido sembrado personalizado por caso de uso declarado (estudiante/escritor/notas).
- **ONBX-04**: Tour de Modo Avanzado (ramas/grafo) como recorrido opt-in separado, nunca mezclado con el tour de Capa 0.

## Out of Scope

Exclusiones explícitas, con razón, para evitar scope creep.

| Feature | Razón |
|---------|-------|
| Automatizar la creación de cuenta (headless browser / signup scripteado) | Captcha + verificación de email lo hacen imposible/frágil y es un campo minado de ToS/anti-bot. El hand-off guiado + checklist es el techo (decisión de PROJECT.md). |
| Pollear a GitHub para detectar que la cuenta se creó | No hay señal confiable/autorizada; frágil y ruidoso en privacidad. Se detecta por el éxito del device flow (el usuario volvió y autorizó). |
| Carrusel de bienvenida multi-slide antes de la app | Peor medido de su clase (2-3x peor que contextual); se salta y no retiene. Se entra directo al cuaderno sembrado + tour progresivo. |
| Tour de más de 5 pasos | >5 pasos → 63% de abandono. Cap duro en 4-5 pasos Capa 0; el resto va a coach marks just-in-time (v2). |
| Modal bloqueante que fuerza el registro antes de escribir | Viola "local primero, nube después"; un muro de signup en un sitio de terceros desconocido es drop-off masivo. |
| Nombrar "GitHub/repo/commit/push/clone" en la copy de Capa 0 | Rompe el core value (git invisible). "GitHub" solo aparece en el hand-off de registro, como "servicio gratuito y seguro". |
| Auto-repetir el tour en cada arranque / recordatorios insistentes | Fatiga de tour → se entrena a ignorarlo. Se muestra una vez; re-lanzable solo por acción explícita en Ayuda. |

## Traceability

Qué fases cubren qué requisitos. La completa el roadmapper.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ONB-01 | Phase 11 | Complete |
| ONB-02 | Phase 11 | Complete |
| ONB-03 | Phase 11 | Complete |
| ONB-04 | Phase 11 | Complete |
| COPY-01 | Phase 11 | Complete |
| BACKUP-01 | Phase 12 | Pending |
| BACKUP-02 | Phase 12 | Pending |
| BACKUP-03 | Phase 12 | Pending |
| BACKUP-04 | Phase 12 | Pending |
| BACKUP-05 | Phase 12 | Pending |
| TOUR-01 | Phase 13 | Pending |
| TOUR-02 | Phase 13 | Pending |
| TOUR-03 | Phase 13 | Pending |

**Coverage:**

- v1 requirements: 13 total
- Mapped to phases: 13 (Phase 11: 5 · Phase 12: 5 · Phase 13: 3) ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-08*
*Last updated: 2026-07-08 — roadmap mapping (phases 11-13) added*
