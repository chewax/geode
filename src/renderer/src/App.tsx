import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  FilePlus,
  FolderPlus,
  Settings as SettingsIcon,
  Save,
  GitBranch,
  Pencil,
  Trash2,
  X,
  UploadCloud,
  GitMerge,
  GitBranchPlus,
  Cloud,
  Coins,
  ArrowDownUp,
  FoldVertical,
  UnfoldVertical,
  HelpCircle,
  Eye,
  PenLine,
  History,
  Command as CommandIcon
} from 'lucide-react'
import logoUrl from './assets/geode_logo_dark.png'
import type { AiConfig, AiUsage, GitGraph, GithubConfig, TreeNode, VaultInfo } from '@shared/ipc'
import { CodeMirrorEditor, type EditorContext, type EditorHandle } from './editor/CodeMirrorEditor'
import { FileTree } from './FileTree'
import { VaultSwitcher } from './VaultSwitcher'
import { BranchSwitcher } from './BranchSwitcher'
import { BranchDialog } from './BranchDialog'
import { MarkdownPreview } from './MarkdownPreview'
import { DiffView } from './DiffView'
import { WindowControls } from './WindowControls'
import { VersionGraph } from './VersionGraph'
import { TimelineScrubber } from './TimelineScrubber'
import { NewVaultDialog } from './NewVaultDialog'
import { CommitDialog } from './CommitDialog'
import { SettingsModal } from './SettingsModal'
import { AiPromptModal } from './AiPromptModal'
import {
  PluginHost,
  GeodeProvider,
  CommandPalette,
  PluginPanels,
  PluginStatusItems,
  activatePlugins,
  loadExternalPlugins,
  BUILTIN_PLUGINS
} from './plugins'

type SaveStatus = 'none' | 'clean' | 'saving' | 'saved'
const AUTOSAVE_MS = 600

