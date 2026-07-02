import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { IPC, type AppInfo, type AiConfig, type GithubConfig } from '@shared/ipc'
import { VaultService } from './services/vault'
import { GitService } from './services/git'
import { OpenRouterProvider, listOpenRouterModels } from './services/ai'
import {
  requestDeviceCode,
  pollForToken,
  getLogin,
  normalizeRemoteUrl,
  type DeviceCode
} from './services/github'
import {
  loadSettings,
  saveSettings,
  setAiKey,
  clearAiKey,
  getAiKey,
  setGithubToken,
  getGithubToken,
  clearGithub
} from './services/settings'

// OAuth App de Geode (client IDs son públicos; device flow no usa secret).
const GITHUB_CLIENT_ID = 'Ov23liOW1wfZr6QhxLVY'

const vault = new VaultService()
const gitService = new GitService()

/** Device flow en curso, entre startDeviceFlow y completeDeviceFlow. */
let pendingDeviceCode: DeviceCode | null = null

async function githubConfig(): Promise<GithubConfig> {
  const { github } = await loadSettings()
  return {
    connected: !!github?.token,
    login: github?.login ?? null,
    remote: github?.remote ?? null,
    autoPush: github?.autoPush ?? false
  }
}

async function aiConfig(): Promise<AiConfig> {
  const { ai } = await loadSettings()
  return {
    enabled: ai?.enabled ?? false,
    model: ai?.model ?? null,
    hasKey: !!ai?.key
  }
}

/** Root del vault activo o error uniforme si no hay ninguno. */
function requireRoot(): string {
  const info = vault.getInfo()
  if (!info) throw new Error('No hay vault abierto')
  return info.root
}

