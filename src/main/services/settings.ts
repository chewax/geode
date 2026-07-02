import { app, safeStorage } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWrite } from '../fs/atomic'

/**
 * Ajustes de la app (no del vault). Viven en userData, fuera de todo repo.
 * La API key de IA se guarda cifrada con safeStorage (cripto del SO); nunca
 * en texto plano ni dentro del vault.
 */
export interface Settings {
  lastVault?: string
  ai?: {
    enabled?: boolean
    model?: string
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
    /** URL del repo del vault donde se pushea (cada usuario el suyo). */
    remote?: string
    /** Pushear automáticamente al guardar cada versión. */
    autoPush?: boolean
    /** Último oid pusheado por rama, para contar commits pendientes. */
    pushed?: Record<string, string>
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
