/**
 * Contrato IPC tipado entre el proceso main (Node) y el renderer (React).
 *
 * Regla de arquitectura (ver ARCHITECTURE.md §2): el renderer NUNCA toca disco
 * ni red directamente. Todo pasa por estos canales hacia el main. Este archivo
 * es la única fuente de verdad de esa frontera y lo comparten ambos lados.
 */

import type { SearchMatch } from './search'
import type { ShortcutId, ShortcutMap } from './shortcuts'

export type { SearchMatch } from './search'

/** Nombres de canal. Prefijo `geode:` para evitar colisiones. */
export const IPC = {
  ping: 'geode:ping',
  appInfo: 'geode:app-info',
  windowMinimize: 'geode:window-minimize',
  windowMaximizeToggle: 'geode:window-maximize-toggle',
  windowClose: 'geode:window-close',
  windowIsMaximized: 'geode:window-is-maximized',
  windowMaximizeChanged: 'geode:window-maximize-changed',
  vaultOpen: 'geode:vault-open',
  vaultCurrent: 'geode:vault-current',
  vaultList: 'geode:vault-list',
  vaultSwitch: 'geode:vault-switch',
  vaultCloneFromGithub: 'geode:vault-clone-from-github',
  vaultCreateWithRepo: 'geode:vault-create-with-repo',
  vaultCreateLocal: 'geode:vault-create-local',
  vaultTree: 'geode:vault-tree',
  vaultReadNote: 'geode:vault-read-note',
  vaultWriteNote: 'geode:vault-write-note',
  vaultCreateNote: 'geode:vault-create-note',
  vaultCreateFolder: 'geode:vault-create-folder',
  vaultRename: 'geode:vault-rename',
  vaultDelete: 'geode:vault-delete',
  vaultReveal: 'geode:vault-reveal',
  vaultDuplicate: 'geode:vault-duplicate',
  vaultRemove: 'geode:vault-remove',
  vaultCreateNoteAt: 'geode:vault-create-note-at',
  vaultSearch: 'geode:vault-search',
  vaultBacklinks: 'geode:vault-backlinks',
  vaultUpdateLinks: 'geode:vault-update-links',
  vaultSaveAttachment: 'geode:vault-save-attachment',
  vaultTags: 'geode:vault-tags',
  vaultObsidianConfig: 'geode:vault-obsidian-config',
  vaultOpenExternal: 'geode:vault-open-external',
  gitCommit: 'geode:git-commit',
  gitGraph: 'geode:git-graph',
  gitCheckout: 'geode:git-checkout',
  gitChanges: 'geode:git-changes',
  gitPush: 'geode:git-push',
  gitPendingPush: 'geode:git-pending-push',
  gitPulled: 'geode:git-pulled',
  gitPendingLineStat: 'geode:git-pending-linestat',
  gitCreateBranch: 'geode:git-create-branch',
  gitMergeBranch: 'geode:git-merge-branch',
  gitCommitDiff: 'geode:git-commit-diff',
  gitAddTag: 'geode:git-add-tag',
  gitRemoveTag: 'geode:git-remove-tag',
  gitDeleteBranch: 'geode:git-delete-branch',
  gitNoteHistory: 'geode:git-note-history',
  gitReadNoteAt: 'geode:git-read-note-at',
  gitTreeAt: 'geode:git-tree-at',
  gitRestoreTree: 'geode:git-restore-tree',
  gitChangedFiles: 'geode:git-changed-files',
  githubGetConfig: 'geode:github-get-config',
  githubStartDeviceFlow: 'geode:github-start-device-flow',
  githubCompleteDeviceFlow: 'geode:github-complete-device-flow',
  githubSetRemote: 'geode:github-set-remote',
  githubSetAutoPush: 'geode:github-set-auto-push',
  githubDisconnect: 'geode:github-disconnect',
  githubListRepos: 'geode:github-list-repos',
  aiGetConfig: 'geode:ai-get-config',
  aiSetKey: 'geode:ai-set-key',
  aiClearKey: 'geode:ai-clear-key',
  aiSetModel: 'geode:ai-set-model',
  aiSetEnabled: 'geode:ai-set-enabled',
  aiListModels: 'geode:ai-list-models',
  aiSuggestMessage: 'geode:ai-suggest-message',
  aiSuggestVersion: 'geode:ai-suggest-version',
  aiGenerateText: 'geode:ai-generate-text',
  aiUsage: 'geode:ai-usage',
  aiSetDictationModel: 'geode:ai-set-dictation-model',
  aiTranscribe: 'geode:ai-transcribe',
  aiSetEngine: 'geode:ai-set-engine',
  aiDetectClis: 'geode:ai-detect-clis',
  aiTestEngine: 'geode:ai-test-engine',
  dictationCommand: 'geode:dictation-command',
  dictationStatus: 'geode:dictation-status',
  dictationGetShortcut: 'geode:dictation-get-shortcut',
  shortcutsGet: 'geode:shortcuts-get',
  shortcutsSet: 'geode:shortcuts-set',
  shortcutsChanged: 'geode:shortcuts-changed',
  snapshotsGet: 'geode:snapshots-get',
  snapshotsSet: 'geode:snapshots-set',
  snapshotsSetAiTitles: 'geode:snapshots-set-ai-titles',
  advancedGet: 'geode:advanced-get',
  advancedSet: 'geode:advanced-set',
  pluginsList: 'geode:plugins-list',
  pluginsGetEnabled: 'geode:plugins-get-enabled',
  pluginsOpenDir: 'geode:plugins-open-dir',
  pluginsSetEnabled: 'geode:plugins-set-enabled',
  pluginsReadSource: 'geode:plugins-read-source',
  vaultEnableBackup: 'geode:vault-enable-backup',
  backupOnboardingGet: 'geode:backup-onboarding-get',
  backupOnboardingSet: 'geode:backup-onboarding-set',
  backupOpenSignup: 'geode:backup-open-signup',
  tourGet: 'geode:tour-get',
  tourSet: 'geode:tour-set'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// ── App info (diagnóstico / "Acerca de") ───────────────────────────────────

export interface AppInfo {
  appVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  /** process.platform, como string para no filtrar tipos de Node al renderer. */
  platform: string
}

// ── Ventana (title bar custom, ventana frameless) ───────────────────────────

export interface WindowApi {
  minimize(): void
  toggleMaximize(): void
  close(): void
  isMaximized(): Promise<boolean>
  /** Suscribe cambios de maximizado. Devuelve una función para desuscribir. */
  onMaximizeChange(cb: (maximized: boolean) => void): () => void
}

// ── Vault ──────────────────────────────────────────────────────────────────

export interface VaultInfo {
  /** Ruta absoluta de la carpeta raíz del vault. */
  root: string
  /** Nombre visible (basename de la carpeta). */
  name: string
  /**
   * Sólo al abrir una carpeta existente por primera vez: se guardó una primera
   * versión de todo su contenido. `fromObsidian` si era una bóveda de Obsidian.
   */
  imported?: { fromObsidian: boolean; notes: number }
}

/** Configuración de Obsidian que Geode respeta (de `.obsidian/app.json`). */
export interface ObsidianConfig {
  isObsidian: boolean
  /** `attachmentFolderPath` de Obsidian; null = no configurado (Geode usa `adjuntos/`). */
  attachmentFolder: string | null
  /** Insertar imágenes como `![[archivo]]` (Obsidian por defecto) en vez de `![](ruta)`. */
  useWikilinks: boolean
}

/** Nodo del árbol de notas. Las rutas son relativas al root, con '/'. */
export interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
}

