# Phase 11: Bienvenida y creación local - Research

**Researched:** 2026-07-08
**Domain:** Electron main-process vault lifecycle + isomorphic-git first-commit + React welcome UI (Geode internal codebase)
**Confidence:** HIGH (all findings verified against the live codebase; no external dependencies introduced)

## Summary

Esta fase es 100% trabajo sobre el código existente de Geode: NO introduce librerías nuevas, NO toca red, y reutiliza primitivas ya probadas (`VaultService`, `GitService.commit`, `atomicWrite`, el patrón IPC tipado, y las clases CSS `welcome`/`primary`/`text-input`/`link-btn`). El trabajo se reparte en tres tiers: (1) un nuevo canal IPC `geode:vault-create-local` con su handler en el main; (2) una nueva primitiva `createLocal` que resuelve la ruta bajo `~/Documents/Geode/<nombre>`, sanitiza el nombre para Windows, resuelve colisiones con sufijo, siembra `Bienvenida.md` y hace el primer commit racy-safe; (3) la reescritura del bloque `if (!vault)` de `App.tsx` con la copy sin jerga y el mini-campo de nombre.

El hallazgo clave sobre el flujo GitHub existente (`vaultCreateWithRepo` en `src/main/index.ts:437`) es que **NO hace un primer commit** — solo `ensureRepo` (git init) + crea el repo remoto; la primera versión la deja al auto-snapshot. Para la creación local, ONB-03 exige que la nota sembrada **quede commiteada como primera versión**, así que `createLocal` DEBE llamar explícitamente a `gitService.commit(dir, mensaje)` después de sembrar. Esa llamada ya es racy-git-safe (hashea contenido real vs blobs de HEAD, ver `pendingChanges`/`headBlobs`/`workBlobs`), así que no hay riesgo de perder el seed.

El segundo hallazgo importante: `adoptVault(info)` en el renderer resetea a un **panel vacío** — no abre ninguna nota. Como la UI-SPEC exige que el cuaderno abra SIEMPRE con `Bienvenida.md`, el renderer debe llamar a `openNote('Bienvenida.md')` DESPUÉS de `adoptVault` en el nuevo flujo de creación local.

**Primary recommendation:** Reutilizar `GitService.commit` como primitiva de primer-commit (NO copiar el flujo de `createWithRepo`, que no commitea); implementar `createLocal` en `VaultService` recibiendo la base de Documents inyectada desde el handler; añadir un util NUEVO de sanitización de nombres de carpeta Windows en el main (el `sanitizeTagName` existente es para refs de git, reglas distintas — NO reutilizar); y encadenar `openNote('Bienvenida.md')` tras `adoptVault`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONB-01 | Bienvenida sin jerga, CTA único "Crear mi primer cuaderno", "abrir carpeta existente" como link secundario | Bloque `if (!vault)` en `App.tsx:1079-1105`; clases CSS `welcome`/`tagline`/`primary`/`link-btn` ya existen; `openVault()` (`App.tsx:452`) cubre el link secundario |
| ONB-02 | Crear cuaderno local 1-click en `~/Documents/Geode/<nombre>`, sin picker; "Elegir otra ubicación" como escape | `app.getPath('documents')` disponible (mismo patrón que `app.getPath('userData')` en settings.ts:52); `vault.pickFolder(title)` (`vault.ts:46`) cubre el escape |
| ONB-03 | Cuaderno arranca con `Bienvenida.md` sembrada (nunca editor vacío), borrable, commiteada como primera versión | `atomicWrite` (`atomic.ts:16`) siembra; `gitService.commit` (`git.ts:133`) hace el primer commit racy-safe; contenido canónico en 11-UI-SPEC.md |
| ONB-04 | Sanitizar nombre (ilegales Windows + reservados) y resolver colisión de carpeta con sufijo, sin fallar ni pisar | NO existe util de sanitización de nombres de archivo hoy; patrón de sufijo-numérico ya presente en `createNote`/`createFolder`/`duplicate` (loop `while exists`) |
| COPY-01 | Reescribir strings de Capa 0 (welcome + nuevo flujo local) de "bóveda/GitHub/repo/clonar" → "cuaderno / copia de seguridad" | Copy exacta congelada en 11-UI-SPEC.md §Copywriting Contract; scope Fase 11 = solo welcome + flujo nuevo (NewVaultDialog/Ajustes → Fase 12) |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bienvenida (pantalla welcome)**
- CTA primario único: **"Crear mi primer cuaderno"** (ONB-01).
- Quitar el clon de GitHub de la pantalla de bienvenida; dejar un único link secundario **"Abrir una carpeta existente"** (abre el picker nativo → `setRoot`). El respaldo/clon es de la Fase 12.
- Reemplazar la tagline actual por: **"Escribí sin miedo a perder nada."**
- El CTA primario muestra un **mini-campo de nombre pre-rellenado** ("Mi primer cuaderno"); Enter o botón "Crear" crea el cuaderno.

