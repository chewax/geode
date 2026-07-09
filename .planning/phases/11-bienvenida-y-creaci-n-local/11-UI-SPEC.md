---
phase: 11
slug: bienvenida-y-creaci-n-local
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-08
---

# Phase 11 — UI Design Contract

> Contrato visual y de interacción para la Fase 11 (Bienvenida y creación local). Generado por gsd-ui-researcher; verificado por gsd-ui-checker.
>
> **Regla de oro de esta fase:** NO se inventa un lenguaje visual nuevo. Se reutilizan las clases y tokens ya existentes en `src/renderer/src/index.css` (`welcome`, `tagline`, `primary`, `link-btn`, `text-input`, `hint`, `modal-error`, `spin`). Solo se reescribe copy y se reestructura el bloque `if (!vault)` de `App.tsx`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (sistema CSS manual existente — NO shadcn, NO Tailwind) |
| Preset | not applicable |
| Component library | none (componentes React propios + CSS plano en `index.css`) |
| Icon library | lucide-react (monocromo `currentColor`, `size` prop; NUNCA emojis) |
| Font | `system-ui, -apple-system, Segoe UI, Roboto, sans-serif` (declarada en `:root`) |

**shadcn gate:** ejecutado. Decisión = `none`. Rationale: la app tiene un design system manual maduro (tokens en `:root`, clases kebab-case, sin linter) y CLAUDE.md fija estas convenciones. Introducir shadcn obligaría a reescribir superficies estables y contradice las restricciones del proyecto. Registry safety gate: no aplica.

---

## Spacing Scale

Escala base de 4pt. Esta fase NO introduce valores nuevos: reutiliza los ya presentes en las clases existentes.

| Token | Value | Usage en esta fase |
|-------|-------|--------------------|
| xs | 4px | Gaps internos, ajuste fino |
| sm | 8px | Gap vertical del bloque `.welcome` (`gap: 8px`) |
| md | 16px | Separación entre grupos de la bienvenida |
| lg | 24px | Respiro alrededor del bloque central |
| xl | 32px | — (no requerido en esta pantalla) |

Exceptions (valores heredados del CSS existente, se conservan para consistencia — NO son nuevos):
- `6px` — gap base de `button` y radio de borde de inputs/botones.
- `10px` — gap de `.welcome-actions` y padding vertical de `.primary` (`10px 18px`).
- `18px` / `20px` — padding horizontal de `.primary`; margen inferior de `.tagline` (`0 0 20px`).
- `44px` alto de la franja `.welcome-drag` (controles de ventana), fuera del flujo central.

Nota para planning: estos valores son heredados y ya justificados. Planning debe garantizar que NO se introduzca ningún valor de spacing NUEVO fuera del conjunto reutilizado (4/8/16/24/32 + las excepciones heredadas listadas arriba).

Objetivo de layout: la bienvenida sigue centrada vertical y horizontalmente (`.welcome` ya es `flex column; align-items:center; justify-content:center`). El nuevo mini-campo de nombre + CTA se apilan bajo la tagline dentro de ese mismo centro.

---

## Typography

| Role | Size | Weight | Line Height | Uso en esta fase |
|------|------|--------|-------------|------------------|
| Display | 44px | 600 | 1.1 | `.welcome h1` — "Geode" (se conserva) |
| Heading | 18px | 600 | 1.3 | Título de sub-paso si hiciera falta (reusa `.modal h2`) |
| Body | 14px | 400 | 1.5 | Texto del input de nombre y cuerpo de la nota sembrada |
| Label | 12px | 400 | 1.4 | Links secundarios / microcopy contextual |

Pesos declarados (máx. 2): **400 regular** + **600 semibold**. El 600 se reserva a `.primary`, `h1` y labels de énfasis; todo el cuerpo va en 400.

Escala de esta fase: exactamente **4 tamaños** (44 / 18 / 14 / 12) para las superficies que esta fase crea o toca. No se introduce ningún 5º tamaño.

