import { app, shell, BrowserWindow, ipcMain, Menu, nativeImage, protocol } from 'electron'
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
  type VaultInfo,
  type BackupOnboarding,
  type BackupOnboardingState,
  type TourSnapshot,
  type TourState
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
import { OpenRouterProvider, listOpenRouterModels, getOpenRouterUsage, mapAiError, pickDictationModel } from './services/ai'
import { setupDictation, teardownDictation } from './dictation'
import {
  requestDeviceCode,
  pollForToken,
  getLogin,
  normalizeRemoteUrl,
  listRepos,
  createRepo,
  type DeviceCode
} from './services/github'
import { githubRepoSlug } from './fs/githubRepoSlug'
import { mapBackupError } from './services/backupErrors'
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
  setAdvanced,
  getBackupOnboarding,
  setBackupOnboarding,
  getTourState,
  setTourState,
  pushedForVault,
  withPushedForVault
} from './services/settings'
import { listPlugins, openPluginsDir, readPluginSource } from './services/plugins'
import { VAULT_SCHEME, mimeFor } from '@shared/attachments'
import { PLUGIN_SCHEME_PRIVILEGES, registerPluginSandboxProtocol } from './pluginSandbox'

// OAuth App de Geode (client IDs son públicos; device flow no usa secret).
const GITHUB_CLIENT_ID = 'Ov23liOW1wfZr6QhxLVY'

