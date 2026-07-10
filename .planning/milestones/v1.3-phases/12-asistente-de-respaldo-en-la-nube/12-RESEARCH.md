# Phase 12: Asistente de respaldo en la nube - Research

**Researched:** 2026-07-09
**Domain:** Onboarding de respaldo en la nube sobre GitHub (OAuth device flow + isomorphic-git push), en Electron/React/TS
**Confidence:** HIGH (todo el hallazgo técnico está verificado leyendo el código real de este repo; las formas de error de APIs externas son MEDIUM y están marcadas)

## Summary

Esta fase NO introduce tecnología nueva: reutiliza el device flow, `createRepo`, `setRemote` y `push` que ya existen en el main. El trabajo es **orquestación + UX + copy + honestidad**, no plomería nueva. Los cinco pilares:

1. **Un flujo de "backup onboarding" que hoy no existe como unidad.** Las piezas están sueltas: `githubStartDeviceFlow`/`githubCompleteDeviceFlow` (conectar), `createRepo` (crea repo), `setRemote` (enlaza), `gitPush` (sube). Ningún handler las encadena. `vaultCreateWithRepo` crea repo + setRemote pero **NO pushea**. Hay que crear **un IPC nuevo (`geode:vault-enable-backup`)** que, con token ya presente, derive un slug de repo válido → `createRepo(private=true)` → `setRemote` → `push` → persista `pushed[branch]` → active `autoPush`.

2. **`autoPush` es hoy CONFIG MUERTA.** Se almacena y se muestra, pero **ningún código lo consume para pushear al guardar** (`doCommit` en App.tsx:774 tiene el comentario explícito "El push es SIEMPRE manual"). BACKUP-04 ("cada vez que guardás, se respalda solo") **requiere cablear de verdad** el auto-push tras un commit/save cuando `autoPush===true`. Esto es el hallazgo de mayor riesgo: sin él, BACKUP-04 no se cumple aunque el toggle diga "sí".

3. **La persistencia de onboarding tampoco existe.** STATE.md dice que Phase 11 planeaba `geode:onboarding-get/-set`, pero **no está en el código** (ni canal IPC, ni campo en settings). Hay que crearla en Phase 12 para el estado `invitado/diferido/completado` de la tarjeta.

4. **Errores crudos en dos superficies distintas con formas distintas.** `createRepo` lanza un `Error` de mensaje `GitHub crear repo: 422 {body}` (fetch plano, status conocido). `gitService.push` lanza **clases de error de isomorphic-git** (`HttpError` con `.data.statusCode`, `PushRejectedError`, `UserCanceledError`) o errores de red (`ENOTFOUND`). Un solo `catch (e){ e.message }` no basta: hay que mapear ambas familias.

5. **El botón persistente reemplaza dos superficies condicionales.** El `UploadCloud` (App.tsx:1280-1291) y la píldora "GitHub/sin GitHub" (App.tsx:1476-1495) hoy solo se montan `connected && remote`. El nuevo botón debe estar **SIEMPRE montado** (ancla `data-tour` de Phase 13).

**Primary recommendation:** Construir un único handler `geode:vault-enable-backup` en el main que encadene las primitivas existentes y centralice el mapeo de errores a español; cablear el auto-push real en el path de commit del main (no del renderer); persistir el estado de onboarding en `settings`; y en el renderer reemplazar las dos superficies condicionales por un botón siempre montado que consume `githubCfg` + un nuevo estado de "último respaldo falló".

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Encadenar createRepo→setRemote→push (BACKUP-03) | Main (handler nuevo) | — | Toca red + fs + settings; el renderer está sandboxed |
| Derivar slug de repo válido de GitHub (BACKUP-03) | Main (`fs/` util nueva, junto a `vaultName.ts`) | — | Reglas de nombre viven donde se llama a `createRepo` |
| Mapear errores API→español (BACKUP-05) | Main (util compartida) | Renderer (mostrar inline) | El main es la frontera donde nacen los errores crudos; el renderer solo muestra el texto ya humano |
| Auto-push al guardar (BACKUP-04) | Main (path de commit) | — | El push necesita token + remoto, ambos solo accesibles en main |
| Estado onboarding started/deferred/done | Main (settings) + IPC | Renderer (lee para decidir card) | Persistencia = settings.json en userData |
| Tarjeta de invitación no bloqueante (BACKUP-01) | Renderer (banner) | — | UI pura; se dispara tras `createLocalVault` |
| Wizard de cuenta + checklist (BACKUP-02) | Renderer (modal) | Main (shell.openExternal, device flow) | La UI vive en renderer; el hand-off al navegador y el device flow ya son handlers |
| Botón de respaldo persistente + estados (BACKUP-01/04) | Renderer (status bar) | Main (githubCfg) | UI de estado derivada de config + pushCount |
| Etiqueta STAT-01 "Todo en la nube" | Renderer (`statusLabel`) | — | Lógica de honestidad ya existe; se preserva |
| Reescritura de copy (COPY-01) | Renderer (4 superficies) | — | Strings user-facing |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Invitación (BACKUP-01):**
- Tarjeta **no bloqueante** (banner en el shell, NO modal) con "Respaldar en la nube" + "Hacerlo después" siempre presente.
- Botón de respaldo **persistente** siempre visible en la status bar, con `data-tour` (ancla de Phase 13), reflejando estados: sin respaldo / respaldando / al día / no se pudo respaldar.
- Si elige "Hacerlo después", la tarjeta **no reaparece sola** (sin re-nag); se retoma solo por el botón persistente.
- El botón unificado **absorbe/reemplaza** el `UploadCloud` (App.tsx:1280-1288) y la píldora "GitHub/sin GitHub" (App.tsx:1477-1490).