/** Resultado de búsqueda de texto completo: una nota con sus coincidencias. */
export interface SearchResult {
  path: string
  /** true si la consulta aparece en el nombre de la nota. */
  nameMatch: boolean
  matches: SearchMatch[]
}

/** Una nota que enlaza a la nota consultada, con la línea donde lo hace. */
export interface Backlink {
  path: string
  /** Línea (0-based) del enlace. */
  line: number
  /** Texto de esa línea (recortado), para dar contexto. */
  context: string
}

export interface VaultApi {
  /** Abre un diálogo de carpeta. Devuelve null si el usuario cancela. */
  open(): Promise<VaultInfo | null>
  /** Vault activo (restaurado del último uso), o null. */
  current(): Promise<VaultInfo | null>
  /** Bóvedas conocidas (abiertas alguna vez y que aún existen), más reciente primero. */
  list(): Promise<VaultInfo[]>
  /** Cambia a una bóveda ya conocida por su ruta. null si ya no existe. */
  switch(root: string): Promise<VaultInfo | null>
  /**
   * Clona un repo de GitHub en una carpeta local (elegida por diálogo) y la abre
   * como bóveda. null si el usuario cancela el diálogo de carpeta.
   */
  cloneFromGithub(cloneUrl: string): Promise<VaultInfo | null>
  /**
   * Crea una bóveda nueva en una carpeta local (elegida por diálogo), crea un repo
   * en GitHub y lo enlaza como remoto. null si el usuario cancela.
   */
  createWithRepo(name: string, isPrivate: boolean): Promise<VaultInfo | null>
  /**
   * Crea un cuaderno LOCAL nuevo (sin GitHub, sin cuenta): arma la ruta, sanitiza
   * el nombre, resuelve colisión, siembra `Bienvenida.md` y la commitea como
   * primera versión, y fija el cuaderno como activo.
   *
   * Por defecto crea bajo `~/Documents/Geode/<nombre>` y NUNCA devuelve null: un
   * nombre vacío o ilegal cae al fallback "Cuaderno". Sólo devuelve null cuando
   * `useCustomLocation` es true y el usuario cancela el picker de "Elegir otra
   * ubicación".
   */
  createLocal(name: string, useCustomLocation?: boolean): Promise<VaultInfo | null>
  /** Árbol de carpetas y notas .md del vault activo. */
  tree(): Promise<TreeNode[]>
  /** Lee una nota por su ruta relativa. */
  readNote(path: string): Promise<string>
  /** Escribe una nota (atómico: temp + fsync + rename). */
  writeNote(path: string, content: string): Promise<void>
  /** Crea una nota nueva en `dir` (relativo; '' = raíz) y devuelve su nodo. */
  createNote(dir: string): Promise<TreeNode>
  /** Crea una carpeta nueva en `dir` (relativo; '' = raíz) y devuelve su nodo. */
  createFolder(dir: string): Promise<TreeNode>
  /** Renombra/mueve una nota o carpeta a una nueva ruta relativa. */
  rename(from: string, to: string): Promise<void>
  /** Borra una nota o carpeta (recursivo). */
  delete(path: string): Promise<void>
  /** Muestra la nota o carpeta en el explorador del SO (resaltada). */
  revealInExplorer(path: string): Promise<void>
  /** Duplica una nota o carpeta con nombre libre y devuelve el nodo nuevo. */
  duplicate(path: string): Promise<TreeNode>
  /**
   * Da de baja una bóveda: la quita de knownVaults y, si fromDisk, envía su carpeta
   * a la papelera del SO (recuperable). Devuelve la bóveda activa resultante
   * (null si no queda ninguna).
   */
  remove(root: string, opts: { fromDisk: boolean }): Promise<VaultInfo | null>
  /**
   * Crea una nota en una ruta exacta (creando carpetas intermedias). Lanza
   * "Ya existe" si la ruta está ocupada: nunca pisa una nota existente.
   */
  createNoteAt(path: string, content: string): Promise<TreeNode>
  /** Búsqueda de texto completo en las notas (sin tildes ni mayúsculas). */
  search(query: string): Promise<SearchResult[]>
  /** Notas que enlazan (con `[[...]]`) a la nota o archivo indicado. */
  backlinks(path: string): Promise<Backlink[]>
  /**
   * Tras renombrar/mover `from` → `to` (nota, adjunto o carpeta), reescribe los
   * enlaces `[[...]]` de toda la bóveda que apuntaban al nombre viejo. Si hay que
   * tocar notas, primero toma una instantánea de seguridad (deshacible desde la
   * línea de tiempo). Devuelve cuántas notas se actualizaron.
   */
  updateLinks(from: string, to: string): Promise<number>
  /**
   * Guarda una imagen (pegada o arrastrada) en la carpeta de adjuntos con un
   * nombre libre y devuelve su ruta relativa a la raíz.
   */
  saveAttachment(name: string, data: Uint8Array, notePath?: string | null): Promise<string>
  /** Etiquetas (`#tag` y propiedad `tags`) con cuántas notas las usan. */
  tags(): Promise<{ tag: string; count: number }[]>
  /** Configuración de Obsidian de la bóveda abierta (si lo es). */
  obsidianConfig(): Promise<ObsidianConfig>
  /** Abre un archivo de la bóveda con la aplicación del sistema (PDF, audio…). */
  openExternal(path: string): Promise<void>
}

