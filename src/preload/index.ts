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
    createNote: (dir) => ipcRenderer.invoke(IPC.vaultCreateNote, dir),
    createFolder: (dir) => ipcRenderer.invoke(IPC.vaultCreateFolder, dir),
    rename: (from, to) => ipcRenderer.invoke(IPC.vaultRename, from, to),
    delete: (path) => ipcRenderer.invoke(IPC.vaultDelete, path)
  },
  git: {
    commit: (message) => ipcRenderer.invoke(IPC.gitCommit, message),
    graph: () => ipcRenderer.invoke(IPC.gitGraph),
    checkout: (oid) => ipcRenderer.invoke(IPC.gitCheckout, oid),
    changes: () => ipcRenderer.invoke(IPC.gitChanges)
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC.aiGetConfig),
    setKey: (key) => ipcRenderer.invoke(IPC.aiSetKey, key),
    clearKey: () => ipcRenderer.invoke(IPC.aiClearKey),
    setModel: (model) => ipcRenderer.invoke(IPC.aiSetModel, model),
    setEnabled: (enabled) => ipcRenderer.invoke(IPC.aiSetEnabled, enabled),
    listModels: () => ipcRenderer.invoke(IPC.aiListModels),
    suggestMessage: () => ipcRenderer.invoke(IPC.aiSuggestMessage),
    generateText: (instruction, selection, before) =>
      ipcRenderer.invoke(IPC.aiGenerateText, instruction, selection, before)
  }
}

contextBridge.exposeInMainWorld('geode', api)