**Onboarding de cuenta (BACKUP-02):**
- Dos caminos: **"Ya tengo cuenta"** (device flow directo) / **"Crear una gratis"** (abre `https://github.com/signup` vía `shell.openExternal`).
- **Checklist en la app** que sobrevive el ida-y-vuelta; al volver "Conectar" reusa `githubStartDeviceFlow` → `githubCompleteDeviceFlow`.
- **"GitHub" se nombra SOLO en este paso**, enmarcado como "servicio gratuito y seguro para guardar tus copias (gratis + privado)". Nunca en Capa 0 fuera de aquí.
- Device flow sin jerga OAuth ("Conectá tu cuenta" + código + "esperando autorización").

**Primer respaldo + invariante (BACKUP-03/04):**
- Al conectar: **crear repo privado + primer push automáticamente**, sin exponer repo/commit/push. Reusar `createRepo(nombre, private=true)` → `setRemote` → `push`.
- **Nombre del repo derivado del cuaderno**, sanitizado a slug válido de GitHub (distinto del sanitizer de carpeta Windows de Phase 11).
- **Activar `autoPush` automáticamente** tras completar el onboarding.
- **"Todo en la nube" (STAT-01):** reusar `statusLabel`; SOLO con árbol limpio Y `pushCount==0`. Nunca declarar "a salvo" antes de un push real.
- Reescribir píldora + popover a lenguaje de respaldo, sin exponer URL del repo ni "GitHub" en Capa 0.

**Errores humanos (BACKUP-05):**
- 422 → "Ya tenés un respaldo con ese nombre". 401/403 → "Se perdió la conexión con tu cuenta, reconectá". Red → "No hay internet — tu cuaderno sigue guardado en este dispositivo". Otros → genérico humano. **Nunca el mensaje crudo de la API.**
- Errores inline en la tarjeta/wizard; botón persistente refleja "no se pudo respaldar".

**Reescritura de copy (COPY-01):** Ajustes (sección GitHub), píldora/popover de estado, `NewVaultDialog`. "GitHub" solo donde sea inevitable.

### Claude's Discretion
- Redacción exacta de microcopys y contenido de la checklist (dentro del tono acordado — pero **el UI-SPEC ya fija copy exacta**, ver más abajo).
- Estructura de componentes nuevos reutilizando clases CSS existentes.
- Forma exacta del mapeo de errores (util compartida vs inline en handler).
- Cómo se persiste el estado del onboarding (probablemente en settings).

### Deferred Ideas (OUT OF SCOPE)
- Tour interactivo (Phase 13, TOUR-01..03) — ancla su paso "respaldar" al botón que esta fase introduce.
- Automatizar creación de cuenta / pollear GitHub → Out of Scope (captcha + verificación de email).
- Carrusel de bienvenida multi-slide → Out of Scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACKUP-01 | Asistente no bloqueante (tarjeta, no modal) + "Hacerlo después" + re-entrada persistente | Trigger tras `createLocalVault` (App.tsx:475); banner con `.time-banner`; botón persistente reemplaza App.tsx:1280-1291 + 1476-1495; estado onboarding nuevo en settings |
| BACKUP-02 | Hand-off a signup + checklist resumible; "GitHub" solo aquí | `shell.openExternal` ya usado (index.ts:716); device flow reusable (`githubStartDeviceFlow`/`CompleteDeviceFlow`); checklist = estado de UI en el wizard |
| BACKUP-03 | Al conectar: repo privado + primer push automático, primera versión sembrada | Nuevo handler encadena `createRepo`(:142)→`setRemote`(:452)→`push`(:488); slug util nueva; seed de Phase 11 garantiza push no vacío |
| BACKUP-04 | Respaldo automático e invisible honrando STAT-01 | **Cablear auto-push (hoy muerto)** en path de commit del main; activar `autoPush`; `statusLabel` (App.tsx:1772) sin cambios de lógica |
| BACKUP-05 | Errores en lenguaje humano, nunca crudo | Util de mapeo en main; formas de error de `createRepo` (fetch) y `push` (clases isomorphic-git) documentadas abajo |
| COPY-01 | Reescritura de jerga en Capa 0 | 4 superficies: SettingsModal:331-376, píldora/popover App.tsx:1476-1495, NewVaultDialog completo, statusLabel (solo texto) |

## Standard Stack

Esta fase **no instala paquetes nuevos**. Todo el stack ya está en el repo y verificado.

### Core (ya presentes)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| isomorphic-git | ^1.38.6 [VERIFIED: package.json] | push/commit/clone sin git nativo | Ya es el motor de versionado del proyecto |
| electron | 43.0.0 | `shell.openExternal`, `safeStorage`, IPC | Framework base |
| lucide-react | 1.23.0 [VERIFIED: runtime require] | Íconos Cloud/CloudUpload/etc. | Convención del proyecto (nunca emojis) |
| react / react-dom | 19.2.7 | UI | Base |

**No hay Package Legitimacy Audit** porque no se instala ningún paquete. Si el planner decidiera agregar alguno (no recomendado), correr el gate de legitimidad antes.

### Íconos Lucide — verificados en `lucide-react@1.23.0`

Verificado por `require('lucide-react')` en runtime (no training data):

