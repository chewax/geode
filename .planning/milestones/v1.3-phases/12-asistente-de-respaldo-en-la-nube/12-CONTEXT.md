# Phase 12: Asistente de respaldo en la nube - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega el respaldo en la nube guiado y no bloqueante: tras crear su primer cuaderno (Fase 11), el usuario ve una invitación (tarjeta, no modal) para respaldarlo; es guiado a crear una cuenta gratuita si no la tiene (hand-off a la página de registro + checklist que sobrevive el ida-y-vuelta); al conectar se crea un repo privado y se sube el primer respaldo automáticamente (con la "Primera versión" sembrada en Fase 11, nunca vacío); y de ahí en más el respaldo es automático e invisible ("cada vez que guardás, se respalda solo"), honrando STAT-01 ("Todo en la nube" solo cuando está de verdad todo subido). Introduce el **botón de respaldo persistente** que el tour de la Fase 13 usará como ancla. Los errores del camino se muestran en lenguaje humano. Cierra además la reescritura de copy diferida de la Fase 11 (Ajustes, píldora de estado, popover, NewVaultDialog).

**Fuera de esta fase:** el tour interactivo (Fase 13, que ancla su paso "respaldar" al botón que esta fase introduce). Automatizar la creación de cuenta (imposible por captcha/verificación — decisión cerrada en PROJECT.md; el techo es el hand-off + checklist). Pollear a GitHub para detectar creación de cuenta (se detecta por el éxito del device flow).
</domain>

<decisions>
## Implementation Decisions

### La invitación de respaldo (BACKUP-01)
- Tras crear el primer cuaderno: **tarjeta no bloqueante** (banner en el shell, NO modal) con "Respaldar en la nube" + "Hacerlo después" siempre presente.
- **Botón de respaldo persistente** siempre visible en la status bar, con `data-tour` (ancla del tour de Fase 13), reflejando estados: sin respaldo / respaldando / al día / no se pudo respaldar.
- Si el usuario elige "Hacerlo después", la tarjeta **no reaparece sola**; se retoma solo por el botón persistente (sin re-nag — evita fatiga, decisión de PROJECT.md/Out of Scope).
- El botón de respaldo unificado **absorbe/reemplaza** el `UploadCloud` (push manual, App.tsx:1280-1288) y la píldora "GitHub/sin GitHub" (App.tsx:1477-1490) actuales — una sola superficie de respaldo, no dos.

### Onboarding de cuenta (BACKUP-02)
- Dos caminos en la tarjeta/wizard: **"Ya tengo cuenta"** (device flow directo) / **"Crear una gratis"** (abre `https://github.com/signup` en el navegador vía `shell.openExternal`).
- **Checklist en la app** que sobrevive el ida-y-vuelta al navegador (pasos: 1. Creá tu cuenta en la página que se abrió · 2. Volvé y conectá); al volver, "Conectar" **reusa el device flow existente** (`githubStartDeviceFlow` → `githubCompleteDeviceFlow`).
- **"GitHub" se nombra SOLO en este paso**, enmarcado como "un servicio gratuito y seguro para guardar tus copias (gratis + privado)". Nunca aparece en Capa 0 fuera de aquí.
- El device flow se enmarca como "Conectá tu cuenta" + código + "esperando autorización", **sin jerga OAuth**.

### Primer respaldo automático + invariante (BACKUP-03, BACKUP-04)
- Al conectar: **crear repo privado + primer push automáticamente**, sin exponer repo/commit/push. Reusar `createRepo(nombre, private=true)` → `setRemote` → `push`. La "Primera versión" sembrada en Fase 11 garantiza que el push nunca sea vacío.
- **Nombre del repo derivado del nombre del cuaderno**, sanitizado a un slug válido de GitHub (distinto de la sanitización de carpeta Windows de Fase 11 — GitHub tiene sus propias reglas). Si el nombre choca (422) → BACKUP-05 lo maneja.
- **Activar `autoPush` automáticamente** (ON tras completar el onboarding de respaldo) para que "cada vez que guardás, se respalda solo" (BACKUP-04).
- **Indicador "Todo en la nube" (STAT-01):** reusar `statusLabel` (App.tsx:1443); "Todo en la nube" SOLO cuando el árbol está limpio Y `pushCount==0` (todo pusheado). Nunca declarar "a salvo" antes de un respaldo real (invariante de honestidad STAT-01, code-review WR-01 de v1.0).
- Reescribir la píldora de estado y el popover (Cuenta/Repo/Subida automática) a lenguaje de respaldo, sin exponer la URL del repo ni "GitHub" en Capa 0.

### Errores humanos (BACKUP-05)
- Interceptar los errores del camino de respaldo y mapearlos a lenguaje claro, **nunca el mensaje crudo de la API**:
  - Repo name-taken (422) → "Ya tenés un respaldo con ese nombre".
  - Auth (401/403 / token perdido) → "Se perdió la conexión con tu cuenta, reconectá".
  - Red / sin internet → "No hay internet — tu cuaderno sigue guardado en este dispositivo".
  - Otros → un genérico humano, sin filtrar el texto de la API.
