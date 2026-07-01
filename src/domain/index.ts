/**
 * Dominio puro de Geode: contratos sin dependencias de Electron ni React.
 *
 * Estas son las interfaces que el documento de arquitectura define como la
 * columna vertebral de la app (ver ARCHITECTURE.md §6). Todavía no tienen
 * implementación: existen para que el resto del código programe contra ellas
 * y para que podamos cambiar estrategias (p. ej. sync branch-por-dispositivo
 * hoy → CRDTs mañana) sin reescribir la app.
 */

// ── Tipos base ────────────────────────────────────────────────────────────

export type CommitId = string

export interface FileEntry {
  path: string
  isDirectory: boolean
}

export interface DeviceIdentity {
  /** Slug del dispositivo, ej. "dani-laptop". Da nombre a la branch device/<slug>. */
  slug: string
  gitName: string
  gitEmail: string
}

export interface Version {
  commit: CommitId
  timestamp: number
  author: string
  message: string
}

export interface Diff {
  path: string
  /** Texto unificado o hunks estructurados; a definir en la fase de historial. */
  hunks: string
}

// ── Almacenamiento: escrituras atómicas, nunca corromper una nota ──────────

export interface StorageService {
  read(path: string): Promise<string>
  /** temp + fsync + rename. Nunca escribe in-place. */
  writeAtomic(path: string, content: string): Promise<void>
  list(dir: string): Promise<FileEntry[]>
  delete(path: string): Promise<void>
  move(from: string, to: string): Promise<void>
}

// ── Versionado: envuelve Git pero habla el idioma de la app ────────────────

export interface GitService {
  commit(paths: string[], message: string, device: DeviceIdentity): Promise<CommitId>
  /** git log --follow: historial de un archivo, cruzando renombres. */
  historyOf(path: string): Promise<Version[]>
  diff(a: CommitId, b: CommitId, path?: string): Promise<Diff>
  /** Restaurar = commit nuevo que devuelve el contenido. Nunca reescribe historia. */
  restore(path: string, version: CommitId): Promise<CommitId>
}

// ── Sync branch-por-dispositivo (agnóstico de la estrategia) ───────────────

export interface Conflict {
  path: string
  /** Contenido de cada lado para la UI 3-way. */
  ours: string
  theirs: string
  base: string
}

export type Resolution =
  | { kind: 'ours' }
  | { kind: 'theirs' }
  | { kind: 'merged'; content: string }

export interface IntegrationResult {
  merged: string[]
  conflicts: Conflict[]
}

export interface SyncService {
  /** device/<slug> del dispositivo actual. */
  deviceBranch(): string
  /** Siempre fast-forward (un único escritor por branch). */
  push(): Promise<void>
  fetchAll(): Promise<void>
  /** Merge de otras device/* en la propia; devuelve conflictos si los hay. */
  integrate(): Promise<IntegrationResult>
  resolve(conflict: Conflict, choice: Resolution): Promise<void>
}

// ── Índice derivado y reconstruible (SQLite/FTS5) ──────────────────────────

export interface SearchHit {
  path: string
  snippet: string
  score: number
}

export interface IndexService {
  /** Reconstruye el índice desde los .md. Es derivado: nunca es la fuente de verdad. */
  reindex(): Promise<void>
  search(query: string): Promise<SearchHit[]>
  backlinks(note: string): Promise<string[]>
}

// ── Attachments detrás de una interfaz (hoy repo, mañana LFS/externo) ───────

export type AttachmentRef = string

export interface AttachmentStore {
  put(bytes: Uint8Array, hint: { name: string; mime: string }): Promise<AttachmentRef>
  get(ref: AttachmentRef): Promise<Uint8Array>
  /** URL utilizable como <img src> en el editor. */
  resolveUrl(ref: AttachmentRef): string
}

// ── Autenticación GitHub ───────────────────────────────────────────────────

export interface Session {
  login: string
  token: string
}

export interface AuthService {
  /** GitHub OAuth device flow. */
  loginDeviceFlow(): Promise<Session>
  currentSession(): Promise<Session | null>
  logout(): Promise<void>
}