**Creación local (ubicación + naming)**
- Carpeta por defecto: **`~/Documents/Geode/<nombre>`**, resolviendo la base con `app.getPath('documents')` (ONB-02). Sin selector de carpeta en el happy path.
- Nombre pre-rellenado: **"Mi primer cuaderno"**.
- Escape secundario **"Elegir otra ubicación"** dentro del paso de creación → picker nativo → crea ahí.
- Nuevo IPC **`vault.createLocal(name)`** (canal `geode:vault-create-local`): arma la ruta bajo Documents/Geode, sanitiza el nombre, resuelve colisión, `git init`, siembra la nota, primer commit, fija el vault (`setRoot`). No pasa por GitHub. Reusar el git-init/primer-commit del flujo existente donde aplique.

**Nota de bienvenida sembrada (ONB-03)**
- Archivo: **"Bienvenida.md"**. Contenido corto y cálido (~1 pantalla). Se **commitea como la primera versión**. Tono: 2ª persona, español cálido, sin jerga; menciona "copia de seguridad", nunca "GitHub".

**Sanitización + colisiones (ONB-04)**
- Sanitizar (no bloquear): reemplazar ilegales de Windows `< > : " / \ | ? *`, recortar puntos/espacios finales, evitar reservados (CON, PRN, AUX, NUL, COM1-9, LPT1-9). Implementar en el **main** como util compartida.
- Colisión de carpeta: **sufijo numérico** ` (2)`, `(3)`… nunca pisar datos.
- Nombre vacío o todo-ilegal: **fallback a "Cuaderno"**.

**Reescritura de copy (COPY-01)**
- Reescribir por completo los strings de la welcome + el nuevo flujo de creación local. Barrer "bóveda → cuaderno" en Capa 0.
- Dejar la copy GitHub-específica de respaldo (NewVaultDialog / respaldo en Ajustes) para la **Fase 12**. En Fase 11 solo se tocan superficies que no dependen de esa reconstrucción.

### Claude's Discretion
- Redacción exacta de la nota de bienvenida y microcopys, dentro del tono acordado.
- Nombres internos de funciones/utils y estructura de archivos nuevos.
- Detalles de estilo CSS reutilizando clases existentes (`welcome`, `modal`, etc.).

### Deferred Ideas (OUT OF SCOPE)
- Asistente de respaldo en la nube y reconstrucción del flujo GitHub / reescritura de copy de NewVaultDialog y sección de respaldo en Ajustes → **Fase 12** (BACKUP-01..05).
- Tour interactivo de primera vez → **Fase 13** (TOUR-01..03).
- Contenido sembrado personalizado por caso de uso → v2 (ONBX-03).
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resolver base `~/Documents/Geode` | Main (handler `index.ts`) | — | Solo el main tiene `app.getPath('documents')`; el renderer está sandboxed |
| Sanitizar nombre de carpeta (Windows) | Main (util nuevo) | — | Lógica de FS; debe correr donde se crea la carpeta; testeable en aislamiento |
| Resolver colisión de carpeta (sufijo) | Main (`VaultService.createLocal`) | — | Requiere `stat`/`readdir` del FS real; mismo patrón que `createNote` |
| `git init` + primer commit sembrado | Main (`GitService`) | — | isomorphic-git corre en el main; commit racy-safe ya implementado |
| Sembrar `Bienvenida.md` (escritura atómica) | Main (`VaultService`/`atomicWrite`) | — | Escritura a disco; el renderer no toca FS |
| Fijar vault + recordar + timer snapshots | Main (handler) | — | Estado singleton del main (`VaultService.root`, settings, timer) |
| Pantalla de bienvenida + mini-campo + estados | Renderer (`App.tsx`) | — | UI/interacción; consume `window.geode.vault.createLocal` |
| Abrir `Bienvenida.md` tras adoptar | Renderer (`App.tsx`) | — | `adoptVault` resetea a panel vacío; abrir nota es acción de UI |
| Copy sin jerga (Capa 0) | Renderer (strings) | — | Todo user-facing vive en el renderer; contrato en 11-UI-SPEC.md |

## Standard Stack

Esta fase **no agrega dependencias**. Todo el stack ya está instalado y en uso.

### Core (ya presente, reutilizado)
| Módulo | Ubicación | Propósito en esta fase | Por qué se reutiliza |
|--------|-----------|------------------------|----------------------|
| `electron` `app.getPath` | `import { app } from 'electron'` | Resolver base de Documents | Mismo patrón ya usado (`app.getPath('userData')`, settings.ts:52, plugins.ts:17) |
| `electron` `dialog` | `src/main/services/vault.ts:1` | Picker nativo del escape "Elegir otra ubicación" | `vault.pickFolder(title)` ya lo envuelve (`vault.ts:46`) |
| `isomorphic-git` (`git`) | `src/main/services/git.ts` | `git.init` (via `ensureRepo`) + primer commit | Commit racy-safe ya implementado y probado |
| `node:fs/promises` | `mkdir`, `stat`, `readdir` | Crear carpeta, chequear colisión | Ya importado en vault.ts |
| `atomicWrite` | `src/main/fs/atomic.ts:16` | Sembrar `Bienvenida.md` sin corrupción | Acepta string, crea dirs recursivo, fsync+rename |
| React + Lucide + CSS plano | `src/renderer/src/` | Pantalla welcome, iconos, estados | Sin design system nuevo (11-UI-SPEC.md) |

