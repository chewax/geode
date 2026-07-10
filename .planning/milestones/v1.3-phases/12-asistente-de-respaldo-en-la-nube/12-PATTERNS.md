# Phase 12: Asistente de respaldo en la nube - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 12 (7 modified, 5 new)
**Analogs found:** 12 / 12

> Todo el trabajo de esta fase es **orquestación + UX + copy**, no plomería nueva. Cada archivo nuevo copia un patrón ya probado del repo. Las referencias abajo son concretas (archivo + líneas). El planner debe copiar la forma, no reinventarla.

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|------|-----------|----------------|---------------|
| `src/main/index.ts` (handler `vaultEnableBackup`) | modificado | route/handler (orquestador) | request-response + file-I/O + net | `IPC.vaultCreateWithRepo` (index.ts:437) + `IPC.gitPush` (index.ts:768) | exact (composición) |
| `src/main/index.ts` (auto-push tras commit) | modificado | service wiring | event-driven (post-commit) | `snapshotIfChanged` (index.ts:178) + `gitPush` handler (index.ts:768) | role-match |
| `src/main/index.ts` (IPC onboarding get/set) | modificado | route/handler | CRUD (settings) | `githubSetAutoPush` (index.ts:741) + `advanced.get/set` | exact |
| `src/main/fs/githubRepoSlug.ts` (o en `github.ts`) | **NUEVO** | utility (sanitizer) | transform | `sanitizeVaultName` (fs/vaultName.ts:33) | role-match (reglas distintas) |
| `src/main/services/backupErrors.ts` (o inline en handler) | **NUEVO** | utility (error map) | transform | `mapBackupError` (RESEARCH.md:320-358) — sin analog directo en repo | no-analog (ver §No Analog) |
| `src/main/services/github.ts` (`createRepo` status en error) | modificado | service | request-response | `createRepo` (github.ts:142) | exact (misma fn) |
| `src/main/services/settings.ts` (campo onboarding + helpers) | modificado | model/config | CRUD | `setAdvanced`/`setSnapshotCadence` (settings.ts:186/205) | exact |
| `src/shared/ipc.ts` (canales + tipos) | modificado | config (contrato) | — | `GithubApi` / `IPC` object (ipc.ts:53-59, 307) | exact |
| `src/preload/index.ts` (mapeo IPC) | modificado | bridge (CommonJS) | request-response | `github` bridge (preload/index.ts:64-72) | exact |
| `src/renderer/src/BackupCard.tsx` (tarjeta invitación) | **NUEVO** | component (banner) | event-driven | `TimeTravelBanner.tsx` (`.time-banner`) | role-match |
| `src/renderer/src/BackupWizard.tsx` (wizard cuenta) | **NUEVO** | component (modal) | request-response | `NewVaultDialog.tsx` (device flow + tabs) | exact |
| `src/renderer/src/App.tsx` (botón persistente + statusLabel + estado + copy) | modificado | component (status bar) | event-driven | `UploadCloud` (App.tsx:1280) + píldora (App.tsx:1476) + `statusLabel` (App.tsx:1772) | exact |
| `src/renderer/src/SettingsModal.tsx` (copy) | modificado | component | — | sección github (SettingsModal.tsx:331-376) | exact (misma sección) |
| `src/renderer/src/NewVaultDialog.tsx` (copy + ícono `⚠`) | modificado | component | — | archivo completo | exact (mismo archivo) |

---

## Pattern Assignments

### `src/main/index.ts` — handler `IPC.vaultEnableBackup` (NUEVO orquestador)

**Analog:** `vaultCreateWithRepo` (index.ts:437-454) para createRepo→setRemote→persist remote; `gitPush` (index.ts:768-784) para push→persist `pushed[branch]`.

**Encadenar createRepo→setRemote→persist** (index.ts:437-454, copiar la secuencia):
```typescript
const token = await getGithubToken()
if (!token) throw new Error('Conectá tu cuenta de GitHub en Ajustes')
// ...
const repo = await createRepo(token, name, isPrivate) // crea el repo en GitHub
await gitService.setRemote(dir, repo.cloneUrl)
const settings = await loadSettings()
settings.github = { ...settings.github, remote: repo.cloneUrl }
await saveSettings(settings)
```

