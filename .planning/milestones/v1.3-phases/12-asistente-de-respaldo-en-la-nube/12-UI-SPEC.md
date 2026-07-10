---
phase: 12
slug: asistente-de-respaldo-en-la-nube
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-09
---

# Phase 12 — UI Design Contract

> Contrato visual y de interacción para la Fase 12 (Asistente de respaldo en la nube). Generado por gsd-ui-researcher; verificado por gsd-ui-checker.
>
> **Regla de oro de esta fase:** NO se inventa un lenguaje visual nuevo. Se reutilizan tokens y clases ya existentes en `src/renderer/src/index.css` (`.time-banner`, `.status-item`, `.status-pop`, `.pop-title/.pop-row`, `.save-status`, `.st-ok/.st-off/.st-warn`, `.tb-btn`, `.push-badge`, `.primary`, `.link-btn`, `.device-box/.device-code`, `.nv-*`, `.modal-error`, `.hint`, `.spin`). Esta fase **crea** tres superficies (tarjeta de invitación, wizard de cuenta, botón de respaldo persistente), **reemplaza** dos (botón `UploadCloud` + píldora "GitHub/sin GitHub") y **reescribe copy** en cuatro (píldora/popover de estado, Ajustes, NewVaultDialog). Ninguna acción destructiva nueva.
>
> **Invariante de honestidad STAT-01 (no negociable):** ninguna superficie de esta fase puede decir "a salvo / respaldado / en la nube / Todo en la nube" mientras el cuaderno siga siendo local-only o tenga cambios sin subir. "Todo en la nube" SOLO con árbol limpio Y `pushCount === 0`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (sistema CSS manual existente — NO shadcn, NO Tailwind) |
| Preset | not applicable |
| Component library | none (componentes React propios + CSS plano en `index.css`) |
| Icon library | lucide-react (monocromo `currentColor`, `size` prop; NUNCA emojis) |
| Font | `system-ui, -apple-system, Segoe UI, Roboto, sans-serif` (declarada en `:root`) |

**shadcn gate:** ejecutado. Decisión = `none`. Rationale: la app tiene un design system manual maduro (tokens en `:root`, clases kebab-case, sin linter) y CLAUDE.md prohíbe explícitamente introducir shadcn/Tailwind. Introducirlos obligaría a reescribir superficies estables (status bar, modales, device flow) y contradice las restricciones del proyecto. Consistente con la decisión de la Fase 11. Registry safety gate: no aplica.

---

## Spacing Scale

Escala base de 4pt. Esta fase NO introduce valores nuevos: reutiliza los ya presentes en las clases existentes.

| Token | Value | Usage en esta fase |
|-------|-------|--------------------|
| xs | 4px | Gap ícono↔texto en la píldora/botón (patrón `.save-status gap: 4`) |
| sm | 8px | Gap horizontal de la tarjeta-banner (`.time-banner gap: 8px`); margen inferior de `.pop-title` |
| md | 16px | Separación entre bloques del wizard (título ↔ checklist ↔ acciones) |
| lg | 24px | Respiro interno del cuerpo del wizard |
| xl | 32px | — (no requerido en estas superficies) |

Exceptions (valores heredados del CSS existente, se conservan para consistencia — NO son nuevos):
- `6px` — gap base de `button`, gap de `.pop-title`, radio de borde de inputs/botones.
- `5px` — gap de `.status-item` (píldora de estado y botón de respaldo).
- `10px 12px` — padding de `.status-pop` (popover); `0 10px` padding de `.time-banner`.
- `10px 18px` — padding de `.primary` (CTA de la tarjeta y del wizard).
- `36px` — alto de la franja `.time-banner` (la tarjeta de invitación reusa este patrón de banner de ancho completo).
- `220–340px` — ancho del popover (`.status-pop min/max-width`), heredado.

Nota para planning: NO introducir ningún valor de spacing NUEVO fuera del conjunto reutilizado (4/8/16/24/32 + las excepciones heredadas listadas arriba). La tarjeta de invitación se ancla como banner (patrón `.time-banner`, ancho completo, bajo la barra de título o sobre el editor); el wizard se monta como modal existente (`.modal` / `.modal-overlay`) o como panel del propio banner — a criterio del planner, reutilizando clases.