### Iconos Lucide (nuevos usos, ya en `lucide-react`)
| Uso | Ícono | size |
|-----|-------|------|
| CTA crear cuaderno | `NotebookPen` | 16 |
| Estado creando (spinner) | `RefreshCw` + `.spin` | 16 |
| Abrir carpeta existente | `FolderOpen` | 14 |
| Elegir otra ubicación | `FolderCog` | 14 |

**Verificación:** confirmar que `NotebookPen` y `FolderCog` existen en la versión instalada de `lucide-react` (1.23.0) antes de importarlos — son los dos únicos íconos que quizá no se hayan usado antes en el repo. `RefreshCw` y `FolderOpen` ya se usan. `[ASSUMED]` — verificar con un `import` de prueba o revisando `node_modules/lucide-react/dist/lucide-react.d.ts`.

**Installation:** ninguna. `npm install` no cambia.

## Package Legitimacy Audit

**No aplica a esta fase.** No se instalan paquetes externos nuevos. Todas las capacidades se construyen sobre dependencias ya presentes en `package-lock.json` (electron, isomorphic-git, react, lucide-react). Sin superficie de slopsquatting.

## Architecture Patterns

### System Architecture Diagram (flujo de creación local)

```text
[Pantalla welcome: input "Mi primer cuaderno" + CTA]
        │  Enter / click "Crear mi primer cuaderno"
        ▼
 window.geode.vault.createLocal(name)          ── renderer (sandboxed)
        │  IPC invoke: canal 'geode:vault-create-local'
        ▼
 preload/index.ts (CommonJS bridge)            ── superficie tipada
        │
        ▼
 ipcMain.handle(IPC.vaultCreateLocal) ──────── main/index.ts (handler)
        │   1. baseDir = app.getPath('documents') + '/Geode'
        │   2. vault.createLocal(name, baseDir)
        ▼
 VaultService.createLocal(name, baseDir):
        │   a. safe = sanitizeVaultName(name)  // util nuevo
        │   b. dir = resolveCollision(baseDir/safe)  // sufijo (2),(3)…
        │   c. mkdir(dir, {recursive})
        │   d. atomicWrite(dir/'Bienvenida.md', SEED)
        │   e. this.setRoot(dir)  → VaultInfo
        ▼  (de vuelta en el handler)
        │   3. gitService.ensureRepo(dir)      // git init, rama main
        │   4. gitService.commit(dir, msg)     // primer commit RACY-SAFE (seed)
        │   5. rememberVault(dir)              // knownVaults + lastVault
        │   6. restartSnapshotTimer()          // rebind timer al nuevo vault
        │   return VaultInfo
        ▼
 renderer: adoptVault(info) → openNote('Bienvenida.md')  ── entra al cuaderno
```

**Nota de orden (load-bearing):** el commit del seed debe correr DESPUÉS de sembrar la nota y de `ensureRepo`. Si se hiciera `ensureRepo` sin nota, no habría cambios y `commit` devolvería `null` (no-op) — no habría primera versión. El orden seed → ensureRepo → commit garantiza que ONB-03 se cumpla.

### Reusable Assets (integración, verificados en el código)

| Asset | Ubicación | Uso en esta fase |
|-------|-----------|------------------|
| Bloque `if (!vault)` | `App.tsx:1079-1105` | Reemplazar por nueva welcome; ELIMINAR botón "Clonar o crear en GitHub" y el render de `<NewVaultDialog>` de esta pantalla |
| `adoptVault(info)` | `App.tsx:434-450` | Adopta el vault creado; resetea a panel VACÍO (no abre nota) |
| `openNote(path, opts)` | `App.tsx:347-350` | Abrir `Bienvenida.md` tras adoptar (encadenar) |
| `openVault()` | `App.tsx:452-455` | Link secundario "Abrir una carpeta existente" (sin cambios) |
| `vault.pickFolder(title)` | `vault.ts:46-53` | Escape "Elegir otra ubicación" (devuelve ruta o null) |
| `vault.setRoot(root)` | `vault.ts:23-29` | Fija el vault activo tras crear |
| `gitService.ensureRepo(dir)` | `git.ts:113-121` | `git init` idempotente (rama `main`) |
| `gitService.commit(dir, msg)` | `git.ts:133-153` | Primer commit racy-safe del seed |
| `atomicWrite(path, content)` | `atomic.ts:16` | Sembrar la nota sin corrupción |
| `rememberVault` / `restartSnapshotTimer` | `main/index.ts` | Mismo cierre que `vaultOpen`/`createWithRepo` |