// ── Git (versionado, Capa 2) ───────────────────────────────────────────────

/** Un commit del árbol del vault. */
export interface GitCommitNode {
  oid: string
  message: string
  /** Epoch en milisegundos. */
  timestamp: number
  author: string
  /** Oids de los commits padre (para dibujar el grafo). */
  parents: string[]
  /** Columna asignada en el grafo (0 = línea principal). */
  lane: number
}

export interface GitBranchRef {
  name: string
  tip: string
  /** Rama de origen a la que se integra al mergear (undefined para main). */
  base?: string
}

/** Una etiqueta (tag de git) apuntando a un commit. */
export interface GitTagRef {
  name: string
  /** Oid del commit etiquetado. */
  oid: string
}

/** Cambio de un archivo en una versión (respecto de su padre). */
export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted'
  /** Patch unificado (jsdiff) o nota para binarios. */
  patch: string
}

/** Una versión de UNA nota: un commit donde su contenido cambió. */
export interface NoteVersion {
  oid: string
  message: string
  /** Epoch en milisegundos. */
  timestamp: number
  author: string
}

/** Grafo de commits de todo el vault, para el árbol de versiones. */
export interface GitGraph {
  /** Commits de todas las ramas, más nuevo primero. */
  commits: GitCommitNode[]
  branches: GitBranchRef[]
  /** Etiquetas (tags de git) del vault. */
  tags: GitTagRef[]
  /** HEAD actual: su oid y la rama si está adjunto (null = detached). */
  head: { oid: string | null; branch: string | null }
  /** Oids que están en la línea de HEAD (ancestros incluido); el resto se atenúa. */
  onCurrentLine: string[]
  /** Último oid pusheado por rama (marca hasta dónde está en GitHub). */
  pushed: string[]
}