---

## Typography

| Role | Size | Weight | Line Height | Uso en esta fase |
|------|------|--------|-------------|------------------|
| Heading | 18px | 600 | 1.3 | Título del wizard (reusa `.modal h2`) |
| Body | 14px | 400 | 1.5 | Texto de la tarjeta, pasos de la checklist, notas del popover |
| Label | 12px | 400 | 1.4 | Texto de la píldora/botón de estado (`.time-banner-info font-size: 12px`), filas del popover |
| Code | 15–18px | 600 | 1.2 | Código del device flow (`.device-code`, monoespaciado, heredado) |

Pesos declarados (máx. 2): **400 regular** + **600 semibold**. El 600 se reserva a `.primary`, títulos (`.pop-title`, `.modal h2`) y al texto de énfasis del botón de estado "al día"; todo el cuerpo va en 400.

Escala de esta fase: exactamente **4 roles** (18 / 15-18 code / 14 / 12) sobre las superficies que esta fase crea o toca. No se introduce ningún tamaño nuevo — todos existen ya en el CSS.

Line-height del cuerpo: **1.5** (coincide con `.pop-note` y `.hint` existentes). Títulos: **1.2–1.3**.

---

## Color

Paleta oscura ya definida en `:root` de `index.css`. Esta fase NO agrega colores. Reutiliza los estados semánticos ya definidos en `.status-item` (`.st-ok #68d391`, `.st-warn #f6ad55`, `.st-off --muted`).

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#16161a` (`--bg`) | Fondo del shell donde se monta la tarjeta |
| Secondary (30%) | `#1c1c22` (`--panel`) / `#202027` (`--panel-2`) | Superficie de la tarjeta-banner, del popover y del cuerpo del wizard |
| Accent (10%) | `#b794f6` (`--accent`) | Ver lista de reserva abajo |
| Destructive/Error | `#ff6b6b` | Solo texto de error inline (`.modal-error`); NO hay botón destructivo en esta fase |

**Estados semánticos del botón/píldora de respaldo (heredados, NO nuevos):**
- `--ok` verde `#68d391` (clase `.st-ok`) → estado "al día / Todo en la nube".
- `--warn` naranja `#f6ad55` (clase `.st-warn`) → estado "no se pudo respaldar".
- `--muted` `#9a9aa6` @0.6 (clase `.st-off`) → estado "sin respaldo".
- `--accent` `#b794f6` → estado "respaldando" (spinner activo) y CTAs primarios.

Accent reserved for (lista explícita — nunca "todos los elementos interactivos"):
1. Relleno del botón CTA primario `.primary` de la tarjeta ("Respaldar en la nube") y del wizard ("Conectar", "Crear una gratis").
2. Ícono/spinner del botón de respaldo persistente MIENTRAS está en estado "respaldando" (`RefreshCw.spin` en `--accent`).
3. Borde de foco de inputs (patrón `.text-input:focus { border-color: var(--accent) }`).
4. Color de links de texto secundarios (`.link-btn`: "Hacerlo después", "Ya tengo cuenta").
5. `--head` (`#2dd4bf`) NO se usa en ninguna superficie de respaldo (reservado a HEAD del grafo — evitar confusión).

Texto: `--text #e6e6ea` (primario), `--muted #9a9aa6` (notas, hints, labels del popover). Sobre `.primary` morado el texto va en `#16161a` (patrón existente, contraste alto).

---

## Copywriting Contract

Todo user-facing en español, 2ª persona, tono cálido, SIN jerga. **"GitHub" se nombra ÚNICAMENTE en el paso de creación de cuenta del wizard**, enmarcado como "un servicio gratuito y seguro para guardar tus copias (gratis + privado)". Nunca "repo / commit / push / clonar / OAuth / device flow / bóveda / local-first" de cara al usuario. Íconos Lucide, nunca emojis.

### Superficies principales (nuevas)