### Pattern 1: IPC tipado end-to-end (4 puntos de edición)
**What:** Todo canal nuevo toca exactamente cuatro archivos, en orden.
**When to use:** Al añadir `geode:vault-create-local`.
**Example (patrón real del repo):**
```typescript
// 1) src/shared/ipc.ts — constante de canal (dentro del objeto IPC)
vaultCreateLocal: 'geode:vault-create-local',
// … y en interface VaultApi:
createLocal(name: string): Promise<VaultInfo>   // no devuelve null: siempre crea (fallback "Cuaderno")

// 2) src/main/index.ts — handler
ipcMain.handle(IPC.vaultCreateLocal, async (_e, name: string): Promise<VaultInfo> => {
  const baseDir = join(app.getPath('documents'), 'Geode')
  const info = await vault.createLocal(name, baseDir)
  await gitService.ensureRepo(info.root)
  await gitService.commit(info.root, 'Primera versión')   // mensaje: discreción, español, sin jerga
  await rememberVault(info.root)
  await restartSnapshotTimer()
  return info
})

// 3) src/preload/index.ts — superficie (DEBE seguir siendo CommonJS/.cjs)
createLocal: (name) => ipcRenderer.invoke(IPC.vaultCreateLocal, name),

// 4) renderer: window.geode.vault.createLocal(name)
```
**Source:** patrón verificado en `vaultCreateWithRepo` (ipc.ts:140, index.ts:437, preload:29).

### Pattern 2: Primer commit racy-git-safe (NO copiar createWithRepo)
**What:** `GitService.commit` detecta cambios hasheando contenido real (`git.hashBlob`) vs blobs de HEAD; inmune al "racy git" (ediciones mismo-tamaño mismo-segundo).
**When to use:** Siempre para el seed. **NO** replicar el flujo de `createWithRepo`, que hace `ensureRepo` + repo remoto pero **no** commitea.
**Example:**
```typescript
// git.ts:133 — commit() ya hace todo: pendingChanges → add/remove → git.commit
// Con Bienvenida.md sembrada y repo recién init (HEAD vacío), headBlobs() = {} ,
// workBlobs() = {Bienvenida.md}, así que hay 1 cambio → primer commit. Nunca null.
const oid = await gitService.commit(dir, 'Primera versión')
```
**Source:** `git.ts:133-153`, `headBlobs` `git.ts:910`, `workBlobs` `git.ts:935`.

### Pattern 3: Resolución de colisión por sufijo (patrón existente)
**What:** Loop `while (await exists) { name = base + ' ' + n++ }`.
**When to use:** Para la carpeta del cuaderno. CONTEXT.md pide sufijo con paréntesis ` (2)`, `(3)` (distinto del ` copia N` de notas, pero misma mecánica).
**Example (adaptar de `createNote` `vault.ts:119-132` y `duplicate` `vault.ts:186-216`):**
```typescript
let candidate = safe
let n = 2
while (existsSync(join(baseDir, candidate))) {  // o stat async
  candidate = `${safe} (${n++})`
}
```
**Source:** `vault.ts:125` (createNote), `vault.ts:202` (duplicate).

### Anti-Patterns to Avoid
- **Reutilizar `sanitizeTagName` para el nombre de carpeta:** es para refs de git (colapsa espacios a guiones, quita `~^:?*[`). Reglas de nombre de archivo Windows son distintas (permiten espacios, prohíben `< > : " / \ | ? *`, reservados). Usar un util NUEVO.
- **Copiar la estructura de `createWithRepo`:** no commitea el seed → ONB-03 fallaría. Añadir siempre el `commit` explícito.
- **Asumir que `adoptVault` abre la nota:** resetea a panel vacío (`App.tsx:436-444`). Hay que llamar `openNote('Bienvenida.md')` explícito.
- **Resolver `app.getPath('documents')` en el renderer:** imposible (sandbox). Resolver en el main.
- **Convertir preload a ESM:** prohibido (CLAUDE.md). Debe permanecer `.cjs`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detección de "hay algo que commitear" en el primer commit | Custom stat/index check | `gitService.commit` (devuelve null si limpio, oid si hay cambios) | Ya es racy-git-safe; un check propio reintroduce el bug del racy git (CLAUDE.md landmine) |
| Escritura del seed | `fs.writeFile` directo | `atomicWrite` (`atomic.ts:16`) | temp+fsync+rename; evita nota corrupta si el proceso muere a media escritura |
| `git init` | `git.init` a mano en el handler | `gitService.ensureRepo` (idempotente) | Ya fija `defaultBranch:'main'` y es no-op si el repo existe |
| Persistir el vault en la lista + timer | Lógica ad-hoc | `rememberVault` + `restartSnapshotTimer` | Mismo cierre que `vaultOpen`/`createWithRepo`; mantiene knownVaults y el timer coherentes |
| Picker de carpeta del escape | `dialog.showOpenDialog` crudo | `vault.pickFolder(title)` | Ya envuelve properties `openDirectory`/`createDirectory` y el caso cancelado (null) |

