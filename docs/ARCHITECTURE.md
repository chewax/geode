# Geode — Documento de Arquitectura y Plan

> App de notas tipo Obsidian con almacenamiento en un repositorio Git/GitHub.
> Propuesta de valor: **versionado total, diffs, rollbacks infinitos, nunca perder nada** — con una UX humana encima de Git.
> Local-first, sin backend en el MVP, extensible por plugins.

**Estado:** en desarrollo (Fase 0 completa; Fase 1 núcleo + versionado local implementados). **Nombre de código de la carpeta:** Amethist. **Nombre de producto:** Geode.

### Estado de implementación (actualizado)

- ✅ **Fase 0** — Andamiaje Electron + Vite + React + TS, IPC tipado, seguridad (contextIsolation/sandbox), dominio puro.
- ✅ **Editor** — CodeMirror 6 con markdown, resaltado y line-wrapping.
- ✅ **Fase 1 · persistencia** — Abrir/recordar vault, árbol de notas, escritura atómica (temp+fsync+rename), autosave con debounce, guardarraíl anti path-traversal.
- ✅ **Fase 1 · versionado local** — GitService (isomorphic-git): detección de cambios **inmune al racy git** (por hash de contenido). **Árbol de versiones de todo el vault** (lanes por topología del DAG) con checkout (ir a una versión mueve HEAD).
- 🌱 **Modelo prod/rama (nuevo)** — `main` = prod intocable; editar arranca una rama de trabajo (`trabajo-N`); **Merge a prod** integra con merge commit y cierra la rama. Reemplaza "branch por dispositivo". Multi-dispositivo real (3-way al mergear, push de `main`) queda para Fase 2.
- 🔤 **Commits = acto manual (nuevo modelo)** — Se quitó el auto-commit. Guardar versión (Ctrl+S) es el único commit; entre medio, journal + autosave (Capa 1) con undo/redo.
- 🤖 **Mensajes de commit por IA** — OpenRouter (key cifrada + modelo elegible), mensaje editable a partir del diff, fallback a timestamp.
- ⏳ **Pendiente en Fase 1** — Journal persistente entre reinicios (Capa 1 fina), diff visual entre versiones, búsqueda (SQLite/FTS5) y `[[backlinks]]`, arquitectura de plugins interna.
- ⏭️ **Fase 2** — GitHub, auth, branch por dispositivo, `main` canónica, UI de conflictos 3-way.

---

## 1. Principios de diseño

Estas son las reglas que deciden los empates cuando dudemos:

1. **Nunca perder datos.** Ante cualquier duda entre "más simple" y "más seguro para los datos del usuario", gana seguro. Escrituras atómicas, journal local, Git como respaldo auditable.
2. **Git es un detalle de implementación, no la UX.** El usuario nunca ve `<<<<<<< HEAD`. Ve "historial de esta nota", "restaurar", "resolver conflicto".
3. **Local-first.** Todo funciona offline. La red es una optimización (sync), nunca un requisito para editar o guardar.
4. **Núcleo delgado, features como plugins.** Aunque al principio el único autor de plugins sea el dueño del proyecto, el core se construye contra una API de plugins. Es lo que hace la app vendible y extensible.
5. **Interfaces antes que implementaciones.** Storage, sync y auth viven detrás de interfaces para poder cambiar la estrategia (ej. CRDTs en el futuro) sin reescribir la app.

---

## 2. Stack técnico

