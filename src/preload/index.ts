import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type GeodeApi } from '@shared/ipc'

/**
 * Puente único hacia el renderer. Expone SOLO la superficie tipada `GeodeApi`;
 * nada de `ipcRenderer` crudo ni de Node. Si algo no está acá, el renderer no
 * puede hacerlo (ver ARCHITECTURE.md §2).
 */
const api: GeodeApi = {
  ping: () => ipcRenderer.invoke(IPC.ping),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo)
}

contextBridge.exposeInMainWorld('geode', api)
