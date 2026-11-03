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
    cloneFromGithub: (cloneUrl) => ipcRenderer.invoke(IPC.vaultCloneFromGithub, cloneUrl),
    createWithRepo: (name, isPrivate) =>
      ipcRenderer.invoke(IPC.vaultCreateWithRepo, name, isPrivate),
    createLocal: (name, useCustomLocation) =>
      ipcRenderer.invoke(IPC.vaultCreateLocal, name, useCustomLocation),
    tree: () => ipcRenderer.invoke(IPC.vaultTree),
    readNote: (path) => ipcRenderer.invoke(IPC.vaultReadNote, path),
    writeNote: (path, content) => ipcRenderer.invoke(IPC.vaultWriteNote, path, content),
    createNote: (dir) => ipcRenderer.invoke(IPC.vaultCreateNote, dir),
    createFolder: (dir) => ipcRenderer.invoke(IPC.vaultCreateFolder, dir),
    rename: (from, to) => ipcRenderer.invoke(IPC.vaultRename, from, to),
    delete: (path) => ipcRenderer.invoke(IPC.vaultDelete, path),
    revealInExplorer: (path) => ipcRenderer.invoke(IPC.vaultReveal, path),
    duplicate: (path) => ipcRenderer.invoke(IPC.vaultDuplicate, path),
    remove: (root, opts) => ipcRenderer.invoke(IPC.vaultRemove, root, opts),
    createNoteAt: (path, content) => ipcRenderer.invoke(IPC.vaultCreateNoteAt, path, content),
    search: (query) => ipcRenderer.invoke(IPC.vaultSearch, query),
    backlinks: (path) => ipcRenderer.invoke(IPC.vaultBacklinks, path),
    updateLinks: (from, to) => ipcRenderer.invoke(IPC.vaultUpdateLinks, from, to),
    saveAttachment: (name, data, notePath) => ipcRenderer.invoke(IPC.vaultSaveAttachment, name, data, notePath ?? null),
    tags: () => ipcRenderer.invoke(IPC.vaultTags),
    obsidianConfig: () => ipcRenderer.invoke(IPC.vaultObsidianConfig),
    getBookmarks: () => ipcRenderer.invoke(IPC.vaultBookmarksGet),
    setBookmarks: (paths) => ipcRenderer.invoke(IPC.vaultBookmarksSet, paths),
    openExternal: (path) => ipcRenderer.invoke(IPC.vaultOpenExternal, path),
    exportPdf: (name) => ipcRenderer.invoke(IPC.vaultExportPdf, name)
  },
  git: {
    commit: (message) => ipcRenderer.invoke(IPC.gitCommit, message),
    graph: () => ipcRenderer.invoke(IPC.gitGraph),
    checkout: (oid) => ipcRenderer.invoke(IPC.gitCheckout, oid),
    changes: () => ipcRenderer.invoke(IPC.gitChanges),
    push: () => ipcRenderer.invoke(IPC.gitPush),
    pendingPush: () => ipcRenderer.invoke(IPC.gitPendingPush),
    onPulled: (cb) => {
      const handler = (_e: IpcRendererEvent, info?: { cloudCopies?: string[] }): void =>
        cb({ cloudCopies: info?.cloudCopies ?? [] })
      ipcRenderer.on(IPC.gitPulled, handler)
      return () => ipcRenderer.removeListener(IPC.gitPulled, handler)
    },
    createBranch: (fromOid, name) => ipcRenderer.invoke(IPC.gitCreateBranch, fromOid, name),
    mergeBranch: () => ipcRenderer.invoke(IPC.gitMergeBranch),
    commitDiff: (oid) => ipcRenderer.invoke(IPC.gitCommitDiff, oid),
    addTag: (oid, name) => ipcRenderer.invoke(IPC.gitAddTag, oid, name),
    removeTag: (name) => ipcRenderer.invoke(IPC.gitRemoveTag, name),
    deleteBranch: (name) => ipcRenderer.invoke(IPC.gitDeleteBranch, name),
    noteHistory: (path) => ipcRenderer.invoke(IPC.gitNoteHistory, path),
    readNoteAt: (oid, path) => ipcRenderer.invoke(IPC.gitReadNoteAt, oid, path),
    treeAt: (oid) => ipcRenderer.invoke(IPC.gitTreeAt, oid),
    restoreTree: (oid) => ipcRenderer.invoke(IPC.gitRestoreTree, oid),
    changedFiles: (oid) => ipcRenderer.invoke(IPC.gitChangedFiles, oid),
    pendingLineStat: () => ipcRenderer.invoke(IPC.gitPendingLineStat)
  },
  github: {
    getConfig: () => ipcRenderer.invoke(IPC.githubGetConfig),
    startDeviceFlow: () => ipcRenderer.invoke(IPC.githubStartDeviceFlow),
    completeDeviceFlow: () => ipcRenderer.invoke(IPC.githubCompleteDeviceFlow),
    setRemote: (url) => ipcRenderer.invoke(IPC.githubSetRemote, url),
    setAutoPush: (autoPush) => ipcRenderer.invoke(IPC.githubSetAutoPush, autoPush),
    disconnect: () => ipcRenderer.invoke(IPC.githubDisconnect),
    listRepos: () => ipcRenderer.invoke(IPC.githubListRepos)
  },
  backup: {
    enable: () => ipcRenderer.invoke(IPC.vaultEnableBackup),
    getOnboarding: () => ipcRenderer.invoke(IPC.backupOnboardingGet),
    setOnboarding: (state) => ipcRenderer.invoke(IPC.backupOnboardingSet, state),
    openSignup: () => ipcRenderer.invoke(IPC.backupOpenSignup)
  },
  i18n: {
    get: () => ipcRenderer.invoke(IPC.i18nGet),
    set: (pref) => ipcRenderer.invoke(IPC.i18nSet, pref)
  },
  tour: {
    get: () => ipcRenderer.invoke(IPC.tourGet),
    set: (state) => ipcRenderer.invoke(IPC.tourSet, state)
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC.aiGetConfig),
    setKey: (key) => ipcRenderer.invoke(IPC.aiSetKey, key),
    clearKey: () => ipcRenderer.invoke(IPC.aiClearKey),
    setModel: (model) => ipcRenderer.invoke(IPC.aiSetModel, model),
    setEnabled: (enabled) => ipcRenderer.invoke(IPC.aiSetEnabled, enabled),
    listModels: () => ipcRenderer.invoke(IPC.aiListModels),
    suggestMessage: () => ipcRenderer.invoke(IPC.aiSuggestMessage),
    suggestVersion: () => ipcRenderer.invoke(IPC.aiSuggestVersion),
    generateText: (instruction, selection, before) =>
      ipcRenderer.invoke(IPC.aiGenerateText, instruction, selection, before),
    usage: () => ipcRenderer.invoke(IPC.aiUsage),
    setDictationModel: (model) => ipcRenderer.invoke(IPC.aiSetDictationModel, model),
    transcribe: (wav) => ipcRenderer.invoke(IPC.aiTranscribe, wav)
  },
  snapshots: {
    get: () => ipcRenderer.invoke(IPC.snapshotsGet),
    set: (cadenceMinutes) => ipcRenderer.invoke(IPC.snapshotsSet, cadenceMinutes),
    setAiTitles: (enabled) => ipcRenderer.invoke(IPC.snapshotsSetAiTitles, enabled)
  },
  advanced: {
    get: () => ipcRenderer.invoke(IPC.advancedGet),
    set: (enabled) => ipcRenderer.invoke(IPC.advancedSet, enabled)
  },
  dictation: {
    onCommand: (cb) => {
      const handler = (_e: IpcRendererEvent, cmd: Parameters<typeof cb>[0]): void => cb(cmd)
      ipcRenderer.on(IPC.dictationCommand, handler)
      return () => ipcRenderer.removeListener(IPC.dictationCommand, handler)
    },
    reportStatus: (status) => ipcRenderer.send(IPC.dictationStatus, status),
    getShortcut: () => ipcRenderer.invoke(IPC.dictationGetShortcut)
  },
  plugins: {
    list: () => ipcRenderer.invoke(IPC.pluginsList),
    getEnabled: () => ipcRenderer.invoke(IPC.pluginsGetEnabled),
    openDir: () => ipcRenderer.invoke(IPC.pluginsOpenDir),
    setEnabled: (id, enabled) => ipcRenderer.invoke(IPC.pluginsSetEnabled, id, enabled),
    readSource: (id) => ipcRenderer.invoke(IPC.pluginsReadSource, id)
  }
}

contextBridge.exposeInMainWorld('geode', api)
