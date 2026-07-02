import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type GeodeApi } from '@shared/ipc'

/**
 * Puente único hacia el renderer. Expone SOLO la superficie tipada `GeodeApi`;
 * nada de `ipcRenderer` crudo ni de Node. Si algo no está acá, el renderer no
 * puede hacerlo (ver ARCHITECTURE.md §2).
 */
const api: GeodeApi = {
  ping: () => ipcRenderer.invoke(IPC.ping),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowMaximizeToggle),
    close: () => ipcRenderer.send(IPC.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
    onMaximizeChange: (cb) => {
      const handler = (_e: IpcRendererEvent, maximized: boolean): void => cb(maximized)
      ipcRenderer.on(IPC.windowMaximizeChanged, handler)
      return () => ipcRenderer.removeListener(IPC.windowMaximizeChanged, handler)
    }
  },
  vault: {
    open: () => ipcRenderer.invoke(IPC.vaultOpen),
    current: () => ipcRenderer.invoke(IPC.vaultCurrent),
    list: () => ipcRenderer.invoke(IPC.vaultList),
    switch: (root) => ipcRenderer.invoke(IPC.vaultSwitch, root),
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
    changes: () => ipcRenderer.invoke(IPC.gitChanges),
    push: () => ipcRenderer.invoke(IPC.gitPush),
    pendingPush: () => ipcRenderer.invoke(IPC.gitPendingPush),
    createBranch: (fromOid, name) => ipcRenderer.invoke(IPC.gitCreateBranch, fromOid, name),
    mergeBranch: () => ipcRenderer.invoke(IPC.gitMergeBranch),
    addTag: (oid, name) => ipcRenderer.invoke(IPC.gitAddTag, oid, name),
    removeTag: (name) => ipcRenderer.invoke(IPC.gitRemoveTag, name),
    deleteBranch: (name) => ipcRenderer.invoke(IPC.gitDeleteBranch, name)
  },
  github: {
    getConfig: () => ipcRenderer.invoke(IPC.githubGetConfig),
    startDeviceFlow: () => ipcRenderer.invoke(IPC.githubStartDeviceFlow),
    completeDeviceFlow: () => ipcRenderer.invoke(IPC.githubCompleteDeviceFlow),
    setRemote: (url) => ipcRenderer.invoke(IPC.githubSetRemote, url),
    setAutoPush: (autoPush) => ipcRenderer.invoke(IPC.githubSetAutoPush, autoPush),
    disconnect: () => ipcRenderer.invoke(IPC.githubDisconnect)
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
      ipcRenderer.invoke(IPC.aiGenerateText, instruction, selection, before),
    usage: () => ipcRenderer.invoke(IPC.aiUsage)
  }
}

contextBridge.exposeInMainWorld('geode', api)