/** Resultado de sincronizar con la nube (traer + integrar + subir). */
export interface SyncOutcome {
  branch: string
  oid: string
  /** true si se trajeron cambios de la nube al disco (hay que recargar). */
  pulled: boolean
  /**
   * Copias "(versión de la nube)" creadas porque la misma nota se editó en el
   * mismo lugar en dos computadoras. Lo local quedó en la nota; esto, al lado.
   */
  cloudCopies: string[]
}

export interface GitApi {
  /** Commitea los cambios del vault. Devuelve el oid, o null si no había nada. */
  commit(message?: string): Promise<string | null>
  /** Grafo de commits de todo el vault. */
  graph(): Promise<GitGraph>
  /** Mueve HEAD a un commit (checkout). Sobrescribe el working dir. */
  checkout(oid: string): Promise<void>
  /** Rutas con cambios pendientes respecto de HEAD (lo que se versionaría). */
  changes(): Promise<string[]>
  /**
   * Sincroniza con la nube: trae e integra lo que haya en el remoto y después
   * pushea la rama actual. `pulled` = el working dir cambió (hay que recargar).
   */
  push(): Promise<SyncOutcome>
  /** Commits de la rama actual sin pushear. */
  pendingPush(): Promise<number>
  /**
   * Suscribe al aviso de que un auto-respaldo trajo cambios de la nube al disco
   * (el renderer debe recargar árbol y notas abiertas). Devuelve el desuscriptor.
   */
  onPulled(cb: (info: { cloudCopies: string[] }) => void): () => void
  /** Crea una rama desde un commit (por defecto HEAD) y cambia a ella. Devuelve el nombre. */
  createBranch(fromOid: string, name?: string): Promise<string>
  /** Integra la rama actual a su rama de origen (base) y cambia a la base. */
  mergeBranch(): Promise<void>
  /** Cambios de una versión respecto de su padre (para el visor de diff). */
  commitDiff(oid: string): Promise<FileDiff[]>
  /** Versiones de una nota: commits donde su contenido cambió (viejo → nuevo). */
  noteHistory(path: string): Promise<NoteVersion[]>
  /** Contenido de una nota tal como estaba en un commit dado. */
  readNoteAt(oid: string, path: string): Promise<string>
  /** Árbol de notas (.md) tal como estaba en un commit — para la vista previa. */
  treeAt(oid: string): Promise<TreeNode[]>
  /** Materializa el árbol de un commit en el working dir (escribe/borra) SIN mover HEAD. */
  restoreTree(oid: string): Promise<void>
  /** Basenames de las notas que cambiaron en un commit respecto de su primer padre. */
  changedFiles(oid: string): Promise<string[]>
  /**
   * Etiqueta un commit (tag de git liviano). El nombre se sanea a un ref válido
   * (espacios → guiones). Devuelve el nombre final aplicado. Lanza si ya existe.
   */
  addTag(oid: string, name: string): Promise<string>
  /** Borra una etiqueta por su nombre. */
  removeTag(name: string): Promise<void>
  /** Borra una rama por su nombre. Lanza si es prod (main) o la rama actual. */
  deleteBranch(name: string): Promise<void>
  /** Recuento de líneas sin commitear de todo el vault: `+added` / `-removed`. */
  pendingLineStat(): Promise<{ added: number; removed: number }>
}