| Element | Copy |
|---------|------|
| Tarjeta — título | **Respaldá tu cuaderno en la nube** |
| Tarjeta — cuerpo | **Guardá una copia de seguridad para no perder tu cuaderno aunque le pase algo a este dispositivo.** |
| Tarjeta — CTA primario | **Respaldar en la nube** (ícono `CloudUpload`, `size={16}`) |
| Tarjeta — acción secundaria (siempre presente) | **Hacerlo después** (estilo `.link-btn`) |
| Wizard — título | **Respaldar en la nube** |
| Wizard — intro | **Para respaldar tu cuaderno necesitás una cuenta. Es gratis y solo vos podés ver tus copias.** |
| Wizard — camino A (tiene cuenta) | **Ya tengo cuenta** → arranca el device flow directo |
| Wizard — camino B (no tiene cuenta) | **Crear una gratis** → abre `https://github.com/signup` con `shell.openExternal` |
| Wizard — encuadre de "GitHub" (único lugar) | **Usamos GitHub, un servicio gratuito y seguro para guardar tus copias. Tus cuadernos quedan privados: solo vos los ves.** |
| Checklist paso 1 (sobrevive el ida-y-vuelta) | **1. Creá tu cuenta gratis en la página que se abrió en tu navegador.** |
| Checklist paso 2 | **2. Cuando termines, volvé acá y tocá "Conectar".** |
| Wizard — CTA conectar (post-signup / "ya tengo cuenta") | **Conectar** (ícono `Cloud`, `size={16}`) |
| Device flow — instrucción | **Escribí este código en la página que se abrió para conectar tu cuenta:** |
| Device flow — código | `{userCode}` en `.device-code` (monoespaciado grande, heredado) |
| Device flow — espera | **Esperando que autorices…** (con `RefreshCw.spin`) |
| Éxito del primer respaldo | **Listo: tu cuaderno está a salvo en la nube.** (mostrado solo cuando el push real terminó — honra STAT-01) |

### Botón de respaldo persistente — estados (status bar, con `data-tour="respaldo"`)

Reemplaza el botón `UploadCloud` (App.tsx:1280-1291) **y** la píldora "GitHub/sin GitHub" (App.tsx:1476-1495): una sola superficie de respaldo. Tooltip (`title`) + texto de popover por estado.

| Estado | Disparador | Ícono | Color | Texto píldora | Tooltip / popover |
|--------|-----------|-------|-------|---------------|-------------------|
| sin-respaldo | conectado=false | `Cloud` (o `CloudOff`) | `.st-off` (muted) | **Sin respaldo** | "Respaldá tu cuaderno en la nube" → al tocar, reabre la tarjeta/wizard |
| respaldando | push en curso | `RefreshCw` `.spin` | `--accent` | **Respaldando…** | "Subiendo tu copia de seguridad…" |
| al-día | conectado + árbol limpio + `pushCount===0` | `Cloud` | `.st-ok` (verde) | **Todo en la nube** | popover: Cuenta / Copia automática (ver popover abajo) |
| error | último respaldo falló | `CloudOff` (o `CloudAlert`) | `.st-warn` (naranja) | **No se pudo respaldar** | mensaje humano del error (ver tabla de errores) + acción para reintentar |

Nota: si está conectado pero hay cambios sin subir (`pushCount>0`), el botón NO dice "Todo en la nube"; muestra un estado de progreso/pendiente coherente con STAT-01 (p. ej. "Respaldando…" si el auto-push está corriendo, o "Sin subir" neutro si quedó pendiente). Nunca declarar "a salvo" con `pushCount>0`.

### Etiqueta de estado STAT-01 (`statusLabel`, App.tsx:1772) — contrato a preservar

Esta fase NO cambia la lógica de `statusLabel`; la documenta como invariante que el botón persistente debe respetar. Se mantienen exactos:

