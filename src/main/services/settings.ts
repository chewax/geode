import { app, safeStorage } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWrite } from '../fs/atomic'
import type { TourState } from '@shared/ipc'

/**
 * Ajustes de la app (no del vault). Viven en userData, fuera de todo repo.
 * La API key de IA se guarda cifrada con safeStorage (cripto del SO); nunca
 * en texto plano ni dentro del vault.
 */
export interface Settings {
  lastVault?: string
  /** Bóvedas abiertas alguna vez, más reciente primero. Para el selector de bóveda. */
  knownVaults?: string[]
  ai?: {
    enabled?: boolean
    model?: string
    /** Modelo para el dictado por voz (debe aceptar audio). Ausente = automático. */
    dictationModel?: string
    /** Key cifrada (base64) si safeStorage está disponible, o texto plano si no. */
    key?: string
    keyEncrypted?: boolean
  }
  github?: {
    /** Token de acceso, cifrado como la key de IA. */
    token?: string
    tokenEncrypted?: boolean
    /** Cuenta conectada (para mostrar). */
    login?: string
    /**
     * @deprecated Remoto GLOBAL heredado. Ya NO es la fuente del destino de push
     * (CR-01): el destino real es el origin propio de cada bóveda (git.getRemote).
     * Se conserva por compatibilidad y para el flujo avanzado de "pegar URL".
     */
    remote?: string
    /** Pushear automáticamente al guardar cada versión. */
    autoPush?: boolean
    /**
     * @deprecated Mapa GLOBAL rama→oid pusheado. Reemplazado por `pushedByVault`
     * para evitar la fuga cross-vault (CR-01). Se migra perezosamente: si existe,
     * se atribuye a `lastVault` (la única bóveda que pudo haberlo escrito).
     */
    pushed?: Record<string, string>
    /**
     * Último oid pusheado por rama, SCOPEADO POR BÓVEDA (`root`). Cada bóveda lleva
     * su propio estado de push: el contador de pendientes de la bóveda B nunca
     * refleja lo pusheado por la bóveda A (CR-01).
     */
    pushedByVault?: Record<string, Record<string, string>>
  }
  plugins?: {
    /** Activado por id de plugin. Ausente = desactivado (default seguro). */
    enabled?: Record<string, boolean>
  }
  snapshots?: {
    /** minutos entre snapshots automáticos; null = manual (sin timer). */
    cadenceMinutes?: number | null
    /** Opt-in: nombrar los snapshots de cadencia con IA. Ausente/false = OFF (default seguro). */
    aiTitles?: boolean
  }
  advanced?: {
    /** Modo Avanzado: expone las superficies git. Ausente = off (experiencia sin git). */
    enabled?: boolean
  }
  backup?: {
    /**
     * Estado del onboarding de respaldo en la nube (BACKUP-01/02). Ausente =
     * "no invitado todavía" (default seguro, sin migración). `invitado` = se
     * mostró la tarjeta; `diferido` = el usuario la pospuso; `completado` = ya
     * hay respaldo configurado.
     */
    onboarding?: 'invitado' | 'diferido' | 'completado'
  }
  tour?: {
    /**
     * Estado del tour de bienvenida (TOUR-02). Ausente = `'unseen'` (default
     * seguro, sin migración). `'started'` = el tour se interrumpió a mitad;
     * `'seen'` = ya se completó/saltó y no se auto-repite.
     */
    state?: 'unseen' | 'started' | 'seen'
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf8')) as Settings
  } catch {
    return {}
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await atomicWrite(settingsPath(), JSON.stringify(settings, null, 2))
}

/** Cifra un secreto con safeStorage si está disponible; si no, lo deja plano. */
function encryptSecret(plain: string): { value: string; encrypted: boolean } {
  if (safeStorage.isEncryptionAvailable()) {
    return { value: safeStorage.encryptString(plain).toString('base64'), encrypted: true }
  }
  return { value: plain, encrypted: false }
}

function decryptSecret(value: string, encrypted: boolean): string | null {
  if (!encrypted) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return null
  }
}

/**
 * Marca `root` como bóveda activa: lo guarda como `lastVault` y lo mueve al
 * frente de `knownVaults` (dedup). Base del selector de bóveda estilo Obsidian.
 */
export async function rememberVault(root: string): Promise<void> {
  const settings = await loadSettings()
  const known = (settings.knownVaults ?? []).filter((v) => v !== root)
  known.unshift(root)
  settings.lastVault = root
  settings.knownVaults = known
  await saveSettings(settings)
}

/**
 * Da de baja `root` de `knownVaults` (inversa de `rememberVault`): lo quita de la
 * lista y, si era la bóveda activa (`lastVault`), reasigna `lastVault` al nuevo
 * frente (`knownVaults[0]`) o lo borra si no queda ninguna. Devuelve el nuevo
 * `lastVault` (undefined si ya no queda ninguna bóveda conocida).
 */
export async function forgetVault(root: string): Promise<string | undefined> {
  const settings = await loadSettings()
  const known = (settings.knownVaults ?? []).filter((v) => v !== root)
  settings.knownVaults = known
  if (settings.lastVault === root) {
    if (known.length > 0) {
      settings.lastVault = known[0]
    } else {
      delete settings.lastVault
    }
  }
  await saveSettings(settings)
  return settings.lastVault
}

/** Guarda la API key de IA cifrada (si se puede) sin tocar el resto de ajustes. */
export async function setAiKey(plain: string): Promise<void> {
  const settings = await loadSettings()
  const enc = encryptSecret(plain)
  settings.ai = { ...settings.ai, key: enc.value, keyEncrypted: enc.encrypted }
  await saveSettings(settings)
}