**Push + persistir `pushed[branch]=oid`** (index.ts:775-783 — el paso que `vaultCreateWithRepo` NO hace):
```typescript
const root = requireRoot()
await gitService.setRemote(root, url)
const { branch, oid } = await gitService.push(root, url, token)
// Recordar el oid pusheado por rama, para el contador de pendientes.
const pushed = { ...settings.github?.pushed, [branch]: oid }
settings.github = { ...settings.github, pushed }
await saveSettings(settings)
```

**Idempotencia (RESEARCH Pattern 1 nota + Open Q #2):** si `settings.github.remote` ya apunta al repo esperado, saltear `createRepo` (evita el 422-propio en reintento) e ir directo a `push`. Envolver `createRepo` y `push` en `try/catch` que relanza `mapBackupError(e)`. Slug via `githubRepoSlug(info.name)`; `info` de `vault.getInfo()` (patrón `requireRoot()`, index.ts:106). Devolver `githubConfig()` (index.ts:86) como los otros handlers github. Tras éxito: `settings.github.autoPush = true` (BACKUP-04) + marcar onboarding `completado`.

**Return type explícito:** `Promise<GithubConfig>` (TS strict, como todos los handlers github).

---

### `src/main/index.ts` — auto-push real tras commit (BACKUP-04, hoy CONFIG MUERTA)

**Analog:** `snapshotIfChanged` (index.ts:178-206) es el punto único "si cambió, commiteá" que usan cadencia (index.ts:249), cambio de bóveda (:357), baja (:381) y cierre (:841). El handler `gitCommit` (index.ts:534) es el commit manual.

**Dónde cablear (RESEARCH Pattern 3 → main, best-effort):** tras el commit exitoso en `snapshotIfChanged` (antes del `return` en index.ts:198) y en el handler `gitCommit` (index.ts:534). Patrón best-effort que NO bloquea ni relanza (espejo del `try/catch` que ya usa `snapshotIfChanged`, index.ts:199-201):
```typescript
// tras un commit exitoso, si autoPush ON y hay remoto+token: push best-effort
const s = await loadSettings()
if (s.github?.autoPush && s.github.remote && (await getGithubToken())) {
  try {
    const url = normalizeRemoteUrl(s.github.remote)
    const { branch, oid } = await gitService.push(requireRoot(), url, token)
    const pushed = { ...s.github.pushed, [branch]: oid }
    s.github = { ...s.github, pushed }
    await saveSettings(s)
  } catch (e) {
    console.warn('[auto-push] falló, el cuaderno sigue local:', e) // NO relanzar
  }
}
```

**Invariantes (CLAUDE.md + RESEARCH):** el auto-push **no invoca IA** (solo sube bytes); no pushear por tecla, solo tras commit real; el fallo se traga (no rompe el guardado) y queda reflejado por `pushCount>0` en el renderer.

---

### `src/main/index.ts` — IPC onboarding get/set + `src/main/services/settings.ts`

**Analog (handler):** `githubSetAutoPush` (index.ts:741-746) — el patrón CRUD-sobre-settings más corto:
```typescript
ipcMain.handle(IPC.githubSetAutoPush, async (_e, autoPush: boolean) => {
  const settings = await loadSettings()
  settings.github = { ...settings.github, autoPush }
  await saveSettings(settings)
  return githubConfig()
})
```

**Analog (settings helper):** `setAdvanced` / `setSnapshotCadence` (settings.ts:186-209) — spread inmutable preservando el resto:
```typescript
export async function setAdvanced(enabled: boolean): Promise<void> {
  const settings = await loadSettings()
  settings.advanced = { ...settings.advanced, enabled }
  await saveSettings(settings)
}
```

**Aplicar:** agregar a `interface Settings` (settings.ts:11-49) un campo nuevo. Opciones (a criterio del planner): `settings.backup?.onboarding?: 'invitado'|'diferido'|'completado'` (nuevo bloque, paralelo a `snapshots`/`advanced`) o `settings.github.onboarding`. Default ausente ⇒ tratar como "no invitado" (no migración — patrón de `resolveAiTitles`/`resolveCadenceMinutes` que interpretan ausente como default seguro). Comentario doc en español, como el resto de `settings.ts`.

---

### `src/main/fs/githubRepoSlug.ts` (NUEVO) — sanitizer de nombre de repo GitHub

**Analog:** `sanitizeVaultName` (fs/vaultName.ts:33-46) — MISMA forma (nunca lanza, fallback constante, cota a 100), REGLAS DISTINTAS (GitHub ≠ Windows).

**Estructura a copiar de `sanitizeVaultName`** (fs/vaultName.ts:33-46):
```typescript
const MAX_VAULT_NAME = 100
export function sanitizeVaultName(raw: string): string {
  let name = (raw ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
  name = name.replace(/\s+/g, ' ').trim()
  name = Array.from(name).slice(0, MAX_VAULT_NAME).join('')
  name = name.replace(/[. ]+$/g, '').trim()
  const stem = name.split('.')[0] || name
  if (name === '' || WINDOWS_RESERVED.test(stem)) return 'Cuaderno'
  return name
}
```

**Nuevas reglas GitHub (RESEARCH Pattern 2, líneas 206-212):** quitar acentos (NFKD) → reemplazar `[^A-Za-z0-9._-]+` por `-` → colapsar `-+` y recortar `^[-.]+|[-.]+$` → `slice(0,100)` → fallback `|| 'cuaderno-geode'`. **Fallback obligatorio** (Pitfall 3): nombre 100% no-ASCII queda vacío. Ubicar en `src/main/fs/` junto a `vaultName.ts` (donde se llama a `createRepo`). Doc en español; explicar por qué NO se reutiliza `sanitizeVaultName` (mismo estilo que el header de `vaultName.ts:6-10` que advierte contra reusar `sanitizeTagName`).

---

### `src/main/services/github.ts` — `createRepo` adjunta status al error (BACKUP-05)

**Analog:** `createRepo` (github.ts:142-167) — la línea a modificar es la 152:
```typescript
if (!res.ok) throw new Error(`GitHub crear repo: ${res.status} ${await res.text()}`)
```

**Cambio recomendado (RESEARCH línea 352-358)** para que `mapBackupError` clasifique por `status` y no por regex de texto:
```typescript
if (!res.ok) {
  const body = await res.text()
  throw Object.assign(new Error(`crear repo: ${res.status}`), { status: res.status, body })
}
```

---

### `src/main/services/backupErrors.ts` (NUEVO) — `mapBackupError` + `BackupError`

**Sin analog directo en el repo** (ver §No Analog). Copiar textualmente de RESEARCH.md:320-350. Clasifica por, en orden: (1) `e.code` de red / regex `network|fetch failed|ENOTFOUND` → offline; (2) `e.data?.statusCode` (isomorphic-git `HttpError`) o `4\d\d` del texto de `createRepo` → 401/403 auth, 422 name-taken; (3) fallback genérico. Los 4 mensajes exactos en español están LOCKED en UI-SPEC.md:159-164. **Anti-patrón (RESEARCH:230):** no parsear `e.message` con regex frágil como señal primaria — usar `status`/`e.code`/`e.data.statusCode`.

**Dos familias de error a cubrir (Pitfall 2):** `createRepo` lanza `Error` plano (fetch, con status adjunto tras el cambio de arriba); `gitService.push` (git.ts:488) propaga clases de `isomorphic-git` (`Errors.{HttpError,PushRejectedError,UserCanceledError}`) o error de red con `.code`.

---

### `src/shared/ipc.ts` + `src/preload/index.ts` — nuevos canales tipados

**Analog (canal + tipo):** bloque `IPC` github (ipc.ts:53-59) + `GithubApi` (ipc.ts:307-318):
```typescript
// ipc.ts — objeto IPC:
githubSetAutoPush: 'geode:github-set-auto-push',
// GithubApi:
setAutoPush(autoPush: boolean): Promise<GithubConfig>
```

**Analog (preload, CommonJS — NO convertir a ESM):** bridge github (preload/index.ts:64-72):
```typescript
github: {
  getConfig: () => ipcRenderer.invoke(IPC.githubGetConfig),
  setAutoPush: (autoPush) => ipcRenderer.invoke(IPC.githubSetAutoPush, autoPush),
  // ...
}
```

**Aplicar:** agregar `vaultEnableBackup: 'geode:vault-enable-backup'`, `backupOnboardingGet/-Set` al objeto `IPC`; métodos tipados a `GithubApi` (o una nueva `BackupApi` en `GeodeApi`, ipc.ts:470); mapeo en preload. Todos los canales llevan prefijo `geode:` (convención).

---

### `src/renderer/src/BackupCard.tsx` (NUEVO) — tarjeta de invitación no bloqueante

**Analog:** `TimeTravelBanner.tsx` (completo, 50 líneas) — banner de ancho completo `.time-banner`, "sólo presenta: las acciones llegan por props".

**Estructura a copiar** (TimeTravelBanner.tsx:10-49):
```typescript
export function TimeTravelBanner({ label, onReturnToPresent, onBringBack }: {...}): JSX.Element {
  return (
    <div className="time-banner">
      <div className="time-banner-info"><Eye size={15} /><span>…</span></div>
      <div className="time-banner-actions">
        <button className="tb-btn present" onClick={onReturnToPresent}>…</button>
        <button className="tb-btn primary head" onClick={onBringBack}>…</button>
      </div>
    </div>
  )
}
```

**Aplicar:** reutilizar `.time-banner` con tinte `--accent` (no `--head`). CTA `.primary` "Respaldar en la nube" (`CloudUpload` size 16) + `.link-btn` "Hacerlo después". Copy exacta en UI-SPEC.md:111-114. Se monta como el `TimeTravelBanner` en App.tsx (entre header y cuerpo, ver App.tsx:1297). Disparo: tras `createLocalVault` (App.tsx:475) si onboarding no es `completado`/`diferido`. "Hacerlo después" → set onboarding `diferido`, no re-nag.

---

### `src/renderer/src/BackupWizard.tsx` (NUEVO) — wizard de cuenta + checklist

**Analog:** `NewVaultDialog.tsx` (completo) — modal `.modal-overlay`/`.modal` con device flow, connect, tabs, estados busy/error.

**Device flow a copiar** (NewVaultDialog.tsx:31-44 + 107-120):
```typescript
const connect = async (): Promise<void> => {
  setConnecting(true); setError(null)
  try {
    setDevice(await window.geode.github.startDeviceFlow()) // abre github.com + código
    await window.geode.github.completeDeviceFlow()          // espera autorización
    setConnected(true); setDevice(null)
  } catch (e) { setError((e as Error).message) }
  finally { setConnecting(false) }
}
// render device:
{device ? (
  <div className="nv-device">
    <p>Ingresá este código…<b className="nv-code"> {device.userCode}</b></p>
    <p className="hint">Esperando autorización…</p>
  </div>
) : (
  <button className="primary" disabled={connecting} onClick={() => void connect()}>
    {connecting ? <RefreshCw size={14} className="spin" /> : <Cloud size={14} />} Conectar…
  </button>
)}
```

**Estructura modal-overlay** (NewVaultDialog.tsx:92-100): overlay con `onClick={onClose}` + `stopPropagation` en el `.modal`; header con botón `X`. **Errores inline** (NewVaultDialog.tsx:200) `{error && <p className="modal-error">…</p>}` — pero SIN el `⚠` Unicode; usar ícono Lucide (`CloudOff`/`CloudAlert`). Reutilizar `.device-box`/`.device-code`. Dos caminos "Ya tengo cuenta" / "Crear una gratis" (`shell.openExternal` via el handler; NO existe canal aún — el planner debe verificar si `startDeviceFlow` ya abre el navegador o si "Crear una gratis" necesita un canal de openExternal a signup). Al conectar OK → llamar `window.geode.…enableBackup()`. Copy LOCKED en UI-SPEC.md:115-126. Checklist = estado de UI que sobrevive round-trip (los 2 `<li>` quedan visibles).

---

### `src/renderer/src/App.tsx` — botón persistente + estado + statusLabel + copy

**Botón persistente (reemplaza DOS superficies).** Analogs a absorber:
- `UploadCloud` (App.tsx:1280-1291) — hoy `{githubCfg?.connected && githubCfg.remote && (<button…/>)}`, con `.push-badge` y `pushing ? 'spin'`.
- Píldora + popover (App.tsx:1476-1495) — `.status-item` + `.status-pop` con `.pop-title`/`.pop-row`.

**Corrección clave (RESEARCH Pitfall 4):** el botón nuevo se renderiza **SIEMPRE** (nunca condicional), con `data-tour="respaldo"`, cambiando solo ícono/color/texto por estado. Esto evita el `getBoundingClientRect()` null del tour de Fase 13. 4 estados (UI-SPEC.md:132-137): sin-respaldo (`.st-off`) / respaldando (`--accent` + `.spin`) / al-día (`.st-ok`) / error (`.st-warn`). Reutilizar `.push-badge` (App.tsx:1289) para pendientes.

**Estado "último respaldo falló"** (RESEARCH Open Q #3): estado efímero de React en App.tsx (como `pushing`, App.tsx:164), seteado en el catch de push; no persiste.

**statusLabel — NO tocar la lógica** (App.tsx:1772-1794). Contrato LOCKED (UI-SPEC.md:141-153):
```typescript
case 'clean':
  if (githubConnected) {
    return pushCount === 0
      ? { text: 'Todo en la nube', Icon: Cloud }
      : { text: 'Guardado en este dispositivo', Icon: HardDrive }
  }
  return { text: 'Guardado', Icon: Check }
```
STAT-01: "Todo en la nube" SOLO con `clean && pushCount===0`.

**doCommit (App.tsx:774-785):** hoy termina con `// El push es SIEMPRE manual`. Con el auto-push cableado en el main (arriba), `refreshGithub()` (App.tsx:780 → 307-311) ya reflejará el nuevo `pushCount`; ese comentario debe actualizarse. `refreshGithub` recalcula `pushCount` vía `git.pendingPush()`.

**Copy rewrite píldora/popover** (App.tsx:1476-1495) — reemplazos exactos en UI-SPEC.md:181-190: "GitHub"→"Todo en la nube"/"Sin respaldo"; ELIMINAR fila "Repo · {remote}" (no exponer URL); "Cambios sin subir"→"Sin respaldar"; "Subida automática"→"Copia automática".

---

### `src/renderer/src/SettingsModal.tsx` — reescritura de copy (sección github)

**Analog:** la propia sección `section === 'github'` (SettingsModal.tsx:331-376). Reemplazos exactos en UI-SPEC.md:192-204: `h2` "GitHub — guardar en tu repo"→"Respaldo en la nube"; device flow copy; "Conectar con GitHub"→"Conectar mi cuenta"; OCULTAR campo URL del repo en flujo normal (opción avanzada); hint "subida siempre manual"→"se respalda solo cada vez que guardás". Mantener la estructura `.settings-section`/`.key-row`/`.device-box`/`.hint`.

---

### `src/renderer/src/NewVaultDialog.tsx` — copy + reemplazar `⚠`

**Analog:** archivo completo (mantiene la función clonar/crear). Reemplazos exactos en UI-SPEC.md:206-227. **Además (RESEARCH:233, 373):** línea 200 `<p className="modal-error">⚠ {error}</p>` — reemplazar el `⚠` Unicode por ícono Lucide (`CloudOff`/`CloudAlert`), CLAUDE.md prohíbe símbolos no-Lucide. Íconos: tab clonar `GitFork`→`CloudDownload`; el import (NewVaultDialog.tsx:3) debe actualizarse.

---

## Shared Patterns

### IPC tipado `geode:*` (canal → handler → preload CommonJS → window.geode)
**Source:** `IPC` object (ipc.ts:53-59), handler `githubSetAutoPush` (index.ts:741), bridge (preload/index.ts:64-72), `GithubApi` (ipc.ts:307).
**Apply to:** `vaultEnableBackup`, `backupOnboardingGet/-Set`. Preload DEBE seguir CommonJS (no ESM). Prefijo `geode:` obligatorio.

### Persistencia inmutable en settings.json
**Source:** `setAdvanced` (settings.ts:205), `setGithubToken` (settings.ts:143), spread `{ ...settings.github, … }`.
**Apply to:** campo onboarding nuevo, `autoPush=true`, `pushed[branch]=oid`. Siempre `loadSettings()` → mutar spread → `saveSettings()` (atomicWrite ya envuelto).

### Config-por-defecto-seguro (ausente = off)
**Source:** `resolveCadenceMinutes`/`resolveAiTitles` (index.ts:217-231), `githubConfig` (index.ts:86 → `?? false`).
**Apply to:** onboarding ausente ⇒ "no invitado"; sin migración.

### Error handling best-effort que no rompe el flujo
**Source:** `snapshotIfChanged` try/catch que loguea y devuelve null (index.ts:199-201); `createLocalVault` que traduce a mensaje humano español (App.tsx:484-493, index.ts:499-508).
**Apply to:** auto-push (traga el fallo), `mapBackupError` (nunca filtra texto crudo de API — ASVS V7).

### Mensajes humanos en español, nunca el crudo de la API
**Source:** `vaultCreateLocal` EACCES→mensaje humano (index.ts:499-508); `createLocalVault` filtro `startsWith` (App.tsx:490).
**Apply to:** los 4 errores de BACKUP-05 (UI-SPEC.md:159-164).

### Device flow reusable sin jerga OAuth
**Source:** `startDeviceFlow`/`completeDeviceFlow` (NewVaultDialog.tsx:31-44), handlers (index.ts:714-730).
**Apply to:** BackupWizard. `startDeviceFlow` ya hace `shell.openExternal(verificationUri)` (index.ts:716).

### Íconos Lucide, nunca emojis/símbolos Unicode
**Source:** toda la UI (`<Cloud size={14} />`, `.spin`). CLAUDE.md.
**Apply to:** corregir `⚠` en NewVaultDialog:200; usar `CloudUpload/Cloud/CloudOff/CloudAlert/RefreshCw/CloudDownload` (todos VERIFIED en lucide 1.23.0, RESEARCH:107-116).

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| `mapBackupError` + `BackupError` class | utility (error map) | transform | No existe un mapeo centralizado de errores API→español en el repo; hoy cada catch hace `e.message` o un mensaje fijo inline. Copiar de RESEARCH.md:320-350 (patrón nuevo, LOW-analog). Es el único código verdaderamente nuevo sin plantilla en el repo. |
| Checklist resumible (2 pasos que sobreviven round-trip al navegador) | UI state | event-driven | No hay precedente de UI que persista a través de un `shell.openExternal`. Es estado de React simple (los `<li>` no se desmontan); sin plumbing nuevo, pero sin analog visual directo. |
| Auto-push tras commit (BACKUP-04) | service wiring | event-driven | El cableado NO existe (`autoPush` es config muerta, verificado por grep). El patrón best-effort se compone de `snapshotIfChanged` + `gitPush`, pero el punto de inserción es nuevo. |

---

## Metadata

**Analog search scope:** `src/main/` (index.ts, services/github.ts, services/git.ts, services/settings.ts, fs/vaultName.ts), `src/shared/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/` (App.tsx, NewVaultDialog.tsx, SettingsModal.tsx, TimeTravelBanner.tsx).
**Files scanned:** 12
**Pattern extraction date:** 2026-07-09
