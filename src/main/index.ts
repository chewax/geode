import { app, shell, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron'
import { join, basename } from 'path'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import iconPng from '../../resources/icon.png?asset'
import iconIco from '../../resources/icon.ico?asset'
import {
  IPC,
  type AppInfo,
  type AiConfig,
  type GithubConfig,
  type NamedVersion,
  type SnapshotsConfig,
  type AdvancedConfig,
  type VaultInfo
} from '@shared/ipc'

// Ícono de la app (ventana + barra de tareas). Usamos el PNG porque nativeImage
// lo carga de forma confiable en cualquier escala; el .ico queda para el
// empaquetado del ejecutable (electron-builder). Lo cargamos como nativeImage
// para poder verificar que la ruta resolvió (si no, se ve el ícono de Electron).
const ICON_PATH = iconPng
const APP_ICON = nativeImage.createFromPath(ICON_PATH)
if (APP_ICON.isEmpty()) {
  console.warn(`[icon] no se pudo cargar el ícono en: ${ICON_PATH} (existe=${existsSync(ICON_PATH)})`)
} else {
  console.log(`[icon] cargado: ${ICON_PATH} ${JSON.stringify(APP_ICON.getSize())}`)
}
// Silenciamos el "no usado" del .ico mientras no haya empaquetador.
void iconIco
import { VaultService } from './services/vault'
import { GitService } from './services/git'
import { OpenRouterProvider, listOpenRouterModels, getOpenRouterUsage } from './services/ai'
import {
  requestDeviceCode,
  pollForToken,
  getLogin,
  normalizeRemoteUrl,
  listRepos,
  createRepo,
  type DeviceCode
} from './services/github'
import {
  loadSettings,
  saveSettings,
  rememberVault,
  forgetVault,
  setAiKey,
  clearAiKey,
  getAiKey,
  setGithubToken,
  getGithubToken,
  clearGithub,
  getPluginsEnabled,
  setPluginEnabled,
  setSnapshotCadence,
  setSnapshotAiTitles,
  setAdvanced
} from './services/settings'
import { listPlugins, openPluginsDir, readPluginSource } from './services/plugins'

// OAuth App de Geode (client IDs son públicos; device flow no usa secret).
const GITHUB_CLIENT_ID = 'Ov23liOW1wfZr6QhxLVY'

const vault = new VaultService()
const gitService = new GitService()

/** Device flow en curso, entre startDeviceFlow y completeDeviceFlow. */
let pendingDeviceCode: DeviceCode | null = null

/** Timer de snapshots automáticos del vault activo; null = sin cadencia (manual). */
let snapshotTimer: NodeJS.Timeout | null = null

/** Guarda de re-entrada del cierre: evita el loop infinito en before-quit. */
let quitting = false

/**
 * Guarda de re-entrada de la cadencia con IA: solo un snapshot de cadencia con IA
 * corre a la vez. Sin esto, una tick (~10s de ventana de IA) puede solaparse con
 * otra tick y disparar una segunda llamada de IA (COST, visible al usuario) cuyo
 * título se descartaría, más un commit concurrente redundante sobre el mismo repo.
 * NO afecta a los paths de ciclo de vida (allowAi=false): esos corren siempre.
 */
let cadenceSnapshotInFlight = false

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

/**
 * Mensaje marcador de los snapshots automáticos. DISTINTO de autoCommitMessage()
 * (que es el fallback del commit manual): al ser un mensaje explícito, el snapshot
 * NUNCA invoca a la IA (SNAP-04) y se reconoce en la timeline por su etiqueta.
 */
function snapshotMessage(): string {
  return 'Instantánea automática — ' + new Date().toLocaleString()
}

/**
 * Genera el mensaje del snapshot con IA (título + descripción del diff .md), o
 * null si no corresponde/falla. Devuelve null cuando falta key o modelo, cuando
 * no hay cambios .md que resumir, o ante cualquier error/timeout. NUNCA lanza:
 * su null hace caer al marcador `snapshotMessage()` sin perder el snapshot.
 *
 * Tope de 10s (mismo patrón que `getOpenRouterUsage`) vía AbortController: si la
 * red se cuelga, el timeout aborta el fetch y el commit ocurre igual con el
 * marcador. El timer se limpia SIEMPRE en `finally`, así no queda un handle armado
 * manteniendo vivo el event loop tras ganar la carrera la IA. Un abort/timeout
 * hace lanzar al fetch, lo captura el catch de abajo y devuelve null (marcador).
 */
async function aiSnapshotMessage(root: string): Promise<string | null> {
  try {
    const key = await getAiKey()
    const { ai } = await loadSettings()
    if (!key || !ai?.model) return null // sin key/modelo: no hay IA posible

    // El diff ya viene acotado a notas .md (content-hash vs HEAD, nunca statusMatrix).
    const diff = await gitService.pendingDiff(root)
    if (!diff) return null // sin cambios .md que resumir

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const generado = await new OpenRouterProvider(key, ai.model).generateNamedVersion(
        diff,
        ctrl.signal
      )
      // Mismo formato que el guardado manual (CommitDialog): título + descripción.
      const mensaje = [generado.title, generado.description].filter(Boolean).join('\n\n')
      return mensaje || null
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    console.warn('[snapshot] IA falló, se usa el marcador:', e)
    return null
  }
}

/**
 * Toma un snapshot del vault activo SOLO si hay cambios. Centraliza el "si cambió,
 * commiteá" reusado por el timer (cadencia), el cambio/baja de bóveda y el cierre.
 * NUNCA lanza: corre también en la ruta de salida de la app. `commit()` ya devuelve
 * null en un árbol limpio (SNAP-02), así que no hace falta un pre-check con changes()
 * (sería una ventana TOCTOU).
 *
 * `allowAi`: la IA SOLO se intenta en el path de cadencia (allowAi=true) y solo si
 * el opt-in `snapshots.aiTitles` está ON; ahí el mensaje sale de `aiSnapshotMessage`
 * y cae al marcador si falta key/modelo o la IA falla/timeout. Los paths de ciclo de
 * vida (cierre, cambio/baja de bóveda) pasan allowAi=false: nunca red en la salida.
 */
async function snapshotIfChanged(reason: string, allowAi: boolean): Promise<string | null> {
  const info = vault.getInfo()
  if (!info) return null // sin vault: no-op, sin lanzar

  // `useAi` decide el path de IA. El `&&` corta el short-circuit antes de loadSettings:
  // los paths de ciclo de vida (allowAi=false) nunca tocan disco ni red.
  const useAi = allowAi && resolveAiTitles((await loadSettings()).snapshots?.aiTitles)

  // Guarda de re-entrada SOLO para la cadencia con IA: si ya hay una en curso, esta
  // tick no-opea (return null) en vez de arrancar una segunda llamada de IA/commit.
  // Los paths de ciclo de vida (useAi=false) NUNCA se bloquean: caen directo al marcador.
  if (useAi && cadenceSnapshotInFlight) return null
  if (useAi) cadenceSnapshotInFlight = true

  try {
    let mensaje = snapshotMessage()
    if (useAi) {
      const aiMsg = await aiSnapshotMessage(info.root)
      mensaje = aiMsg ?? snapshotMessage()
    }
    return await gitService.commit(info.root, mensaje)
  } catch (e) {
    console.warn('[snapshot] falló (' + reason + '):', e)
    return null
  } finally {
    // Se libera siempre: un fallo no puede dejar la guarda trabada permanentemente.
    if (useAi) cadenceSnapshotInFlight = false
  }
}

/** Cadencias válidas en minutos (además de null = manual). Única fuente de verdad. */
const SNAPSHOT_CADENCES = new Set([5, 10, 15, 30])

/**
 * Cadencia efectiva desde la config: `undefined` (nunca configurado) → 10 (default
 * ON); `null` (Manual explícito) → null; cualquier otro valor (0, negativo, basura
 * de un settings.json corrupto o editado a mano) → null. Así ni el timer ni la UI
 * derivan nunca un `setInterval` de 0 ms (defensa en profundidad, T-04-01).
 */
function resolveCadenceMinutes(raw: number | null | undefined): number | null {
  if (raw === undefined) return 10
  if (raw === null) return null
  return SNAPSHOT_CADENCES.has(raw) ? raw : null
}

/**
 * Opt-in efectivo de títulos por IA desde la config: SOLO `true` habilita la IA
 * (ausente, null o basura de un settings.json corrupto/editado a mano → false,
 * default seguro OFF). Misma defensa en profundidad que `resolveCadenceMinutes`
 * (T-09-02): nunca se enciende la IA por un valor no confiable.
 */
function resolveAiTitles(raw: boolean | undefined): boolean {
  return raw === true
}

/**
 * (Re)inicia el timer de snapshots según la cadencia guardada. Se llama al abrir/
 * cambiar de bóveda y al cambiar la cadencia. El clear + set van juntos DESPUÉS del
 * await (no antes): si no, dos llamadas concurrentes —cambios rápidos de bóveda o
 * un set de cadencia cruzándose con un vaultOpen— podrían dejar un intervalo
 * huérfano (ambas limpian `null` y luego ambas asignan).
 */
async function restartSnapshotTimer(): Promise<void> {
  const { snapshots } = await loadSettings()
  const minutes = resolveCadenceMinutes(snapshots?.cadenceMinutes)
  if (snapshotTimer) {
    clearInterval(snapshotTimer)
    snapshotTimer = null
  }
  if (minutes == null) return // Manual (o cadencia inválida): sin timer
  snapshotTimer = setInterval(() => {
    void snapshotIfChanged('cadencia', true)
  }, minutes * 60_000)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon: APP_ICON,
    // Ventana sin marco nativo: usamos una title bar custom (ver App.tsx).
    frame: false,
    backgroundColor: '#16161a',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // Seguridad (ver ARCHITECTURE.md §2 y §9): el renderer corre aislado,
      // sin acceso a Node. Todo pasa por el puente del preload vía IPC.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!APP_ICON.isEmpty()) mainWindow.setIcon(APP_ICON)
    mainWindow.show()
  })

  // Avisar al renderer cuando cambia el estado de maximizado (para el ícono).
  const emitMaxState = (): void =>
    mainWindow.webContents.send(IPC.windowMaximizeChanged, mainWindow.isMaximized())
  mainWindow.on('maximize', emitMaxState)
  mainWindow.on('unmaximize', emitMaxState)

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

  // Controles de la ventana (title bar custom, ventana frameless).
  ipcMain.on(IPC.windowMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on(IPC.windowMaximizeToggle, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on(IPC.windowClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle(
    IPC.windowIsMaximized,
    (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  )

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
      await rememberVault(info.root)
      await restartSnapshotTimer() // rebind el timer de snapshots al nuevo vault
    }
    return info
  })

  ipcMain.handle(IPC.vaultCurrent, () => vault.getInfo())

  ipcMain.handle(IPC.vaultList, async (): Promise<VaultInfo[]> => {
    const { knownVaults } = await loadSettings()
    const out: VaultInfo[] = []
    for (const root of knownVaults ?? []) {
      try {
        if ((await stat(root)).isDirectory()) out.push({ root, name: basename(root) })
      } catch {
        // La carpeta se movió o borró: la omitimos del selector.
      }
    }
    return out
  })

  ipcMain.handle(IPC.vaultSwitch, async (_e, root: string): Promise<VaultInfo | null> => {
    try {
      // Instantánea de seguridad de la bóveda actual antes de cambiar: corre ANTES
      // de setRoot para que snapshotIfChanged (que lee vault.getInfo()) commitee el
      // root viejo/activo, no el nuevo. El orden es load-bearing (SNAP-03).
      await snapshotIfChanged('cambio-de-boveda', false)
      const info = await vault.setRoot(root)
      await gitService.ensureRepo(info.root)
      await rememberVault(info.root)
      await restartSnapshotTimer() // rebind el timer de snapshots al nuevo vault
      return info
    } catch {
      return null
    }
  })

  ipcMain.handle(
    IPC.vaultRemove,
    async (_e, root: string, opts: { fromDisk: boolean }): Promise<VaultInfo | null> => {
      // SEGURIDAD (mitiga T-07-05-01): solo damos de baja bóvedas conocidas. Nunca
      // pasamos a shell.trashItem una ruta arbitraria que venga del renderer.
      const { knownVaults } = await loadSettings()
      if (!(knownVaults ?? []).includes(root)) throw new Error('Bóveda desconocida')

      const wasActive = vault.getInfo()?.root === root

      // Instantánea de seguridad de la bóveda activa antes de soltarla, para no
      // perder cambios sin commitear (mismo patrón que vaultSwitch).
      if (wasActive) {
        await snapshotIfChanged('baja-de-boveda', false)
      }

      if (opts.fromDisk) {
        // Si es la activa, la soltamos primero para no tener la carpeta "abierta"
        // al enviarla a la papelera.
        if (wasActive) vault.clearRoot()
        try {
          await shell.trashItem(root)
        } catch (e) {
          const motivo = e instanceof Error ? e.message : String(e)
          // Falló la papelera: NO quitamos nada de knownVaults (T-07-05-04).
          throw new Error(
            `No se pudo enviar la carpeta a la papelera: ${motivo}. La bóveda sigue en la lista.`
          )
        }
      }

      const nextRoot = await forgetVault(root) // quita de knownVaults + reasigna lastVault

      if (wasActive) {
        if (nextRoot) {
          await vault.setRoot(nextRoot)
          await gitService.ensureRepo(nextRoot)
        } else {
          vault.clearRoot()
        }
        await restartSnapshotTimer() // rebind del timer al nuevo/ausente vault
      }

      return vault.getInfo()
    }
  )

  ipcMain.handle(
    IPC.vaultCloneFromGithub,
    async (_e, cloneUrl: string): Promise<VaultInfo | null> => {
      const token = await getGithubToken()
      if (!token) throw new Error('Conectá tu cuenta de GitHub en Ajustes')
      const dir = await vault.pickFolder('Elegí una carpeta VACÍA donde clonar el repo')
      if (!dir) return null
      if (!(await vault.isEmptyDir(dir))) {
        throw new Error('La carpeta no está vacía. Elegí (o creá) una carpeta vacía para clonar.')
      }
      const url = normalizeRemoteUrl(cloneUrl)
      await gitService.clone(dir, url, token)
      const info = await vault.setRoot(dir)
      await gitService.setRemote(dir, url)
      const settings = await loadSettings()
      settings.github = { ...settings.github, remote: url }
      await saveSettings(settings)
      await rememberVault(dir)
      return info
    }
  )

  ipcMain.handle(
    IPC.vaultCreateWithRepo,
    async (_e, name: string, isPrivate: boolean): Promise<VaultInfo | null> => {
      const token = await getGithubToken()
      if (!token) throw new Error('Conectá tu cuenta de GitHub en Ajustes')
      const dir = await vault.pickFolder('Elegí la carpeta para la bóveda nueva')
      if (!dir) return null
      await gitService.ensureRepo(dir) // init repo local (rama main)
      const repo = await createRepo(token, name, isPrivate) // crea el repo en GitHub
      const info = await vault.setRoot(dir)
      await gitService.setRemote(dir, repo.cloneUrl)
      const settings = await loadSettings()
      settings.github = { ...settings.github, remote: repo.cloneUrl }
      await saveSettings(settings)
      await rememberVault(dir)
      return info
    }
  )

  ipcMain.handle(
    IPC.vaultCreateLocal,
    async (_e, name: string, useCustomLocation?: boolean): Promise<VaultInfo | null> => {
      // Base del cuaderno: por defecto ~/Documents/Geode; con el escape "Elegir otra
      // ubicación" se usa la carpeta elegida como PADRE (el picker devuelve null si
      // el usuario cancela → no-op).
      let baseDir: string
      if (useCustomLocation) {
        const parent = await vault.pickFolder('Elegí dónde crear tu cuaderno')
        if (!parent) return null
        baseDir = parent
      } else {
        baseDir = join(app.getPath('documents'), 'Geode')
      }

      try {
        // ORDEN LOAD-BEARING (RESEARCH Pitfall #1): sembrar la nota (dentro de
        // createLocal) → ensureRepo → commit. Si se commiteara antes de sembrar,
        // pendingChanges estaría vacío y commit no-opearía a null: sin primera
        // versión. Con el seed ya en disco, este primer commit NUNCA es null.
        // El mensaje es texto fijo en español; NO se invoca IA (la creación y los
        // auto-snapshots no invocan IA — CLAUDE.md).
        const { root } = await vault.createLocal(name, baseDir)
        await gitService.ensureRepo(root) // git init (rama main), idempotente
        await gitService.commit(root, 'Primera versión') // primer commit racy-safe del seed
        // setRoot recién ACÁ: el cuaderno se vuelve "activo" solo tras init+commit OK,
        // igual que vaultCreateWithRepo/vaultCloneFromGithub. Así una falla parcial no
        // deja el main apuntando a una carpeta huérfana sin repo (WR-01).
        const info = await vault.setRoot(root)
        await rememberVault(info.root)
        await restartSnapshotTimer() // rebind el timer de snapshots al nuevo cuaderno
        return info
      } catch (e) {
        const codigo = (e as NodeJS.ErrnoException)?.code
        if (codigo === 'EACCES' || codigo === 'EPERM') {
          // No filtramos el stack crudo al renderer (T-11-05): mensaje humano.
          throw new Error(
            'No se pudo crear el cuaderno. Revisá que tengas permiso de escritura en la carpeta.'
          )
        }
        throw e
      }
    }
  )

  ipcMain.handle(IPC.vaultTree, () => vault.tree())
  ipcMain.handle(IPC.vaultReadNote, (_e, path: string) => vault.readNote(path))
  ipcMain.handle(IPC.vaultWriteNote, (_e, path: string, content: string) =>
    vault.writeNote(path, content)
  )
  ipcMain.handle(IPC.vaultCreateNote, (_e, dir: string) => vault.createNote(dir))
  ipcMain.handle(IPC.vaultCreateFolder, (_e, dir: string) => vault.createFolder(dir))
  ipcMain.handle(IPC.vaultRename, (_e, from: string, to: string) => vault.rename(from, to))
  ipcMain.handle(IPC.vaultDelete, (_e, path: string) => vault.deletePath(path))
  // La ruta se resuelve con vault.absPath (validada por resolveInside): nunca se
  // pasa una ruta cruda del renderer al shell del SO.
  ipcMain.handle(IPC.vaultReveal, (_e, path: string) => {
    const abs = vault.absPath(path)
    try {
      shell.showItemInFolder(abs)
    } catch (e) {
      console.error('[vault] no se pudo revelar en el explorador:', abs, e)
      throw e
    }
  })
  ipcMain.handle(IPC.vaultDuplicate, (_e, path: string) => vault.duplicate(path))

  ipcMain.handle(IPC.gitCommit, (_e, message?: string) =>
    gitService.commit(requireRoot(), message ?? autoCommitMessage())
  )
  ipcMain.handle(IPC.gitGraph, async () => {
    const { github } = await loadSettings()
    return gitService.graph(requireRoot(), Object.values(github?.pushed ?? {}))
  })
  ipcMain.handle(IPC.gitCheckout, (_e, oid: string) => gitService.checkout(requireRoot(), oid))
  ipcMain.handle(IPC.gitChanges, () => gitService.changes(requireRoot()))
  ipcMain.handle(IPC.gitPendingLineStat, () => gitService.pendingLineStat(requireRoot()))
  ipcMain.handle(IPC.gitCreateBranch, (_e, fromOid: string, name?: string) =>
    gitService.createBranch(requireRoot(), fromOid, name ?? '')
  )
  ipcMain.handle(IPC.gitMergeBranch, () => gitService.mergeBranch(requireRoot()))
  ipcMain.handle(IPC.gitCommitDiff, (_e, oid: string) => gitService.commitDiff(requireRoot(), oid))
  ipcMain.handle(IPC.gitAddTag, (_e, oid: string, name: string) =>
    gitService.addTag(requireRoot(), oid, name)
  )
  ipcMain.handle(IPC.gitRemoveTag, (_e, name: string) => gitService.removeTag(requireRoot(), name))
  ipcMain.handle(IPC.gitDeleteBranch, (_e, name: string) =>
    gitService.deleteBranch(requireRoot(), name)
  )
  ipcMain.handle(IPC.gitNoteHistory, (_e, path: string) =>
    gitService.noteHistory(requireRoot(), path)
  )
  ipcMain.handle(IPC.gitReadNoteAt, (_e, oid: string, path: string) =>
    gitService.readAt(requireRoot(), oid, path)
  )
  ipcMain.handle(IPC.gitTreeAt, (_e, oid: string) => gitService.treeAt(requireRoot(), oid))
  ipcMain.handle(IPC.gitRestoreTree, (_e, oid: string) => gitService.restoreTree(requireRoot(), oid))
  ipcMain.handle(IPC.gitChangedFiles, (_e, oid: string) =>
    gitService.changedFiles(requireRoot(), oid)
  )

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

  ipcMain.handle(IPC.aiSuggestVersion, async (): Promise<NamedVersion> => {
    const key = await getAiKey()
    const { ai } = await loadSettings()
    if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')

    // El diff ya viene acotado a notas .md desde pendingDiff.
    const diff = await gitService.pendingDiff(requireRoot())
    if (!diff) return { title: '', description: '' }

    return new OpenRouterProvider(key, ai.model).generateNamedVersion(diff)
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

  ipcMain.handle(IPC.aiUsage, async () => {
    const key = await getAiKey()
    return key ? getOpenRouterUsage(key) : null
  })

  // ── Snapshots automáticos (cadencia + timer) ────────────────────────────────

  ipcMain.handle(IPC.snapshotsGet, async (): Promise<SnapshotsConfig> => {
    const { snapshots } = await loadSettings()
    // Mismo resolver que el timer: undefined→10 ON, null→manual, inválido→manual.
    return {
      cadenceMinutes: resolveCadenceMinutes(snapshots?.cadenceMinutes),
      aiTitles: resolveAiTitles(snapshots?.aiTitles)
    }
  })

  ipcMain.handle(
    IPC.snapshotsSet,
    async (_e, cadenceMinutes: number | null): Promise<SnapshotsConfig> => {
      // Validación (T-04-01): solo null|5|10|15|30. Cualquier otro valor (0,
      // negativos, basura) se coacciona a Manual para que nunca llegue a
      // setInterval como un bucle de 0 ms. Reusa el set único SNAPSHOT_CADENCES.
      let safe: number | null = cadenceMinutes
      if (cadenceMinutes !== null && !SNAPSHOT_CADENCES.has(cadenceMinutes)) {
        console.warn('[snapshot] cadencia inválida, usando manual:', cadenceMinutes)
        safe = null
      }
      await setSnapshotCadence(safe)
      await restartSnapshotTimer()
      return { cadenceMinutes: safe, aiTitles: resolveAiTitles((await loadSettings()).snapshots?.aiTitles) }
    }
  )

  ipcMain.handle(
    IPC.snapshotsSetAiTitles,
    async (_e, enabled: boolean): Promise<SnapshotsConfig> => {
      // Coerción booleana pura (T-09-01): nunca se persiste el valor crudo del
      // renderer. El flag no afecta la cadencia, así que NO se reinicia el timer.
      await setSnapshotAiTitles(!!enabled)
      const { snapshots } = await loadSettings()
      return { cadenceMinutes: resolveCadenceMinutes(snapshots?.cadenceMinutes), aiTitles: !!enabled }
    }
  )

  // ── Modo Avanzado (interruptor de las superficies git) ──────────────────────

  ipcMain.handle(IPC.advancedGet, async (): Promise<AdvancedConfig> => {
    const { advanced } = await loadSettings()
    // Ausente = off: la experiencia por defecto es sin git.
    return { enabled: advanced?.enabled ?? false }
  })

  ipcMain.handle(IPC.advancedSet, async (_e, enabled: boolean): Promise<AdvancedConfig> => {
    // Coerción booleana pura (T-05-01): nunca se persiste el valor crudo.
    await setAdvanced(!!enabled)
    return { enabled: !!enabled }
  })

  // ── Plugins externos (descubrimiento + gestión; la carga la hace el renderer) ─

  ipcMain.handle(IPC.pluginsList, async () => listPlugins(await getPluginsEnabled()))

  // Solo lectura: devuelve el mapa crudo `settings.plugins.enabled` sin mutar nada.
  ipcMain.handle(IPC.pluginsGetEnabled, async () => getPluginsEnabled())

  ipcMain.handle(IPC.pluginsOpenDir, () => openPluginsDir())

  ipcMain.handle(IPC.pluginsSetEnabled, async (_e, id: string, enabled: boolean) => {
    await setPluginEnabled(id, enabled)
    return listPlugins(await getPluginsEnabled())
  })

  ipcMain.handle(IPC.pluginsReadSource, async (_e, id: string) =>
    readPluginSource(id, await getPluginsEnabled())
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

  ipcMain.handle(IPC.githubListRepos, async () => {
    const token = await getGithubToken()
    if (!token) throw new Error('Conectá tu cuenta de GitHub en Ajustes')
    return listRepos(token)
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
    await rememberVault(lastVault) // asegura que el último vault esté en knownVaults
    await restartSnapshotTimer() // arranca el timer de snapshots del vault restaurado
  } catch {
    // La carpeta se movió o borró: arrancamos sin vault, sin romper.
  }
}

app.whenReady().then(async () => {
  // En Windows, el AppUserModelID asocia la ventana con el ícono/identidad de la
  // app en la barra de tareas (sin esto usa el ícono genérico de Electron).
  if (process.platform === 'win32') app.setAppUserModelId('com.geode.app')

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

// Instantánea de seguridad al cerrar la app (SNAP-03): sólo si hay cambios.
// isomorphic-git es asíncrono, así que "snapshot síncrono antes de salir" se
// implementa bloqueando el cierre (preventDefault) hasta que el commit resuelve,
// y recién ahí app.quit(). La guarda `quitting` deja pasar la segunda pasada del
// evento (evita el loop infinito). snapshotIfChanged nunca lanza, así que un
// snapshot fallido no puede bloquear el cierre: la app siempre termina saliendo.
// Limitación MVP: en la ruta window-all-closed → app.quit() el renderer ya puede
// estar desmontado, así que los últimos edits sin debounce (<600 ms) pueden no
// estar en disco todavía; se acepta para MVP (el timer periódico captura el resto).
app.on('before-quit', (event) => {
  if (quitting) return // segunda pasada: dejar salir
  event.preventDefault()
  quitting = true
  void (async () => {
    // La app SIEMPRE debe poder cerrar: si el commit se colgara, salimos igual
    // tras un tope de 3 s en vez de dejar el proceso vivo sin ventana.
    const limite = new Promise<null>((r) => setTimeout(() => r(null), 3000))
    await Promise.race([snapshotIfChanged('cierre', false), limite])
    app.quit() // re-dispara before-quit; la guarda lo deja pasar
  })()
})