| Condición | Texto | Ícono |
|-----------|-------|-------|
| `saving` | **Guardando…** | `Loader2` `.spin` |
| `saved` (autoguardado sin commit) | **Guardado en este dispositivo** | `HardDrive` |
| `clean` + conectado + `pushCount===0` | **Todo en la nube** | `Cloud` |
| `clean` + conectado + `pushCount>0` | **Guardado en este dispositivo** | `HardDrive` |
| `clean` + no conectado | **Guardado** | `Check` |

"Todo en la nube" es el ÚNICO texto que afirma nube, y solo aparece en la última fila honesta. No agregar variantes que afirmen respaldo antes de un push real.

### Errores humanos (BACKUP-05) — mapeo exacto, inline en tarjeta/wizard

Nunca mostrar el mensaje crudo de la API (`createRepo` github.ts:152 y `push` lanzan `GitHub crear repo: 422 …`). Interceptar y mapear:

| Causa | Copy humano | Superficie |
|-------|-------------|------------|
| Nombre de repo tomado (422) | **Ya tenés un respaldo con ese nombre. Probá con otro nombre de cuaderno.** | inline en el wizard (`.modal-error`) |
| Auth perdida / token inválido (401/403) | **Se perdió la conexión con tu cuenta. Reconectá para seguir respaldando.** | inline + botón "Reconectar" |
| Sin internet / red (ENOTFOUND/timeout) | **No hay internet. Tu cuaderno sigue guardado en este dispositivo; se respaldará cuando vuelva la conexión.** | inline + botón persistente en estado "no se pudo respaldar" |
| Otro / desconocido | **No se pudo respaldar ahora. Tu cuaderno sigue guardado en este dispositivo; volvé a intentarlo en un momento.** | inline genérico, sin filtrar texto de API |

### Empty / estados sin datos

| Element | Copy |
|---------|------|
| Empty state (cuaderno nuevo sin respaldo) | La tarjeta de invitación ES el empty state del respaldo. Si el usuario elige "Hacerlo después", NO reaparece sola (sin re-nag); se retoma solo tocando el botón persistente. |
| Destructive confirmation | Ninguna acción destructiva nueva en esta fase. |

---

## Copy Rewrite Table (old → new)

Reescritura de las superficies diferidas de la Fase 11 (COPY-01). Reemplazos exactos. "GitHub" desaparece de Capa 0 salvo el paso de creación de cuenta del wizard.

### Status bar — píldora + popover (App.tsx:1476-1495)

| Ubicación | Antes | Después |
|-----------|-------|---------|
| Píldora conectado | `GitHub` | **Todo en la nube** (según STAT-01; si hay pendientes, estado de progreso) |
| Píldora no conectado | `sin GitHub` | **Sin respaldo** |
| Popover título | `<Cloud/> GitHub` | **`<Cloud/>` Respaldo en la nube** |
| Popover fila Cuenta | `Cuenta · {login}` | **Cuenta · {login}** (se conserva; es el usuario, no jerga) |
| Popover fila Repo | `Repo · {remote}` | **(ELIMINAR — no exponer la URL del repo)** |
| Popover fila cambios | `Cambios sin subir · {n}` | **Sin respaldar · {n}** (0 = todo al día) |
| Popover fila autoPush | `Subida automática · {sí/no}` | **Copia automática · {activada/desactivada}** |
| Popover no conectado | `No conectado. Conectá tu cuenta en Ajustes (⚙).` | **Todavía sin respaldo. Tocá para respaldar tu cuaderno en la nube.** |

### Ajustes — sección de respaldo (SettingsModal.tsx:331-376)

