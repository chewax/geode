import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWrite } from '../fs/atomic'

/**
 * Ajustes de la app (no del vault). Viven en userData, fuera de todo repo.
 * Por ahora solo recuerdan el último vault para reabrirlo al arrancar.
 */
export interface Settings {
  lastVault?: string
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