**Key insight:** casi todo lo "peligroso" de esta fase (racy git, corrupción de archivos, coherencia del timer/knownVaults) ya está resuelto en primitivas existentes. El trabajo nuevo real es: (1) un util de sanitización Windows, (2) el pegamento del handler, y (3) la UI. Construir de nuevo cualquier primitiva reintroduce bugs ya cerrados.

## Runtime State Inventory

> Esta fase es mayormente greenfield (crea rutas nuevas), pero toca la reescritura de strings de Capa 0 (COPY-01), que es un rename de superficie de texto. Inventario de estado runtime relevante:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — el nuevo cuaderno es carpeta+repo nuevos; no hay clave/colección que embeba el nombre viejo. El commit del seed crea historia nueva. | Ninguna |
| Live service config | None — no hay servicio externo en esta fase (GitHub es Fase 12). | Ninguna |
| OS-registered state | None — no se registran tareas/procesos de SO. La ruta `~/Documents/Geode/` se crea al vuelo. | Ninguna |
| Secrets/env vars | None — no se leen ni escriben secretos en esta fase. | Ninguna |
| Build artifacts | None nuevo — no cambia el empaquetado ni genera artefactos. | Ninguna |
| **Copy/strings (rename de superficie)** | Strings "bóveda/GitHub/repo/clonar/local-first" en la welcome (`App.tsx:1086,1089,1091`). El resto de "bóveda" en Capa 0 vive en tooltips/labels del árbol y selector. | Reescribir SOLO welcome + flujo nuevo (COPY-01 scope Fase 11). NewVaultDialog/Ajustes → Fase 12. Barrido guiado por grep, ver Open Questions. |

**Nota:** la única "migración" es de texto (copy), no de datos. Ningún cuaderno existente cambia; los cuadernos ya creados siguen siendo carpetas con nombre propio.

## Common Pitfalls

### Pitfall 1: El primer commit sale `null` (no hay primera versión)
**What goes wrong:** Si se llama `gitService.commit` antes de sembrar la nota (o si `ensureRepo` corre sobre una carpeta con `.git` preexistente y árbol limpio), `commit` devuelve `null` y no hay primera versión → "ver historial" (escenario del tour, Fase 13) queda vacío.
**Why it happens:** `commit` no-opea cuando `pendingChanges` está vacío (`git.ts:134-135`).
**How to avoid:** Orden estricto: `mkdir` → `atomicWrite(Bienvenida.md)` → `ensureRepo` → `commit`. Verificar que `commit` devuelve un oid no-null en el happy path.
**Warning signs:** Grafo de versiones vacío tras crear; `git.log` sin commits.

### Pitfall 2: `adoptVault` deja el editor vacío en vez de mostrar la nota
**What goes wrong:** La UI-SPEC exige que el cuaderno abra SIEMPRE con `Bienvenida.md`; `adoptVault` resetea a panel vacío.
**Why it happens:** `adoptVault` hace `setContent('')` y `makeLeaf()` sin path activo (`App.tsx:436-444`).
**How to avoid:** Tras `await adoptVault(info)` en el flujo de creación local, llamar `await openNote('Bienvenida.md')`. (El flujo "abrir carpeta existente" NO debe forzar esto — solo el de creación.)
**Warning signs:** Pantalla de editor en blanco tras crear el primer cuaderno.

### Pitfall 3: Nombre de carpeta inválido en Windows rompe el `mkdir`
**What goes wrong:** Nombres con `:` (p.ej. "Notas: 2026") o reservados (CON, PRN…) hacen fallar `mkdir` o crean rutas raras en Windows.
**Why it happens:** El picker nativo del SO garantizaba estos nombres antes; el input libre no.
**How to avoid:** `sanitizeVaultName` ANTES de armar la ruta: reemplazar `< > : " / \ | ? *`, recortar `.`/espacios finales, detectar reservados (case-insensitive, con y sin extensión), fallback "Cuaderno". Cubrir el caso "todo se limpió a vacío" → "Cuaderno".
**Warning signs:** `EINVAL`/`ENOENT` en `mkdir`; carpetas fantasma.

### Pitfall 4: Colisión pisa un cuaderno existente
**What goes wrong:** Crear dos veces "Mi primer cuaderno" reusa la misma carpeta y mezcla/pisa datos.
**Why it happens:** `mkdir({recursive:true})` no falla si la carpeta ya existe.
**How to avoid:** Resolver colisión ANTES del `mkdir` con el loop de sufijo ` (2)`, `(3)`… hasta encontrar una ruta libre. Nunca escribir sobre una carpeta no vacía.
**Warning signs:** Un cuaderno "nuevo" aparece con notas viejas.