| Ícono | Existe | Uso en esta fase |
|-------|--------|------------------|
| `Cloud` | ✅ | estado al-día / conectar |
| `CloudUpload` | ✅ | CTA "Respaldar en la nube" |
| `CloudDownload` | ✅ | NewVaultDialog "Traer uno respaldado" |
| `CloudOff` | ✅ | estado sin-respaldo / error |
| `CloudAlert` | ✅ | **disponible** — usable para estado error (el UI-SPEC dudaba de esto) |
| `UploadCloud` | ✅ | (superficie que se reemplaza) |
| `RefreshCw` | ✅ | spinner "respaldando" |
| `Check`, `HardDrive`, `Loader2`, `Lock`, `Globe`, `GitFork` | ✅ | STAT-01 + NewVaultDialog |

**[VERIFIED]** Todos existen. `CloudAlert` está disponible → el estado "error" puede usarlo; no hace falta el fallback a `CloudOff+st-warn` que el UI-SPEC sugería (aunque ambas opciones son válidas).

## Architecture Patterns

### System Architecture Diagram (flujo de respaldo)

```
[Usuario crea 1er cuaderno]
   └─> createLocalVault() App.tsx:475
        └─> (Phase 11) seed Bienvenida.md + commit "Primera versión"  ← push nunca vacío
        └─> [NUEVO] si onboarding != done/deferred → mostrar TARJETA (banner)

[Tarjeta: "Respaldar en la nube"]
   ├─> "Hacerlo después" → onboarding=deferred (settings) → cierra, no re-nag
   └─> "Respaldar" → abre WIZARD
        ├─> "Ya tengo cuenta" ─┐
        └─> "Crear una gratis" │  shell.openExternal(github/signup) + CHECKLIST (sobrevive round-trip)
                               ▼
                     [Conectar] → githubStartDeviceFlow (device code + abre navegador)
                               → githubCompleteDeviceFlow (poll → token cifrado)
                               ▼
              [NUEVO handler] geode:vault-enable-backup
                   1. slug = githubRepoSlug(vault.name)         ← util nueva
                   2. createRepo(token, slug, private=true)     ← github.ts:142  ⚠ puede 422
                   3. setRemote(root, repo.cloneUrl)            ← git.ts:452
                   4. push(root, url, token)                    ← git.ts:488     ⚠ puede 401/red
                   5. settings.github.pushed[branch]=oid
                   6. settings.github.autoPush=true
                   7. onboarding=done
                        │ (cualquier throw en 2-4)
                        ▼
                  mapBackupError(e) → texto español  ← util nueva (BACKUP-05)
                        ▼
              renderer muestra inline + botón persistente = "no se pudo respaldar"

[De ahí en más, en cada guardado]
   doCommit / snapshot → commit  → [NUEVO] si autoPush: push automático
                                        → statusLabel: "Todo en la nube" solo si clean && pushCount==0
```

### Pattern 1: Handler orquestador que reutiliza primitivas (BACKUP-03)
**What:** Un solo `ipcMain.handle(IPC.vaultEnableBackup, ...)` que encadena las primitivas ya probadas, en vez de exponerlas sueltas al renderer.
**When to use:** Siempre en esta fase — evita que el renderer haga 4 llamadas y tenga que orquestar estados intermedios/rollback.
**Example (patrón, basado en `vaultCreateWithRepo` index.ts:437 + `gitPush` index.ts:768):**
```typescript
// Source: composición de patrones existentes en src/main/index.ts
ipcMain.handle(IPC.vaultEnableBackup, async (): Promise<GithubConfig> => {
  const token = await getGithubToken()
  if (!token) throw new BackupError('auth') // ya conectado por el wizard; si no, error humano
  const root = requireRoot()
  const info = vault.getInfo()
  if (!info) throw new Error('No hay cuaderno abierto')

  const slug = githubRepoSlug(info.name)            // util nueva (ver Pattern 2)
  let repo
  try {
    repo = await createRepo(token, slug, true)      // private=true
  } catch (e) {
    throw mapBackupError(e)                          // 422 → "Ya tenés un respaldo con ese nombre"
  }
  await gitService.setRemote(root, repo.cloneUrl)

  const settings = await loadSettings()
  settings.github = { ...settings.github, remote: repo.cloneUrl }
  await saveSettings(settings)

  try {
    const { branch, oid } = await gitService.push(root, repo.cloneUrl, token)
    const pushed = { ...settings.github?.pushed, [branch]: oid }
    settings.github = { ...settings.github, pushed, autoPush: true } // BACKUP-04: autoPush ON
    await saveSettings(settings)
  } catch (e) {
    throw mapBackupError(e)                          // 401/red mapeados; repo ya existe → reintento no re-crea
  }
  return githubConfig()
})
```
**Nota de idempotencia:** si el push falla tras crear el repo, un reintento con el mismo nombre dará 422 ("ya existe"). El planner debe decidir: (a) al reintentar, saltear `createRepo` si el remoto ya está seteado y solo re-pushear; o (b) tratar el 422-propio como éxito de creación. Recomendación: **si `settings.github.remote` ya apunta al repo esperado, saltear createRepo y ir directo a push** (reintento seguro).

### Pattern 2: Slug de repo GitHub (distinto del sanitizer de carpeta)
**What:** Derivar un nombre de repo válido para GitHub del nombre del cuaderno. Reglas de GitHub (distintas de Windows):
- Permitidos: alfanuméricos ASCII, `-`, `_`, `.`. Todo lo demás (espacios, acentos, `/`, etc.) GitHub lo reemplaza por `-`.
- No puede ser vacío ni solo `.`/`..`. Longitud máx. 100.
- GitHub colapsa múltiples separadores y recorta. Case-insensitive para colisiones.
**When to use:** En el main, junto a `vaultName.ts` (nueva función `githubRepoSlug` en `src/main/fs/` o en `github.ts`).
**Example:**
```typescript
// Source: reglas de nombre de repo de GitHub [CITED: docs.github.com/rest/repos/repos#create]
export function githubRepoSlug(raw: string): string {
  let s = (raw ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '') // quita acentos
  s = s.replace(/[^A-Za-z0-9._-]+/g, '-')  // no permitidos → guion
  s = s.replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '') // colapsa y recorta
  s = s.slice(0, 100)
  return s || 'cuaderno-geode' // fallback si queda vacío (ej. nombre 100% no-ASCII)
}
```
**Cuidado:** un nombre 100% no-ASCII (ej. "日本語") queda vacío tras el filtro → **necesita fallback** (igual que `sanitizeVaultName` cae a "Cuaderno"). No dejar que `createRepo("")` llegue a la API.