| Capa | Elección | Notas |
|---|---|---|
| Shell de escritorio | **Electron** | Decidido. Empaquetado con electron-builder. Auto-update vía electron-updater. |
| Lenguaje | **TypeScript** en todo | Renderer, main process y lógica de dominio. |
| UI | **React + react-dom** (NO React Native) | Bundler: Vite. |
| Editor | **CodeMirror 6** | Mismo motor que Obsidian. Markdown, extensible, buen soporte de decoraciones. |
| Git | **isomorphic-git** | Git puro en JS: no depende del binario de git del sistema → app autocontenida y portable. `simple-git` (wrapper del binario) queda como plan B si necesitamos features avanzadas. |
| Índice / búsqueda / grafo | **SQLite** (better-sqlite3) | Backlinks, búsqueda full-text (FTS5), metadata. Es un índice derivado y reconstruible, no la fuente de verdad. |
| Auth GitHub | **OAuth Device Flow** (+ PAT como fallback) | Device flow evita esconder un client secret en el binario. |
| Estado UI | Zustand o Redux Toolkit | A decidir en fase de UI; Zustand por simplicidad. |

### Proceso Electron: separación de responsabilidades

- **Main process:** filesystem, Git (isomorphic-git), SQLite, auth/keychain, ciclo de vida de ventanas. Todo lo que toca disco o red.
- **Renderer:** React + CodeMirror. **Sin acceso directo a Node** (`contextIsolation: true`, `nodeIntegration: false`).
- **Puente:** `contextBridge` expone una API tipada y acotada (`window.geode`) vía IPC. Nada de `require` en el renderer.

> Regla de seguridad: el renderer nunca toca disco ni red directamente. Todo pasa por IPC hacia el main. Esto también nos deja mockear el backend en tests.

---

## 3. Modelo de almacenamiento y versionado (la pieza central)

El requisito "nunca perder nada" y el requisito "diffs y rollbacks con sentido" están en tensión: uno quiere granularidad altísima, el otro quiere commits gruesos. Se resuelve con **dos capas separadas**.

### Capa 1 — Journal local (durabilidad)

- **Objetivo:** que un crash, un corte de luz o un cierre abrupto **nunca** pierdan texto, sin ensuciar el historial de Git.
- **Escritura atómica de la nota:** siempre write-to-temp + `fsync` + `rename` sobre el archivo `.md`. Nunca se escribe in-place.
- **Autosave frecuente:** debounce corto (p. ej. 500 ms sin tipear) → persiste el archivo en disco.
- **Snapshots de sesión:** además del archivo, un log append-only (o tabla SQLite) guarda snapshots/deltas periódicos con timestamp. Permite recuperar "lo que había hace 2 minutos" aunque todavía no se haya hecho commit.
- El journal es **local y efímero**: se puede podar (p. ej. conservar 48 h) una vez que el contenido quedó consolidado en un commit Git.

### Capa 2 — Commits Git (versionado semántico)

- **Objetivo:** historial navegable, diffs con sentido, rollbacks, atribución, sync.
- **Un commit = un acto explícito del usuario (DECIDIDO).** El único disparador es **"Guardar versión"** (botón o Ctrl+S). No hay auto-commit por inactividad: mientras editás, todo vive en la Capa 1 (journal + autosave). Commitear crea un **ledger permanente**, y la UI lo avisa antes de confirmar.
- **Mensaje de commit por IA (ver §5.1).** Al guardar, se genera un mensaje que resume el diff (vía OpenRouter, modelo elegible). El usuario puede **editarlo** antes de confirmar. Si la IA no está configurada o falla, cae a un mensaje con timestamp.
- Al commitear, el estado guardado pasa a ser la nueva base; el journal de sesión deja de ser necesario para esos cambios.

> **Resumen mental:** el journal garantiza *nunca perder nada* (y da undo/redo); Git guarda *hitos permanentes con sentido* que vos marcás. Son dos cosas distintas y por eso viven en capas distintas.

### Árbol de versiones y rollback (feature estrella)

Git da rollback infinito gratis; el valor es la UX. **Modelo (decidido con el usuario): un árbol de commits de TODO el vault, estilo git — no restaurar-como-commit-nuevo.**