export async function clearAiKey(): Promise<void> {
  const settings = await loadSettings()
  if (settings.ai) {
    delete settings.ai.key
    delete settings.ai.keyEncrypted
    await saveSettings(settings)
  }
}

/** Devuelve la API key en claro (solo para uso interno del main). */
export async function getAiKey(): Promise<string | null> {
  const { ai } = await loadSettings()
  if (!ai?.key) return null
  return decryptSecret(ai.key, ai.keyEncrypted ?? false)
}

/** Guarda el token de GitHub cifrado + el login de la cuenta conectada. */
export async function setGithubToken(plain: string, login: string): Promise<void> {
  const settings = await loadSettings()
  const enc = encryptSecret(plain)
  settings.github = {
    ...settings.github,
    token: enc.value,
    tokenEncrypted: enc.encrypted,
    login
  }
  await saveSettings(settings)
}

/** Token de GitHub en claro (solo uso interno del main). */
export async function getGithubToken(): Promise<string | null> {
  const { github } = await loadSettings()
  if (!github?.token) return null
  return decryptSecret(github.token, github.tokenEncrypted ?? false)
}

export async function clearGithub(): Promise<void> {
  const settings = await loadSettings()
  delete settings.github
  await saveSettings(settings)
}

/**
 * Mapa rama→oid pusheado de ESA bóveda (`root`) leído de un Settings ya cargado.
 * Cada bóveda lleva su propio estado (CR-01): nunca se comparte entre bóvedas.
 * Back-compat: si aún existe el `pushed` plano global (settings viejos) y `root`
 * es la última bóveda activa, se atribuye a ella (migración perezosa, sin romper).
 */
export function pushedForVault(settings: Settings, root: string): Record<string, string> {
  const perVault = settings.github?.pushedByVault?.[root]
  if (perVault) return perVault
  if (settings.github?.pushed && settings.lastVault === root) return settings.github.pushed
  return {}
}

/**
 * Devuelve una copia inmutable de `settings` con el oid pusheado de `branch`
 * registrado PARA ESA bóveda (`root`) en `github.pushedByVault`. No toca el
 * `pushed` global heredado ni el estado de otras bóvedas.
 */
export function withPushedForVault(
  settings: Settings,
  root: string,
  branch: string,
  oid: string
): Settings {
  const vaultPushed = { ...pushedForVault(settings, root), [branch]: oid }
  const pushedByVault = { ...settings.github?.pushedByVault, [root]: vaultPushed }
  return { ...settings, github: { ...settings.github, pushedByVault } }
}

// ── Plugins externos ─────────────────────────────────────────────────────────

/** Mapa id→activado de los plugins externos. */
export async function getPluginsEnabled(): Promise<Record<string, boolean>> {
  return (await loadSettings()).plugins?.enabled ?? {}
}

/** Activa/desactiva un plugin externo (persistente). */
export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  const settings = await loadSettings()
  const map = { ...settings.plugins?.enabled, [id]: enabled }
  settings.plugins = { ...settings.plugins, enabled: map }
  await saveSettings(settings)
}

// ── Snapshots automáticos ─────────────────────────────────────────────────────

/** Fija la cadencia de snapshots (null = manual) sin tocar el resto de ajustes. */
export async function setSnapshotCadence(cadenceMinutes: number | null): Promise<void> {
  const settings = await loadSettings()
  settings.snapshots = { ...settings.snapshots, cadenceMinutes }
  await saveSettings(settings)
}

/**
 * Activa/desactiva el opt-in de títulos por IA en los snapshots de cadencia,
 * preservando la cadencia. Ausente/false = OFF (default seguro, sin IA).
 */
export async function setSnapshotAiTitles(enabled: boolean): Promise<void> {
  const settings = await loadSettings()
  settings.snapshots = { ...settings.snapshots, aiTitles: enabled }
  await saveSettings(settings)
}

// ── Modo Avanzado ─────────────────────────────────────────────────────────────

/** Activa/desactiva el Modo Avanzado (persistente) sin tocar el resto de ajustes. */
export async function setAdvanced(enabled: boolean): Promise<void> {
  const settings = await loadSettings()
  settings.advanced = { ...settings.advanced, enabled }
  await saveSettings(settings)
}

// ── Onboarding de respaldo en la nube ─────────────────────────────────────────

/** Estado del onboarding de respaldo; `null` = todavía no invitado (default seguro). */
export async function getBackupOnboarding(): Promise<
  'invitado' | 'diferido' | 'completado' | null
> {
  return (await loadSettings()).backup?.onboarding ?? null
}

/** Fija el estado del onboarding de respaldo (persistente) sin tocar el resto de ajustes. */
export async function setBackupOnboarding(
  state: 'invitado' | 'diferido' | 'completado'
): Promise<void> {
  const settings = await loadSettings()
  settings.backup = { ...settings.backup, onboarding: state }
  await saveSettings(settings)
}

// ── Tour interactivo de primera vez ───────────────────────────────────────────

/** Estado del tour; default `'unseen'` (NO null, a diferencia del backup). */
export async function getTourState(): Promise<TourState> {
  return (await loadSettings()).tour?.state ?? 'unseen'
}

/** Fija el estado del tour (persistente) preservando el resto de ajustes. */
export async function setTourState(state: TourState): Promise<void> {
  const settings = await loadSettings()
  settings.tour = { ...settings.tour, state }
  await saveSettings(settings)
}