Line-height del cuerpo: **1.5** (coincide con `.tagline.error` existente). Headings/Display: **1.1–1.3**.

---

## Color

Paleta oscura ya definida en `:root` de `index.css`. Esta fase NO agrega colores.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#16161a` (`--bg`) | Fondo de pantalla completa de la bienvenida |
| Secondary (30%) | `#1c1c22` (`--panel`) / `#202027` (`--panel-2`) | Superficie del input de nombre; superficie base de botones no-primarios |
| Accent (10%) | `#b794f6` (`--accent`) | Ver lista de reserva abajo |
| Destructive | `#ff6b6b` | Solo texto de error (`.modal-error` / `.tagline.error`); NO hay botón destructivo en esta fase |

Accent reserved for (lista explícita — nunca "todos los elementos interactivos"):
1. Relleno del botón CTA primario `.primary` ("Crear mi primer cuaderno").
2. Borde de foco del input de nombre (`:focus { border-color: var(--accent) }`, patrón `.text-input:focus`).
3. Color de los links de texto secundarios (`.link-btn`: "Abrir una carpeta existente", "Elegir otra ubicación").
4. `--head` (`#2dd4bf`) NO se usa en esta pantalla (reservado a HEAD del grafo).

Texto: `--text #e6e6ea` (primario), `--muted #9a9aa6` (tagline, hints, labels). Sobre el `.primary` morado el texto va en `#16161a` (patrón existente, contraste alto).

---

## Copywriting Contract

Todo user-facing en español, 2ª persona, tono cálido, SIN jerga (nunca "bóveda / GitHub / repo / clonar / commit / local-first"). Íconos Lucide, nunca emojis.

| Element | Copy |
|---------|------|
| Tagline (reemplaza "Notas versionadas sobre Git — local-first.") | **Escribí sin miedo a perder nada.** |
| Input de nombre (valor pre-rellenado, seleccionable) | **Mi primer cuaderno** |
| Primary CTA | **Crear mi primer cuaderno** |
| CTA en estado "creando" | **Creando tu cuaderno…** (con `<RefreshCw className="spin" />`) |
| Link secundario 1 (abre picker nativo → `setRoot`) | **Abrir una carpeta existente** |
| Escape secundario (dentro del paso de creación; picker nativo → crea ahí) | **Elegir otra ubicación** |
| Empty state del editor | N/A — el cuaderno abre SIEMPRE con `Bienvenida.md` sembrada, nunca editor vacío (ONB-03) |
| Error state (fallo de I/O al crear) | **No se pudo crear el cuaderno. Revisá que tengas permiso de escritura en tu carpeta de Documentos e intentá de nuevo.** |
| Destructive confirmation | Ninguna acción destructiva nueva en esta fase. La nota sembrada se borra con el flujo de borrado existente (sin confirmación nueva). |
| Fallback de nombre inválido/vacío | Carpeta creada como **"Cuaderno"** (silencioso, sin bloquear ni mostrar error) |

**Nota sembrada — `Bienvenida.md` (contenido canónico, se commitea como primera versión):**

```markdown
# Te damos la bienvenida

Este es tu primer cuaderno. Escribí acá lo que quieras: ideas, notas,
borradores, listas… lo que se te ocurra.

No tenés que preocuparte por guardar: tu cuaderno se guarda solo y
recuerda cada cambio, así que **nunca vas a perder nada** y podés
experimentar sin miedo.

Más adelante vas a poder hacer una **copia de seguridad** para tenerlo a
salvo en otro lugar. Pero eso es para después: por ahora, simplemente
escribí.

¿Querés empezar de cero? Borrá esta nota y hacela tuya.
```

Restricciones de la nota (ONB-03): corta (~1 pantalla), 2ª persona, cálida, español; menciona "copia de seguridad" y jamás "GitHub"/"respaldo en la nube" técnico; borrable; sirve de escenario para el tour de Fase 13.

