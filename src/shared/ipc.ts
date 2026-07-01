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
  gitCommit: 'geode:git-commit',
  gitHistory: 'geode:git-history',
  gitReadAt: 'geode:git-read-at'
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
}

// ── Git (versionado, Capa 2) ───────────────────────────────────────────────

export interface GitVersion {
  oid: string
  message: string
  /** Epoch en milisegundos. */
  timestamp: number
  author: string
}

export interface GitApi {
  /** Commitea los cambios del vault. Devuelve el oid, o null si no había nada. */
  commit(message?: string): Promise<string | null>
  /** Versiones de una nota (más nueva primero). */
  history(path: string): Promise<GitVersion[]>
  /** Contenido de una nota en un commit dado. */
  readAt(oid: string, path: string): Promise<string>
}

// ── Superficie completa expuesta en window.geode ───────────────────────────

export interface GeodeApi {
  /** Sanity check del puente IPC. */
  ping(): Promise<'pong'>
  /** Versiones del runtime. */
  getAppInfo(): Promise<AppInfo>
  vault: VaultApi
  git: GitApi
}