### Pattern 3: Auto-push real cableado en el path de commit (BACKUP-04)
**What:** Tras cada commit (manual `doCommit`, snapshot de cadencia, snapshot de cierre), si `autoPush===true` y hay remoto+token, disparar un push en segundo plano.
**When to use:** BACKUP-04. **Este cableado NO existe hoy.**
**Dónde:** Preferible en el **main**, en `snapshotIfChanged` (index.ts:178) y tras `gitCommit` (el handler), porque token+remoto solo viven ahí. Alternativa: en el renderer, en `doCommit` (App.tsx:774) llamando a `git.push()` si `githubCfg.autoPush`. Recomendación: **main**, para que también cubra los snapshots de cadencia/cierre (que ocurren sin UI). El push debe ser **best-effort y no bloquear el guardado** (envolver en try/catch que no relanza; en fallo, marcar estado "no se pudo respaldar" que el renderer lee vía `githubCfg`/pendingPush).
**Invariante de coste (CLAUDE.md):** el auto-push **no invoca IA** — solo sube bytes. No hay riesgo de coste. Pero sí hay coste de red/latencia: no pushear en cada tecla, solo tras un commit real.

### Pattern 4: Botón persistente siempre montado (ancla del tour)
**What:** Un `<button>` en la status bar que NUNCA se desmonta condicionalmente, con `data-tour="respaldo"`, que absorbe el `UploadCloud` + la píldora.
**When to use:** BACKUP-01 + dependencia dura de Phase 13.
**Anti-patrón actual a corregir:** hoy `{githubCfg?.connected && githubCfg.remote && (<button UploadCloud/>)}` (App.tsx:1280) y `<div className="status-item">…</div>` con contenido condicional (1476). El nuevo botón se renderiza siempre; su **contenido/ícono/color** cambia por estado, pero el nodo con `data-tour` está siempre en el DOM. Esto evita el `getBoundingClientRect()` null que STATE.md marca como pitfall de Phase 13.

### Anti-Patterns to Avoid
- **Exponer `createRepo`/`push` sueltos al renderer y orquestar en React:** duplica la lógica de rollback y filtra errores crudos. Orquestar en un handler del main.
- **Confiar en que `autoPush` ya pushea:** es config muerta. Verificar el cableado real o BACKUP-04 no se cumple.
- **Parsear `e.message` con regex frágil para clasificar errores:** las dos familias (fetch de createRepo vs clases de isomorphic-git) tienen formas distintas. Clasificar por `status`/`e.code`/`e.data.statusCode`, no por texto.
- **Mostrar la URL del repo o "GitHub" en Capa 0:** viola el core value. Eliminar la fila "Repo · {remote}" del popover (UI-SPEC lo ordena).
- **Decir "Todo en la nube" con `pushCount>0`:** rompe STAT-01 (invariante de honestidad, code-review WR-01 de v1.0).
- **Usar `⚠` u otros símbolos Unicode como íconos:** NewVaultDialog:200 hoy usa `⚠ {error}` — reemplazar por un ícono Lucide (`CloudOff`/`CloudAlert`) al reescribir la copy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth / obtener token | Un flujo OAuth nuevo | `githubStartDeviceFlow`/`githubCompleteDeviceFlow` (index.ts:714/723) | Ya implementado, token cifrado con safeStorage |
| Crear repo en GitHub | fetch manual a la API | `createRepo(token, name, isPrivate)` (github.ts:142) | Ya devuelve `GithubRepoInfo` tipado con `auto_init:false` (clave para push no conflictivo) |
| Push con auth HTTPS | Configurar http+onAuth a mano | `gitService.push(dir, url, token)` (git.ts:488) | Ya maneja `x-access-token`, resuelve oid, valida detached HEAD |
| Enlazar remoto | addRemote manual | `gitService.setRemote(dir, url)` (git.ts:452) | Idempotente (borra origin previo) |
| Contar pendientes de subir | Diff de logs | `gitService.aheadCount` vía `gitPendingPush` (index.ts:759) | Ya alimenta `pushCount` |
| Normalizar URL SSH→HTTPS | Parseo propio | `normalizeRemoteUrl` (github.ts:27) | isomorphic-git no hace SSH |
| Cifrar/guardar token | Crypto propio | `setGithubToken`/`getGithubToken` (settings.ts:143/156) | safeStorage del SO |
| Abrir el navegador | window.open | `shell.openExternal` (ya usado en index.ts:716) | Electron, respeta sandbox |
| Slug de carpeta Windows | — | NO reutilizar `sanitizeVaultName` para el repo | Reglas distintas (GitHub ≠ Windows); ver Pattern 2 |

**Key insight:** el 90% de BACKUP-03 ya está construido y probado en v1.0/v1.1. El error de scope sería reimplementar el device flow o el push. El trabajo real es **encadenar + persistir estado + mapear errores + UX**.

## Runtime State Inventory