function autoCommitMessage(): string {
  return `Snapshot ${new Date().toISOString()}`
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Seguridad (ver ARCHITECTURE.md §2 y §9): el renderer corre aislado,
      // sin acceso a Node. Todo pasa por el puente del preload vía IPC.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Los links externos abren en el navegador del sistema, no en la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

/**
 * Handlers IPC. Un handler por canal del contrato de @shared/ipc.
 * Los del vault delegan en VaultService; acá se irán sumando Git/Sync.
 */
function registerIpcHandlers(): void {
  ipcMain.handle(IPC.ping, (): 'pong' => 'pong')

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform
  }))

  ipcMain.handle(IPC.vaultOpen, async () => {
    const info = await vault.openDialog()
    if (info) {
      await gitService.ensureRepo(info.root)
      await saveSettings({ lastVault: info.root })
    }
    return info
  })

  ipcMain.handle(IPC.vaultCurrent, () => vault.getInfo())
  ipcMain.handle(IPC.vaultTree, () => vault.tree())
  ipcMain.handle(IPC.vaultReadNote, (_e, path: string) => vault.readNote(path))
  ipcMain.handle(IPC.vaultWriteNote, (_e, path: string, content: string) =>
    vault.writeNote(path, content)
  )
  ipcMain.handle(IPC.vaultCreateNote, (_e, dir: string) => vault.createNote(dir))
  ipcMain.handle(IPC.vaultCreateFolder, (_e, dir: string) => vault.createFolder(dir))
  ipcMain.handle(IPC.vaultRename, (_e, from: string, to: string) => vault.rename(from, to))
  ipcMain.handle(IPC.vaultDelete, (_e, path: string) => vault.deletePath(path))

  ipcMain.handle(IPC.gitCommit, (_e, message?: string) =>
    gitService.commit(requireRoot(), message ?? autoCommitMessage())
  )
  ipcMain.handle(IPC.gitGraph, () => gitService.graph(requireRoot()))
  ipcMain.handle(IPC.gitCheckout, (_e, oid: string) => gitService.checkout(requireRoot(), oid))
  ipcMain.handle(IPC.gitChanges, () => gitService.changes(requireRoot()))

  ipcMain.handle(IPC.aiGetConfig, () => aiConfig())

  ipcMain.handle(IPC.aiSetKey, async (_e, key: string) => {
    await setAiKey(key)
    return aiConfig()
  })

  ipcMain.handle(IPC.aiClearKey, async () => {
    await clearAiKey()
    return aiConfig()
  })

  ipcMain.handle(IPC.aiSetModel, async (_e, model: string) => {
    const settings = await loadSettings()
    settings.ai = { ...settings.ai, model }
    await saveSettings(settings)
    return aiConfig()
  })

  ipcMain.handle(IPC.aiSetEnabled, async (_e, enabled: boolean) => {
    const settings = await loadSettings()
    settings.ai = { ...settings.ai, enabled }
    await saveSettings(settings)
    return aiConfig()
  })

  ipcMain.handle(IPC.aiListModels, async () => {
    const key = await getAiKey()
    return listOpenRouterModels(key ?? '')
  })

  ipcMain.handle(IPC.aiSuggestMessage, async (): Promise<string> => {
    const key = await getAiKey()
    const { ai } = await loadSettings()
    if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')

    const diff = await gitService.pendingDiff(requireRoot())
    if (!diff) return ''

    const provider = new OpenRouterProvider(key, ai.model)
    return provider.generateMessage(diff)
  })

  ipcMain.handle(
    IPC.aiGenerateText,
    async (_e, instruction: string, selection: string, before: string): Promise<string> => {
      const key = await getAiKey()
      const { ai } = await loadSettings()
      if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')
      const provider = new OpenRouterProvider(key, ai.model)
      return provider.generateText(instruction, selection, before)
    }
  )

  // ── GitHub / push ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.githubGetConfig, () => githubConfig())

  ipcMain.handle(IPC.githubStartDeviceFlow, async () => {
    pendingDeviceCode = await requestDeviceCode(GITHUB_CLIENT_ID)
    void shell.openExternal(pendingDeviceCode.verificationUri)
    return {
      userCode: pendingDeviceCode.userCode,
      verificationUri: pendingDeviceCode.verificationUri
    }
  })

  ipcMain.handle(IPC.githubCompleteDeviceFlow, async () => {
    if (!pendingDeviceCode) throw new Error('No hay un device flow en curso')
    const token = await pollForToken(GITHUB_CLIENT_ID, pendingDeviceCode)
    pendingDeviceCode = null
    const login = await getLogin(token)
    await setGithubToken(token, login)
    return githubConfig()
  })

  ipcMain.handle(IPC.githubSetRemote, async (_e, url: string) => {
    const remote = normalizeRemoteUrl(url) // SSH → HTTPS (isomorphic-git no hace SSH)
    const settings = await loadSettings()
    settings.github = { ...settings.github, remote }
    await saveSettings(settings)
    if (vault.getInfo()) await gitService.setRemote(requireRoot(), remote)
    return githubConfig()
  })

  ipcMain.handle(IPC.githubSetAutoPush, async (_e, autoPush: boolean) => {
    const settings = await loadSettings()
    settings.github = { ...settings.github, autoPush }
    await saveSettings(settings)
    return githubConfig()
  })

  ipcMain.handle(IPC.githubDisconnect, async () => {
    await clearGithub()
    return githubConfig()
  })

  ipcMain.handle(IPC.gitPendingPush, async () => {
    const info = vault.getInfo()
    if (!info) return 0
    const { github } = await loadSettings()
    const branch = await gitService.currentBranch(info.root)
    const sinceOid = branch ? (github?.pushed?.[branch] ?? null) : null
    return gitService.aheadCount(info.root, sinceOid)
  })

  ipcMain.handle(IPC.gitPush, async () => {
    const settings = await loadSettings()
    const token = await getGithubToken()
    const url = normalizeRemoteUrl(settings.github?.remote ?? '') // arregla URLs SSH ya guardadas
    if (!token) throw new Error('Conectá tu cuenta de GitHub en Ajustes')
    if (!url) throw new Error('Configurá la URL del repo en Ajustes')

    const root = requireRoot()
    await gitService.setRemote(root, url)
    const { branch, oid } = await gitService.push(root, url, token)

    // Recordar el oid pusheado por rama, para el contador de pendientes.
    const pushed = { ...settings.github?.pushed, [branch]: oid }
    settings.github = { ...settings.github, pushed }
    await saveSettings(settings)
    return { branch, oid }
  })
}

/** Reabre el último vault si todavía existe. */
async function restoreLastVault(): Promise<void> {
  const { lastVault } = await loadSettings()
  if (!lastVault) return
  try {
    await vault.setRoot(lastVault)
    await gitService.ensureRepo(lastVault)
  } catch {
    // La carpeta se movió o borró: arrancamos sin vault, sin romper.
  }
}

app.whenReady().then(async () => {
  // Sin menú por defecto: sus aceleradores de edición (Ctrl+Y/Ctrl+Z/…)
  // secuestran las teclas antes de que lleguen al editor y rompen el redo.
  // El copiar/pegar sigue funcionando (lo maneja Chromium dentro del editor).
  Menu.setApplicationMenu(null)

  registerIpcHandlers()
  await restoreLastVault()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
