---
phase: 13
slug: tour-interactivo-de-primera-vez
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-09
---

# Phase 13 — UI Design Contract

> Contrato visual y de interacción para la Fase 13 (Tour interactivo de primera vez). Generado por gsd-ui-researcher; verificado por gsd-ui-checker.
>
> **Regla de oro de esta fase:** NO se inventa un lenguaje visual nuevo. El `TourOverlay` es una superficie NUEVA (spotlight + cartel), pero reutiliza exclusivamente los tokens y patrones ya existentes en `src/renderer/src/index.css` (`--bg/--panel-2/--border/--accent/--muted/--text`, radio `8px`, sombra `0 8px 24px rgba(0,0,0,0.45)`, backdrop `rgba(0,0,0,0.55)` de `.modal-overlay`, clases `.primary`, `.link-btn`, `.spin`). Ninguna dependencia nueva. Ninguna acción destructiva.
>
> **Invariantes de esta fase (no negociables):**
> 1. **Nunca se atasca:** `Esc` y "Saltar" cierran el tour en cualquier paso; el clic fuera del cartel NO rompe ni cierra el tour (a diferencia de un modal).
> 2. **Nunca hace spotlight sobre la nada:** si el ancla no está montada o `getBoundingClientRect` da null/0, el paso cae a cartel centrado sin recorte (evita el crash de rect null).
> 3. **Solo Capa 0:** los `data-tour` viven únicamente en escribir/guardar/respaldar/historial; JAMÁS en rama/merge/grafo/Modo Avanzado.
> 4. **No auto-repite:** una vez terminado o saltado, `onboarding.tourSeen=true` y no reaparece solo.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (sistema CSS manual existente — NO shadcn, NO Tailwind) |
| Preset | not applicable |
| Component library | none (componentes React propios + CSS plano en `index.css`) |
| Icon library | lucide-react (monocromo `currentColor`, `size` prop; NUNCA emojis) |
| Font | `system-ui, -apple-system, Segoe UI, Roboto, sans-serif` (declarada en `:root`) |

**shadcn gate:** ejecutado. Decisión = `none`. Rationale: la app tiene un design system manual maduro (tokens en `:root`, clases kebab-case, sin linter) y CLAUDE.md prohíbe explícitamente introducir shadcn/Tailwind. El tour es un overlay propio y liviano "sin dependencia nueva" (decisión LOCKED en 13-CONTEXT.md); introducir una librería de tours (react-joyride/shepherd) contradice esa decisión y las restricciones del proyecto. Consistente con Fases 11 y 12. Registry safety gate: no aplica.

---

## Spacing Scale

Escala base de 4pt. Esta fase NO introduce valores nuevos: reutiliza los ya presentes en las clases existentes.

| Token | Value | Usage en esta fase |
|-------|-------|--------------------|
| xs | 4px | Gap ícono↔título del cartel; gap fino del footer |
| sm | 8px | **Separación ancla↔cartel** (offset del auto-flip); **padding del recorte del spotlight** alrededor del rect; gap entre botones del footer |
| md | 16px | Padding interno del cartel (`.tour-card`); separación título ↔ cuerpo ↔ footer |
| lg | 24px | — (no requerido) |
| xl | 32px | — (no requerido) |

Exceptions (valores heredados del CSS existente, se conservan para consistencia — NO son nuevos):
- `6px` — gap base de `button`, radio de borde de botones/inputs.
- `10px 18px` — padding de `.primary` (botones "Siguiente"/"Listo").
- `8px` radio del cartel (heredado de `.vault-menu`/`.status-pop`); `0 8px 24px rgba(0,0,0,0.45)` sombra del cartel (heredada).
- `9999px` — radio del box-shadow del velo del spotlight (técnica de recorte, no es spacing de layout).

Nota para planning: NO introducir ningún valor de spacing NUEVO fuera del conjunto reutilizado (4/8/16 + las excepciones heredadas). El cartel se dimensiona con `max-width: 320px` (mismo contrato de ancho que el input de bienvenida de Fase 11 y el `max-width` del `.status-pop`), nunca a ancho completo.

---

## Typography

| Role | Size | Weight | Line Height | Uso en esta fase |
|------|------|--------|-------------|------------------|
| Heading | 18px | 600 | 1.3 | Título de cada paso del cartel (`.tour-card-title`, reusa escala de `.modal h2`) |
| Body | 14px | 400 | 1.5 | Cuerpo/microcopy de cada paso (`.tour-card-body`) |
| Control | 13px | 500 | 1.2 | Texto de los botones del footer (heredado: `button` base = 13px) |
| Label | 12px | 400 | 1.4 | Progreso "Paso N de M" (`.tour-progress`, muted) |