- **Árbol del vault:** grafo de commits de todas las ramas (columnas/lanes + aristas a los padres). La línea de HEAD se ve plena; el resto, atenuado.
- **"Ir a una versión" = checkout** (mueve HEAD), no genera un commit nuevo. Si el oid es el tip de una rama, HEAD se adjunta a esa rama (editar la continúa); si es un commit interior, HEAD queda *detached*.
- **Editar arranca una rama de trabajo** (ver §4): sobre prod o sobre una versión vieja, el próximo commit va a una rama `trabajo-N`, sin pisar lo escrito. Prod (`main`) queda intacto; se integra por merge.
- **Diff visual** entre versiones — pendiente.
- Descartado el enfoque previo (restaurar = commit nuevo): ensuciaba el historial y hacía perder la referencia antes/después.

### Mensajes de commit por IA

Para tener de un vistazo qué cambió en cada versión, el mensaje de commit lo genera IA a partir del diff de lo que se va a versionar.

- **Motor: OpenRouter.** El usuario ingresa su API key (guardada **cifrada** con `safeStorage` de Electron, en `userData`, fuera del repo) y **elige el modelo** de la lista de OpenRouter. La abstracción `AiMessageProvider` permite sumar otros motores (local/Ollama, Anthropic directo) sin tocar el resto.
- **Cuándo:** solo al "Guardar versión" (único momento con commit). El diff se arma con jsdiff (unified, truncado para acotar tokens); las notas `.md` van con su diff, los binarios solo como "agregado/modificado/borrado".
- **Editable + fallback:** la IA propone, el usuario aprueba/edita antes de confirmar. Si la IA está deshabilitada o falla, el mensaje cae a timestamp.
- **Privacidad:** al usar la nube, el diff viaja a OpenRouter. Es una elección explícita del usuario (alternativa local queda para más adelante por la misma interfaz).

---

## 4. Modelo de versionado y sync: `main` = prod, cambios por rama + merge

**DECISIÓN (reemplaza el modelo anterior de "branch por dispositivo").** `main` es **producción** y es intocable: nunca se commitea directo. Todo cambio ocurre en una **rama de trabajo** y llega a prod por **merge**. Esto elimina la necesidad de una branch permanente por dispositivo: multi-dispositivo sale gratis porque todos comparten `main` como prod y cada uno trabaja en ramas que publica con merge.

### Reglas

- **`main` (prod) solo avanza por merge.** Nunca hay commits directos a main (excepción: repo vacío, el primer commit hace *bootstrap* de prod).
- **Editar arranca una rama de trabajo.** Estando en prod (o en una versión vieja / detached), la primera edición crea `trabajo-N` en HEAD y adjunta HEAD sin tocar el working dir (o se crea a mano con "Empezar cambios"). Los "Guardar versión" van a esa rama.
- **Merge a prod.** Integra la rama de trabajo en `main` con un **merge commit (no fast-forward)** para conservar la topología rama+merge en el árbol, vuelve a prod y **cierra (borra) la rama**. Modelo tipo PR: cada tanda de cambios = una rama que se publica y se cierra.
- **Conflictos solo al mergear a prod.** Single-device: prod no diverge mientras trabajás, así que el merge es trivial (el árbol de la rama es el resultado). Multi-dispositivo: si prod avanzó, el merge es 3-way → **UI de resolución por nota** (Fase 2), sin cambiar esta interfaz.

### Multi-dispositivo (Fase 2, sobre este modelo)

1. Todos comparten `main` (prod) en el repo remoto.
2. Cada dispositivo trabaja en ramas `trabajo-*` locales y las pushea.
3. Publicar = merge de la rama a `main` (con resolución 3-way si prod avanzó) y push de `main`.
4. Onboarding de dispositivo nuevo = `clone` de `main`. No hay branches permanentes por dispositivo.