// Protocolo propio para servir imágenes de la bóveda al renderer sandboxeado
// (que no puede leer disco). Debe registrarse como privilegiado ANTES de `ready`.
protocol.registerSchemesAsPrivileged([
  { scheme: VAULT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  PLUGIN_SCHEME_PRIVILEGES
])

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

/**
 * Bóvedas (por root) con un snapshot en curso. Single-flight: dos commits
 * concurrentes sobre el mismo .git pueden pisarse el index (con adjuntos
 * grandes un commit puede tardar mucho y encimarse con la cadencia o con un
 * cambio de bóveda ida y vuelta). El que llega segundo se salta sin perder
 * nada: el primero captura el estado y el próximo tick agarra lo que falte.
 */
const snapshotsInFlight = new Set<string>()

async function githubConfig(): Promise<GithubConfig> {
  const { github } = await loadSettings()
  // El remoto reportado es el de LA BÓVEDA ACTIVA (su origin en `.git`), NUNCA el
  // global (CR-01): una bóveda sin respaldo propio muestra `remote=null` aunque
  // otra bóveda sí esté respaldada. `connected`/`login` sí son globales: la cuenta
  // de GitHub es una sola y se comparte entre bóvedas legítimamente.
  const info = vault.getInfo()
  const remote = info ? await gitService.getRemote(info.root) : null
  return {
    connected: !!github?.token,
    login: github?.login ?? null,
    remote,
    autoPush: github?.autoPush ?? false
  }
}

async function aiConfig(): Promise<AiConfig> {
  const { ai } = await loadSettings()
  return {
    enabled: ai?.enabled ?? false,
    model: ai?.model ?? null,
    dictationModel: ai?.dictationModel ?? null,
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
 *
 * `opts.awaitPush`: controla si se ESPERA al auto-push tras el commit. Default true
 * (cierre y cadencia lo esperan: el before-quit lo cubre con su race de 3s). El
 * cambio/baja de bóveda pasan false → push fire-and-forget, para no bloquear la UI
 * esperando la red (autoPushAfterCommit nunca lanza y tiene su propio try/catch).
 */
async function snapshotIfChanged(
  reason: string,
  allowAi: boolean,
  opts: { awaitPush?: boolean } = {}
): Promise<string | null> {
  const info = vault.getInfo()
  if (!info) return null // sin vault: no-op, sin lanzar

  // Single-flight POR BÓVEDA: si ya hay un snapshot de ESTE repo en curso (un
  // commit grande de la cadencia, o un cambio de bóveda rápido ida y vuelta),
  // este se salta. Dos commits concurrentes sobre el mismo .git pueden pisarse
  // el index; y el que está corriendo ya va a capturar el estado actual.
  if (snapshotsInFlight.has(info.root)) return null
  snapshotsInFlight.add(info.root)

  // `useAi` decide el path de IA. El `&&` corta el short-circuit antes de loadSettings:
  // los paths de ciclo de vida (allowAi=false) nunca tocan disco ni red.
  const useAi = allowAi && resolveAiTitles((await loadSettings()).snapshots?.aiTitles)

  // Guarda de re-entrada SOLO para la cadencia con IA: si ya hay una en curso, esta
  // tick no-opea (return null) en vez de arrancar una segunda llamada de IA/commit.
  // Los paths de ciclo de vida (useAi=false) NUNCA se bloquean: caen directo al marcador.
  if (useAi && cadenceSnapshotInFlight) {
    snapshotsInFlight.delete(info.root)
    return null
  }
  if (useAi) cadenceSnapshotInFlight = true

  try {
    let mensaje = snapshotMessage()
    if (useAi) {
      const aiMsg = await aiSnapshotMessage(info.root)
      mensaje = aiMsg ?? snapshotMessage()
    }
    const oid = await gitService.commit(info.root, mensaje)
    // Auto-push tras el commit real (no si fue no-op → oid null). Best-effort:
    // no bloquea ni rompe el snapshot (el before-quit lo envuelve en un race de 3s).
    // Si awaitPush=false (switch/baja de bóveda), se dispara fire-and-forget para
    // no bloquear la UI con la red; autoPushAfterCommit nunca lanza.
    if (oid) {
      if (opts.awaitPush === false) void autoPushAfterCommit(info.root)
      else await autoPushAfterCommit(info.root)
    }
    return oid
  } catch (e) {
    console.warn('[snapshot] falló (' + reason + '):', e)
    return null
  } finally {
    // Se libera siempre: un fallo no puede dejar la guarda trabada permanentemente.
    snapshotsInFlight.delete(info.root)
    if (useAi) cadenceSnapshotInFlight = false
  }
}

/**
 * Auto-push best-effort tras un commit REAL (BACKUP-04): si el respaldo está
 * activo (autoPush ON + remoto), sube los bytes ya commiteados al remoto sin
 * bloquear ni romper el guardado. NUNCA lanza (espejo del try/catch de
 * snapshotIfChanged): un push fallido se traga —el cuaderno sigue local y se
 * reintenta en el próximo commit— y queda reflejado por pushCount>0. NUNCA
 * invoca IA: solo sube bytes ya escritos (costo de red, no de IA — CLAUDE.md).
 * Corre solo tras un commit real, no por tecla.
 */
async function autoPushAfterCommit(root: string): Promise<void> {
  const s = await loadSettings()
  if (!s.github?.autoPush) return // respaldo apagado globalmente
  const token = await getGithubToken()
  if (!token) return // sin credencial: no se puede pushear, se reintenta luego
  // INVARIANTE DE SEGURIDAD (CR-01): el destino es SIEMPRE el origin propio de
  // ESTA bóveda (leído de su `.git`), nunca un remoto global. Si esta bóveda no
  // tiene origin (no está respaldada), es un NO-OP: es IMPOSIBLE que un commit de
  // la bóveda B termine en el repo de la bóveda A.
  const remote = await gitService.getRemote(root)
  if (!remote) return // esta bóveda no está respaldada: no se pushea nada
  try {
    const url = normalizeRemoteUrl(remote)
    // Trae e integra lo que haya en la nube antes de subir: si otro dispositivo
    // pusheó, un push a secas se rechazaba (non-fast-forward) para siempre.
    const { branch, oid, pulled, cloudCopies } = await gitService.sync(root, url, token)
    // Recordar el oid pusheado por rama PARA ESTA bóveda (el contador de
    // pendientes de esta bóveda vuelve a 0, sin tocar el de otras). Se recarga el
    // settings por si otra operación lo modificó durante el await del push.
    await saveSettings(withPushedForVault(await loadSettings(), root, branch, oid))
    // El disco cambió por debajo del renderer: avisarle para que recargue árbol
    // y notas abiertas (solo si la bóveda sincronizada sigue siendo la abierta).
    if (pulled && vault.getInfo()?.root === root) {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.gitPulled, { cloudCopies })
      }
    }
  } catch (e) {
    // Solo la superficie segura al log: nunca el objeto de error crudo (podría
    // arrastrar la URL con credencial embebida o headers de una futura versión de
    // isomorphic-git — WR-02). Espejo del patrón de errores de usuario del proyecto.
    console.warn(
      '[auto-push] falló, el cuaderno sigue local:',
      e instanceof Error ? e.message : String(e)
    )
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

/** Ventana principal (la que graba el dictado). */
let mainWindowRef: BrowserWindow | null = null

/** Errores del dictado en español humano, sin el crudo del proveedor. */
function mapDictationError(e: unknown): Error {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized')) {
    return new Error('No se pudo dictar: la clave de OpenRouter fue rechazada. Revisala en Ajustes → IA.')
  }
  if (msg.includes('402') || msg.includes('credit') || msg.includes('insufficient')) {
    return new Error('No se pudo dictar: tu cuenta de OpenRouter no tiene saldo suficiente.')
  }
  if (msg.includes('aborted') || msg.includes('timeout') || msg.includes('fetch failed') || msg.includes('network')) {
    return new Error('No se pudo dictar: no hay conexión con OpenRouter. Probá de nuevo en un momento.')
  }
  if (msg.includes('404') || msg.includes('no endpoints')) {
    return new Error('No se pudo dictar: el modelo de dictado ya no existe. Elegí otro en Ajustes → IA.')
  }
  return new Error('No se pudo transcribir el audio ahora. Probá de nuevo en un momento.')
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

  mainWindowRef = mainWindow
  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null
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
 * Sirve archivos de la bóveda vía `geode-vault://vault/<ruta>[?oid=<commit>]`.
 * La ruta pasa por `vault.readFileBytes` (resolveInside: sin path traversal). Con
 * `oid` se lee el blob de esa versión, para que la vista del pasado muestre las
 * imágenes tal como eran. Cualquier error → 404, sin filtrar rutas.
 */
function registerVaultProtocol(): void {
  protocol.handle(VAULT_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const rel = url.pathname
        .split('/')
        .filter(Boolean)
        .map((s) => decodeURIComponent(s))
        .join('/')
      const oid = url.searchParams.get('oid')
      const bytes = oid
        ? await gitService.readBytesAt(requireRoot(), oid, rel)
        : await vault.readFileBytes(rel)
      return new Response(Buffer.from(bytes), {
        headers: { 'content-type': mimeFor(rel), 'cache-control': 'no-cache' }
      })
    } catch {
      return new Response('No encontrado', { status: 404 })
    }
  })
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

  ipcMain.handle(IPC.vaultOpen, async (): Promise<VaultInfo | null> => {
    const info = await vault.openDialog()
    if (!info) return null
    await gitService.ensureRepo(info.root)
    // Carpeta existente sin versiones (p. ej. una bóveda de Obsidian): guardar
    // YA una primera versión de todo, así desde el primer minuto nada de lo que
    // trajo se puede perder (antes recién se versionaba en la primera cadencia).
    let result: VaultInfo = info
    if (!(await gitService.hasCommits(info.root))) {
      const { isObsidian } = await vault.obsidianConfig()
      const notes = (await vault.listFiles()).filter((p) => p.toLowerCase().endsWith('.md')).length
      await gitService.commit(info.root, isObsidian ? 'Primera versión (importada de Obsidian)' : 'Primera versión')
      result = { ...info, imported: { fromObsidian: isObsidian, notes } }
    }
    await rememberVault(info.root)
    await restartSnapshotTimer() // rebind el timer de snapshots al nuevo vault
    return result
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
      await snapshotIfChanged('cambio-de-boveda', false, { awaitPush: false })
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
      // perder cambios sin commitear (mismo patrón que vaultSwitch). El push solo
      // es fire-and-forget si la carpeta QUEDA en disco: si va a la papelera, hay
      // que esperarlo — es la última chance de respaldar, y un push leyendo .git
      // en paralelo con trashItem puede fallar con EBUSY en Windows.
      if (wasActive) {
        await snapshotIfChanged('baja-de-boveda', false, { awaitPush: opts.fromDisk })
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
      await gitService.setRemote(dir, url) // destino REAL de push: origin per-vault (CR-01)
      const settings = await loadSettings()
      // Compat: `github.remote` está @deprecated (ver settings.ts); ya NO es la
      // fuente del destino de push. Se sigue escribiendo sólo por retro-compat.
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
      await gitService.setRemote(dir, repo.cloneUrl) // destino REAL de push: origin per-vault (CR-01)
      const settings = await loadSettings()
      // Compat: `github.remote` está @deprecated (ver settings.ts); ya NO es la
      // fuente del destino de push. Se sigue escribiendo sólo por retro-compat.
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
        // ensureRepo/commit viven FUERA del try/catch de createLocal (que solo cubre
        // mkdir→seed), así que su falla no limpiaba la carpeta ya sembrada: quedaba un
        // cuaderno huérfano sin repo que forzaba el sufijo " (2)" en cada reintento
        // (WR-04). Se cubre esa ventana acá: si init/commit falla, se borra la carpeta
        // recién creada y se relanza el error original (la limpieza se traga con
        // `.catch` para no enmascararlo, y el catch externo mantiene el mensaje humano).
        try {
          await gitService.ensureRepo(root) // git init (rama main), idempotente
          await gitService.commit(root, 'Primera versión') // primer commit racy-safe del seed
        } catch (e) {
          await vault.discard(root).catch(() => {})
          throw e
        }
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
  ipcMain.handle(IPC.vaultCreateNoteAt, (_e, path: string, content: string) =>
    vault.createNoteAt(path, content)
  )
  ipcMain.handle(IPC.vaultSearch, (_e, query: string) => vault.search(String(query ?? '')))
  ipcMain.handle(IPC.vaultBacklinks, (_e, path: string) => vault.backlinks(path))
  ipcMain.handle(IPC.vaultSaveAttachment, (_e, name: string, data: Uint8Array, notePath: string | null) =>
    vault.saveAttachment(String(name ?? ''), new Uint8Array(data), typeof notePath === 'string' ? notePath : null)
  )
  ipcMain.handle(IPC.vaultTags, () => vault.tags())
  ipcMain.handle(IPC.vaultObsidianConfig, () => vault.obsidianConfig())
  // Ruta validada con resolveInside (absPath): nunca una ruta cruda al shell.
  ipcMain.handle(IPC.vaultOpenExternal, async (_e, path: string) => {
    const err = await shell.openPath(vault.absPath(path))
    if (err) throw new Error('No se pudo abrir el archivo con la aplicación del sistema')
  })
  // Actualizar enlaces tras renombrar/mover. Reescribir notas en masa es justo el
  // tipo de cambio que el usuario podría querer deshacer: si hay algo que tocar,
  // primero se toma una instantánea de seguridad (sin IA) — así el estado previo
  // queda en la línea de tiempo y "nunca perdés nada".
  ipcMain.handle(IPC.vaultUpdateLinks, async (_e, from: string, to: string): Promise<number> => {
    const plan = await vault.planLinkUpdates(from, to)
    if (plan.size === 0) return 0
    await snapshotIfChanged('antes de actualizar enlaces', false)
    await vault.applyLinkUpdates(plan)
    return plan.size
  })

  ipcMain.handle(IPC.gitCommit, async (_e, message?: string) => {
    const root = requireRoot()
    const oid = await gitService.commit(root, message ?? autoCommitMessage())
    // El guardado manual también se respalda solo (BACKUP-04) si el respaldo está
    // activo. Solo tras un commit real (oid no-null); best-effort, nunca IA.
    if (oid) await autoPushAfterCommit(root)
    return oid
  })
  ipcMain.handle(IPC.gitGraph, async () => {
    const root = requireRoot()
    // Refs pusheadas SCOPEADAS a esta bóveda (CR-01): el grafo marca como
    // "en la nube" solo lo que se pusheó del repo de ESTA bóveda, nunca oids de otra.
    const pushed = pushedForVault(await loadSettings(), root)
    return gitService.graph(root, Object.values(pushed))
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
    gitService.readAtOrNull(requireRoot(), oid, path)
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

  ipcMain.handle(IPC.aiSetDictationModel, async (_e, model: string | null) => {
    const settings = await loadSettings()
    const ai = { ...settings.ai }
    if (model) ai.dictationModel = model
    else delete ai.dictationModel
    settings.ai = ai
    await saveSettings(settings)
    return aiConfig()
  })

  // Dictado: transcribir el WAV grabado en el renderer. Usa la misma clave de
  // OpenRouter que el resto de la IA (el costo se ve en la barra de estado). El
  // modelo: el configurado para dictado si acepta audio; si no, uno automático.
  ipcMain.handle(IPC.aiTranscribe, async (_e, wavBase64: string): Promise<string> => {
    const key = await getAiKey()
    if (!key) throw new Error('Para dictar, configurá tu clave de OpenRouter en Ajustes → IA.')
    if (typeof wavBase64 !== 'string' || wavBase64.length === 0) return ''
    let model: string | null = null
    try {
      const { ai } = await loadSettings()
      model = pickDictationModel(await listOpenRouterModels(key), ai?.dictationModel ?? null)
    } catch (e) {
      throw mapDictationError(e)
    }
    if (!model) throw new Error('OpenRouter no ofrece ahora ningún modelo que entienda audio. Probá más tarde.')
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 120_000)
      try {
        return await new OpenRouterProvider(key, model).transcribe(wavBase64, controller.signal)
      } finally {
        clearTimeout(timer)
      }
    } catch (e) {
      throw mapDictationError(e)
    }
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
    try {
      const key = await getAiKey()
      const { ai } = await loadSettings()
      if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')

      const diff = await gitService.pendingDiff(requireRoot())
      if (!diff) return ''

      const provider = new OpenRouterProvider(key, ai.model)
      return await provider.generateMessage(diff)
    } catch (e) {
      // Boundary: traducimos a copy amigable en español y nunca filtramos el crudo.
      throw mapAiError(e)
    }
  })

  ipcMain.handle(IPC.aiSuggestVersion, async (): Promise<NamedVersion> => {
    try {
      const key = await getAiKey()
      const { ai } = await loadSettings()
      if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')

      // El diff ya viene acotado a notas .md desde pendingDiff.
      const diff = await gitService.pendingDiff(requireRoot())
      if (!diff) return { title: '', description: '' }

      return await new OpenRouterProvider(key, ai.model).generateNamedVersion(diff)
    } catch (e) {
      // Boundary: guardar versión no debe filtrar el error crudo del proveedor.
      throw mapAiError(e)
    }
  })

  ipcMain.handle(
    IPC.aiGenerateText,
    async (_e, instruction: string, selection: string, before: string): Promise<string> => {
      try {
        const key = await getAiKey()
        const { ai } = await loadSettings()
        if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')
        const provider = new OpenRouterProvider(key, ai.model)
        return await provider.generateText(instruction, selection, before)
      } catch (e) {
        // Boundary: el asistente de escritura tampoco filtra el crudo del proveedor.
        throw mapAiError(e)
      }
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
    // El wizard de respaldo consume este handler: TODO fallo (rate limit, caída de
    // GitHub, OAuth revocado) pasa por mapBackupError (BACKUP-05) para que solo
    // cruce el mensaje humano en español, nunca el texto crudo en inglés de la API.
    try {
      pendingDeviceCode = await requestDeviceCode(GITHUB_CLIENT_ID)
    } catch (e) {
      throw mapBackupError(e)
    }
    void shell.openExternal(pendingDeviceCode.verificationUri)
    return {
      userCode: pendingDeviceCode.userCode,
      verificationUri: pendingDeviceCode.verificationUri
    }
  })

  ipcMain.handle(IPC.githubCompleteDeviceFlow, async () => {
    if (!pendingDeviceCode) throw new Error('No hay un device flow en curso')
    // Igual que el start: el crudo de la API (device flow / getLogin) nunca llega
    // al wizard; se traduce a una de las copies humanas de mapBackupError (BACKUP-05).
    try {
      const token = await pollForToken(GITHUB_CLIENT_ID, pendingDeviceCode)
      pendingDeviceCode = null
      const login = await getLogin(token)
      await setGithubToken(token, login)
    } catch (e) {
      throw mapBackupError(e)
    }
    return githubConfig()
  })

  ipcMain.handle(IPC.githubSetRemote, async (_e, url: string) => {
    const remote = normalizeRemoteUrl(url) // SSH → HTTPS (isomorphic-git no hace SSH)
    const settings = await loadSettings()
    // Compat: `github.remote` está @deprecated (ver settings.ts); ya NO es la
    // fuente del destino de push. El destino REAL es el origin per-vault que se
    // fija abajo con gitService.setRemote. Se sigue escribiendo por retro-compat.
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
    // El contador de pendientes usa el estado pusheado DE ESTA bóveda (CR-01):
    // nunca el oid de otra bóveda (que no existiría en este log y contaría de más).
    const pushed = pushedForVault(await loadSettings(), info.root)
    const branch = await gitService.currentBranch(info.root)
    const sinceOid = branch ? (pushed[branch] ?? null) : null
    return gitService.aheadCount(info.root, sinceOid)
  })

  ipcMain.handle(IPC.gitPush, async () => {
    const token = await getGithubToken()
    if (!token) throw new Error('Conectá tu cuenta de GitHub en Ajustes')

    const root = requireRoot()
    // INVARIANTE DE SEGURIDAD (CR-01): el destino es el origin propio de ESTA
    // bóveda (leído de su `.git`), NUNCA el remoto global compartido. Ya no se
    // fuerza `setRemote(root, urlGlobal)`: eso podía apuntar la bóveda B al repo
    // de la bóveda A. Si esta bóveda no tiene origin, no hay respaldo que reintentar.
    const ownRemote = await gitService.getRemote(root)
    if (!ownRemote) {
      throw new Error('Este cuaderno todavía no tiene respaldo en la nube. Activalo primero.')
    }
    const url = normalizeRemoteUrl(ownRemote) // arregla URLs SSH ya guardadas

    // RESPALDO NUNCA VACÍO (BACKUP-03): si la bóveda todavía no tiene ninguna
    // versión (rama sin commits — típico al abrir una carpeta existente como
    // cuaderno), commiteamos su contenido actual como primera versión ANTES del
    // push. Sin esto, pushear una rama sin nacer falla con "Could not find <rama>".
    if (!(await gitService.hasCommits(root))) {
      await gitService.commit(root, 'Primera versión')
    }

    // Push manual (reintento del botón persistente): TODO fallo de git/API pasa
    // por mapBackupError (BACKUP-05) para que solo cruce el mensaje humano —
    // nunca el crudo de la API ni el token embebido en la URL (T-12-01/T-12-03).
    // `sync` trae e integra lo de la nube ANTES de pushear: si otro dispositivo
    // subió cambios, el push a secas se rechazaba (non-fast-forward) siempre.
    let branch: string
    let oid: string
    let pulled: boolean
    let cloudCopies: string[]
    try {
      const res = await gitService.sync(root, url, token)
      branch = res.branch
      oid = res.oid
      pulled = res.pulled
      cloudCopies = res.cloudCopies
    } catch (e) {
      throw mapBackupError(e)
    }

    // Recordar el oid pusheado por rama PARA ESTA bóveda, para el contador de pendientes.
    await saveSettings(withPushedForVault(await loadSettings(), root, branch, oid))
    return { branch, oid, pulled, cloudCopies }
  })

  // ── Respaldo en la nube (enable + onboarding + signup) ──────────────────────

  // Orquestador del primer respaldo (BACKUP-03): encadena createRepo(private)→
  // setRemote→push reusando las primitivas ya probadas, persiste pushed[branch],
  // activa autoPush (BACKUP-04) y marca el onboarding como completado. Es
  // idempotente en el reintento (si ya hay remoto, va directo al push) y traduce
  // TODO error al español con mapBackupError (BACKUP-05): nunca cruza crudo ni el
  // token al renderer (devuelve solo GithubConfig, sin repo/commit/push).
  ipcMain.handle(IPC.vaultEnableBackup, async (): Promise<GithubConfig> => {
    // El wizard ya conectó la cuenta antes de llamar acá; si falta el token es un
    // fallo de auth que el renderer muestra con la copy de "reconectá".
    const token = await getGithubToken()
    if (!token) throw mapBackupError({ status: 401 })

    const root = requireRoot()
    const info = vault.getInfo()
    if (!info) throw new Error('No hay cuaderno abierto')

    // IDEMPOTENCIA + INVARIANTE DE SEGURIDAD (CR-01): la decisión de "ya está
    // respaldada" se toma sobre el origin PROPIO de ESTA bóveda (`git.getRemote`),
    // NUNCA sobre un remoto global. Antes, el remoto global de la bóveda A hacía
    // que el wizard abierto en la bóveda B saltara createRepo y pusheara B al repo
    // de A. Ahora: si ESTA bóveda no tiene origin, se crea su repo; si ya lo tiene
    // (reintento tras un push fallido), se reusa el suyo, nunca el de otra.
    let remote = await gitService.getRemote(root)
    if (!remote) {
      // AUTO-SUFIJO EN COLISIÓN DE NOMBRE (mejora UAT Fase 12): el nombre del repo
      // es AUTODERIVADO del nombre del cuaderno e INVISIBLE — el usuario nunca lo
      // elige — así que una colisión (422 name-taken) NO debe fallar nunca. En vez
      // de mostrar "ya tenés un respaldo con ese nombre", reintentamos con sufijo
      // incremental (mi-cuaderno, mi-cuaderno-2, mi-cuaderno-3…) hasta que uno
      // libre entre. Es consistente con el auto-sufijo de CARPETAS locales de la
      // Fase 11, y además es MÁS SEGURO (CR-01): garantiza un repo NUEVO y distinto,
      // nunca reusa uno ajeno ya existente (que arriesgaría un push cruzado).
      const MAX_ATTEMPTS = 20 // cota dura: imposible loop infinito
      const base = githubRepoSlug(info.name)
      let attempt = 1
      let slug = base
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const repo = await createRepo(token, slug, true) // private=true
          remote = repo.cloneUrl
          break
        } catch (e) {
          // Clasificamos con la MISMA lógica de siempre (no re-parseamos el crudo).
          const mapped = mapBackupError(e)
          // Solo el choque de nombre se reintenta; auth/offline/unknown lanzan YA
          // (sin reintentos inútiles ante un fallo de red o de credenciales). Al
          // agotar la cota también lanzamos: en el caso imposible de 20 nombres
          // tomados, el usuario recibe igual un mensaje humano.
          if (mapped.kind !== 'name-taken' || attempt >= MAX_ATTEMPTS) throw mapped
          attempt += 1
          slug = `${base}-${attempt}` // mi-cuaderno-2, mi-cuaderno-3, …
        }
      }
      await gitService.setRemote(root, remote) // origin propio de ESTA bóveda
    }

    // RESPALDO NUNCA VACÍO (BACKUP-03): el onboarding siembra Bienvenida.md como
    // "Primera versión", pero una bóveda EXISTENTE abierta como cuaderno puede no
    // tener ninguna versión todavía (rama sin nacer). Commiteamos su contenido
    // actual antes del push para que "el push nunca sea vacío" valga para cualquier
    // bóveda, no solo las sembradas — sin esto el push falla con "Could not find".
    if (!(await gitService.hasCommits(root))) {
      await gitService.commit(root, 'Primera versión')
    }

    // Primer respaldo: push de la primera versión (sembrada o recién commiteada).
    let branch: string
    let oid: string
    try {
      const url = normalizeRemoteUrl(remote)
      const res = await gitService.push(root, url, token)
      branch = res.branch
      oid = res.oid
    } catch (e) {
      throw mapBackupError(e)
    }

    // Persistir el oid pusheado PARA ESTA bóveda (contador de pendientes), encender
    // autoPush (BACKUP-04) y marcar el onboarding como completado.
    const next = withPushedForVault(await loadSettings(), root, branch, oid)
    next.github = { ...next.github, autoPush: true }
    await saveSettings(next)
    await setBackupOnboarding('completado')

    return githubConfig()
  })

  ipcMain.handle(
    IPC.backupOnboardingGet,
    async (): Promise<BackupOnboarding> => ({ state: await getBackupOnboarding() })
  )

  ipcMain.handle(
    IPC.backupOnboardingSet,
    async (_e, state: BackupOnboardingState): Promise<BackupOnboarding> => {
      // Coerción defensiva (T-12-08): solo persistimos uno de los 3 estados
      // válidos; nunca el valor crudo del renderer. Si llega basura, no mutamos y
      // devolvemos el estado actual.
      const valid: BackupOnboardingState[] = ['invitado', 'diferido', 'completado']
      if (!valid.includes(state)) return { state: await getBackupOnboarding() }
      await setBackupOnboarding(state)
      return { state }
    }
  )

  ipcMain.handle(
    IPC.tourGet,
    async (): Promise<TourSnapshot> => ({ state: await getTourState() })
  )

  ipcMain.handle(
    IPC.tourSet,
    async (_e, state: TourState): Promise<TourSnapshot> => {
      // Coerción defensiva (T-13-01): solo persistimos uno de los 3 estados
      // válidos; nunca el valor crudo del renderer. Si llega basura, no mutamos
      // y devolvemos el estado actual.
      const valid: TourState[] = ['unseen', 'started', 'seen']
      if (!valid.includes(state)) return { state: await getTourState() }
      await setTourState(state)
      return { state }
    }
  )

  ipcMain.handle(IPC.backupOpenSignup, async (): Promise<void> => {
    // URL FIJA hardcodeada (T-12-06): el handler NO recibe ninguna URL del
    // renderer, así que no hay superficie de arbitrary-URL launch / open-redirect.
    void shell.openExternal('https://github.com/signup')
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
  registerVaultProtocol()
  setupDictation(() => mainWindowRef)
  registerPluginSandboxProtocol()
  await restoreLastVault()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => teardownDictation())

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