Pesos declarados (máx. 2): **400 regular** + **600 semibold**. El 600 se reserva a `.tour-card-title` y al `.primary` ("Siguiente"/"Listo"); el cuerpo va en 400. (El `500` del texto de botón es el peso heredado de `button`/`.link-btn` del CSS existente, no un peso nuevo introducido por esta fase.)

Escala de esta fase: exactamente **4 tamaños** (18 / 14 / 13 / 12), todos ya presentes en `index.css`. No se introduce ningún tamaño nuevo.

Line-height del cuerpo: **1.5** (coincide con `.hint`/`.pop-note`). Título: **1.3**.

---

## Color

Paleta oscura ya definida en `:root` de `index.css`. Esta fase NO agrega colores.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#16161a` (`--bg`) | — (el shell de la app se ve tenue bajo el velo) |
| Secondary (30%) | `#202027` (`--panel-2`) / `#1c1c22` (`--panel`) | Superficie del cartel (`.tour-card`), igual que modales/popovers |
| Accent (10%) | `#b794f6` (`--accent`) | Ver lista de reserva abajo |
| Destructive | `#ff6b6b` | NO aplica — el tour no tiene estados de error ni acciones destructivas |

**Velo del spotlight (backdrop):** `rgba(0, 0, 0, 0.55)` — el MISMO valor que `.modal-overlay` (index.css:1422). Se aplica como `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` sobre el rect del ancla, dejando el control real "iluminado" dentro del recorte. NO es un color nuevo.

Accent reserved for (lista explícita — nunca "todos los elementos interactivos"):
1. **Anillo del spotlight** alrededor del control resaltado (borde de 2px `var(--accent)` sobre el recorte — patrón heredado de `outline: 1px solid var(--accent)` / `box-shadow: inset 0 0 0 1px var(--accent)` del CSS existente).
2. Relleno del botón primario `.primary` del cartel ("Siguiente" y "Listo").
3. Borde/realce de foco de teclado de los botones del cartel (patrón `:focus { border-color: var(--accent) }`).
4. `--head` (`#2dd4bf`) NO se usa en ninguna superficie del tour (reservado a HEAD del grafo — evitar que el usuario asocie el anillo del tour con el Modo Avanzado).

Texto: `--text #e6e6ea` (título + cuerpo del cartel), `--muted #9a9aa6` (progreso "Paso N de M", "Saltar"/"Anterior"). Sobre el `.primary` morado el texto va en `#16161a` (patrón existente, contraste alto).

---

## Copywriting Contract

Todo user-facing en español rioplatense (voseo), 2ª persona, tono cálido, corto, SIN jerga (nunca "bóveda / GitHub / repo / commit / push / clonar / overlay / tour / spotlight" de cara al usuario). Íconos Lucide, nunca emojis.

### Los 4 pasos (microcopy exacto — redacción LOCKED de Claude's Discretion)

| # | Paso | `data-tour` | Ícono Lucide | Título | Cuerpo |
|---|------|-------------|--------------|--------|--------|
| 1 | escribir | `escribir` (editor host) | `PencilLine` (16) | **Escribí sin miedo** | **Este es tu cuaderno. Escribí lo que quieras acá: se guarda solo y nunca vas a perder nada.** |
| 2 | guardar | `guardar` (botón Guardar versión, App.tsx:1305) | `Save` (16) | **Marcá una versión** | **Cuando algo te importe, guardá una versión desde acá. Vas a poder volver a este momento más adelante.** |
| 3 | respaldar | `respaldo` (BackupButton, ya existe) | `Cloud` (16) | **Respaldá en la nube** | **Desde este botón guardás una copia de seguridad en la nube, por si algo le pasa a este dispositivo.** |
| 4 | historial | `historial` (Timeline, App.tsx:1394) | `History` (16) | **Volvé cuando quieras** | **Acá está el historial de tu cuaderno. Podés mirar los cambios y volver a cualquier versión anterior.** |

Notas de copy:
- El paso "respaldar" **solo describe** el botón; su microcopy NO afirma que el cuaderno ya está a salvo (respeta STAT-01: no se dice "está respaldado / en la nube" hasta que haya un push real; esta copy es instructiva, en futuro condicional).
- Máximo ~2 líneas de cuerpo por cartel (cap de atención; PROJECT.md: >5 pasos → 63% abandono, se aplica el mismo criterio de brevedad al cuerpo).