// ── GitHub (device flow + push del vault) ───────────────────────────────────

export interface GithubConfig {
  connected: boolean
  login: string | null
  /** URL del repo del vault donde se pushea. */
  remote: string | null
  autoPush: boolean
}

export interface DeviceFlowStart {
  userCode: string
  verificationUri: string
}

/** Un repo de GitHub del usuario (para el selector de clonado). */
export interface GithubRepoInfo {
  name: string
  fullName: string
  private: boolean
  cloneUrl: string
  /** ISO date del último update (para ordenar). */
  updatedAt: string
}

export interface GithubApi {
  getConfig(): Promise<GithubConfig>
  /** Inicia el device flow: devuelve el código a mostrar y abre github.com. */
  startDeviceFlow(): Promise<DeviceFlowStart>
  /** Espera a que el usuario autorice; guarda el token. Devuelve la config. */
  completeDeviceFlow(): Promise<GithubConfig>
  setRemote(url: string): Promise<GithubConfig>
  setAutoPush(autoPush: boolean): Promise<GithubConfig>
  disconnect(): Promise<GithubConfig>
  /** Repos del usuario (para elegir cuál clonar). */
  listRepos(): Promise<GithubRepoInfo[]>
}

// ── Respaldo en la nube (onboarding + habilitar) ────────────────────────────

/** Estado del onboarding de respaldo; `null` = todavía no invitado (default seguro). */
export type BackupOnboardingState = 'invitado' | 'diferido' | 'completado'

/** Snapshot del estado del onboarding de respaldo que cruza el puente IPC. */
export interface BackupOnboarding {
  state: BackupOnboardingState | null
}

