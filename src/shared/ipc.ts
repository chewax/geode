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
  appInfo: 'geode:app-info'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Payloads de request/response por canal. */
export interface AppInfo {
  appVersion: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  /** process.platform, como string para no filtrar tipos de Node al renderer. */
  platform: string
}

/**
 * Superficie que el preload expone en `window.geode`.
 * A medida que crezca la app, cada servicio del dominio (vault, git, sync…)
 * agrega su sub-objeto acá y su handler correspondiente en el main.
 */
export interface GeodeApi {
  /** Sanity check del puente IPC. */
  ping(): Promise<'pong'>
  /** Versiones del runtime, para el "Acerca de" y diagnósticos. */
  getAppInfo(): Promise<AppInfo>
}
