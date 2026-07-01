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

/** Guarda la API key de IA cifrada (si se puede) sin tocar el resto de ajustes. */
export async function setAiKey(plain: string): Promise<void> {
  const settings = await loadSettings()
  const ai = settings.ai ?? {}
  if (safeStorage.isEncryptionAvailable()) {
    ai.key = safeStorage.encryptString(plain).toString('base64')
    ai.keyEncrypted = true
  } else {
    ai.key = plain
    ai.keyEncrypted = false
  }
  settings.ai = ai
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
  if (!ai.keyEncrypted) return ai.key
  try {
    return safeStorage.decryptString(Buffer.from(ai.key, 'base64'))
  } catch {
    return null
  }
}