export interface BackupApi {
  /** Habilita el respaldo del vault actual (device flow + createRepo + push). */
  enable(): Promise<GithubConfig>
  /** Estado actual del onboarding de respaldo. */
  getOnboarding(): Promise<BackupOnboarding>
  /** Persiste el nuevo estado del onboarding y devuelve el snapshot resultante. */
  setOnboarding(state: BackupOnboardingState): Promise<BackupOnboarding>
  /** Abre la página de creación de cuenta en el navegador (hand-off guiado). */
  openSignup(): Promise<void>
}

// ── Tour interactivo de primera vez ─────────────────────────────────────────

/**
 * Estado del tour de bienvenida (tri-state). A diferencia de BackupOnboarding,
 * NUNCA es null: el default es `'unseen'`. `'started'` = el tour se abrió pero
 * se cerró a mitad (interrumpido) → puede reaparecer una vez; `'seen'` = ya se
 * completó/saltó y no se auto-repite.
 */
export type TourState = 'unseen' | 'started' | 'seen'

/** Snapshot del estado del tour que cruza el puente IPC (siempre presente). */
export interface TourSnapshot {
  state: TourState
}

export interface TourApi {
  /** Estado actual del tour (default `'unseen'`). */
  get(): Promise<TourSnapshot>
  /** Persiste el nuevo estado del tour y devuelve el snapshot resultante. */
  set(state: TourState): Promise<TourSnapshot>
}

// ── IA (mensajes de commit) ─────────────────────────────────────────────────

export interface AiModel {
  id: string
  name: string
  /** USD por token de entrada (string de OpenRouter); null si no informa. */
  promptPrice: string | null
  /** USD por token de salida; null si no informa. */
  completionPrice: string | null
  contextLength: number | null
  /** true si el modelo acepta audio de entrada (sirve para el dictado). */
  audioInput: boolean
}

/**
 * Motor de IA: OpenRouter con la API key del usuario (BYOK), o el CLI oficial de
 * un proveedor que el usuario ya tiene instalado y con sesión iniciada (usa su
 * suscripción; Geode nunca ve ni guarda esas credenciales).
 */
export type AiEngine = 'openrouter' | 'claude' | 'codex' | 'gemini'

/** Motores que corren a través de un CLI instalado en la computadora. */
export type CliEngine = Exclude<AiEngine, 'openrouter'>

/** Estado de un CLI de IA en esta computadora. */
export interface AiCliStatus {
  engine: CliEngine
  installed: boolean
  /** Primera línea de `<cli> --version`, o null si no está instalado. */
  version: string | null
}

/** Resultado de "Probar conexión" con un motor. */
export interface AiEngineTest {
  ok: boolean
  /** Mensaje para el usuario (en español). */
  message: string
}

export interface AiConfig {
  enabled: boolean
  /** Motor elegido (default: OpenRouter). */
  engine: AiEngine
  /**
   * Si el motor tiene lo necesario para generar texto: con OpenRouter, key y
   * modelo; con un CLI, siempre true (si no está instalado o sin sesión, el
   * error se informa al usarlo).
   */
  ready: boolean
  model: string | null
  /** Modelo para el dictado por voz; null = Geode elige uno que acepte audio. */
  dictationModel: string | null
  /** Si hay una API key guardada (nunca se expone la key en sí al renderer). */
  hasKey: boolean
}

/**
 * Versión con nombre: título humano (primera línea del mensaje) + descripción
 * (cuerpo). La IA los genera discriminados a partir del diff de notas .md.
 */
export interface NamedVersion {
  /** Nombre corto del momento (primera línea del mensaje del commit). */
  title: string
  /** Descripción del contenido/tema que cambió (cuerpo del mensaje). */
  description: string
}

/** Uso de la API key en OpenRouter (en USD). */
export interface AiUsage {
  label: string | null
  /** Crédito consumido (acumulado). */
  usage: number
  /** Límite de crédito, o null si no hay. */
  limit: number | null
}

