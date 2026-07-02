/**
 * Contrato IPC tipado entre el proceso main (Node) y el renderer (React).
 *
 * Regla de arquitectura (ver ARCHITECTURE.md §2): el renderer NUNCA toca disco
 * ni red directamente. Todo pasa por estos canales hacia el main. Este archivo
 * es la única fuente de verdad de esa frontera y lo comparten ambos lados.
 */

/** Nombres de canal. Prefijo `geode:` para evitar colisiones. */
export const IPC = {
  ping: 'geode:ping',
  appInfo: 'geode:app-info',
  vaultOpen: 'geode:vault-open',
  vaultCurrent: 'geode:vault-current',
  vaultTree: 'geode:vault-tree',
  vaultReadNote: 'geode:vault-read-note',
  vaultWriteNote: 'geode:vault-write-note',
  vaultCreateNote: 'geode:vault-create-note',
  vaultCreateFolder: 'geode:vault-create-folder',
  vaultRename: 'geode:vault-rename',
  vaultDelete: 'geode:vault-delete',
  gitCommit: 'geode:git-commit',
  gitGraph: 'geode:git-graph',
  gitCheckout: 'geode:git-checkout',
  gitChanges: 'geode:git-changes',
  gitPush: 'geode:git-push',
  gitPendingPush: 'geode:git-pending-push',
  gitStartWork: 'geode:git-start-work',
  gitMergeToProd: 'geode:git-merge-to-prod',
  githubGetConfig: 'geode:github-get-config',
  githubStartDeviceFlow: 'geode:github-start-device-flow',
  githubCompleteDeviceFlow: 'geode:github-complete-device-flow',
  githubSetRemote: 'geode:github-set-remote',
  githubSetAutoPush: 'geode:github-set-auto-push',
  githubDisconnect: 'geode:github-disconnect',
  aiGetConfig: 'geode:ai-get-config',
  aiSetKey: 'geode:ai-set-key',
  aiClearKey: 'geode:ai-clear-key',
  aiSetModel: 'geode:ai-set-model',
  aiSetEnabled: 'geode:ai-set-enabled',
  aiListModels: 'geode:ai-list-models',
  aiSuggestMessage: 'geode:ai-suggest-message',
  aiGenerateText: 'geode:ai-generate-text',
  aiUsage: 'geode:ai-usage'
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

// ── Vault ──────────────────────────────────────────────────────────────────

export interface VaultInfo {
  /** Ruta absoluta de la carpeta raíz del vault. */
  root: string
  /** Nombre visible (basename de la carpeta). */
  name: string
}

/** Nodo del árbol de notas. Las rutas son relativas al root, con '/'. */
export interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children?: TreeNode[]
}

export interface VaultApi {
  /** Abre un diálogo de carpeta. Devuelve null si el usuario cancela. */
  open(): Promise<VaultInfo | null>
  /** Vault activo (restaurado del último uso), o null. */
  current(): Promise<VaultInfo | null>
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
}

/** Grafo de commits de todo el vault, para el árbol de versiones. */
export interface GitGraph {
  /** Commits de todas las ramas, más nuevo primero. */
  commits: GitCommitNode[]
  branches: GitBranchRef[]
  /** HEAD actual: su oid y la rama si está adjunto (null = detached). */
  head: { oid: string | null; branch: string | null }
  /** Oids que están en la línea de HEAD (ancestros incluido); el resto se atenúa. */
  onCurrentLine: string[]
  /** Último oid pusheado por rama (marca hasta dónde está en GitHub). */
  pushed: string[]
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
  /** Pushea la rama actual al remoto configurado. */
  push(): Promise<{ branch: string; oid: string }>
  /** Commits de la rama actual sin pushear. */
  pendingPush(): Promise<number>
  /** Arranca una rama de trabajo si estás en prod/detached. Devuelve la rama (o null). */
  startWork(): Promise<string | null>
  /** Mergea la rama de trabajo actual a prod (main) y vuelve a prod. */
  mergeToProd(message?: string): Promise<void>
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

export interface GithubApi {
  getConfig(): Promise<GithubConfig>
  /** Inicia el device flow: devuelve el código a mostrar y abre github.com. */
  startDeviceFlow(): Promise<DeviceFlowStart>
  /** Espera a que el usuario autorice; guarda el token. Devuelve la config. */
  completeDeviceFlow(): Promise<GithubConfig>
  setRemote(url: string): Promise<GithubConfig>
  setAutoPush(autoPush: boolean): Promise<GithubConfig>
  disconnect(): Promise<GithubConfig>
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
}

export interface AiConfig {
  enabled: boolean
  model: string | null
  /** Si hay una API key guardada (nunca se expone la key en sí al renderer). */
  hasKey: boolean
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
  /** Asistente de escritura: genera texto para el editor según una instrucción. */
  generateText(instruction: string, selection: string, before: string): Promise<string>
  /** Uso/gasto de la API key en OpenRouter. null si no hay key. */
  usage(): Promise<AiUsage | null>
}

// ── Superficie completa expuesta en window.geode ───────────────────────────

export interface GeodeApi {
  /** Sanity check del puente IPC. */
  ping(): Promise<'pong'>
  /** Versiones del runtime. */
  getAppInfo(): Promise<AppInfo>
  vault: VaultApi
  git: GitApi
  ai: AiApi
  github: GithubApi
}
