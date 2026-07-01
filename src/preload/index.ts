import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type GeodeApi } from '@shared/ipc'

/**
 * Puente único hacia el renderer. Expone SOLO la superficie tipada `GeodeApi`;
 * nada de `ipcRenderer` crudo ni de Node. Si algo no está acá, el renderer no
 * puede hacerlo (ver ARCHITECTURE.md §2).
 */
const api: GeodeApi = {
  ping: () => ipcRenderer.invoke(IPC.ping),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  vault: {
    open: () => ipcRenderer.invoke(IPC.vaultOpen),
    current: () => ipcRenderer.invoke(IPC.vaultCurrent),
    tree: () => ipcRenderer.invoke(IPC.vaultTree),
    readNote: (path) => ipcRenderer.invoke(IPC.vaultReadNote, path),
    writeNote: (path, content) => ipcRenderer.invoke(IPC.vaultWriteNote, path, content),
    createNote: (dir) => ipcRenderer.invoke(IPC.vaultCreateNote, dir)
  },
  git: {
    commit: (message) => ipcRenderer.invoke(IPC.gitCommit, message),
    graph: () => ipcRenderer.invoke(IPC.gitGraph),
    checkout: (oid) => ipcRenderer.invoke(IPC.gitCheckout, oid)
  }
}

contextBridge.exposeInMainWorld('geode', api)