| Ubicación | Antes | Después |
|-----------|-------|---------|
| Ítem de nav / `h2` | `<Cloud/> GitHub — guardar en tu repo` | **`<Cloud/>` Respaldo en la nube** |
| Subtítulo | `Conectá tu cuenta y elegí el repo donde se respalda tu bóveda en la nube.` | **Conectá tu cuenta para guardar copias de seguridad de tus cuadernos en la nube.** |
| Conectado | `Conectado como {login}` | **Conectado como {login}** (se conserva) |
| Botón desconectar | `Desconectar` | **Desconectar** (se conserva) |
| Device flow | `Ingresá este código en GitHub (se abrió en tu navegador):` | **Escribí este código en la página que se abrió para conectar tu cuenta:** |
| Espera | `{uri} — esperando autorización…` | **Esperando que autorices…** |
| Botón conectar | `Conectar con GitHub` | **Conectar mi cuenta** |
| Campo URL del repo | `label "URL del repo"` + placeholder `https://github.com/usuario/mis-notas.git` | **(OCULTAR en flujo normal — el repo se deriva del nombre del cuaderno; dejar como opción avanzada si el planner lo mantiene, con label "Dirección del respaldo (avanzado)")** |
| Hint subida manual | `La subida a la nube es siempre manual: usá el botón de subir de la barra superior.` | **Tu cuaderno se respalda solo cada vez que guardás. También podés forzar una copia desde el botón de la barra inferior.** |

### NewVaultDialog (NewVaultDialog.tsx) — mantiene la función, reescribe la copy

Usado por el VaultSwitcher para importar un cuaderno ya respaldado. "GitHub" solo donde sea inevitable, enmarcado como servicio de respaldo.

| Ubicación | Antes | Después |
|-----------|-------|---------|
| Título/propósito | `Nueva bóveda` / clonar repo | **Traer un cuaderno respaldado** |
| Prompt conectar | `Para clonar o crear repos, conectá tu cuenta de GitHub.` | **Para traer un cuaderno de la nube, conectá tu cuenta.** |
| Device flow | `Ingresá este código en la página que se abrió:` | **Escribí este código en la página que se abrió:** (se conserva) |
| Botón conectar | `Conectar con GitHub` | **Conectar mi cuenta** |
| Tab clonar | `<GitFork/> Clonar existente` | **`<CloudDownload/>` Traer uno respaldado** |
| Tab crear | `<Plus/> Crear nueva` | **`<Plus/>` Crear cuaderno respaldado** |
| Lista repos vacía | `No tenés repos en tu cuenta.` | **Todavía no tenés cuadernos respaldados en tu cuenta.** |
| Lista cargando | `Cargando tus repos…` | **Buscando tus cuadernos respaldados…** |
| Item privado/público | `privado / público` | **privado / público** (se conserva; con `Lock`/`Globe`) |
| CTA clonar | `Clonar y abrir` | **Traer y abrir** |
| Hint clonar | `Al clonar vas a elegir una carpeta local vacía como destino.` | **Vas a elegir una carpeta vacía en tu equipo donde guardar la copia.** |
| Label crear | `Nombre del repo` | **Nombre del cuaderno** |
| Placeholder | `mis-notas` | **mi-cuaderno** |
| Check privado | `Privado` | **Privado (solo vos lo ves)** |
| CTA crear | `Crear y abrir` | **Crear y abrir** (se conserva) |
| Hint crear | `Vas a elegir la carpeta local para la bóveda nueva.` | **Vas a elegir dónde guardar el cuaderno en tu equipo.** |

---

## Component Inventory & Interaction Contract

### 1. Tarjeta de invitación (BACKUP-01) — banner, NO modal

- **Patrón:** reutiliza `.time-banner` (banner de ancho completo, `-webkit-app-region: no-drag`, altura ~36px, tinte suave del `--accent` en vez del `--head`). Se monta bajo la barra de título o sobre el área del editor tras `createLocalVault` (Fase 11).
- **No bloqueante:** el usuario puede seguir escribiendo con la tarjeta visible.
- **Contenido:** ícono `Cloud`/`CloudUpload` + título/cuerpo (ver copy) + CTA `.primary` "Respaldar en la nube" + `.link-btn` "Hacerlo después".
- **Disparo:** una sola vez, tras crear el primer cuaderno. "Hacerlo después" la cierra y NO reaparece sola (sin re-nag). Se retoma solo por el botón persistente.
- **Persistencia:** estado de onboarding de respaldo (`invitado` / `diferido` / `completado`) en settings (a criterio del planner), vía IPC `geode:*`.

### 2. Wizard de cuenta (BACKUP-02) — dos caminos + checklist resumible