### Pitfall 5: `app.getPath('documents')` en un entorno sin carpeta Documents
**What goes wrong:** En algunos entornos (CI, perfiles atípicos) `documents` puede resolver a una ruta inusual, pero rara vez falla.
**Why it happens:** Electron cae a un default del SO; en Windows casi siempre existe.
**How to avoid:** `mkdir(baseDir, {recursive:true})` crea `Geode/` bajo Documents si no existe. Envolver el handler en try/catch y devolver el error I/O en español (la UI-SPEC ya define el mensaje: "No se pudo crear el cuaderno. Revisá que tengas permiso de escritura…").
**Warning signs:** Rechazo del IPC con `EACCES`/`EPERM`.

## Code Examples

### Util de sanitización de nombre de carpeta Windows (NUEVO)
```typescript
// Source: reglas Windows (naming a file) + patrón del repo. Ubicar en el main
// (p.ej. src/main/fs/vaultName.ts o dentro de vault.ts). Nombre interno: discreción.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Limpia un nombre libre para que sea una carpeta válida en Windows. Nunca lanza. */
export function sanitizeVaultName(raw: string): string {
  let name = (raw ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ') // ilegales → espacio
  name = name.replace(/\s+/g, ' ').trim()                        // colapsa espacios
  name = name.replace(/[. ]+$/g, '').trim()                      // sin punto/espacio final
  const base = name.split('.')[0] || name
  if (name === '' || WINDOWS_RESERVED.test(base)) return 'Cuaderno'
  return name
}
```
Nota: `\x00-\x1f` cubre control chars; los reservados se chequean sobre el stem (antes del primer punto) porque Windows los prohíbe incluso con extensión (`CON.md`).

### Contenido canónico del seed (de 11-UI-SPEC.md — usar textual)
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