export function App(): JSX.Element {
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [vaults, setVaults] = useState<VaultInfo[]>([])
  const [newVaultOpen, setNewVaultOpen] = useState(false)
  const [tree, setTree] = useState<TreeNode[]>([])
  // Explorador estilo Obsidian: orden A-Z/Z-A y colapsar/expandir todo.
  const [sortAsc, setSortAsc] = useState(true)
  const [allExpanded, setAllExpanded] = useState(true)
  const [collapseVersion, setCollapseVersion] = useState(0)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('none')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [preview, setPreview] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [graph, setGraph] = useState<GitGraph | null>(null)
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commitChanges, setCommitChanges] = useState<string[] | null>(null)
  // Commit desde el cual crear una rama (abre el diálogo de nombre); null = cerrado.
  const [branchFrom, setBranchFrom] = useState<string | null>(null)
  // Commit cuyo diff se está viendo (abre el visor de cambios); null = cerrado.
  const [diffOid, setDiffOid] = useState<string | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ node: TreeNode; x: number; y: number } | null>(null)
  const [tabs, setTabs] = useState<string[]>([])
  const tabsRef = useRef<string[]>([])
  tabsRef.current = tabs
  const editorRef = useRef<EditorHandle>(null)
  const [aiEdit, setAiEdit] = useState<EditorContext | null>(null)
  const [githubCfg, setGithubCfg] = useState<GithubConfig | null>(null)
  const [pushCount, setPushCount] = useState(0)
  const [pushing, setPushing] = useState(false)
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null)
  const [aiUsageErr, setAiUsageErr] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Host de plugins: se crea una sola vez (estable entre renders).
  const hostRef = useRef<PluginHost | null>(null)
  if (!hostRef.current) hostRef.current = new PluginHost()
  const host = hostRef.current

  // Journal: guardado pendiente + timer de autosave, en refs.
  const pendingRef = useRef<{ path: string; content: string } | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const openPathRef = useRef<string | null>(null)
  openPathRef.current = openPath
  const headOidRef = useRef<string | null>(null)
  headOidRef.current = graph?.head.oid ?? null

  const refreshVaults = useCallback(async () => {
    setVaults(await window.geode.vault.list())
  }, [])

  const refreshTree = useCallback(async () => {
    const t = await window.geode.vault.tree()
    setTree(t)
    return t
  }, [])

  const refreshGraph = useCallback(async () => {
    setGraph(await window.geode.git.graph())
  }, [])

  const refreshGithub = useCallback(async () => {
    const cfg = await window.geode.github.getConfig()
    setGithubCfg(cfg)
    setPushCount(cfg.connected && cfg.remote ? await window.geode.git.pendingPush() : 0)
  }, [])

  const refreshAiUsage = useCallback(async () => {
    try {
      setAiUsage(await window.geode.ai.usage())
      setAiUsageErr(null)
    } catch (e) {
      // No lo escondemos: si falla, el popover muestra el motivo en vez de
      // quedarse "Cargando…" para siempre.
      setAiUsageErr((e as Error).message || 'Error desconocido')
    }
  }, [])

  const doPush = useCallback(async () => {
    setPushing(true)
    try {
      const res = await window.geode.git.push()
      host.emit('sync:after', { branch: res.branch, oid: res.oid })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo pushear')
    } finally {
      setPushing(false)
      await refreshGithub()
      await refreshGraph() // mover el chip "en GitHub" al commit recién pusheado
    }
  }, [refreshGithub, refreshGraph, host])

  /** Journal: persiste a disco lo pendiente (autosave). NO commitea. */
  const flush = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    await window.geode.vault.writeNote(pending.path, pending.content)
    setStatus('saved')
    setSavedAt(new Date())
  }, [])

  const handleChange = useCallback((doc: string) => {
    const path = openPathRef.current
    if (!path) return
    setContent(doc)
    pendingRef.current = { path, content: doc }
    setStatus('saving')
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
    host.emit('note:change', { path, content: doc })
    // Sin auto-branch: editar commitea en la rama actual (incluida main). Las
    // ramas se crean a mano con el botón de rama.
  }, [flush, host])

  const loadIntoEditor = useCallback((path: string, text: string) => {
    setOpenPath(path)
    setContent(text)
    setEditorEpoch((e) => e + 1) // fuerza remonte del editor con el nuevo texto
    setStatus('clean')
    host.emit('note:open', { path, content: text })
  }, [host])

  const openNote = useCallback(async (path: string) => {
    await flush() // journal: no perder lo tipeado al cambiar de nota
    const text = await window.geode.vault.readNote(path)
    loadIntoEditor(path, text)
    setTabs((t) => (t.includes(path) ? t : [...t, path])) // abrir como tab
  }, [flush, loadIntoEditor])

  /**
   * Restaura el contenido de una versión vieja de la nota activa: lo escribe como
   * cambio pendiente (no reescribe historia). El usuario decide guardarlo como una
   * versión nueva con Ctrl+S.
   */
  const restoreVersion = useCallback(async (content: string) => {
    const path = openPathRef.current
    if (!path) return
    await window.geode.vault.writeNote(path, content)
    loadIntoEditor(path, content)
    setStatus('saved') // en disco (journal); todavía no es una versión guardada
    setSavedAt(new Date())
    setTimelineOpen(false)
    await refreshGraph()
  }, [loadIntoEditor, refreshGraph])

  /** Cierra una tab; si era la activa, pasa a una vecina (o vacía el editor). */
  const closeTab = useCallback(async (path: string) => {
    await flush()
    const prev = tabsRef.current
    const idx = prev.indexOf(path)
    const next = prev.filter((p) => p !== path)
    setTabs(next)
    if (path === openPathRef.current) {
      const fallback = next[idx] ?? next[idx - 1] ?? null
      if (fallback) await openNote(fallback)
      else {
        setOpenPath(null)
        setContent('')
        setStatus('none')
      }
    }
  }, [flush, openNote])

  /** Adopta una bóveda como activa y refresca todo (árbol, grafo, github, lista). */
  const adoptVault = useCallback(async (info: VaultInfo) => {
    setVault(info)
    setOpenPath(null)
    setContent('')
    setStatus('none')
    setTabs([])
    host.emit('vault:switch', { root: info.root, name: info.name })
    await refreshTree()
    await refreshGraph()
    await refreshGithub()
    await refreshVaults()
  }, [refreshTree, refreshGraph, refreshGithub, refreshVaults, host])

  const openVault = useCallback(async () => {
    const info = await window.geode.vault.open()
    if (info) await adoptVault(info)
  }, [adoptVault])

  /** Cambia a una bóveda ya conocida (selector de bóveda). */
  const switchVault = useCallback(async (root: string) => {
    const info = await window.geode.vault.switch(root)
    if (!info) {
      await refreshVaults() // la carpeta ya no existe: la sacamos del selector
      return
    }
    await adoptVault(info)
  }, [adoptVault, refreshVaults])

  const newNoteIn = useCallback(async (dir: string) => {
    const node = await window.geode.vault.createNote(dir)
    await refreshTree()
    await openNote(node.path)
    setEditingPath(node.path) // permitir nombrarla al toque
  }, [refreshTree, openNote])

  const newFolderIn = useCallback(async (dir: string) => {
    const node = await window.geode.vault.createFolder(dir)
    await refreshTree()
    setEditingPath(node.path)
  }, [refreshTree])

  const renameNode = useCallback(async (node: TreeNode, rawName: string) => {
    setEditingPath(null)
    const clean = rawName.replace(/[\\/]/g, '').trim()
    if (!clean) return
    const parent = parentDir(node.path)
    const filename = node.isDir ? clean : `${clean.replace(/\.md$/i, '')}.md`
    const toRel = parent ? `${parent}/${filename}` : filename
    if (toRel === node.path) return
    try {
      await window.geode.vault.rename(node.path, toRel)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo renombrar')
      return
    }
    // Reflejar en el editor y en las tabs si se renombró/movió la nota o carpeta.
    const remap = (p: string): string =>
      p === node.path ? toRel : p.startsWith(`${node.path}/`) ? toRel + p.slice(node.path.length) : p
    const cur = openPathRef.current
    if (cur) setOpenPath(remap(cur))
    setTabs((prev) => prev.map(remap))
    await refreshTree()
  }, [refreshTree])

  const deleteNode = useCallback(async (node: TreeNode) => {
    const label = node.isDir ? node.name : node.name.replace(/\.md$/i, '')
    const ok = window.confirm(
      `¿Eliminar "${label}"?${node.isDir ? ' Se borra toda la carpeta y su contenido.' : ''}`
    )
    if (!ok) return
    await window.geode.vault.delete(node.path)
    setTabs((prev) => prev.filter((p) => p !== node.path && !p.startsWith(`${node.path}/`)))
    const cur = openPathRef.current
    if (cur === node.path || (cur && cur.startsWith(`${node.path}/`))) {
      setOpenPath(null)
      setContent('')
      setStatus('none')
    }
    await refreshTree()
  }, [refreshTree])

  /** Abre el diálogo de "Guardar versión" si hay cambios pendientes. */
  const openCommitDialog = useCallback(async () => {
    await flush()
    const changes = await window.geode.git.changes()
    if (changes.length === 0) {
      setStatus('clean')
      return
    }
    setCommitChanges(changes)
  }, [flush])

  /** Confirmación del diálogo: crea la versión (commit permanente). */
  const doCommit = useCallback(async (message: string) => {
    const fallback = `Versión ${new Date().toLocaleString()}`
    host.emit('note:beforeSave', { path: openPathRef.current })
    await window.geode.git.commit(message || fallback)
    setCommitChanges(null)
    await refreshGraph()
    await refreshGithub()
    void refreshAiUsage() // el mensaje pudo haber usado la IA
    host.emit('note:afterSave', { path: openPathRef.current })
    // El push es SIEMPRE manual (botón Push). Guardar versión nunca sube al remoto.
  }, [refreshGraph, refreshGithub, refreshAiUsage, host])

  /** Ir a una versión: checkout. Avisa si hay cambios sin versionar (se perderían). */
  const goToVersion = useCallback(async (oid: string) => {
    await flush()
    const pending = await window.geode.git.changes()
    if (pending.length > 0) {
      const ok = window.confirm(
        `Tenés ${pending.length} cambio(s) sin guardar como versión.\n` +
          'Si vas a otra versión ahora, se descartan.\n\n' +
          'Cancelá y usá "Guardar versión" para conservarlos.'
      )
      if (!ok) return
    }
    await window.geode.git.checkout(oid)
    const t = await refreshTree()
    // Las tabs que ya no existen en esta versión se cierran.
    const existing = new Set(flattenPaths(t))
    setTabs((prev) => prev.filter((p) => existing.has(p)))
    const path = openPathRef.current
    if (path && existing.has(path)) {
      const text = await window.geode.vault.readNote(path)
      loadIntoEditor(path, text)
    } else {
      setOpenPath(null)
      setContent('')
      setStatus('none')
    }
    await refreshGraph()
    await refreshGithub()
  }, [flush, refreshTree, loadIntoEditor, refreshGraph, refreshGithub])

  /** Integra la rama actual a su rama de origen (base) y cambia a la base. */
  const mergeBranch = useCallback(async () => {
    await flush()
    // No perder cambios sin versionar: se guardan como una versión antes del merge.
    if ((await window.geode.git.changes()).length > 0) {
      await window.geode.git.commit(`Cambios ${new Date().toLocaleString()}`)
    }
    await window.geode.git.mergeBranch()
    const t = await refreshTree()
    const path = openPathRef.current
    if (path && new Set(flattenPaths(t)).has(path)) {
      loadIntoEditor(path, await window.geode.vault.readNote(path))
    } else {
      setOpenPath(null)
      setContent('')
      setStatus('none')
    }
    await refreshGraph()
    await refreshGithub()
  }, [flush, refreshTree, loadIntoEditor, refreshGraph, refreshGithub])

  /**
   * Crea una rama desde un commit (por defecto HEAD) y cambia a ella. Si sale de
   * otra versión, avisa si hay cambios sin versionar (el checkout los descarta).
   */
  const createBranchAt = useCallback(async (fromOid: string, name: string) => {
    await flush()
    const switching = fromOid !== headOidRef.current
    if (switching) {
      const pending = await window.geode.git.changes()
      if (
        pending.length > 0 &&
        !window.confirm(
          `Tenés ${pending.length} cambio(s) sin guardar como versión.\n` +
            'Crear la rama desde otra versión los descarta.\n\n¿Continuar?'
        )
      ) {
        return
      }
    }
    try {
      await window.geode.git.createBranch(fromOid, name)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo crear la rama')
      return
    }
    const t = await refreshTree()
    const p = openPathRef.current
    if (p && new Set(flattenPaths(t)).has(p)) {
      loadIntoEditor(p, await window.geode.vault.readNote(p))
    } else {
      setOpenPath(null)
      setContent('')
      setStatus('none')
    }
    await refreshGraph()
    await refreshGithub()
  }, [flush, refreshTree, loadIntoEditor, refreshGraph, refreshGithub])

  /** Etiqueta un commit (tag de git). Avisa si el nombre ya existe. */
  const addTag = useCallback(async (oid: string, name: string) => {
    try {
      await window.geode.git.addTag(oid, name)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo agregar la etiqueta')
      return
    }
    await refreshGraph()
  }, [refreshGraph])

  const removeTag = useCallback(async (name: string) => {
    await window.geode.git.removeTag(name)
    await refreshGraph()
  }, [refreshGraph])

  /** Borra/descarta una rama. Confirma según esté fusionada o no. Devuelve si se borró. */
  const deleteBranch = useCallback(async (name: string, merged: boolean): Promise<boolean> => {
    const warn = merged
      ? `La rama "${name}" ya está fusionada: se puede descartar sin perder versiones.`
      : `⚠ La rama "${name}" tiene versiones que NO están en su base. Si la borrás, se pierden.`
    if (!window.confirm(`${warn}\n\n¿Borrar la rama?`)) return false
    await flush()
    try {
      await window.geode.git.deleteBranch(name)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo borrar la rama')
      return false
    }
    // Borrar la rama actual cambia a su base: recargar árbol/editor.
    const t = await refreshTree()
    const p = openPathRef.current
    if (p && new Set(flattenPaths(t)).has(p)) {
      loadIntoEditor(p, await window.geode.vault.readNote(p))
    } else {
      setOpenPath(null)
      setContent('')
      setStatus('none')
    }
    await refreshGraph()
    await refreshGithub()
    return true
  }, [flush, refreshTree, loadIntoEditor, refreshGraph, refreshGithub])

  const toggleGraph = useCallback(() => setGraphOpen((open) => !open), [])

  /** Ctrl+K en el editor: abre el asistente de IA sobre la selección/cursor. */
  const requestAi = useCallback(() => {
    if (!aiConfig?.hasKey || !aiConfig?.model) {
      window.alert('Configurá la API key y el modelo de IA en Ajustes (⚙).')
      return
    }
    const ctx = editorRef.current?.getContext()
    if (ctx) setAiEdit(ctx)
  }, [aiConfig])

  // Al arrancar: restaurar vault y cargar config de IA/GitHub.
  useEffect(() => {
    void (async () => {
      const cfg = await window.geode.ai.getConfig()
      setAiConfig(cfg)
      if (cfg.hasKey) void refreshAiUsage()
      await refreshGithub() // también sin bóveda: la pantalla de bienvenida lo usa
      const info = await window.geode.vault.current()
      if (!info) return
      setVault(info)
      await refreshTree()
      await refreshGraph()
      await refreshVaults()
    })()
  }, [refreshTree, refreshGraph, refreshGithub, refreshAiUsage, refreshVaults])

  // Ctrl/Cmd+S: abre el diálogo de guardar versión.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void openCommitDialog()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCommitDialog])

  const stats = useMemo(() => {
    const chars = content.length
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    const lines = content.split('\n').length
    return { chars, words, lines }
  }, [content])

  const sortedTree = useMemo(() => sortTree(tree, sortAsc), [tree, sortAsc])

  /** Colapsa o expande todas las carpetas del árbol de una. */
  const toggleCollapseAll = useCallback(() => {
    setAllExpanded((v) => !v)
    setCollapseVersion((n) => n + 1)
  }, [])

  const hasHead = !!graph?.head.oid
  // Se puede mergear si la rama actual tiene una base a la cual integrar.
  const canMerge = !!graph?.branches.find((b) => b.name === graph.head.branch)?.base
  const aiReady = !!aiConfig && aiConfig.enabled && aiConfig.hasKey && !!aiConfig.model

  // ── Plugins ───────────────────────────────────────────────────────────────
  // Acciones de la app en un ref siempre fresco: los comandos se registran una
  // sola vez pero invocan los callbacks/estado actuales (sin closures viejas).
  const commandApi = {
    saveVersion: () => void openCommitDialog(),
    newNote: () => void newNoteIn(''),
    newFolder: () => void newFolderIn(''),
    togglePreview: () => setPreview((p) => !p),
    toggleGraph,
    createBranch: () => { if (graph?.head.oid) setBranchFrom(graph.head.oid) },
    merge: () => void mergeBranch(),
    push: () => void doPush(),
    hasOpenPath: !!openPath,
    hasHead,
    canMerge,
    pushEnabled: !!(githubCfg?.connected && githubCfg.remote) && pushCount > 0 && !pushing
  }
  const commandApiRef = useRef(commandApi)
  commandApiRef.current = commandApi

  // Montaje único: puente a la UI (editor imperativo + toast), activación de los
  // plugins internos y registro de los comandos del núcleo en la paleta.
  useEffect(() => {
    host.setBridge({
      editor: {
        insertAtCursor: (t) => editorRef.current?.insertAtCursor(t),
        getSelection: () => editorRef.current?.getSelection() ?? '',
        revealRange: (f, t) => editorRef.current?.revealRange(f, t)
      },
      notify: (m) => setToast(m)
    })
    const offPlugins = activatePlugins(host, BUILTIN_PLUGINS)

    // Plugins externos: la carga es async (lee la fuente por IPC y la evalúa),
    // así que se activan aparte y se limpian en el unmount aunque lleguen tarde.
    let offExternal: { dispose: () => void } | null = null
    let cancelled = false
    void (async () => {
      const { plugins, errors } = await loadExternalPlugins()
      if (cancelled) return
      offExternal = activatePlugins(host, plugins)
      if (errors.length > 0) {
        setToast(`Plugins con error: ${errors.map((e) => e.id).join(', ')}`)
      }
    })()

    const api = (): typeof commandApiRef.current => commandApiRef.current
    const cmds = [
      host.registerCommand({ id: 'core.saveVersion', title: 'Guardar versión', category: 'Núcleo', shortcut: 'Ctrl+S', run: () => api().saveVersion() }),
      host.registerCommand({ id: 'core.newNote', title: 'Nueva nota', category: 'Núcleo', run: () => api().newNote() }),
      host.registerCommand({ id: 'core.newFolder', title: 'Nueva carpeta', category: 'Núcleo', run: () => api().newFolder() }),
      host.registerCommand({ id: 'core.togglePreview', title: 'Alternar vista previa', category: 'Vista', run: () => api().togglePreview(), isEnabled: () => api().hasOpenPath }),
      host.registerCommand({ id: 'core.toggleGraph', title: 'Alternar árbol de versiones', category: 'Vista', run: () => api().toggleGraph() }),
      host.registerCommand({ id: 'core.createBranch', title: 'Crear rama desde la versión actual', category: 'Git', run: () => api().createBranch(), isEnabled: () => api().hasHead }),
      host.registerCommand({ id: 'core.merge', title: 'Integrar rama a su base', category: 'Git', run: () => api().merge(), isEnabled: () => api().canMerge }),
      host.registerCommand({ id: 'core.push', title: 'Push a GitHub', category: 'Git', run: () => api().push(), isEnabled: () => api().pushEnabled })
    ]
    return () => {
      cancelled = true
      cmds.forEach((c) => c.dispose())
      offPlugins.dispose()
      offExternal?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ctrl/Cmd+P: abre la paleta de comandos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Toast: se desvanece solo.
  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2500)
    return () => window.clearTimeout(id)
  }, [toast])

  // Red de seguridad: si el preload no cargó, window.geode no existe.
  if (typeof window.geode === 'undefined') {
    return (
      <div className="welcome">
        <div className="welcome-drag" />
        <h1>Geode</h1>
        <p className="tagline error">
          El puente con el sistema (preload) no cargó. Reiniciá la app; si persiste,
          revisá la consola del proceso principal.
        </p>
      </div>
    )
  }

  if (!vault) {
    return (
      <div className="welcome">
        <div className="welcome-drag">
          <WindowControls />
        </div>
        <h1>Geode</h1>
        <p className="tagline">Notas versionadas sobre Git — local-first.</p>
        <div className="welcome-actions">
          <button className="primary" onClick={() => void openVault()}>
            Abrir carpeta como vault
          </button>
          <button onClick={() => setNewVaultOpen(true)}>Clonar o crear en GitHub</button>
        </div>
        {newVaultOpen && (
          <NewVaultDialog
            githubConnected={!!githubCfg?.connected}
            onReady={(info) => {
              setNewVaultOpen(false)
              void adoptVault(info)
            }}
            onClose={() => setNewVaultOpen(false)}
          />
        )}
      </div>
    )
  }

  return (
    <GeodeProvider host={host}>
    <div className="shell">
      <header className="titlebar">
        <div className="tb-left">
          <img className="tb-logo" src={logoUrl} alt="Geode" />
          <span className="tb-doc" title={openPath ?? vault.name}>
            {openPath ? tabName(openPath) : vault.name}
          </span>
        </div>

        <div className="tb-right">
          <div className="tb-actions">
            <button
              className="tb-btn icon"
              title="Paleta de comandos (Ctrl+P)"
              aria-label="Paleta de comandos"
              onClick={() => setPaletteOpen(true)}
            >
              <CommandIcon size={15} />
            </button>
            {openPath && (
              <button
                className={`tb-btn icon${preview ? ' active' : ''}`}
                title={preview ? 'Editar' : 'Vista previa'}
                aria-label={preview ? 'Editar' : 'Vista previa'}
                onClick={() => setPreview((p) => !p)}
              >
                {preview ? <PenLine size={15} /> : <Eye size={15} />}
              </button>
            )}
            {hasHead && (
              <button
                className="tb-btn icon"
                title="Crear una rama desde esta versión"
                aria-label="Crear una rama desde esta versión"
                onClick={() => graph?.head.oid && setBranchFrom(graph.head.oid)}
              >
                <GitBranchPlus size={15} />
              </button>
            )}
            {canMerge && (
              <button
                className="tb-btn icon"
                title="Integrar la rama a su rama de origen"
                aria-label="Integrar la rama a su rama de origen"
                onClick={() => void mergeBranch()}
              >
                <GitMerge size={15} />
              </button>
            )}
            <button
              className="tb-btn icon cta"
              title="Crear versión (Ctrl+S)"
              aria-label="Crear versión"
              onClick={() => void openCommitDialog()}
            >
              <Save size={15} />
            </button>
            <button
              className={`tb-btn icon${graphOpen ? ' active' : ''}`}
              title="Árbol de versiones"
              aria-label="Árbol de versiones"
              onClick={toggleGraph}
            >
              <GitBranch size={15} />
            </button>
            {openPath && (
              <button
                className={`tb-btn icon${timelineOpen ? ' active' : ''}`}
                title="Línea de tiempo de la nota"
                aria-label="Línea de tiempo de la nota"
                onClick={() => setTimelineOpen((o) => !o)}
              >
                <History size={15} />
              </button>
            )}
            {githubCfg?.connected && githubCfg.remote && (
              <button
                className="tb-btn icon push"
                title={pushCount > 0 ? `Push a GitHub (${pushCount} pendiente(s))` : 'Push a GitHub'}
                aria-label="Push a GitHub"
                disabled={pushing || pushCount === 0}
                onClick={() => void doPush()}
              >
                <UploadCloud size={15} className={pushing ? 'spin' : ''} />
                {pushCount > 0 && <span className="push-badge">{pushCount}</span>}
              </button>
            )}
          </div>
          <WindowControls />
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-toolbar">
            <button className="icon-btn" title="Nueva nota" onClick={() => void newNoteIn('')}>
              <FilePlus size={16} />
            </button>
            <button className="icon-btn" title="Nueva carpeta" onClick={() => void newFolderIn('')}>
              <FolderPlus size={16} />
            </button>
            <button
              className="icon-btn"
              title={sortAsc ? 'Orden A→Z (click: Z→A)' : 'Orden Z→A (click: A→Z)'}
              onClick={() => setSortAsc((v) => !v)}
            >
              <ArrowDownUp size={16} />
            </button>
            <button
              className="icon-btn"
              title={allExpanded ? 'Colapsar todo' : 'Expandir todo'}
              onClick={toggleCollapseAll}
            >
              {allExpanded ? <FoldVertical size={16} /> : <UnfoldVertical size={16} />}
            </button>
          </div>

          <div className="sidebar-tree">
            {tree.length > 0 ? (
              <FileTree
                nodes={sortedTree}
                openPath={openPath}
                editingPath={editingPath}
                defaultExpanded={allExpanded}
                collapseVersion={collapseVersion}
                onOpen={(p) => void openNote(p)}
                onContext={(node, x, y) => setMenu({ node, x, y })}
                onRename={(node, name) => void renameNode(node, name)}
                onRenameCancel={() => setEditingPath(null)}
                onDelete={(node) => void deleteNode(node)}
              />
            ) : (
              <p className="tree-empty">Vault vacío. Creá una nota con ＋ o una carpeta con 📁.</p>
            )}
          </div>

          <div className="sidebar-footer">
            <VaultSwitcher
              current={vault}
              vaults={vaults}
              onSwitch={(root) => void switchVault(root)}
              onManage={() => void openVault()}
              onNew={() => setNewVaultOpen(true)}
            />
            <div className="sidebar-footer-actions">
              <button className="icon-btn" title="Ayuda" disabled>
                <HelpCircle size={16} />
              </button>
              <button className="icon-btn" title="Ajustes" onClick={() => setSettingsOpen(true)}>
                <SettingsIcon size={16} />
              </button>
            </div>
          </div>
        </aside>

        <main className="main">
          {tabs.length > 0 && (
            <div className="tabbar">
              {tabs.map((p) => (
                <div
                  key={p}
                  className={`tab${p === openPath ? ' active' : ''}`}
                  title={p}
                  onClick={() => void openNote(p)}
                  onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); void closeTab(p) } }}
                >
                  <span className="tab-label">{tabName(p)}</span>
                  <button
                    className="tab-close icon-btn"
                    title="Cerrar"
                    onClick={(e) => { e.stopPropagation(); void closeTab(p) }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="editor-pane">
            {openPath ? (
              preview ? (
                <MarkdownPreview source={content} />
              ) : (
                <CodeMirrorEditor
                  ref={editorRef}
                  reloadKey={`${openPath}#${editorEpoch}`}
                  initialDoc={content}
                  onChange={handleChange}
                  onRequestAi={requestAi}
                  extraExtensions={host.listExtensions()}
                />
              )
            ) : (
              <div className="placeholder">Elegí una nota del panel, o creá una con ＋.</div>
            )}
          </div>
          <footer className="statusbar">
            <div className="status-left">
              {openPath ? (
                <>
                  <span>{stats.words} palabras</span>
                  <span>{stats.chars} caracteres</span>
                  <span>{stats.lines} líneas</span>
                </>
              ) : (
                <span>Ninguna nota abierta</span>
              )}
              {statusLabel(status, savedAt) && (
                <span className="save-status">{statusLabel(status, savedAt)}</span>
              )}
            </div>

            <div className="status-right">
              <PluginStatusItems host={host} />

              {graph && graph.head.oid && (
                <BranchSwitcher
                  branches={graph.branches}
                  head={graph.head}
                  menuUp
                  onSwitch={(tip) => void goToVersion(tip)}
                />
              )}

              <div className="status-item">
                <Cloud size={14} className={githubCfg?.connected ? 'st-ok' : 'st-off'} />
                <span>{githubCfg?.connected ? 'GitHub' : 'sin GitHub'}</span>
                <div className="status-pop">
                  {githubCfg?.connected ? (
                    <>
                      <div className="pop-title"><Cloud size={13} /> GitHub</div>
                      <div className="pop-row"><span>Cuenta</span><b>{githubCfg.login}</b></div>
                      <div className="pop-row"><span>Repo</span><b>{githubCfg.remote ?? 'sin configurar'}</b></div>
                      <div className="pop-row"><span>Sin pushear</span><b>{pushCount} commit(s)</b></div>
                      <div className="pop-row"><span>Auto-push</span><b>{githubCfg.autoPush ? 'sí' : 'no'}</b></div>
                    </>
                  ) : (
                    <>
                      <div className="pop-title"><Cloud size={13} /> GitHub</div>
                      <div className="pop-note">No conectado. Conectá tu cuenta en Ajustes (⚙).</div>
                    </>
                  )}
                </div>
              </div>

              {aiConfig?.hasKey && (
                <div
                  className="status-item"
                  onMouseEnter={() => void refreshAiUsage()}
                >
                  <Coins size={14} className={aiUsageErr ? 'st-warn' : 'st-ok'} />
                  <span>{aiUsage ? formatUsd(aiUsage.usage) : aiUsageErr ? '!' : '—'}</span>
                  <div className="status-pop">
                    <div className="pop-title"><Coins size={13} /> OpenRouter</div>
                    {aiUsage ? (
                      <>
                        <div className="pop-row"><span>Gastado</span><b>{formatUsd(aiUsage.usage)}</b></div>
                        <div className="pop-row">
                          <span>Límite</span>
                          <b>{aiUsage.limit != null ? formatUsd(aiUsage.limit) : 'sin límite'}</b>
                        </div>
                        {aiUsage.limit != null && (
                          <div className="pop-row">
                            <span>Restante</span>
                            <b>{formatUsd(Math.max(0, aiUsage.limit - aiUsage.usage))}</b>
                          </div>
                        )}
                        <div className="pop-row"><span>Modelo</span><b>{aiConfig.model ?? '—'}</b></div>
                      </>
                    ) : aiUsageErr ? (
                      <div className="pop-note pop-err">No se pudo leer el uso: {aiUsageErr}</div>
                    ) : (
                      <div className="pop-note">Cargando uso…</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </footer>
        </main>

        {graphOpen && graph && (
          <VersionGraph
            graph={graph}
            onSelect={(oid) => void goToVersion(oid)}
            onClose={() => setGraphOpen(false)}
            onAddTag={(oid, name) => void addTag(oid, name)}
            onRemoveTag={(name) => void removeTag(name)}
            onDeleteBranch={deleteBranch}
            onCreateBranch={(oid) => setBranchFrom(oid)}
            onShowDiff={(oid) => setDiffOid(oid)}
          />
        )}

        <PluginPanels host={host} />
      </div>

      {timelineOpen && openPath && (
        <TimelineScrubber
          path={openPath}
          onRestore={(content) => void restoreVersion(content)}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {newVaultOpen && (
        <NewVaultDialog
          githubConnected={!!githubCfg?.connected}
          onReady={(info) => {
            setNewVaultOpen(false)
            void adoptVault(info)
          }}
          onClose={() => setNewVaultOpen(false)}
        />
      )}

      {diffOid && <DiffView oid={diffOid} onClose={() => setDiffOid(null)} />}

      {branchFrom && (
        <BranchDialog
          onConfirm={(name) => {
            const oid = branchFrom
            setBranchFrom(null)
            void createBranchAt(oid, name)
          }}
          onClose={() => setBranchFrom(null)}
        />
      )}

      {commitChanges && (
        <CommitDialog
          changes={commitChanges}
          aiReady={aiReady}
          onConfirm={doCommit}
          onClose={() => setCommitChanges(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => { setSettingsOpen(false); void refreshGithub(); void refreshAiUsage() }}
          onConfigChange={setAiConfig}
        />
      )}

      {aiEdit && (
        <AiPromptModal
          context={aiEdit}
          onInsert={(text) => {
            editorRef.current?.replaceRange(aiEdit.from, aiEdit.to, text)
            setAiEdit(null)
            void refreshAiUsage()
          }}
          onClose={() => setAiEdit(null)}
        />
      )}

      {menu && (
        <div className="ctx-overlay" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>
          <ul className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            {menu.node.isDir && (
              <>
                <li onClick={() => { setMenu(null); void newNoteIn(menu.node.path) }}>
                  <FilePlus size={14} /> Nueva nota
                </li>
                <li onClick={() => { setMenu(null); void newFolderIn(menu.node.path) }}>
                  <FolderPlus size={14} /> Nueva carpeta
                </li>
                <li className="ctx-sep" />
              </>
            )}
            <li onClick={() => { setEditingPath(menu.node.path); setMenu(null) }}>
              <Pencil size={14} /> Renombrar
            </li>
            <li className="ctx-danger" onClick={() => { const n = menu.node; setMenu(null); void deleteNode(n) }}>
              <Trash2 size={14} /> Eliminar
            </li>
          </ul>
        </div>
      )}

      {paletteOpen && <CommandPalette host={host} onClose={() => setPaletteOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
    </GeodeProvider>
  )
}

/**
 * Ordena el árbol para el explorador: carpetas primero, luego notas; alfabético
 * (asc/desc) dentro de cada grupo. Recursivo. No muta el árbol original.
 */
function sortTree(nodes: TreeNode[], asc: boolean): TreeNode[] {
  const dir = asc ? 1 : -1
  return [...nodes]
    .sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name) * dir : a.isDir ? -1 : 1
    )
    .map((n) => (n.children ? { ...n, children: sortTree(n.children, asc) } : n))
}

/** Carpeta padre de una ruta relativa ('' si está en la raíz). */
function parentDir(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

/** Formatea un monto en USD, con más decimales para montos chicos. */
function formatUsd(amount: number): string {
  if (amount === 0) return '$0'
  return amount < 1 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`
}

/** Nombre de una tab: basename sin extensión .md. */
function tabName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
}

/** Todas las rutas de nota (hojas) de un árbol. */
function flattenPaths(nodes: TreeNode[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.isDir) {
      if (n.children) out.push(...flattenPaths(n.children))
    } else {
      out.push(n.path)
    }
  }
  return out
}

function statusLabel(status: SaveStatus, savedAt: Date | null): string {
  switch (status) {
    case 'saving':
      return '● guardando…'
    case 'saved':
      return savedAt ? `✓ guardado ${savedAt.toLocaleTimeString()}` : '✓ guardado'
    case 'clean':
      return '✓ sin cambios'
    default:
      return ''
  }
}