### Controles del cartel (LOCKED en 13-CONTEXT.md)

| Element | Copy | Presencia |
|---------|------|-----------|
| Progreso | **Paso {n} de {m}** (p. ej. "Paso 1 de 4") | Todos los pasos (izquierda del footer, `--muted`) |
| Saltar | **Saltar** | Todos los pasos MENOS el último (`.link-btn`, muted); cierra y marca visto |
| Anterior | **Anterior** | Todos MENOS el paso 1 (`.link-btn`/botón fantasma); oculto o deshabilitado en el paso 1 |
| Siguiente | **Siguiente** | Todos MENOS el último (`.primary`, accent) |
| Listo | **Listo** | Solo el último paso, reemplaza a "Siguiente"/"Saltar" (`.primary`, accent); cierra y marca visto |

### Re-lanzamiento (LOCKED: mínimo comando en la paleta)

| Superficie | Copy | Detalle |
|------------|------|---------|
| Comando de paleta | **Ver el recorrido guiado** | `host.registerCommand({ id: 'core.tour', title: 'Ver el recorrido guiado', category: 'Ayuda', run: () => launchTour() })` (patrón App.tsx:1093) |
| Botón Ayuda (ActivityBar) | `aria-label` / `title` = **Ver el recorrido guiado** | Se HABILITA el `<button className="activity-btn" title="Ayuda" disabled>` existente (ActivityBar.tsx:24, ícono `HelpCircle`); al tocarlo lanza el tour. Es la re-entrada "barata" que menciona 13-CONTEXT.md |

### Estados sin datos / degradación (no generan copy de error)

| Situación | Comportamiento visual | Copy |
|-----------|----------------------|------|
| Ancla no montada / rect null o 0 | Cartel **centrado en pantalla, sin spotlight ni anillo** (nunca crash) | Mismo título/cuerpo del paso; sin cambios de texto |
| TODAS las anclas ausentes (estado raro) | El tour no arranca / se cierra silencioso | — (sin mensaje; no se marca visto salvo que termine/salte) |
| Timeline colapsado (paso 4) | Se **expande la sección** (o se ancla a su cabecera) antes del spotlight | Mismo cuerpo del paso "historial" |
| Cierre de la app a mitad del tour | Se marca visto SOLO si termina o salta; un cierre a mitad **puede reaparecer una vez** | — |
| Destructive confirmation | Ninguna acción destructiva en esta fase | — |

---

## Component Inventory & Interaction Contract

Superficie NUEVA: `TourOverlay` (renderer-only, portal + `getBoundingClientRect`). Modelo de pasos = array de `{ anchor: data-tour, title, body, icon, placement }` (estructura interna a discreción del planner, decisión LOCKED). Se dispara tras `createLocalVault` (App.tsx:475-497), coordinado con el gating de la BackupCard de Fase 12: **el tour corre PRIMERO**; la tarjeta de respaldo queda como invitación persistente. Nunca se muestran encimados.

### 1. Velo + Spotlight (`.tour-overlay` / `.tour-spotlight`)

- **Portal** a `document.body`; `position: fixed; inset: 0`.
- **z-index: 300** para el velo/spotlight y **301** para el cartel. Supera todo el chrome existente (máximo actual: `.ctx-menu` z-index 210, toasts 200, `.modal-overlay` 100). Mientras el tour corre, otros overlays quedan gated off (coordinación con Fase 12).
- **Recorte del control real:** un elemento posicionado sobre el `getBoundingClientRect` del ancla, **inflado 8px** por lado, `border-radius: 8px`, con `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` (velo) + **anillo `2px solid var(--accent)`**. El control real queda visible y "iluminado" dentro del recorte.
- **Recálculo:** en `resize` y `scroll` (y vía `requestAnimationFrame`/`ResizeObserver` a criterio del planner). El recorte y el cartel se reposicionan juntos. Transición suave opcional reutilizando `transition: all 0.12s ease` (patrón existente).
- **No bloqueante / nunca atasca:** el velo captura el clic para evitar disparos accidentales de la app, pero el clic sobre el velo NO avanza ni cierra el tour. `Esc` y "Saltar" cierran siempre. No hay trampa de foco dura tipo modal.
- **Anclas grandes (editor host):** si el rect del ancla es muy grande (paso "escribir"), el anillo puede resultar exagerado; el planner puede degradar a cartel centrado sin recorte para ese paso. No romper.