export interface AiApi {
  getConfig(): Promise<AiConfig>
  /** Guarda la API key (cifrada en el main). Devuelve la config actualizada. */
  setKey(key: string): Promise<AiConfig>
  clearKey(): Promise<AiConfig>
  setModel(model: string): Promise<AiConfig>
  setEnabled(enabled: boolean): Promise<AiConfig>
  /** Lista de modelos disponibles en OpenRouter. */
  listModels(): Promise<AiModel[]>
  /** Genera un mensaje de commit a partir del diff pendiente. '' si no hay cambios. */
  suggestMessage(): Promise<string>
  /** Genera título + descripción discriminados del diff pendiente (solo notas .md). */
  suggestVersion(): Promise<NamedVersion>
  /** Asistente de escritura: genera texto para el editor según una instrucción. */
  generateText(instruction: string, selection: string, before: string): Promise<string>
  /** Uso/gasto de la API key en OpenRouter. null si no hay key. */
  usage(): Promise<AiUsage | null>
  /** Fija el modelo del dictado (null = elegir uno automáticamente). */
  setDictationModel(model: string | null): Promise<AiConfig>
  /** Transcribe audio WAV (base64) a texto con OpenRouter. '' si no hubo voz. */
  transcribe(wavBase64: string): Promise<string>
  /** Elige el motor de IA (OpenRouter o un CLI con suscripción). */
  setEngine(engine: AiEngine): Promise<AiConfig>
  /** Qué CLIs de IA (Claude Code, Codex, Gemini CLI) están instalados. */
  detectClis(): Promise<AiCliStatus[]>
  /** Hace una consulta mínima con el motor para verificar que responde. */
  testEngine(engine: AiEngine): Promise<AiEngineTest>
}

// ── Dictado por voz (atajo global) ──────────────────────────────────────────

/** Adónde va el texto dictado: el cursor (Geode al frente) o la nota de hoy. */
export type DictationTarget = 'cursor' | 'daily'

/** Orden del main al renderer (el atajo global se registra en el main). */
export interface DictationCommand {
  action: 'start' | 'stop' | 'cancel'
  target: DictationTarget
}

/** Estado que el renderer reporta para la ventanita flotante. */
export interface DictationStatus {
  state: 'listening' | 'transcribing' | 'done' | 'error' | 'idle'
  message?: string
}

export interface DictationApi {
  /** Suscribe las órdenes del atajo global. Devuelve el desuscriptor. */
  onCommand(cb: (cmd: DictationCommand) => void): () => void
  /** Reporta el estado (lo muestra la ventanita flotante "Escuchando…"). */
  reportStatus(status: DictationStatus): void
  /** Atajo global efectivo (p. ej. "Ctrl+Alt+Espacio"), o null si no se pudo registrar. */
  getShortcut(): Promise<string | null>
}

// ── Atajos de teclado reasignables ──────────────────────────────────────────

/** Estado de los atajos: efectivos + si el global del dictado quedó registrado. */
export interface ShortcutsState {
  /** Atajo efectivo de cada acción (formato accelerator de Electron). */
  bindings: ShortcutMap
  /** Ids con un atajo distinto al de fábrica. */
  customized: ShortcutId[]
  /** false si el sistema no dejó registrar el atajo global del dictado. */
  globalRegistered: boolean
}

export interface ShortcutsApi {
  get(): Promise<ShortcutsState>
  /**
   * Reasigna un atajo (`null` = volver al de fábrica). Rechaza con un mensaje en
   * español si la combinación no es válida, choca con otra acción o (para el
   * global) el sistema no la deja registrar; en ese caso no se guarda nada.
   */
  set(id: ShortcutId, accelerator: string | null): Promise<ShortcutsState>
  /** Avisa cuando cambian (p. ej. desde Ajustes). Devuelve el desuscriptor. */
  onChange(cb: (state: ShortcutsState) => void): () => void
}

// ── Snapshots automáticos (guardado por cadencia; IA opcional en cadencia) ──

export interface SnapshotsConfig {
  /** minutos entre snapshots; null = manual (sin timer). */
  cadenceMinutes: number | null
  /** Opt-in de títulos por IA en la cadencia. Default false (marcador, sin IA). */
  aiTitles: boolean
}