Esta fase **no es un rename/refactor** puro, pero introduce persistencia nueva y consume estado existente. Inventario relevante:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `settings.json` en `app.getPath('userData')`: `github.{token,login,remote,autoPush,pushed}` ya existe (settings.ts:22-34). **NO existe** campo de onboarding de respaldo. | Agregar campo nuevo (ej. `settings.backup.onboarding: 'invitado'\|'diferido'\|'completado'` o `settings.github.onboarding`) + helpers + 2 IPC (`geode:backup-onboarding-get/-set`). Code edit, no migración (default = ausente ⇒ "no invitado"). |
| Live service config | Repo privado en la cuenta GitHub del usuario (creado en runtime, no en git). | Ninguna — se crea al vuelo; nombre derivado del cuaderno. |
| OS-registered state | Ninguno. | None — verificado: no hay Task Scheduler/launchd/registry en juego. |
| Secrets/env vars | `settings.github.token` cifrado con safeStorage. `GITHUB_CLIENT_ID` (constante en main). | Ninguna acción — el token ya se persiste; el flujo lo reusa. |
| Build artifacts | Ninguno afectado. | None. |

**Nota:** el `pushed[branch]` (settings.ts:33) ya existe y alimenta el contador de pendientes. El nuevo handler debe **persistirlo tras el primer push** (igual que `gitPush` index.ts:780) o el contador arrancará mal.

## Common Pitfalls

### Pitfall 1: `autoPush` no dispara nada (config muerta)
**What goes wrong:** Se activa `autoPush=true`, el popover dice "Copia automática: activada", pero al guardar **no se sube nada**. BACKUP-04 falla silenciosamente.
**Why it happens:** El único consumidor de `autoPush` en el código es la vista del popover (App.tsx:1486). `doCommit` (App.tsx:774) tiene el comentario "El push es SIEMPRE manual". No hay ningún `if (autoPush) push()`.
**How to avoid:** Cablear explícitamente el push tras commit cuando `autoPush`. Verificar con un test manual: conectar → guardar una edición → confirmar que `pushCount` vuelve a 0 sin tocar el botón.
**Warning signs:** `pushCount` crece tras guardar aunque estés conectado con autoPush ON.
**[VERIFIED: grep del código — `autoPush` no aparece en ningún path de push]**

### Pitfall 2: Dos familias de error con formas distintas
**What goes wrong:** Un mapeo que asume `e.message` uniforme clasifica mal los errores de push (o los deja crudos).
**Why it happens:** `createRepo` lanza `new Error("GitHub crear repo: 422 {body}")` (fetch plano). `gitService.push` propaga **clases de isomorphic-git**: `HttpError` (con `.data.statusCode` = 401/403), `PushRejectedError` (non-fast-forward), `UserCanceledError` (onAuth vacío), o un error de red plano con `.code = 'ENOTFOUND'/'ETIMEDOUT'/'EAI_AGAIN'`.
**How to avoid:** Un `mapBackupError(e)` que chequee, en orden: (1) `e.code`/mensaje de red → offline; (2) status 401/403 (de `e.data?.statusCode` o del texto de createRepo) → reconexión; (3) status 422 o `errors[].message` con "already exists" → nombre tomado; (4) fallback genérico. **Mejor aún:** modificar `createRepo` para que, en `!res.ok`, parsee el body y lance un error **con un campo `status`** (ej. `Object.assign(new Error(...), {status: res.status})`) — así el mapeo no parsea texto.
**[VERIFIED: isomorphic-git@1.38.6 expone `Errors.{HttpError,PushRejectedError,UserCanceledError,...}` — confirmado en runtime]**
**[MEDIUM]** La forma exacta del 422 de GitHub es `{message:"Repository creation failed.", errors:[{resource:"Repository", field:"name", message:"name already exists on this account"}]}` — confirmado por múltiples fuentes, pero el planner debería añadir un fallback por si GitHub cambia el wording.

### Pitfall 3: Nombre de repo vacío tras el slug
**What goes wrong:** Un cuaderno con nombre 100% no-ASCII (o solo símbolos) produce slug vacío → `createRepo("")` → 422/400 confuso.
**Why it happens:** El filtro `[^A-Za-z0-9._-]` borra todo.
**How to avoid:** Fallback obligatorio (`|| 'cuaderno-geode'`), igual que `sanitizeVaultName` cae a "Cuaderno".
**Warning signs:** Error de creación con nombres en otros alfabetos.

### Pitfall 4: El botón persistente se desmonta y rompe el tour (Phase 13)
**What goes wrong:** El botón se renderiza `connected && remote`; antes de conectar no existe → el tour de Phase 13 hace `getBoundingClientRect()` sobre null.
**Why it happens:** Es el comportamiento actual de `UploadCloud` (App.tsx:1280) y la píldora.
**How to avoid:** Renderizar el nodo con `data-tour="respaldo"` **siempre**, cambiando solo su contenido por estado. STATE.md ya marca esto como el pitfall #1 de Phase 13.

### Pitfall 5: Declarar "a salvo" antes del push real (STAT-01)
**What goes wrong:** El mensaje de éxito o el botón dice "Todo en la nube" cuando el push aún no terminó (o hay pendientes).
**Why it happens:** Optimismo de UI; mostrar éxito al iniciar en vez de al resolver.
**How to avoid:** El mensaje "Listo: tu cuaderno está a salvo" (UI-SPEC) se muestra **solo tras resolver el `push`**. El botón usa `statusLabel`/`pushCount`: "Todo en la nube" solo con `clean && pushCount===0`. **No tocar la lógica de `statusLabel` (App.tsx:1772)** — está correcta; el botón debe respetarla.