**Estado actual (implementado):** el respaldo sincroniza la **rama actual** con `GitService.sync`: fetch de esa rama → integración (nada / fast-forward / merge 3-way por líneas con `diff3`) → push. Lo pendiente se commitea antes de tocar el working dir. Un conflicto en la misma línea se resuelve a favor de lo local y la versión completa de la nube queda al lado como `<nota> (versión de la nube).md` (sin UI de resolución todavía). Si isomorphic-git no puede mergear (criss-cross, borrada/editada), se hace un merge conservador con el árbol local y ambos padres, así el push nunca queda rechazado y todo sigue en el historial.

### Árbol del vault (visualización)

El grafo asigna columnas por **topología del DAG** (no por rama), así ramas y merges se ven aunque la rama de trabajo ya se haya cerrado tras el merge (sus commits siguen alcanzables desde `main` vía el merge commit).

---

## 5. Modelo de datos (el "vault")

- Un **vault** = un repositorio Git = una carpeta local. Puede haber varios vaults.
- **Notas:** archivos `.md` en cualquier estructura de carpetas. El markdown en disco es la **fuente de verdad**.
- **Links internos** estilo `[[Nota]]` → resueltos y guardados como grafo en SQLite (índice derivado).
- **Attachments / imágenes — DECIDIDO: dentro del repo**, en `attachments/`, con dos salvaguardas desde el día 1:
  - **Aviso/límite de tamaño al pegar** (warning a partir de ~5–10 MB por archivo) para que nadie infle el historial con un video de 200 MB (recordar: cada versión de un binario se guarda entera y para siempre).
  - **Capa de indirección `AttachmentStore`**: el código nunca asume "el binario está en Git". Esto permite mover binarios grandes a Git-LFS o a un store externo más adelante **sin tocar el resto de la app**. No usamos LFS ahora: ata al usuario a la cuota de LFS de GitHub (paga y chica) y rompe el "clone y tenés todo". Para notas personales, el repo plano aguanta años.
- **Metadata de la app** (config del vault, nombre de dispositivo, prefs) en una carpeta `.geode/` versionada o parcialmente ignorada (secrets nunca se commitean).
- **Índice SQLite** (`.geode/index.db`): **ignorado por Git**, reconstruible desde los `.md` en cualquier momento.

---

## 6. Estructura de módulos (arquitectura por capas)

```
Renderer (React)                Main (Node)
┌───────────────────────┐       ┌──────────────────────────────┐
│ UI / CodeMirror        │  IPC  │ VaultService                 │
│ Plugin host (UI side)  │◄─────►│ StorageService (atomic FS)   │
│ State store            │       │ GitService (isomorphic-git)  │
└───────────────────────┘       │ SyncService (branch/device)  │
                                 │ IndexService (SQLite/FTS5)   │
                                 │ AuthService (GitHub OAuth)   │
                                 │ PluginHost (backend side)    │
                                 └──────────────────────────────┘
```

Dominio puro (TypeScript sin dependencias de Electron/React) en un paquete aparte, para poder testearlo y — si algún día hay móvil — reutilizarlo.

### Interfaces clave (contratos, sujetos a refinamiento)