### Escape "Elegir otra ubicación" (crea en carpeta elegida)
```typescript
// El handler puede aceptar un baseDir opcional; si el renderer pasó una carpeta
// del picker, se usa como padre en vez de ~/Documents/Geode.
// Renderer:
const dir = await window.geode.vault.pickFolder?.(...) // o un canal que reuse pickFolder
// Decisión de forma: exponer createLocal(name, parentDir?) o un canal separado.
// Recomendación: createLocal(name) para el happy path + reusar el patrón de
// createWithRepo (pickFolder en el handler) para el escape. Ver Open Questions #2.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Crear vault SOLO vía GitHub (`createWithRepo`) o abrir carpeta | Camino LOCAL puro sin cuenta (`createLocal`) | Fase 11 (esta) | Primer path de entrada sin jerga ni red |
| Welcome con "vault/Git/clonar/local-first" | Copy sin jerga ("cuaderno", "sin miedo a perder nada") | Fase 11 (COPY-01) | Alinea con core value (git invisible) |
| Primera versión la deja el auto-snapshot | Seed commiteado explícito al crear | Fase 11 (ONB-03) | Historial no vacío desde el arranque (escenario del tour) |

**Deprecated/outdated:** ninguno. Los flujos GitHub (`createWithRepo`/`cloneFromGithub`) siguen vivos; solo se quitan de la PANTALLA de bienvenida (se reconstruyen en Fase 12).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `NotebookPen` y `FolderCog` existen en lucide-react 1.23.0 | Standard Stack | Bajo — sustituir por íconos equivalentes (`Notebook`, `FolderPen`, `Settings`) si falta; verificar con import de prueba |
| A2 | El sufijo de colisión usa formato ` (2)`, ` (3)` (con paréntesis) | Architecture Patterns | Bajo — CONTEXT.md lo especifica textual; confirmar espaciado exacto en plan |
| A3 | El escape "Elegir otra ubicación" crea bajo la carpeta elegida (como padre), no la usa como carpeta del cuaderno directamente | Code Examples / Open Q2 | Medio — cambia la firma de `createLocal`; resolver en planning (ver Open Questions #2) |
| A4 | El mensaje del primer commit es texto fijo en español (p.ej. "Primera versión"); NO invoca IA | Pattern 2 | Bajo — coherente con CLAUDE.md (auto-snapshots no invocan IA); la creación tampoco debe |
| A5 | Persistencia de onboarding (`geode:onboarding-get/-set`) NO entra en Fase 11 | Open Questions #1 | Medio — STATE.md la menciona en Fase 11, pero CONTEXT.md/UI-SPEC/requisitos (ONB-01..04, COPY-01) no; probablemente es de Fase 13 (tour). Confirmar con el usuario |

## Open Questions

1. **¿Entra la persistencia de onboarding (`geode:onboarding-get/-set`) en Fase 11?**
   - What we know: STATE.md (línea 64) la lista bajo Phase 11. Pero CONTEXT.md, 11-UI-SPEC.md y los requisitos de la fase (ONB-01..04, COPY-01) NO la mencionan; TOUR-02 (Fase 13) sí pide "persiste tour visto".
   - What's unclear: si el flag de onboarding se necesita ya en Fase 11 (p.ej. para no re-disparar algo) o si es puramente de Fase 13.
   - Recommendation: tratarla como **fuera de scope de Fase 11** salvo confirmación del usuario. La Fase 11 no auto-dispara ningún tour ni tiene estado "visto" que persistir. Flag para discuss/planner.

2. **Forma exacta del escape "Elegir otra ubicación": ¿`createLocal(name, parentDir?)` o canal/handler separado?**
   - What we know: el happy path es `createLocal(name)` → `~/Documents/Geode/<nombre>`. El escape abre `vault.pickFolder` y crea ahí.
   - What's unclear: si el picker devuelve la carpeta PADRE (bajo la cual se crea `<nombre>/`) o la carpeta DESTINO directa del cuaderno.
   - Recommendation: que el picker devuelva el **padre** y se reuse la misma sanitización+colisión bajo esa base (consistencia con el happy path). Exponer `createLocal(name)` + un segundo camino que resuelva `parentDir` en el handler vía `pickFolder` (patrón de `createWithRepo`). Decisión de forma para el planner; A3.

3. **Alcance exacto del barrido "bóveda → cuaderno" en Capa 0 (COPY-01) para Fase 11.**
   - What we know: Fase 11 toca SOLO welcome + flujo de creación local. NewVaultDialog y sección de respaldo en Ajustes → Fase 12.
   - What's unclear: qué otras superficies de Capa 0 (tooltips del árbol, selector de bóveda, mensajes de error tipo "No hay vault abierto") caen dentro del "reframe fundacional" de esta fase.
   - Recommendation: el planner debe ejecutar un grep de "bóveda"/"vault"/"boveda" en `src/renderer` y clasificar cada hit: welcome+creación = Fase 11; NewVaultDialog/Ajustes-respaldo = Fase 12; el resto (labels neutrales del árbol/selector) = decisión caso a caso, preferir tocar solo lo user-facing de Capa 0. Ver comando en Environment/Validation.

## Environment Availability

Esta fase **no depende de herramientas/servicios externos** (sin GitHub, sin red, sin CLIs). Todo corre dentro de Electron con librerías ya instaladas.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Electron `app.getPath('documents')` | ONB-02 (ruta base) | ✓ | Electron 43 | `mkdir recursive` crea `Geode/` si falta |
| isomorphic-git | ONB-03 (init+commit) | ✓ | 1.38.6 | — (core del producto) |
| lucide-react | UI iconos | ✓ | 1.23.0 | Sustituir íconos si `NotebookPen`/`FolderCog` faltan (A1) |
| Node fs/promises | creación de carpeta/nota | ✓ | bundled | — |

**Missing dependencies with no fallback:** ninguno.
**Missing dependencies with fallback:** ninguno crítico (solo A1, íconos, con sustitutos triviales).

## Validation Architecture

> `nyquist_validation: true` en config, PERO el repo tiene **cero tests automatizados** (STATE.md, blocker documentado) y `human_verify_mode: end-of-phase`. La validación efectiva es typecheck + build + UAT humano, consistente con v1.0/v1.1/v1.2.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Ninguno (sin jest/vitest; sin config de test) |
| Config file | none |
| Quick run command | `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json` (typecheck main+renderer) |
| Full suite command | `npm run build` (electron-vite build: main + preload + renderer) |

Nota: verificar los scripts reales en `package.json` (probable `npm run typecheck` / `npm run build`). El gate real de la fase es typecheck en verde + build en verde + UAT manual.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONB-01 | Welcome sin jerga, CTA único, link secundario | manual (UAT) | — (inspección visual + typecheck/build) | ❌ sin infra de test |
| ONB-02 | Crear en `~/Documents/Geode/<nombre>` 1-click | manual (UAT) | — (crear y verificar ruta en el SO) | ❌ |
| ONB-03 | Seed `Bienvenida.md` + commiteado como 1ª versión | manual (UAT) | — (abrir historial: 1 commit) | ❌ |
| ONB-04 | Sanitización + colisión sufijo | unit (candidato) | `sanitizeVaultName` es función pura → testeable en aislamiento SI se agrega framework | ❌ Wave 0 opcional |
| COPY-01 | Sin "bóveda/GitHub/repo" en welcome | manual + grep | `grep -riE "bóveda|github|repo|clonar|local-first" src/renderer/src/App.tsx` (bloque welcome) → 0 hits | n/a |

### Sampling Rate
- **Per task commit:** typecheck (`tsc --noEmit`) del lado tocado.
- **Per wave merge:** `npm run build` completo en verde.
- **Phase gate:** build en verde + UAT humano end-of-phase (crear cuaderno real, ver seed abierta, ver 1 commit, probar nombre con `:` y colisión).

### Wave 0 Gaps
- [ ] No hay framework de test — mantener el status quo (typecheck+build+UAT). **NO** introducir un framework de test como parte de esta fase salvo pedido explícito (cambio de alcance).
- [ ] `sanitizeVaultName` es la ÚNICA lógica pura fácilmente testeable; si en el futuro se agrega vitest, priorizar cubrir sus casos (ilegales, reservados, vacío, trailing dots). No bloqueante para Fase 11.

*Resumen: la infraestructura de validación existente (typecheck + build + UAT) cubre la fase; el gap de tests automatizados es un blocker de proyecto conocido, no específico de Fase 11.*

## Security Domain

> `security_enforcement: true`, ASVS nivel 1, block_on high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Sin cuentas/auth en esta fase (local-only; GitHub → Fase 12) |
| V3 Session Management | no | Sin sesiones |
| V4 Access Control | no | Sin control de acceso multiusuario (app de escritorio local) |
| V5 Input Validation | **yes** | Sanitización de nombre de carpeta (`sanitizeVaultName`) + `resolveInside` (ya bloquea path traversal, `vault.ts:68`) |
| V6 Cryptography | no | Sin cripto nueva (safeStorage no se toca en esta fase) |
| V12 Files & Resources | **yes** | Escritura atómica (`atomicWrite`), creación de carpeta bajo base controlada, sin escribir fuera de `~/Documents/Geode` |

### Known Threat Patterns for esta fase (Electron main + FS)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal vía nombre ("../../etc") | Tampering / Elevation | `sanitizeVaultName` elimina `/ \ :` y control chars ANTES de armar la ruta; la carpeta se ancla bajo `app.getPath('documents')/Geode`. Además `VaultService.resolveInside` sigue protegiendo lecturas/escrituras dentro del vault |
| Nombre reservado/ilegal Windows (CON, `:`) | DoS (crash de `mkdir`) | Detección de reservados + reemplazo de ilegales + fallback "Cuaderno" |
| Colisión que pisa datos existentes | Tampering (pérdida de datos) | Resolución por sufijo ANTES de `mkdir`; nunca escribir sobre carpeta no vacía (respeta core value "nada se pierde") |
| Inyección en el seed (contenido del nombre en la nota) | Injection | El nombre del cuaderno NO se interpola en `Bienvenida.md` (contenido es constante); si en el futuro se personalizara, escapar markdown |
| IPC arg no confiable (renderer manda `name`) | Tampering | El main valida/sanitiza `name`; nunca lo usa crudo para la ruta. Patrón ya establecido (main valida todos los args IPC, CLAUDE.md) |

**Nota de core value:** el control de colisión (sufijo, nunca pisar) no es solo seguridad — es la garantía de "nunca se pierde nada". Debe ser un criterio de aceptación duro, no un nice-to-have.

## Sources

### Primary (HIGH confidence — código verificado en esta sesión)
- `src/main/index.ts:327-454` — handlers `vaultOpen`, `vaultCloneFromGithub`, `vaultCreateWithRepo`, `snapshotIfChanged`, `restartSnapshotTimer`
- `src/main/services/vault.ts` — `VaultService` completo (`setRoot`, `pickFolder`, `createNote`, `resolveInside`, `duplicate`)
- `src/main/services/git.ts:79-153, 905-953` — `sanitizeTagName`, `ensureRepo`, `commit`, `headBlobs`, `workBlobs` (racy-safe)
- `src/main/fs/atomic.ts` — `atomicWrite`
- `src/shared/ipc.ts:9-165` — objeto `IPC`, `VaultApi`, `VaultInfo`
- `src/preload/index.ts:1-41` — puente CommonJS, superficie `vault`
- `src/renderer/src/App.tsx:434-507, 347-350, 1079-1105` — `adoptVault`, `openVault`, `openNote`, bloque welcome
- `.planning/phases/11-*/11-CONTEXT.md`, `11-UI-SPEC.md` — decisiones y contrato de UI (LOCKED)
- `CLAUDE.md` — restricciones (CommonJS preload, racy-git, Lucide, español, sin IA en auto-snapshots)

### Secondary (MEDIUM confidence)
- `app.getPath('documents')` — verificado por analogía con `app.getPath('userData')` (settings.ts:52, plugins.ts:17); la key `'documents'` es API estándar de Electron

### Tertiary (LOW confidence — a validar)
- Existencia de `NotebookPen`/`FolderCog` en lucide-react 1.23.0 (A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sin dependencias nuevas; todo verificado en el código
- Architecture: HIGH — patrón IPC y primitivas de git/fs verificados línea por línea
- Pitfalls: HIGH — derivados de comportamiento real observado (`commit` no-op en árbol limpio, `adoptVault` panel vacío)
- Security: HIGH — superficie acotada (FS + IPC), mitigaciones ya presentes (`resolveInside`) + util nuevo de sanitización

**Research date:** 2026-07-08
**Valid until:** 2026-08-07 (código interno estable; revalidar si cambian `git.ts`/`vault.ts`/`App.tsx` antes de planificar)