export interface SnapshotsApi {
  /** Config actual; default 10 min y aiTitles false si nunca se configuró. */
  get(): Promise<SnapshotsConfig>
  /** Fija la cadencia (null = manual) y reinicia el timer. */
  set(cadenceMinutes: number | null): Promise<SnapshotsConfig>
  /** Activa/desactiva el opt-in de títulos por IA en la cadencia. No toca el timer. */
  setAiTitles(enabled: boolean): Promise<SnapshotsConfig>
}

// ── Modo Avanzado (interruptor de las superficies git) ──────────────────────

export interface AdvancedConfig {
  /** Modo Avanzado activo. Default false (sin git). */
  enabled: boolean
}

export interface AdvancedApi {
  /** Config actual; default false si nunca se configuró. */
  get(): Promise<AdvancedConfig>
  /** Activa/desactiva el Modo Avanzado (persistente). Devuelve la config. */
  set(enabled: boolean): Promise<AdvancedConfig>
}

// ── Plugins externos (aislados en iframe sandbox) ───────────────────────────

/**
 * Versión de la API de plugins que la app soporta hoy. Un plugin cuyo
 * `apiVersion` sea mayor que este número es incompatible y se rechaza al listar.
 * v2 (aditiva sobre v1): bloques de código (`markdown.registerCodeBlock`),
 * `vault.exists/createNote`, `openNote` y `ui.pick`. Los plugins v1 siguen andando.
 */
export const HOST_API_VERSION = 2

/**
 * Manifiesto de un plugin externo (`plugin.json` en su carpeta). El campo
 * `permissions` está RESERVADO para el sandbox (Fase B): hoy es solo informativo,
 * pero se declara desde ya para no romper el formato al hacerlo cumplir.
 */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  /** Archivo de entrada CommonJS, relativo a la carpeta del plugin. */
  main: string
  /** Versión mínima de Geode requerida (semver). */
  minAppVersion?: string
  /** Versión de la API de plugins que el plugin espera; ausente ⇒ v1. */
  apiVersion?: number
  /** Permisos declarados. Reservado para el sandbox; hoy informativo. */
  permissions?: string[]
}

/** Un plugin externo instalado en la carpeta de plugins. */
export interface InstalledPlugin {
  manifest: PluginManifest
  /** Carpeta absoluta del plugin (para abrir/gestionar). */
  dir: string
  /** Si el usuario lo tiene activado. */
  enabled: boolean
  /** Motivo por el que el manifiesto no se pudo leer/validar, si aplica. */
  error?: string
}

export interface PluginsApi {
  /** Plugins externos encontrados en la carpeta de plugins. */
  list(): Promise<InstalledPlugin[]>
  /**
   * Mapa crudo `settings.plugins.enabled` (id→activado), sin resolver defaults.
   * Quien lo consume resuelve el default: `?? true` para built-ins (ON por
   * defecto) y `?? false` para externos (opt-in). Solo lectura.
   */
  getEnabled(): Promise<Record<string, boolean>>
  /** Abre la carpeta de plugins en el explorador del SO. */
  openDir(): Promise<void>
  /** Activa/desactiva un plugin (persistente). Devuelve la lista actualizada. */
  setEnabled(id: string, enabled: boolean): Promise<InstalledPlugin[]>
  /** Código fuente del entry de un plugin, para que el renderer lo cargue. */
  readSource(id: string): Promise<string>
}

// ── Superficie completa expuesta en window.geode ───────────────────────────

export interface GeodeApi {
  /** Sanity check del puente IPC. */
  ping(): Promise<'pong'>
  /** Versiones del runtime. */
  getAppInfo(): Promise<AppInfo>
  window: WindowApi
  vault: VaultApi
  git: GitApi
  ai: AiApi
  github: GithubApi
  backup: BackupApi
  tour: TourApi
  snapshots: SnapshotsApi
  advanced: AdvancedApi
  plugins: PluginsApi
  dictation: DictationApi
  shortcuts: ShortcutsApi
}