- Los errores se muestran **inline en la tarjeta/wizard**; el botón persistente refleja "no se pudo respaldar".
- Nota técnica: `createRepo` (github.ts:152) y `push` hoy lanzan errores crudos (`GitHub crear repo: 422 …`) — el planner debe interceptarlos en el handler o en un mapeo compartido.

### Reescritura de copy diferida (COPY-01, desde Fase 11)
- Reescribir **ahora** las superficies diferidas de la Fase 11:
  - Sección GitHub de Ajustes (SettingsModal) → "Respaldo en la nube / copia de seguridad".
  - Píldora de estado "GitHub / sin GitHub" → "Respaldado / Sin respaldo".
  - Popover Cuenta/Repo/Subida automática → lenguaje humano de respaldo.
  - `NewVaultDialog` (clonar/crear, usado por el VaultSwitcher) → reescribir la copy a "respaldo / cuaderno" **manteniendo la función** (importar un cuaderno ya respaldado). "GitHub" solo donde sea inevitable, enmarcado como servicio de respaldo.

### Claude's Discretion
- Redacción exacta de microcopys y del contenido de la checklist, dentro del tono acordado.
- Estructura de componentes nuevos (tarjeta, wizard, botón de respaldo) reutilizando clases CSS existentes.
- Forma exacta del mapeo de errores (util compartida vs inline en handler) — a criterio del planner/research.
- Cómo se persiste el estado del onboarding de respaldo (empezado/diferido/completado) — probablemente en settings.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/services/github.ts`: device flow (`requestDeviceCode`, `pollForToken`, `getLogin`), `listRepos`, `createRepo(token, name, isPrivate)` (auto_init:false), `normalizeRemoteUrl`. `createRepo`/`push` lanzan errores crudos → mapear para BACKUP-05.
- `src/main/index.ts`: handlers `githubStartDeviceFlow` (abre navegador + código, index.ts:714), `githubCompleteDeviceFlow` (polling + guarda token, :723), `githubSetRemote` (:732), `githubSetAutoPush` (:741), `gitPush` (:768), `gitPendingPush` (ahead count, :759), `vaultCreateWithRepo`/`vaultCloneFromGithub` (:416+). `restoreLastVault` (:788).
- `src/renderer/src/App.tsx`: status bar con `UploadCloud` (push manual, :1280-1288), `statusLabel(status, connected, pushCount)` (:1443), píldora "GitHub/sin GitHub" + popover Cuenta/Repo/Subida automática (:1477-1490), `githubCfg` state (:162), `pushCount` (:310), `refreshGithub`.
- `src/renderer/src/NewVaultDialog.tsx`: flujo clonar/crear GitHub (usado por VaultSwitcher; ya NO por la welcome tras Fase 11) — copy a reescribir.
- `src/renderer/src/SettingsModal.tsx`: sección GitHub/backup — copy a reescribir.
- `src/main/services/settings.ts`: `settings.github` (token cifrado, remote, autoPush, pushed[]).

### Established Patterns
- IPC tipado `geode:*` (ipc.ts → index.ts handler → preload CommonJS → window.geode); preload DEBE seguir CommonJS.
- Device flow OAuth sin client secret; token cifrado con safeStorage.
- STAT-01: "Todo en la nube" solo con árbol limpio + pusheado (honestidad).
- Racy-git-safe commit; auto-snapshots no invocan IA por defecto.
- UI: Lucide (Cloud, UploadCloud, RefreshCw…), clases kebab-case, strings/comentarios en español.

### Integration Points
- El botón de respaldo persistente reemplaza `UploadCloud` + píldora en la status bar de App.tsx.
- La tarjeta de invitación se dispara tras `createLocalVault` (Fase 11) — coordinar con el estado post-creación en App.tsx.
- Nuevo estado de onboarding de respaldo (started/deferred/done) probablemente en settings + IPC.
- El botón lleva `data-tour` para que la Fase 13 lo ancle.
</code_context>

<specifics>
## Specific Ideas

- "GitHub" enmarcado: "un servicio gratuito y seguro para guardar tus copias (gratis + privado)".
- Signup URL: `https://github.com/signup` (abrir con `shell.openExternal`).
- Errores: "Ya tenés un respaldo con ese nombre" (422), "Se perdió la conexión con tu cuenta, reconectá" (401/403), "No hay internet — tu cuaderno sigue guardado en este dispositivo" (red).
- Repo privado por defecto; nombre derivado del cuaderno.
- "Todo en la nube" solo con árbol limpio Y pushCount==0.
</specifics>

<deferred>
## Deferred Ideas

- Tour interactivo de primera vez que ancla su paso "respaldar" al botón de respaldo de esta fase → **Fase 13** (TOUR-01..03).
- Automatizar creación de cuenta / pollear GitHub → **Out of Scope** (PROJECT.md: imposible/frágil por captcha+verificación de email).
- Carrusel de bienvenida multi-slide → Out of Scope.
</deferred>