**Sanitización silenciosa (ONB-04) — NO genera copy de error:** los ilegales de Windows (`< > : " / \ | ? *`), puntos/espacios finales y nombres reservados (CON, PRN, AUX, NUL, COM1–9, LPT1–9) se limpian sin avisar; las colisiones de carpeta se resuelven con sufijo ` (2)`, ` (3)`… El usuario nunca ve un error por el nombre.

---

## Component Inventory & Interaction Contract

Reworked screen: bloque `if (!vault)` de `App.tsx` (~líneas 1079–1105).

### Estructura de la bienvenida (idle)
- `.welcome` (contenedor, drag de ventana) → `.welcome-drag` con `<WindowControls />` (se conserva).
- `<h1>Geode</h1>` (Display 44px, se conserva).
- `<p class="tagline">` → nueva copy: "Escribí sin miedo a perder nada."
- **Grupo de creación** (nuevo, apilado, centrado, `-webkit-app-region: no-drag`):
  - `<input class="text-input">` pre-rellenado con "Mi primer cuaderno", `autoFocus`, texto seleccionado al montar para que el usuario pueda sobrescribir de una. Ancho fijo **320px** (contrato, no sugerencia) para no verse como campo de formulario ancho.
  - `<button class="primary">` con ícono Lucide `NotebookPen` (`size={16}`) + "Crear mi primer cuaderno". Dispara `vault.createLocal(name)` (canal `geode:vault-create-local`).
  - `Enter` en el input equivale a click en el CTA (1-click / 1-Enter).
- **Links secundarios** (bajo el CTA, en `.welcome-actions` o fila propia, estilo `.link-btn`, `--muted`/`--accent`):
  - "Elegir otra ubicación" (ícono `FolderCog`, `size={14}`) → picker nativo → crea el cuaderno en la carpeta elegida.
  - "Abrir una carpeta existente" (ícono `FolderOpen`, `size={14}`) → `openVault()` existente (picker → `setRoot`).
- Se ELIMINA el botón "Clonar o crear en GitHub" y el render de `<NewVaultDialog>` de esta pantalla (pasa a Fase 12).

### Estados (contrato de interacción)
| Estado | Disparador | UI |
|--------|-----------|-----|
| Idle | Sin vault | Input prefilled + CTA habilitado; foco en el input con texto seleccionado |
| Creating | Click en CTA / Enter | CTA deshabilitado, ícono `RefreshCw` con clase `spin`, texto "Creando tu cuaderno…"; links secundarios deshabilitados |
| Success | `createLocal` resuelve `VaultInfo` | `adoptVault(info)` existente → entra al cuaderno con `Bienvenida.md` abierta |
| Error | `createLocal` rechaza (I/O) | Mensaje `.modal-error` bajo el CTA (rojo `#ff6b6b`, español), CTA vuelve a habilitarse para reintentar |

Notas de estado:
- El CTA NO se deshabilita por validación de nombre: un nombre vacío o todo-ilegal cae a "Cuaderno". Solo se deshabilita durante `Creating`.
- Reutilizar `RefreshCw + .spin` como spinner (patrón ya usado en `NewVaultDialog`).

### Íconos Lucide (esta fase)
| Uso | Ícono | size |
|-----|-------|------|
| CTA crear cuaderno | `NotebookPen` | 16 |
| Estado creando (spinner) | `RefreshCw` + `.spin` | 16 |
| Abrir carpeta existente | `FolderOpen` | 14 |
| Elegir otra ubicación | `FolderCog` | 14 |

### Accesibilidad
- Input con `aria-label="Nombre de tu primer cuaderno"`.
- Links secundarios como `<button class="link-btn">` (no `<a>`), foco por teclado natural.
- Foco de teclado visible = borde `--accent` (patrón `:focus` existente).
- El CTA es un `<button>` real; `Enter` en el input lo activa. No confiar en click de mouse únicamente.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none (sin shadcn) | — | not applicable |

Sin registries de terceros. Todos los componentes son propios; no hay bloques externos que vetar.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