### 2. Cartel / coach-mark (`.tour-card`)

- **Superficie:** `background: var(--panel-2)`; `border: 1px solid var(--border)`; `border-radius: 8px`; `box-shadow: 0 8px 24px rgba(0,0,0,0.45)` (todos heredados de `.vault-menu`/`.modal`).
- **Tamaño:** `max-width: 320px`; `padding: 16px`.
- **Layout (de arriba a abajo):**
  1. **Fila de título:** ícono Lucide del paso (`size={16}`, `currentColor`) + `.tour-card-title` (18/600). Gap 4–8px.
  2. **Cuerpo:** `.tour-card-body` (14/400/1.5), separado 16px del título.
  3. **Footer** (`.tour-card-footer`, separado 16px del cuerpo, `display:flex; align-items:center; justify-content:space-between`):
     - Izquierda: `.tour-progress` "Paso N de M" (12/400, `--muted`) + "Saltar" (`.link-btn`, muted).
     - Derecha (`.tour-actions`, gap 8px): "Anterior" (fantasma/muted, oculto en paso 1) + "Siguiente" (`.primary`) — o "Listo" (`.primary`) en el último paso.
- **Placement con auto-flip:** cada paso declara un `placement` preferido; si el cartel no entra en el viewport, hace auto-flip al lado opuesto. Offset ancla↔cartel = **8px**.

| Paso | Ancla | `placement` preferido | Racional |
|------|-------|----------------------|----------|
| escribir | editor host (centro) | `bottom` (o centrado si el rect es enorme) | El editor domina el centro; el cartel va bajo su borde superior |
| guardar | botón Guardar versión (barra inferior) | `top` (auto-flip a `bottom`) | El botón vive abajo; el cartel sube para no salirse |
| respaldar | BackupButton (barra inferior) | `top` (auto-flip a `bottom`) | Ídem barra inferior |
| historial | Timeline (App.tsx:1394) | `left` (auto-flip a `top`) | El Timeline suele ir al costado/abajo; el cartel se aparta del panel |

- **Degradación (rect null/0):** `placement` efectivo = `center`, sin recorte ni anillo; el cartel se muestra centrado con el mismo contenido.

### 3. Re-lanzamiento

- **Comando de paleta** "Ver el recorrido guiado" (categoría "Ayuda"), siempre disponible una vez abierto un cuaderno.
- **Botón Ayuda** de la ActivityBar (se habilita el `HelpCircle` hoy `disabled`) → lanza el tour. Re-lanzar NO altera `tourSeen` (ya visto sigue visto); simplemente reproduce el recorrido a pedido.

### Íconos Lucide (esta fase)

| Uso | Ícono | size |
|-----|-------|------|
| Paso escribir | `PencilLine` | 16 |
| Paso guardar | `Save` | 16 |
| Paso respaldar | `Cloud` | 16 |
| Paso historial | `History` | 16 |
| Re-lanzar (ActivityBar) | `HelpCircle` (ya presente) | 20 |

Nota planner: confirmar `PencilLine` y `History` en `lucide-react@1.23.0`; si `PencilLine` no existe, usar `Pencil`; si `History` no existe, usar `Clock`/`GitCommit`. Todos monocromo `currentColor`.

### Accesibilidad

- Cartel con `role="dialog"` + `aria-label` = título del paso; el título recibe foco al aparecer cada paso.
- Botones del cartel son `<button>` reales: `Enter`/`Espacio` activan; foco de teclado visible con borde `--accent`. Orden de tab: Anterior → Saltar → Siguiente/Listo.
- **`Esc` cierra el tour siempre** (marca visto) — atajo de teclado global mientras el overlay está montado.
- El anillo del spotlight es puramente decorativo; la instrucción está en el texto del cartel (no depender solo del color/posición).
- Contraste: texto del cartel `--text` sobre `--panel-2`; texto sobre `.primary` morado en `#16161a` (patrón existente).
- El botón Ayuda ya trae `aria-label`; se actualiza a "Ver el recorrido guiado" y deja de estar `disabled`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none (sin shadcn) | — | not applicable |

Sin registries de terceros. El `TourOverlay` y el cartel son componentes propios; no hay bloques externos ni dependencias nuevas que vetar (decisión LOCKED: "sin dependencia nueva").

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