### Pitfall 6: Race del checklist (tab cerrada / "Ya tengo cuenta" prematuro)
**What goes wrong:** El usuario abre signup, cierra la pestaña sin crear cuenta, vuelve y toca "Conectar" → el device flow espera para siempre.
**Why it happens:** No hay señal de que la cuenta se creó (Out of Scope pollear GitHub).
**How to avoid:** El device flow ya maneja esto: `pollForToken` tiene deadline (`expiresIn`, ~900s) y muestra "Esperando que autorices…". Si expira, lanza "El código expiró; probá de nuevo" (github.ts:82). El wizard debe permitir reintentar sin romperse. No hace falta lógica nueva, solo UX que tolere el reintento.

## Code Examples

### Registrar un IPC nuevo (patrón completo: canal + preload + handler)
```typescript
// 1. src/shared/ipc.ts — agregar al objeto IPC:
vaultEnableBackup: 'geode:vault-enable-backup',
backupOnboardingGet: 'geode:backup-onboarding-get',
backupOnboardingSet: 'geode:backup-onboarding-set',
// y a la interface GithubApi o una nueva BackupApi los métodos tipados.

// 2. src/preload/index.ts — mapear (CommonJS, NO convertir a ESM):
enableBackup: () => ipcRenderer.invoke(IPC.vaultEnableBackup),

// 3. src/main/index.ts — handler (ver Pattern 1)
```
**[VERIFIED: patrón leído en ipc.ts:10-80, preload/index.ts:64-72, index.ts:712-784]**