- **Patrón:** modal existente (`.modal` + `.modal-overlay`) o panel expandido del banner. Reutiliza `.device-box` / `.device-code` para el código.
- **Bifurcación:** "Ya tengo cuenta" (device flow directo: `githubStartDeviceFlow` → `githubCompleteDeviceFlow`) / "Crear una gratis" (`shell.openExternal('https://github.com/signup')` + checklist).
- **Checklist que sobrevive el ida-y-vuelta:** los dos pasos permanecen visibles al volver del navegador; el botón "Conectar" reusa el device flow existente. Manejar razas: pestaña cerrada sin crear cuenta, "Ya tengo cuenta" prematuro → el device flow simplemente espera autorización y muestra "Esperando que autorices…".
- **"GitHub" nombrado SOLO aquí**, con el encuadre "servicio gratuito y seguro (gratis + privado)".
- **Device flow display:** instrucción + `.device-code` (código grande monoespaciado) + espera con `RefreshCw.spin`. Sin jerga OAuth.
- **Al conectar (BACKUP-03/04):** crear repo privado (`createRepo(nombre, private=true)`) con **nombre derivado del cuaderno sanitizado a slug de GitHub** (distinto de la sanitización de carpeta Windows de Fase 11) → `setRemote` → `push` automático (la "Primera versión" sembrada en Fase 11 evita push vacío) → activar `autoPush`. Nada de repo/commit/push visible. Al terminar el push real: mensaje de éxito honesto.

### 3. Botón de respaldo persistente (BACKUP-01/04) — status bar

- **Patrón:** `.status-item` (con `.status-pop` en hover) que **absorbe/reemplaza** el botón `UploadCloud` (App.tsx:1280-1291) y la píldora "GitHub/sin GitHub" (App.tsx:1476-1495). Una sola superficie.
- **`data-tour="respaldo"`** en el nodo del botón (siempre montado) → ancla del tour de Fase 13. NUNCA debe desmontarse condicionalmente (a diferencia del `UploadCloud` actual, que solo aparecía conectado).
- **Cuatro estados** (ver tabla de estados arriba): sin-respaldo / respaldando / al-día / error. Reutiliza `.st-off`, `--accent` + `.spin`, `.st-ok`, `.st-warn`.
- **Click:** en sin-respaldo o error → reabre la tarjeta/wizard. En al-día → muestra popover informativo (Cuenta / Copia automática). Puede forzar una copia manual (rol del viejo `UploadCloud`).
- **Badge de pendientes:** reutiliza `.push-badge` si hay cambios sin subir.

### Íconos Lucide (esta fase)

| Uso | Ícono | size |
|-----|-------|------|
| CTA respaldar / subir | `CloudUpload` | 16 |
| Estado al-día / conectar | `Cloud` | 14–16 |
| Estado sin-respaldo | `Cloud` (color `.st-off`) o `CloudOff` | 14 |
| Estado error | `CloudOff` (o `CloudAlert` si disponible en lucide 1.23) | 14 |
| Estado respaldando (spinner) | `RefreshCw` + `.spin` | 14–16 |
| Traer cuaderno respaldado (NewVaultDialog) | `CloudDownload` | 14 |
| Privado / público (se conserva) | `Lock` / `Globe` | 11 |
| Éxito | `Check` | 14 |

Nota planner: confirmar disponibilidad de `CloudUpload`/`CloudDownload`/`CloudOff` en `lucide-react@1.23.0`; si `CloudAlert` no existe, usar `CloudOff` con color `.st-warn` para el estado de error.

### Accesibilidad

- Botón de respaldo persistente: `<button>` real con `aria-label` por estado ("Respaldar en la nube", "Respaldando", "Todo en la nube", "No se pudo respaldar") y `title` con el mismo texto.
- CTAs del wizard/tarjeta: `<button>` reales; `Enter` activa el CTA primario.
- Código del device flow: seleccionable/copiable; foco de teclado visible (borde `--accent`).
- Errores inline con rol perceptible (`.modal-error`, texto `#ff6b6b`, español, accionable).
- Contraste: texto sobre `.primary` morado en `#16161a` (patrón existente).

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