```ts
// Almacenamiento: escrituras atómicas, nunca corromper una nota.
interface StorageService {
  read(path: string): Promise<string>;
  writeAtomic(path: string, content: string): Promise<void>; // temp + fsync + rename
  list(dir: string): Promise<FileEntry[]>;
  delete(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
}

// Versionado. Envuelve Git pero habla el idioma de la app.
interface GitService {
  commit(paths: string[], message: string, device: DeviceIdentity): Promise<CommitId>;
  historyOf(path: string): Promise<Version[]>;          // git log --follow
  diff(a: CommitId, b: CommitId, path?: string): Promise<Diff>;
  restore(path: string, version: CommitId): Promise<CommitId>; // commit nuevo, no reescribe
}

// Sync branch-por-dispositivo. Interfaz agnóstica de la estrategia
// para poder pasar a CRDTs sin tocar el resto de la app.
interface SyncService {
  deviceBranch(): string;                    // device/<slug>
  push(): Promise<void>;                     // siempre fast-forward
  fetchAll(): Promise<void>;
  integrate(): Promise<IntegrationResult>;   // merge de otras device/* → conflictos si los hay
  resolve(conflict: Conflict, choice: Resolution): Promise<void>;
}

// Índice derivado y reconstruible.
interface IndexService {
  reindex(): Promise<void>;
  search(query: string): Promise<SearchHit[]>;
  backlinks(note: string): Promise<string[]>;
}

interface AuthService {
  loginDeviceFlow(): Promise<Session>;       // GitHub OAuth device flow
  currentSession(): Promise<Session | null>;
  logout(): Promise<void>;
}

interface DeviceIdentity {
  slug: string;        // dani-laptop
  gitName: string;
  gitEmail: string;
}

// Attachments detrás de una interfaz: hoy escriben al repo (attachments/),
// mañana pueden ir a Git-LFS o a un store externo sin tocar el resto de la app.
interface AttachmentStore {
  put(bytes: Uint8Array, hint: { name: string; mime: string }): Promise<AttachmentRef>;
  get(ref: AttachmentRef): Promise<Uint8Array>;
  resolveUrl(ref: AttachmentRef): string;   // para <img src> en el editor
  // El caller valida tamaño y avisa antes de put(); el límite es política de UI.
}
```

---

## 7. Arquitectura de plugins (la ventaja vendible)

Lo que hizo grande a Obsidian no fue el editor: fue el ecosistema. Aunque al principio los plugins los escribamos nosotros, **construir el core contra una API de plugins mantiene el core limpio y es lo que hace el producto extensible/vendible.**

- **Prueba de fuego:** features propias (visor de historial, panel de sync) se construyen **como plugins internos** usando la misma API pública. Si la API alcanza para eso, alcanza para terceros.
- **Superficie de la API (v1):**
  - Registrar **comandos** (paleta de comandos) y atajos.
  - Registrar **vistas/paneles** en la UI.
  - **Hooks de ciclo de vida** de notas: `onNoteOpen`, `onBeforeCommit`, `onAfterSync`, etc.
  - Acceso de lectura al vault y al grafo (no FS crudo).
  - Event bus tipado.
- **Aislamiento:** plugins de terceros corren con permisos acotados (nada de FS/red arbitrarios sin declararlo). Definir modelo de permisos antes de abrir a terceros.
- **Distribución:** diferida. Primero API estable + plugins internos.

---

## 8. Autenticación

- **GitHub OAuth Device Flow** como camino principal: el usuario ve un código, lo pega en github.com, la app recibe el token. No requiere client secret embebido.
- **PAT (Personal Access Token)** como fallback para power users / self-host.
- **Almacenamiento del token:** en el keychain del SO (`keytar` o equivalente), **nunca** en un archivo del vault ni en algo que se commitee.
- Scopes mínimos: acceso al repo del vault.

---

## 9. Seguridad y durabilidad (checklist permanente)

- `contextIsolation: true`, `nodeIntegration: false`, sandbox del renderer.
- Escrituras atómicas en toda ruta que persista datos del usuario.
- Secrets solo en keychain; `.geode/` con `.gitignore` para lo sensible.
- Índice SQLite ignorado por Git y reconstruible.
- **Cifrado del vault — NO-GOAL (decisión explícita).** Elegimos **repo privado sobre cifrado** para preservar diffs/merge. El cifrado por archivo convierte cada `.md` en un blob aleatorio para Git: se pierden diffs, merge por línea, "ver la nota como estaba" y el modelo branch-por-dispositivo (dos ediciones cifradas concurrentes = conflicto binario irresoluble). Es decir, mataría la propuesta de valor central. Si algún día el mercado exige E2E, será una **línea de producto separada** ("vault cifrado" que acepta explícitamente sacrificar diffs a cambio de privacidad, técnicamente vía CRDT cifrado), **no** un toggle sobre el modelo normal.
- (Futuro) **Backup independiente de GitHub:** permitir múltiples remotos o export, para no atar "nunca perder nada" a un solo proveedor.