### Mapeo de errores a español (BACKUP-05)
```typescript
// Source: composición sobre createRepo (github.ts:152) + Errors de isomorphic-git@1.38.6
import { Errors } from 'isomorphic-git'

class BackupError extends Error {
  constructor(public kind: 'name-taken'|'auth'|'offline'|'unknown', msg: string) { super(msg) }
}

function mapBackupError(e: unknown): BackupError {
  const err = e as { code?: string; data?: { statusCode?: number }; message?: string }
  const msg = err?.message ?? ''
  // Red / sin internet (fetch de createRepo o de push)
  if (['ENOTFOUND','ETIMEDOUT','EAI_AGAIN','ECONNREFUSED'].includes(err?.code ?? '') ||
      /network|fetch failed|ENOTFOUND/i.test(msg)) {
    return new BackupError('offline',
      'No hay internet. Tu cuaderno sigue guardado en este dispositivo; se respaldará cuando vuelva la conexión.')
  }
  // Auth (HttpError de push .data.statusCode, o "401/403" del texto de createRepo)
  const status = err?.data?.statusCode ?? Number(/\b(4\d\d)\b/.exec(msg)?.[1] ?? 0)
  if (status === 401 || status === 403) {
    return new BackupError('auth',
      'Se perdió la conexión con tu cuenta. Reconectá para seguir respaldando.')
  }
  // Nombre de repo tomado (422 con "already exists")
  if (status === 422 || /already exists/i.test(msg)) {
    return new BackupError('name-taken',
      'Ya tenés un respaldo con ese nombre. Probá con otro nombre de cuaderno.')
  }
  return new BackupError('unknown',
    'No se pudo respaldar ahora. Tu cuaderno sigue guardado en este dispositivo; volvé a intentarlo en un momento.')
}
```
**Recomendación fuerte:** que `createRepo` (github.ts:152) adjunte el status al error para no depender del regex:
```typescript
if (!res.ok) {
  const body = await res.text()
  throw Object.assign(new Error(`crear repo: ${res.status}`), { status: res.status, body })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Copy con "GitHub/repo/bóveda/clonar" en Capa 0 | Lenguaje de respaldo ("copia de seguridad/cuaderno") | Phase 11 (COPY-01 parcial) → Phase 12 cierra las 4 superficies diferidas | Consistencia con core value "git invisible" |
| Push 100% manual (botón UploadCloud) | Auto-push tras guardar (BACKUP-04) | Phase 12 | Requiere cablear `autoPush` de verdad (hoy muerto) |
| Píldora "GitHub/sin GitHub" + botón UploadCloud (2 superficies condicionales) | 1 botón persistente unificado siempre montado | Phase 12 | Habilita el ancla del tour de Phase 13 |
| Sección Ajustes "GitHub — guardar en tu repo" con campo URL manual | "Respaldo en la nube" con repo derivado del cuaderno | Phase 12 | Oculta el campo URL en flujo normal (opción avanzada opcional) |

**Deprecado/a reemplazar en esta fase:**
- Botón `UploadCloud` (App.tsx:1280-1291): absorbido por el botón persistente.
- Píldora "GitHub/sin GitHub" (App.tsx:1476-1495): absorbida por el botón persistente.
- Fila "Repo · {remote}" del popover: **eliminar** (no exponer URL).
- `⚠` como ícono de error en NewVaultDialog:200: reemplazar por Lucide.

## Copywriting Contract (del UI-SPEC — LOCKED)

El UI-SPEC ya fija la **copy exacta** de cada superficie (nueva y reescrita). El planner debe copiarla textualmente, no reinventarla. Resumen de las tablas clave (ver `12-UI-SPEC.md` para el detalle completo):

- **Tarjeta:** título "Respaldá tu cuaderno en la nube"; CTA "Respaldar en la nube" (`CloudUpload` size 16); secundaria "Hacerlo después" (`.link-btn`).
- **Wizard:** intro, encuadre único de "GitHub", checklist 2 pasos, device flow sin jerga, éxito "Listo: tu cuaderno está a salvo en la nube." (solo tras push real).
- **Botón persistente — 4 estados:** sin-respaldo (`Cloud`/`CloudOff`, `.st-off`, "Sin respaldo") / respaldando (`RefreshCw.spin`, `--accent`, "Respaldando…") / al-día (`Cloud`, `.st-ok`, "Todo en la nube") / error (`CloudOff`/`CloudAlert`, `.st-warn`, "No se pudo respaldar").
- **statusLabel (App.tsx:1772):** contrato a preservar sin cambios de lógica.
- **Errores:** 4 mensajes exactos (ver tabla BACKUP-05 en el UI-SPEC).
- **Copy Rewrite Table (old→new):** píldora/popover (App.tsx:1476-1495), Ajustes (SettingsModal:331-376), NewVaultDialog completo — reemplazos exactos definidos.

## Project Constraints (from CLAUDE.md)

- **Strings y comentarios en español.** Toda la copy user-facing en 2ª persona, tono cálido.
- **Íconos Lucide monocromo `currentColor`, NUNCA emojis** (corregir el `⚠` de NewVaultDialog:200).
- **Preload debe ser CommonJS (`.cjs`)** — al agregar el nuevo IPC, no convertir preload a ESM.
- **Renderer sandboxed** (contextIsolation, nodeIntegration=false): todo por IPC `geode:*`. El nuevo canal lleva prefijo `geode:`.
- **Racy-git-safe commit:** el push no toca la detección de cambios; el commit ya es racy-safe. No revertir a statusMatrix.
- **AI nunca en auto-snapshots ni en auto-push:** el auto-push solo sube bytes, no genera mensajes con IA. Coste escala con guardados manuales, no con tiempo.
- **STAT-01 (invariante de honestidad):** "Todo en la nube" solo con árbol limpio Y `pushCount===0`. No negociable.
- **TS strict con tipos de retorno explícitos** en funciones exportadas.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Forma del body 422 de GitHub = `{errors:[{field:"name", message:"name already exists on this account"}]}` | Pitfall 2 / Code Examples | Bajo — el mapeo usa `status===422` como señal primaria; el texto es secundario. Si GitHub cambia el wording, el status sigue siendo 422. |
| A2 | Reglas de slug de GitHub (reemplaza no-alfanuméricos por `-`, máx 100, case-insensitive) | Pattern 2 | Bajo-medio — GitHub acepta el nombre "crudo" y lo normaliza server-side, pero derivar el slug del lado app permite detectar colisiones y mostrar el nombre. Si el slug local difiere del que GitHub genera, el `setRemote` usa `repo.cloneUrl` devuelto por la API (fuente de verdad), así que no se rompe. |
| A3 | Los errores de red de isomorphic-git push exponen `.code` = ENOTFOUND/ETIMEDOUT | Pitfall 2 | Medio — isomorphic-git puede envolver el error de fetch. El planner debería añadir una prueba manual offline para confirmar la forma exacta, o capturar por `/network|fetch/i` como fallback (ya incluido). |
| A4 | El auto-push conviene cablearlo en el main (cubre snapshots sin UI) | Pattern 3 | Bajo — es una decisión de diseño; el renderer también funcionaría para commits manuales, pero perdería los snapshots de cadencia/cierre. |

## Open Questions

1. **¿Dónde exactamente cablear el auto-push?**
   - What we know: `autoPush` es config muerta; token+remoto solo en main; snapshots de cadencia/cierre ocurren sin UI (index.ts:178, 248, 841).
   - What's unclear: si BACKUP-04 exige respaldar también los snapshots automáticos o solo los guardados manuales/commits.
   - Recommendation: cablear en el main tras cualquier commit exitoso (manual + snapshot), best-effort, sin bloquear. Confirmar con el planner/UAT si el auto-push en cada snapshot de cadencia es deseable (coste de red, no de IA).

2. **¿Reintento tras push fallido re-crea el repo?**
   - What we know: si el repo ya se creó pero el push falló, reintentar `createRepo` da 422.
   - What's unclear: el flujo de reintento exacto.
   - Recommendation: si `settings.github.remote` ya está seteado al repo esperado, saltear `createRepo` y solo re-pushear (ver Pattern 1, nota de idempotencia).

3. **¿Dónde vive el estado "último respaldo falló" que el botón refleja?**
   - What we know: `githubCfg` (connected/remote/autoPush) + `pushCount` ya existen. No hay flag de "último push falló".
   - What's unclear: si se persiste en settings o es estado efímero de React.
   - Recommendation: estado efímero de React en App.tsx (como `pushing`), seteado en el catch del push; no necesita persistencia (al reabrir, `pushCount>0` ya indica pendiente).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| isomorphic-git | push/commit | ✓ | 1.38.6 | — |
| lucide-react (íconos Cloud*) | UI de respaldo | ✓ | 1.23.0 | — (todos verificados) |
| Electron `shell.openExternal` | hand-off signup | ✓ | 43.0.0 | — (ya usado en index.ts:716) |
| Electron `safeStorage` | token cifrado | ✓ | 43.0.0 | texto plano si SO no soporta cripto (ya manejado en settings.ts:69) |
| Red / GitHub API | createRepo + push | runtime | — | Error humano "sin internet" (BACKUP-05); cuaderno sigue local |
| Cuenta GitHub del usuario | respaldo | runtime | — | Wizard de creación (BACKUP-02) |

**Sin dependencias faltantes que bloqueen.** Todo el stack está instalado y verificado.

## Validation Architecture

> El repo tiene **cero tests automatizados** (STATE.md, CLAUDE.md: "No explicit linter/test configured"). La verificación es **typecheck + build en verde + UAT humano end-of-phase** (`human_verify_mode=end-of-phase`), consistente con v1.0–v1.2.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Ninguno (sin jest/vitest/pytest) |
| Config file | none |
| Quick run command | `npx tsc --noEmit` (typecheck; verificar comando real en package.json scripts) |
| Full suite command | `npm run build` (electron-vite build de main/preload/renderer) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACKUP-01 | Tarjeta aparece tras 1er cuaderno; no re-nag | manual-only (UAT) | — | ❌ (sin framework) |
| BACKUP-02 | Wizard hand-off + checklist sobrevive round-trip | manual-only (UAT) | — | ❌ |
| BACKUP-03 | Repo privado creado + primer push automático | manual-only (UAT) + typecheck | `npx tsc --noEmit` | ❌ |
| BACKUP-04 | Auto-push tras guardar; "Todo en la nube" honesto | manual-only (UAT) | — | ❌ |
| BACKUP-05 | Errores en español (forzar 422/offline) | manual-only (UAT) | — | ❌ |
| COPY-01 | Sin "GitHub/repo/bóveda" en Capa 0 | manual-only (UAT) + grep | grep de strings prohibidos en renderer | ❌ |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (typecheck del área tocada).
- **Per wave merge:** `npm run build` (build completo).
- **Phase gate:** build verde + UAT humano end-of-phase antes de `/gsd-verify-work`.

### Wave 0 Gaps
- None — no hay infraestructura de tests que instalar (decisión de proyecto sostenida: verificación por typecheck+build+UAT). El planner NO debe introducir un framework de tests en esta fase sin decisión explícita del usuario.

## Security Domain

> `security_enforcement` no está explícitamente en `false`; se incluye la sección. Superficie de seguridad de esta fase: manejo de token OAuth, red a GitHub, y renderizado de errores.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sí | Device flow OAuth (sin client secret); token cifrado con `safeStorage` (settings.ts:143). No introducir nuevos secretos en texto plano. |
| V3 Session Management | no | No hay sesiones web; el token es persistente por dispositivo. |
| V4 Access Control | parcial | Repo creado como **privado** (`isPrivate=true`) — no exponer contenido del usuario públicamente por defecto. |
| V5 Input Validation | sí | El nombre del cuaderno se convierte a slug seguro antes de ir a la API (`githubRepoSlug`); no interpolar el nombre en superficies markdown (ya cubierto en Phase 11 seed T-11-04). |
| V6 Cryptography | sí | No hand-roll: reutilizar `safeStorage`. No loggear el token. |
| V7 Error Handling | sí | **Nunca filtrar el mensaje crudo de la API** al usuario (BACKUP-05) — evita fugas de detalles internos y da UX humana. |

### Known Threat Patterns for Electron + GitHub OAuth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fuga de token en logs/errores | Information Disclosure | `mapBackupError` no incluye el token; no `console.log` del token; el error crudo nunca llega al renderer |
| Inyección markdown vía nombre de cuaderno | Tampering | Slug sanitizado; nombre nunca interpolado en HTML/markdown sin sanitizar (DOMPurify ya en preview) |
| Repo público accidental | Information Disclosure | `private=true` explícito en `createRepo`; check "Privado (solo vos lo ves)" en NewVaultDialog |
| Man-in-the-middle en push | Tampering | HTTPS forzado (`normalizeRemoteUrl` convierte SSH→HTTPS); isomorphic-git sobre TLS |
| Renderer accede a red/fs directo | Elevation of Privilege | contextIsolation + IPC `geode:*`; el nuevo handler valida `requireRoot()` y token antes de actuar |

## Sources

### Primary (HIGH confidence)
- Código del repo (leído directamente en esta sesión): `src/main/services/github.ts` (device flow, createRepo:142, push auth), `src/main/services/git.ts` (push:488, setRemote:452, aheadCount:465, commit:133), `src/main/services/settings.ts` (github config, safeStorage), `src/main/index.ts` (handlers 415-510, 710-784, snapshots 178-249, 841), `src/renderer/src/App.tsx` (doCommit:774, doPush:338, statusLabel:1772, UploadCloud:1280, píldora:1476, createLocalVault:475), `src/renderer/src/SettingsModal.tsx` (331-376), `src/renderer/src/NewVaultDialog.tsx` (completo), `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/fs/vaultName.ts`.
- `require('lucide-react')` runtime check — todos los íconos verificados en 1.23.0.
- `require('isomorphic-git').Errors` runtime — clases de error confirmadas (1.38.6).

### Secondary (MEDIUM confidence)
- GitHub REST API repo creation 422 body shape — múltiples fuentes concordantes (issues/discussions de GitHub) confirman `errors[].message = "name already exists on this account"`. [CITED: docs.github.com/rest/repos/repos#create]

### Tertiary (LOW confidence)
- Forma exacta con que isomorphic-git envuelve errores de red (ENOTFOUND) en push — inferida; el planner debería confirmar con una prueba offline. Mitigado con fallback por regex de mensaje.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todo leído del repo; nada nuevo que instalar; íconos y versiones verificados en runtime.
- Architecture: HIGH — las primitivas y sus firmas están confirmadas por lectura directa; el diseño reencadena código existente.
- Pitfalls: HIGH — el hallazgo crítico (autoPush muerto, onboarding inexistente) está verificado por grep del código, no por suposición.
- Formas de error de API externa: MEDIUM — 422 de GitHub bien documentado; wrapping de red de isomorphic-git es la única incógnita real, con fallback previsto.

**Research date:** 2026-07-09
**Valid until:** 2026-08-09 (código del repo estable; revalidar si github.ts/git.ts/App.tsx cambian antes de planificar)