---

## 10. Roadmap por fases

### Fase 0 — Andamiaje
Electron + Vite + React + TypeScript arrancando. IPC tipado (`window.geode`). electron-builder. Estructura de paquetes (dominio puro separado).

### Fase 1 — MVP local, un dispositivo
- Abrir/crear vault (carpeta local), árbol de archivos.
- Editor CodeMirror 6 con markdown.
- **Capa 1:** autosave + escritura atómica + journal local.
- **Capa 2:** commits Git agrupados (isomorphic-git), mensajes autogenerados, botón "Guardar versión".
- **Visor de historial por nota:** timeline + diff + restaurar.
- Búsqueda básica (SQLite/FTS5) y `[[backlinks]]`.
- **Arquitectura de plugins interna ya montada** (aunque sin plugins de terceros).

### Fase 2 — GitHub + multi-dispositivo
- Auth OAuth device flow, keychain.
- Nombre de dispositivo en primer arranque; identidad Git por dispositivo.
- Branch por dispositivo, push fast-forward, `fetchAll` + `integrate`.
- **Branch `main` canónica:** onboarding de dispositivo nuevo por `clone` de `main`; fast-forward de `main` tras integrar.
- **UI de resolución de conflictos 3-way por nota.**
- `AttachmentStore` sobre el repo + límite de tamaño; casos borde de merge (delete/modify, binarios).

### Fase 3 — Producto extensible
- API de plugins pública + modelo de permisos.
- Features propias reescritas como plugins internos.
- Onboarding pulido, settings, temas.

### Más allá (diferido, la interfaz ya lo permite)
- Merge automático en background sobre `main`.
- CRDTs (Yjs) para merge sin conflicto a nivel de texto.
- Git-LFS o store externo de attachments (vía `AttachmentStore`, si algún usuario choca con el límite).
- Backend opcional: suscripciones, marketplace de plugins, sync gestionado.
- App móvil (reutilizando el dominio puro en TS).
- (Solo si el mercado lo exige) Línea de producto "vault cifrado" E2E — separada, con el trade-off de perder diffs/merge fino.

---

## 11. Decisiones abiertas (resolver antes o durante la fase que las toca)

1. ~~**Attachments:** ¿dentro del repo, Git-LFS, o fuera?~~ **CERRADO:** dentro del repo (`attachments/`) + `AttachmentStore` + límite de tamaño. LFS/externo diferido. (ver §5)
2. **Granularidad exacta de commits:** afinar los disparadores (tiempos de inactividad) con uso real. — *abierto, se afina en Fase 1.*
3. ~~**`main` canónica:** ¿Fase 2 o esperamos?~~ **CERRADO:** se introduce en Fase 2. (ver §4/§10)
4. **Store de estado UI:** Zustand vs Redux Toolkit — decidir en la fase de UI. — *abierto.*
5. **Modelo de permisos de plugins:** definir antes de abrir a terceros. — *abierto, se define en Fase 3.*
6. ~~**Cifrado del vault:** ¿opt-in? ¿compatible con diffs?~~ **CERRADO: NO-GOAL.** Repo privado sobre cifrado, para preservar diffs/merge. (ver §9)

---

## 12. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Merge de texto conflictivo = mala UX | UI 3-way por nota desde Fase 2; a futuro CRDTs. |
| Historial de Git explota con commits basura | Modelo de dos capas: journal ≠ commits; commits agrupados. |
| Repo engorda por binarios | Política de attachments + Git-LFS opcional. |
| Cifrado incompatible con diffs | Tratarlo como feature avanzada aislada; no bloquea el MVP. |
| Corrupción de datos en crash | Escrituras atómicas + journal; Git como respaldo auditable. |
| No saber de qué dispositivo es un cambio | Atribución por nombre de branch (`device/<slug>`); no se requiere conservar origen post-merge. |
