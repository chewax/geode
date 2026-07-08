import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  FilePlus,
  FolderPlus,
  Save,
  GitBranch,
  Pencil,
  Trash2,
  UploadCloud,
  GitMerge,
  GitBranchPlus,
  Cloud,
  Coins,
  ArrowDownUp,
  RefreshCw,
  FoldVertical,
  UnfoldVertical,
  Info,
  Command as CommandIcon,
  Loader2,
  HardDrive,
  Check
} from 'lucide-react'
import logoUrl from './assets/geode_logo_dark.png'
import type { AiConfig, AiUsage, AppInfo, GitGraph, GithubConfig, TreeNode, VaultInfo } from '@shared/ipc'
import { type EditorContext, type EditorHandle } from './editor/CodeMirrorEditor'
import { PaneView } from './PaneView'
import { type PaneHandle, type TabDrag } from './EditorPane'
import {
  makeLeaf,
  firstLeaf,
  findLeaf,
  allLeaves,
  openInLeaf,
  pinTab,
  updateLeaf,
  mapLeaves,
  reorderTab,
  closeTabInLeaf,
  splitWithTab,
  splitLeaf,
  removePathEverywhere,
  keepOnly,
  setSizes,
  type PaneLayout,
  type DropZone
} from './paneTree'
import { FileTree } from './FileTree'
import { VaultSwitcher } from './VaultSwitcher'
import { SidebarSection } from './SidebarSection'
import { ActivityBar } from './ActivityBar'
import { BranchSwitcher } from './BranchSwitcher'
import { BranchDialog } from './BranchDialog'
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog'
import { ConfirmDeleteBranchDialog } from './ConfirmDeleteBranchDialog'
import { ConfirmRemoveVaultDialog } from './ConfirmRemoveVaultDialog'
import { DiffView } from './DiffView'
import { WindowControls } from './WindowControls'
import { VersionGraph } from './VersionGraph'
import { Timeline } from './Timeline'
import { TimeTravelBanner } from './TimeTravelBanner'
import { entryLabel, relativeDate } from './time/labels'
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

export function App(): JSX.Element {
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [vaults, setVaults] = useState<VaultInfo[]>([])
  const [newVaultOpen, setNewVaultOpen] = useState(false)
  const [removeVaultTarget, setRemoveVaultTarget] = useState<VaultInfo | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  // Explorador estilo Obsidian: orden A-Z/Z-A y colapsar/expandir todo.
  const [sortAsc, setSortAsc] = useState(true)
  const [allExpanded, setAllExpanded] = useState(true)
  const [collapseVersion, setCollapseVersion] = useState(0)
  // Área de edición: árbol de paneles recursivo (estilo VSCode). La hoja inicial
  // se crea una sola vez para que `panes` y `activePaneId` compartan su id.
  const initialLeaf = useMemo(() => makeLeaf(), [])
  const [panes, setPanes] = useState<PaneLayout>(initialLeaf)
  const [activePaneId, setActivePaneId] = useState(initialLeaf.id)
  /** Nonce por panel: al cambiar, el panel recarga su nota desde disco. */
  const [reloadNonces, setReloadNonces] = useState<Record<string, number>>({})
  // Espejo del panel enfocado (para statusbar, stats, título, IA, timeline).
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('none')
  // Contador de líneas sin commitear de todo el vault (CHG-01): +added / -removed.
  const [lineStat, setLineStat] = useState<{ added: number; removed: number }>({ added: 0, removed: 0 })
  /** Handles imperativos de cada panel (flush, editor activo, preview). */
  const paneHandles = useRef<Map<string, PaneHandle>>(new Map())
  /** Último contenido conocido por panel (para refrescar el espejo al enfocar). */
  const paneContentRef = useRef<Map<string, string>>(new Map())
  /** Editor al que la IA debe insertar su resultado (el panel que la invocó). */
  const aiTargetRef = useRef<EditorHandle | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graph, setGraph] = useState<GitGraph | null>(null)
  // Viaje en el tiempo: oid en preview (null = presente en vivo). Transitorio,
  // NUNCA se persiste — la app siempre abre en el presente (SOFT-05, T-02-10).
  const [previewOid, setPreviewOid] = useState<string | null>(null)
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  // Modo Avanzado: revela las superficies git (toolbar, grafo, ramas, paleta).
  // Default false ⇒ experiencia sin jerga git (fail-safe ante error IPC).
  const [advanced, setAdvanced] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commitChanges, setCommitChanges] = useState<string[] | null>(null)
  // Commit desde el cual crear una rama (abre el diálogo de nombre); null = cerrado.
  const [branchFrom, setBranchFrom] = useState<string | null>(null)
  // Commit cuyo diff se está viendo (abre el visor de cambios); null = cerrado.
  const [diffOid, setDiffOid] = useState<string | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  /** Error de validación del rename en curso, mostrado inline bajo el input; null si no hay. */
  const [renameError, setRenameError] = useState<string | null>(null)
  /** Texto tipeado a preservar al reabrir el input tras un rename fallido; null =
   *  sembrar con el nombre actual del nodo (rename nuevo, no reintento). */
  const [renameSeed, setRenameSeed] = useState<string | null>(null)
  /** Nodo pendiente de confirmar borrado (abre el diálogo); null = cerrado. */
  const [pendingDelete, setPendingDelete] = useState<TreeNode | null>(null)
  /** Rama pendiente de confirmar borrado (abre el diálogo); null = cerrado. */
  const [pendingDeleteBranch, setPendingDeleteBranch] = useState<{ name: string; merged: boolean } | null>(null)
  /** Error inline del borrado de rama (reemplaza a window.alert); null = sin error. */
  const [deleteBranchError, setDeleteBranchError] = useState<string | null>(null)
  /** Borrado de rama en vuelo: evita reentradas por doble activación (WR-03). */
  const deletingBranchRef = useRef(false)
  /** Nodo seleccionado en el árbol (archivo o carpeta): el "+" crea acá dentro. */
  const [selected, setSelected] = useState<{ path: string; isDir: boolean } | null>(null)
  /** Ruta a revelar en el árbol (auto-expande sus carpetas ancestro). */
  const [revealPath, setRevealPath] = useState<string | null>(null)
  /** Ancho del sidebar (px), redimensionable y persistido. */
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('geode.sidebarWidth'))
    return Number.isFinite(saved) && saved >= 160 ? saved : 250
  })
  // node: null = menú contextual de la zona vacía del árbol (acciones de raíz).
  const [menu, setMenu] = useState<{ node: TreeNode | null; x: number; y: number } | null>(null)
  const [aiEdit, setAiEdit] = useState<EditorContext | null>(null)
  const [githubCfg, setGithubCfg] = useState<GithubConfig | null>(null)
  const [pushCount, setPushCount] = useState(0)
  const [pushing, setPushing] = useState(false)
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null)
  const [aiUsageErr, setAiUsageErr] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /** Refresco desde disco en curso: alimenta el `.spin` del icono RefreshCw. */
  const [refreshing, setRefreshing] = useState(false)

  // Host de plugins: se crea una sola vez (estable entre renders).
  const hostRef = useRef<PluginHost | null>(null)
  if (!hostRef.current) hostRef.current = new PluginHost()
  const host = hostRef.current

  // Panel activo y su nota (derivados del árbol). Los refs se mantienen frescos
  // para usarlos dentro de callbacks estables sin closures viejas.
  const activeLeaf = useMemo(() => findLeaf(panes, activePaneId), [panes, activePaneId])
  const openPath = activeLeaf?.active ?? null
  const openPathRef = useRef<string | null>(null)
  openPathRef.current = openPath
  const panesRef = useRef<PaneLayout>(panes)
  panesRef.current = panes
  const activePaneIdRef = useRef(activePaneId)
  activePaneIdRef.current = activePaneId
  /** Layout (paneles + panel activo) capturado al entrar en preview, para
   *  restaurarlo exacto al volver al presente (SOFT-04). paneTree es inmutable,
   *  así que la referencia ES la instantánea (sin clonar). */
  const layoutSnapshotRef = useRef<{ panes: PaneLayout; activePaneId: string } | null>(null)
  const headOidRef = useRef<string | null>(null)
  headOidRef.current = graph?.head.oid ?? null

  // Editor imperativo del panel enfocado (para IA/timeline/plugins).
  const getActiveEditor = useCallback(
    (): EditorHandle | null => paneHandles.current.get(activePaneIdRef.current)?.getEditor() ?? null,
    []
  )

  /** Persiste a disco lo pendiente de TODOS los paneles (antes de commit/checkout). */
  const flushAll = useCallback(async () => {
    await Promise.all([...paneHandles.current.values()].map((h) => h.flush()))
  }, [])

  /** Fuerza recarga desde disco de todos los paneles (tras checkout/merge). */
  const bumpAll = useCallback(() => {
    setReloadNonces((prev) => {
      const next = { ...prev }
      for (const leaf of allLeaves(panesRef.current)) next[leaf.id] = (next[leaf.id] ?? 0) + 1
      return next
    })
  }, [])

  const refreshVaults = useCallback(async () => {
    setVaults(await window.geode.vault.list())
  }, [])

  /**
   * Refresca el árbol de notas. En preview lee la versión pasada vía
   * `git.treeAt(previewOid)`; en el presente, `vault.tree()`. Acepta un override
   * explícito para usar el oid correcto en la misma tanda en que se hace
   * `setPreviewOid` (el estado aún no re-renderizó).
   */
  /** Recalcula el contador de líneas sin commitear (CHG-01). Sin IA (invariante de costo). */
  const refreshLineStat = useCallback(async (): Promise<void> => {
    try {
      setLineStat(await window.geode.git.pendingLineStat())
    } catch {
      setLineStat({ added: 0, removed: 0 })
    }
  }, [])

  const refreshTree = useCallback(async (oidOverride?: string | null): Promise<TreeNode[]> => {
    const oid = oidOverride !== undefined ? oidOverride : previewOid
    const t = oid ? await window.geode.git.treeAt(oid) : await window.geode.vault.tree()
    setTree(t)
    // En preview (oid != null) no recontamos: el contador es del presente y no
    // debe mostrarse mientras se viaja al pasado (WR-02). En el presente sí.
    if (oid == null) void refreshLineStat()
    return t
  }, [previewOid, refreshLineStat])

  const refreshGraph = useCallback(async () => {
    setGraph(await window.geode.git.graph())
  }, [])

  /** Entra en modo preview de una versión pasada: persiste ediciones en vuelo,
   *  guarda la instantánea de layout y reenruta árbol + paneles a esa versión.
   *  No escribe NADA a disco: la vista es de sólo lectura (T-02-04). */
  const enterPreview = useCallback(async (oid: string): Promise<void> => {
    await flushAll() // no perder lo tipeado antes de congelar la vista
    layoutSnapshotRef.current = {
      panes: panesRef.current,
      activePaneId: activePaneIdRef.current
    }
    setPreviewOid(oid)
    await refreshTree(oid)
  }, [flushAll, refreshTree])

  /** Restaura el layout capturado al entrar en preview (si existe) y lo limpia. */
  const restoreLayoutSnapshot = useCallback((): void => {
    const snap = layoutSnapshotRef.current
    if (!snap) return
    setPanes(snap.panes)
    setActivePaneId(snap.activePaneId)
    layoutSnapshotRef.current = null
  }, [])

  /** Sale del preview: vuelve al presente en vivo y restaura el layout exacto. */
  const exitPreview = useCallback(async (): Promise<void> => {
    setPreviewOid(null)
    restoreLayoutSnapshot()
    await refreshTree(null)
  }, [refreshTree, restoreLayoutSnapshot])

  /** Transporte de la timeline: un paso atrás (más viejo) o adelante (más nuevo).
   *  Pasar el presente hacia adelante equivale a salir del preview (SOFT-04). */
  const stepPreview = useCallback(
    (dir: 'back' | 'forward'): void => {
      const g = graph
      if (!g || g.commits.length === 0) return
      const idx = previewOid ? g.commits.findIndex((c) => c.oid === previewOid) : 0
      if (idx < 0) return
      if (dir === 'back') {
        const older = g.commits[idx + 1]
        if (older) void enterPreview(older.oid)
      } else {
        const newerIdx = idx - 1
        if (newerIdx < 0) return
        if (newerIdx === 0) void exitPreview()
        else void enterPreview(g.commits[newerIdx].oid)
      }
    },
    [graph, previewOid, enterPreview, exitPreview]
  )

  /** Un click en la lista: el más nuevo vuelve al presente; el resto entra en
   *  preview de esa versión. */
  const selectPreview = useCallback(
    (oid: string): void => {
      if (graph && oid === graph.commits[0]?.oid) void exitPreview()
      else void enterPreview(oid)
    },
    [graph, enterPreview, exitPreview]
  )

  const refreshGithub = useCallback(async () => {
    const cfg = await window.geode.github.getConfig()
    setGithubCfg(cfg)
    setPushCount(cfg.connected && cfg.remote ? await window.geode.git.pendingPush() : 0)
  }, [])

  /** Relee el flag de Modo Avanzado. Ante error IPC cae a false (sin git). */
  const refreshAdvanced = useCallback(async () => {
    let enabled = false
    try {
      enabled = (await window.geode.advanced.get()).enabled
    } catch {
      enabled = false
    }
    setAdvanced(enabled)
    // Al salir de Modo Avanzado, cerramos el grafo de versiones para que no
    // reaparezca "colgado" si luego se reactiva el modo.
    if (!enabled) setGraphOpen(false)
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

  /** Abre (o activa) una nota en el panel enfocado. Sin `pinned` = preview (un
   *  click en el árbol); `{ pinned: true }` = tab permanente (doble click). */
  const openNote = useCallback(async (path: string, opts?: { pinned: boolean }) => {
    await flushAll() // no perder lo tipeado al cambiar de nota
    setPanes((prev) => openInLeaf(prev, activePaneIdRef.current, path, { preview: !opts?.pinned }))
  }, [flushAll])

  // ── Callbacks de los paneles (EditorPane → App) ─────────────────────────────

  /** Enfoca un panel: pasa a ser el activo y refresca el espejo de contenido. */
  const focusPane = useCallback((paneId: string) => {
    setActivePaneId(paneId)
    setContent(paneContentRef.current.get(paneId) ?? '')
  }, [])

  /** Selecciona una tab dentro de un panel (y lo enfoca). */
  const selectTab = useCallback((paneId: string, path: string) => {
    setActivePaneId(paneId)
    setPanes((prev) => updateLeaf(prev, paneId, (leaf) => ({ ...leaf, active: path })))
  }, [])

  const closeTab = useCallback(async (paneId: string, path: string) => {
    await paneHandles.current.get(paneId)?.flush()
    setPanes((prev) => closeTabInLeaf(prev, paneId, path))
  }, [])

  const reorderTabIn = useCallback((paneId: string, path: string, toIndex: number) => {
    setPanes((prev) => reorderTab(prev, paneId, path, toIndex))
  }, [])

  /** Suelta una tab en otro panel: la mueve (centro) o divide por el borde. */
  const dropTab = useCallback(async (drag: TabDrag, dstPaneId: string, zone: DropZone) => {
    await flushAll()
    setPanes((prev) => splitWithTab(prev, drag.srcPaneId, drag.path, dstPaneId, zone))
    setActivePaneId(dstPaneId)
  }, [flushAll])

  /** Divide un panel abriendo su nota activa en una hoja nueva al lado. */
  const splitPane = useCallback(async (paneId: string, dir: 'row' | 'col') => {
    await paneHandles.current.get(paneId)?.flush() // el panel nuevo lee de disco
    const { tree, newPaneId } = splitLeaf(panesRef.current, paneId, dir)
    setPanes(tree)
    setActivePaneId(newPaneId)
  }, [])

  const onPaneNoteOpen = useCallback((paneId: string, path: string, text: string) => {
    paneContentRef.current.set(paneId, text)
    if (paneId === activePaneIdRef.current) {
      setContent(text)
      setStatus('clean')
      host.emit('note:open', { path, content: text })
    }
  }, [host])

  const onPaneNoteChange = useCallback((paneId: string, path: string, doc: string) => {
    paneContentRef.current.set(paneId, doc)
    // Cualquier edición fija la preview de ese panel. Solo reconstruimos el árbol
    // de paneles si realmente hay algo que fijar (evita churn en cada tecla en
    // layouts divididos, donde mapLeaves siempre aloca un root nuevo, IN-01).
    if (findLeaf(panesRef.current, paneId)?.preview === path) {
      setPanes((prev) => pinTab(prev, paneId, path))
    }
    if (paneId === activePaneIdRef.current) {
      setContent(doc)
      setStatus('saving')
      host.emit('note:change', { path, content: doc })
      // Sin refreshLineStat aquí (WR-01): el disco aún no tiene el cambio (el
      // autosave escribe AUTOSAVE_MS después) y la llamada no está secuenciada.
      // El recuento se hace en onPaneSaved (tras el flush) y en refreshTree/doCommit.
    }
  }, [host])

  const onPaneSaved = useCallback((paneId: string) => {
    if (paneId === activePaneIdRef.current) {
      setStatus('saved')
      void refreshLineStat() // el guardado cambió lo pendiente → recontar (CHG-01)
    }
  }, [refreshLineStat])

  const registerPaneHandle = useCallback((paneId: string, handle: PaneHandle | null) => {
    if (handle) paneHandles.current.set(paneId, handle)
    else paneHandles.current.delete(paneId)
  }, [])

  const onPaneResize = useCallback((splitId: string, sizes: number[]) => {
    setPanes((prev) => setSizes(prev, splitId, sizes))
  }, [])

  /** Adopta una bóveda como activa y refresca todo (árbol, grafo, github, lista). */
  const adoptVault = useCallback(async (info: VaultInfo) => {
    setVault(info)
    // Reset del área de edición a un único panel vacío.
    const leaf = makeLeaf()
    paneContentRef.current.clear()
    setPanes(leaf)
    setActivePaneId(leaf.id)
    setReloadNonces({})
    setContent('')
    setStatus('none')
    setSelected(null)
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

  /**
   * Da de baja una bóveda (FILE-05). `fromDisk` envía además la carpeta a la
   * papelera del SO (recuperable). Si se da de baja la bóveda ACTIVA, adopta la
   * restante que devuelve el main, o resetea a la pantalla sin bóveda si no queda
   * ninguna. Los errores (p.ej. la papelera falló) se muestran en español.
   */
  const removeVault = useCallback(async (target: VaultInfo, fromDisk: boolean) => {
    try {
      // Persistir lo tipeado antes de la instantánea de baja y (si aplica) de
      // mandar la carpeta a la papelera: si no, se perderían los últimos ~600ms
      // de escritura, y en fromDisk el flush de desmontaje escribiría en una
      // carpeta ya en la papelera (viola "nada se pierde", WR-02).
      await flushAll()
      const active = await window.geode.vault.remove(target.root, { fromDisk })
      if (target.root === vault?.root) {
        if (active) {
          // adoptVault ya refresca árbol/grafo/github/lista.
          await adoptVault(active)
        } else {
          // No queda ninguna bóveda: reset al estado sin bóveda (pantalla welcome).
          setVault(null)
          setTree([])
          setGraph(null)
          const leaf = makeLeaf()
          paneContentRef.current.clear()
          setPanes(leaf)
          setActivePaneId(leaf.id)
          setContent('')
          setStatus('none')
          setSelected(null)
          await refreshVaults()
        }
      } else {
        await refreshVaults()
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo quitar la bóveda')
    } finally {
      setRemoveVaultTarget(null)
    }
  }, [vault, adoptVault, refreshVaults, flushAll])

  const newNoteIn = useCallback(async (dir: string) => {
    const node = await window.geode.vault.createNote(dir)
    await refreshTree()
    setRevealPath(node.path) // auto-expande la carpeta destino
    setSelected({ path: node.path, isDir: false })
    await openNote(node.path, { pinned: true }) // una nota nueva se abre para editar, no como preview
    setRenameError(null)
    setRenameSeed(null)
    setEditingPath(node.path) // permitir nombrarla al toque
  }, [refreshTree, openNote])

  const newFolderIn = useCallback(async (dir: string) => {
    const node = await window.geode.vault.createFolder(dir)
    await refreshTree()
    setRevealPath(node.path)
    setSelected({ path: node.path, isDir: true })
    setRenameError(null)
    setRenameSeed(null)
    setEditingPath(node.path)
  }, [refreshTree])

  /** Carpeta destino para crear: la seleccionada (o la de la nota seleccionada), o raíz. */
  const createTargetDir = useCallback((): string => {
    if (!selected) return ''
    return selected.isDir ? selected.path : parentDir(selected.path)
  }, [selected])

  // Arrastre del divisor: sigue el mouse (clamp 160–520px), persiste al soltar.
  const startSidebarResize = useCallback((e: ReactPointerEvent): void => {
    e.preventDefault()
    // El sidebar NO empieza en x=0: a su izquierda está la ActivityBar. El ancho
    // se mide desde el borde izquierdo real del sidebar (su hermano anterior),
    // no desde clientX crudo — si no, el ancho queda inflado por ese offset y el
    // divisor se dibuja corrido del cursor.
    const asideEl = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null
    const left = asideEl ? asideEl.getBoundingClientRect().left : 0
    const onMove = (ev: PointerEvent): void => {
      const w = Math.min(520, Math.max(160, ev.clientX - left))
      setSidebarWidth(w)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing-col')
      setSidebarWidth((w) => {
        localStorage.setItem('geode.sidebarWidth', String(w))
        return w
      })
    }
    document.body.classList.add('resizing-col')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

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
      // Sin diálogo nativo: mostramos el error inline y reabrimos el input para
      // corregir. Preservamos lo tipeado (rawName) como semilla del input para
      // que el usuario corrija en vez de reescribir desde cero.
      setRenameError(e instanceof Error ? e.message : 'No se pudo renombrar')
      setRenameSeed(rawName)
      setEditingPath(node.path)
      return
    }
    setRenameError(null)
    setRenameSeed(null)
    // Reflejar en todos los paneles (tabs + nota activa) y en la selección.
    const remap = (p: string): string =>
      p === node.path ? toRel : p.startsWith(`${node.path}/`) ? toRel + p.slice(node.path.length) : p
    setPanes((prev) =>
      mapLeaves(prev, (leaf) => ({
        ...leaf,
        tabs: leaf.tabs.map(remap),
        active: leaf.active ? remap(leaf.active) : null,
        // Remapear también la tab de preview: si no, tras renombrar quedaría
        // apuntando al path viejo (referencia colgada → pierde la itálica y el
        // doble-click para fijar deja de funcionar en ese panel).
        preview: leaf.preview ? remap(leaf.preview) : leaf.preview
      }))
    )
    setSelected((s) => (s ? { ...s, path: remap(s.path) } : s))
    await refreshTree()
  }, [refreshTree])

  // Sólo abre el diálogo de confirmación; el borrado real vive en confirmDelete.
  const deleteNode = useCallback((node: TreeNode) => {
    setPendingDelete(node)
  }, [])

  // Ejecuta el borrado real tras la confirmación explícita del diálogo. El elemento
  // sigue siendo recuperable desde el historial git.
  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    const node = pendingDelete
    setPendingDelete(null)
    // El árbol puede haber cambiado en disco mientras el diálogo estaba abierto
    // (auto-refresco al enfocar). Si el nodo capturado ya no existe, no-op: borrar
    // su ruta obsoleta sería un fs.rm silencioso (force:true) sobre algo que ya no
    // está, dando falsa sensación de borrado. Cerramos el diálogo sin tocar disco.
    // El guard recorre notas Y carpetas (pathExistsInTree): así también valida el
    // borrado de carpetas, que flattenPaths ignora por diseño (solo hojas/notas).
    if (!pathExistsInTree(tree, node.path)) return
    await window.geode.vault.delete(node.path)
    setPanes((prev) => removePathEverywhere(prev, node.path))
    setSelected((s) =>
      s && (s.path === node.path || s.path.startsWith(`${node.path}/`)) ? null : s
    )
    await refreshTree()
  }, [pendingDelete, tree, refreshTree])

  /** Tras un cambio de working tree (checkout/merge/rama): cierra las tabs de notas
   *  que ya no existen y recarga el contenido de todos los paneles desde disco. */
  const syncPanesToTree = useCallback((t: TreeNode[], reloadEditors = true) => {
    const existing = new Set(flattenPaths(t))
    setPanes((prev) => keepOnly(prev, existing))
    // `reloadEditors` false evita remontar los editores (pierde cursor/undo). Se
    // usa en el refresco al enfocar la ventana, que ocurre en cada alt-tab: ahí
    // sólo interesa reconciliar la estructura del árbol, no recargar contenido.
    if (reloadEditors) bumpAll()
  }, [bumpAll])

  /** Re-lee la bóveda desde disco (refresh manual + auto-refresh al enfocar).
   *  Captura cambios hechos por fuera de Geode (crear/mover/renombrar/borrar
   *  desde el explorer del SO) sin reiniciar. Persiste ANTES lo tipeado con
   *  `flushAll` para no pisar ediciones en curso (respeta el journal, T-06-04).
   *  Durante el viaje en el tiempo NO relee disco: el árbol muestra la versión
   *  pasada vía `treeAt` y releer pisaría esa vista (guard de preview, T-06-05). */
  const refreshFromDisk = useCallback(async ({ reloadEditors = true }: { reloadEditors?: boolean } = {}): Promise<void> => {
    if (previewOid != null) return
    setRefreshing(true)
    // El refresco de un vault local es casi instantáneo; para que el giro del
    // icono se perciba como feedback de la acción del usuario, garantizamos un
    // tiempo mínimo de spin (~medio ciclo) SOLO en el click del botón
    // (reloadEditors), no en el auto-refresco al enfocar (no gira en cada alt-tab).
    const minSpin =
      reloadEditors ? new Promise<void>((r) => setTimeout(r, 500)) : Promise.resolve()
    try {
      await flushAll()
      const t = await refreshTree()
      // El botón de refresco (acción del usuario) recarga los editores; el
      // auto-refresco al enfocar no, para no reiniciar cursor/undo en cada
      // alt-tab cuando nada cambió por fuera.
      syncPanesToTree(t, reloadEditors)
      await minSpin
    } finally {
      setRefreshing(false)
    }
  }, [previewOid, flushAll, refreshTree, syncPanesToTree])

  // Auto-refresh al recuperar el foco de la ventana: capta cambios hechos por
  // fuera de Geode mientras estaba en segundo plano. No hace falta lógica
  // anti-clobber aquí: `refreshFromDisk` ya persiste lo tipeado con `flushAll`
  // antes de recargar (protege el journal) y no actúa durante el preview. Va con
  // `reloadEditors: false` para no reiniciar cursor/undo de los editores abiertos
  // en cada alt-tab; sólo se reconcilia la estructura del árbol.
  useEffect(() => {
    const handler = (): void => void refreshFromDisk({ reloadEditors: false })
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [refreshFromDisk])

  /** "Volver aquí": materializa la versión en preview como cambios sin guardar,
   *  SIN mover HEAD (T-02-05). Si el árbol está sucio, toma una instantánea de
   *  seguridad (mensaje explícito ⇒ SIN IA, T-02-03) para no perder nada; luego
   *  restaura el working-dir y sale del preview reactivando la edición (SOFT-06). */
  const bringBack = useCallback(async (): Promise<void> => {
    const oid = previewOid
    if (!oid) return
    try {
      await flushAll() // persistir lo tipeado antes de medir el árbol
      const dirty = await window.geode.git.changes()
      if (dirty.length > 0) {
        // Mensaje explícito ⇒ no invoca la IA (coste sólo en guardados manuales).
        await window.geode.git.commit('Instantánea de seguridad — ' + new Date().toLocaleString())
      }
      await window.geode.git.restoreTree(oid) // sólo working-dir; HEAD intacto
      setPreviewOid(null)
      restoreLayoutSnapshot()
      syncPanesToTree(await refreshTree(null))
      await refreshGraph()
      setToast('Traído al presente como cambios sin guardar.')
    } catch (e) {
      // Falla del snapshot de seguridad o de restoreTree: no dejar al usuario
      // atascado en la preview sin señal. HEAD no se movió (restoreTree sólo
      // toca el working-dir); puede reintentar o volver al presente.
      setToast(e instanceof Error ? e.message : 'No se pudo traer esta versión al presente.')
    }
  }, [previewOid, flushAll, restoreLayoutSnapshot, syncPanesToTree, refreshTree, refreshGraph])

  /** Abre el diálogo de "Guardar versión" si hay cambios pendientes. */
  const openCommitDialog = useCallback(async () => {
    await flushAll()
    const changes = await window.geode.git.changes()
    if (changes.length === 0) {
      setStatus('clean')
      return
    }
    setCommitChanges(changes)
  }, [flushAll])

  /** Confirmación del diálogo: crea la versión (commit permanente). */
  const doCommit = useCallback(async (message: string) => {
    const fallback = `Versión ${new Date().toLocaleString()}`
    host.emit('note:beforeSave', { path: openPathRef.current })
    await window.geode.git.commit(message || fallback)
    setCommitChanges(null)
    await refreshGraph()
    await refreshGithub()
    void refreshAiUsage() // el mensaje pudo haber usado la IA
    void refreshLineStat() // el commit vació lo pendiente → el contador va a 0/oculto (CR-01)
    host.emit('note:afterSave', { path: openPathRef.current })
    // El push es SIEMPRE manual (botón Push). Guardar versión nunca sube al remoto.
  }, [refreshGraph, refreshGithub, refreshAiUsage, refreshLineStat, host])

  /** Ir a una versión: checkout. Avisa si hay cambios sin versionar (se perderían). */
  const goToVersion = useCallback(async (oid: string) => {
    await flushAll()
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
    syncPanesToTree(await refreshTree())
    await refreshGraph()
    await refreshGithub()
  }, [flushAll, refreshTree, syncPanesToTree, refreshGraph, refreshGithub])

  /** Integra la rama actual a su rama de origen (base) y cambia a la base. */
  const mergeBranch = useCallback(async () => {
    await flushAll()
    // No perder cambios sin versionar: se guardan como una versión antes del merge.
    if ((await window.geode.git.changes()).length > 0) {
      await window.geode.git.commit(`Cambios ${new Date().toLocaleString()}`)
    }
    await window.geode.git.mergeBranch()
    syncPanesToTree(await refreshTree())
    await refreshGraph()
    await refreshGithub()
  }, [flushAll, refreshTree, syncPanesToTree, refreshGraph, refreshGithub])

  /**
   * Crea una rama desde un commit (por defecto HEAD) y cambia a ella. Si sale de
   * otra versión, avisa si hay cambios sin versionar (el checkout los descarta).
   */
  const createBranchAt = useCallback(async (fromOid: string, name: string) => {
    await flushAll()
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
    syncPanesToTree(await refreshTree())
    await refreshGraph()
    await refreshGithub()
  }, [flushAll, refreshTree, syncPanesToTree, refreshGraph, refreshGithub])

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

  /** Solo abre el diálogo de confirmación de borrado de rama; el borrado real vive
   *  en confirmDeleteBranch. Devuelve void (IN-02): el resultado booleano anterior
   *  era engañoso (siempre true, aun al cancelar). El ocultado real de la rama
   *  ocurre tras el borrado, vía refresco del grafo en confirmDeleteBranch. */
  const deleteBranch = useCallback((name: string, merged: boolean): void => {
    setDeleteBranchError(null)
    setPendingDeleteBranch({ name, merged })
  }, [])

  /** Ejecuta el borrado real de la rama tras la confirmación explícita del diálogo.
   *  En error, muestra el detalle inline en el diálogo (sin window.alert) y NO cierra. */
  const confirmDeleteBranch = useCallback(async (): Promise<void> => {
    // Guarda anti-reentrada (WR-03): una doble activación (doble click, o click
    // seguido de Enter con el botón enfocado) dispararía dos borrados sobre una
    // rama ya eliminada y escribiría el error en un diálogo ya desmontado.
    if (!pendingDeleteBranch || deletingBranchRef.current) return
    deletingBranchRef.current = true
    const { name } = pendingDeleteBranch
    await flushAll()
    try {
      await window.geode.git.deleteBranch(name)
    } catch (e) {
      const detalle = e instanceof Error ? e.message : ''
      setDeleteBranchError(detalle ? `No se pudo borrar la rama. ${detalle}` : 'No se pudo borrar la rama.')
      return
    } finally {
      deletingBranchRef.current = false
    }
    // Borrar la rama actual cambia a su base: recargar árbol/editor.
    setPendingDeleteBranch(null)
    setDeleteBranchError(null)
    syncPanesToTree(await refreshTree())
    await refreshGraph()
    await refreshGithub()
  }, [pendingDeleteBranch, flushAll, refreshTree, syncPanesToTree, refreshGraph, refreshGithub])

  const toggleGraph = useCallback(() => setGraphOpen((open) => !open), [])

  /** Ctrl+K en el editor: abre el asistente de IA sobre la selección/cursor del
   *  panel indicado (o el activo). Recuerda el editor destino para insertar ahí. */
  const requestAi = useCallback((paneId?: string) => {
    if (!aiConfig?.hasKey || !aiConfig?.model) {
      window.alert('Configurá la API key y el modelo de IA en Ajustes (⚙).')
      return
    }
    const ed = paneId ? paneHandles.current.get(paneId)?.getEditor() ?? null : getActiveEditor()
    const ctx = ed?.getContext()
    if (ctx) {
      aiTargetRef.current = ed
      setAiEdit(ctx)
    }
  }, [aiConfig, getActiveEditor])

  // Si el panel activo desapareció (p. ej. tras podar un split vacío), reasignar
  // el foco a la primera hoja del árbol.
  useEffect(() => {
    if (!findLeaf(panes, activePaneId)) {
      const leaf = firstLeaf(panes)
      setActivePaneId(leaf.id)
      setContent(paneContentRef.current.get(leaf.id) ?? '')
    }
  }, [panes, activePaneId])

  // Al arrancar: restaurar vault y cargar config de IA/GitHub.
  useEffect(() => {
    void (async () => {
      setAppInfo(await window.geode.getAppInfo())
      const cfg = await window.geode.ai.getConfig()
      setAiConfig(cfg)
      if (cfg.hasKey) void refreshAiUsage()
      await refreshGithub() // también sin bóveda: la pantalla de bienvenida lo usa
      void refreshAdvanced() // interruptor de las superficies git
      const info = await window.geode.vault.current()
      if (!info) return
      setVault(info)
      await refreshTree()
      await refreshGraph()
      await refreshVaults()
    })()
  }, [refreshTree, refreshGraph, refreshGithub, refreshAiUsage, refreshVaults, refreshAdvanced])

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
  // Commit actualmente en preview (para el banner). null en el presente.
  const previewedCommit =
    previewOid && graph ? graph.commits.find((c) => c.oid === previewOid) ?? null : null
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
    togglePreview: () => paneHandles.current.get(activePaneIdRef.current)?.togglePreview(),
    toggleGraph,
    splitRight: () => splitPane(activePaneIdRef.current, 'row'),
    splitDown: () => splitPane(activePaneIdRef.current, 'col'),
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
        insertAtCursor: (t) => getActiveEditor()?.insertAtCursor(t),
        getSelection: () => getActiveEditor()?.getSelection() ?? '',
        revealRange: (f, t) => getActiveEditor()?.revealRange(f, t)
      },
      notify: (m) => setToast(m)
    })
    let cancelled = false

    // Built-ins: default ON. Se lee el mapa de habilitados por IPC (async) y se
    // filtran los internos con `?? true` — un built-in ausente del mapa se
    // activa; solo se excluye si su entrada es explícitamente `false`. Difiere
    // de los externos, que son opt-in (`?? false`, resuelto en el main). El
    // await respeta el flag `cancelled` del unmount para no activar tras montar.
    let offPlugins: { dispose: () => void } | null = null
    void (async () => {
      // Fail-open: los built-ins son ON por defecto (núcleo). Si la IPC falla,
      // se usa un mapa vacío para que `?? true` reactive TODOS los internos en
      // vez de dejar al usuario sin funcionalidad. Además evita un unhandled
      // rejection en el fire-and-forget.
      let enabledMap: Record<string, boolean> = {}
      try {
        enabledMap = await window.geode.plugins.getEnabled()
      } catch {
        enabledMap = {}
      }
      if (cancelled) return
      const enabledBuiltins = BUILTIN_PLUGINS.filter((p) => enabledMap[p.id] ?? true)
      offPlugins = activatePlugins(host, enabledBuiltins)
    })()

    // Plugins externos: la carga es async (lee la fuente por IPC y la evalúa),
    // así que se activan aparte y se limpian en el unmount aunque lleguen tarde.
    let offExternal: { dispose: () => void } | null = null
    void (async () => {
      const { plugins, errors } = await loadExternalPlugins()
      if (cancelled) return
      offExternal = activatePlugins(host, plugins)
      if (errors.length > 0) {
        setToast(`Plugins con error: ${errors.map((e) => e.id).join(', ')}`)
      }
    })()

    const api = (): typeof commandApiRef.current => commandApiRef.current
    // Comandos no-git: siempre registrados. Los de superficie git (crear rama,
    // integrar, push, árbol de versiones) NO viven acá: se registran sólo en
    // Modo Avanzado (efecto dedicado) para no filtrar jerga git en el default.
    const cmds = [
      host.registerCommand({ id: 'core.saveVersion', title: 'Guardar versión', category: 'Núcleo', shortcut: 'Ctrl+S', run: () => api().saveVersion() }),
      host.registerCommand({ id: 'core.newNote', title: 'Nueva nota', category: 'Núcleo', run: () => api().newNote() }),
      host.registerCommand({ id: 'core.newFolder', title: 'Nueva carpeta', category: 'Núcleo', run: () => api().newFolder() }),
      host.registerCommand({ id: 'core.togglePreview', title: 'Alternar vista previa', category: 'Vista', run: () => api().togglePreview(), isEnabled: () => api().hasOpenPath }),
      host.registerCommand({ id: 'core.splitRight', title: 'Dividir editor a la derecha', category: 'Vista', shortcut: 'Ctrl+\\', run: () => api().splitRight() }),
      host.registerCommand({ id: 'core.splitDown', title: 'Dividir editor abajo', category: 'Vista', run: () => api().splitDown() })
    ]
    return () => {
      cancelled = true
      cmds.forEach((c) => c.dispose())
      offPlugins?.dispose()
      offExternal?.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Comandos de superficie git en la paleta: registrados SÓLO en Modo Avanzado.
  // En default no están listados ni son invocables, y la categoría 'Git' no
  // existe (ADV-01/ADV-03). Al apagar el flag (o desmontar) se `dispose()`.
  useEffect(() => {
    if (!advanced) return
    const api = (): typeof commandApiRef.current => commandApiRef.current
    const gitCmds = [
      host.registerCommand({ id: 'core.toggleGraph', title: 'Alternar árbol de versiones', category: 'Vista', run: () => api().toggleGraph() }),
      host.registerCommand({ id: 'core.createBranch', title: 'Crear rama desde la versión actual', category: 'Git', run: () => api().createBranch(), isEnabled: () => api().hasHead }),
      host.registerCommand({ id: 'core.merge', title: 'Integrar rama a su base', category: 'Git', run: () => api().merge(), isEnabled: () => api().canMerge }),
      host.registerCommand({ id: 'core.push', title: 'Push a GitHub', category: 'Git', run: () => api().push(), isEnabled: () => api().pushEnabled })
    ]
    return () => gitCmds.forEach((c) => c.dispose())
  }, [advanced, host])

  // Ctrl/Cmd+P: paleta de comandos. Ctrl+\: dividir el editor a la derecha.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        void splitPane(activePaneIdRef.current, 'row')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [splitPane])

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

  // Acciones de la sección Notas: viven en la cabecera de la sección (reveladas
  // al hover). App las posee y las inyecta vía la prop `actions` de SidebarSection.
  const notesActions = (
    <>
      <button
        className="icon-btn"
        title={selected?.isDir ? `Nueva nota en "${selected.path}"` : 'Nueva nota'}
        onClick={() => void newNoteIn(createTargetDir())}
      >
        <FilePlus size={14} />
      </button>
      <button
        className="icon-btn"
        title={selected?.isDir ? `Nueva carpeta en "${selected.path}"` : 'Nueva carpeta'}
        onClick={() => void newFolderIn(createTargetDir())}
      >
        <FolderPlus size={14} />
      </button>
      <button
        className="icon-btn"
        title={previewOid != null ? 'No disponible durante el viaje en el tiempo' : 'Actualizar notas'}
        aria-label="Actualizar notas"
        disabled={previewOid != null}
        onClick={() => void refreshFromDisk()}
      >
        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
      </button>
      <button
        className="icon-btn"
        title={sortAsc ? 'Orden A→Z (click: Z→A)' : 'Orden Z→A (click: A→Z)'}
        onClick={() => setSortAsc((v) => !v)}
      >
        <ArrowDownUp size={14} />
      </button>
      <button
        className="icon-btn"
        title={allExpanded ? 'Colapsar todo' : 'Expandir todo'}
        onClick={toggleCollapseAll}
      >
        {allExpanded ? <FoldVertical size={14} /> : <UnfoldVertical size={14} />}
      </button>
    </>
  )

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
            {advanced && hasHead && (
              <button
                className="tb-btn icon"
                title="Crear una rama desde esta versión"
                aria-label="Crear una rama desde esta versión"
                onClick={() => graph?.head.oid && setBranchFrom(graph.head.oid)}
              >
                <GitBranchPlus size={15} />
              </button>
            )}
            {advanced && canMerge && (
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
            {advanced && (
              <button
                className={`tb-btn icon${graphOpen ? ' active' : ''}`}
                title="Árbol de versiones"
                aria-label="Árbol de versiones"
                onClick={toggleGraph}
              >
                <GitBranch size={15} />
              </button>
            )}
            {githubCfg?.connected && githubCfg.remote && (
              <button
                className="tb-btn icon push"
                title={pushCount > 0 ? `Subir cambios a la nube (${pushCount} pendiente(s))` : 'Subir cambios a la nube'}
                aria-label="Subir cambios a la nube"
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

      {previewOid != null && previewedCommit && graph && (
        <TimeTravelBanner
          label={entryLabel(previewedCommit, graph.tags)}
          relativeDate={relativeDate(previewedCommit.timestamp)}
          onReturnToPresent={() => void exitPreview()}
          onBringBack={() => void bringBack()}
        />
      )}

      <div className="body">
        <ActivityBar onOpenSettings={() => setSettingsOpen(true)} />

        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <SidebarSection id="notas" title="EXPLORADOR" flex actions={notesActions}>
            {tree.length > 0 ? (
              // Contenedor que llena el alto: un click en su zona vacía (fuera de
              // cualquier nodo) deselecciona, y con `selected` en null los botones
              // "+" y el menú contextual crean en la raíz (estilo VSCode).
              <div
                className="tree-scroll"
                style={{ flex: 1 }}
                onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
                onContextMenu={(e) => {
                  if (e.target !== e.currentTarget) return
                  e.preventDefault()
                  setSelected(null)
                  setMenu({ node: null, x: e.clientX, y: e.clientY })
                }}
              >
                <FileTree
                  nodes={sortedTree}
                  openPath={openPath}
                  selectedPath={selected?.path ?? null}
                  editingPath={editingPath}
                  revealPath={revealPath}
                  defaultExpanded={allExpanded}
                  collapseVersion={collapseVersion}
                  onOpen={(p, opts) => void openNote(p, opts)}
                  onSelect={(node) => setSelected({ path: node.path, isDir: node.isDir })}
                  onContext={(node, x, y) => setMenu({ node, x, y })}
                  onRename={(node, name) => void renameNode(node, name)}
                  onRenameCancel={() => { setEditingPath(null); setRenameError(null); setRenameSeed(null) }}
                  onDelete={(node) => void deleteNode(node)}
                  onStartRename={(node) => { setRenameError(null); setRenameSeed(null); setEditingPath(node.path) }}
                  renameError={renameError}
                  renameSeed={renameSeed}
                />
              </div>
            ) : (
              <div className="tree-empty">
                <p className="tree-empty-title">Bóveda vacía</p>
                <p>Creá una nota o una carpeta con las acciones de la cabecera de esta sección.</p>
              </div>
            )}
          </SidebarSection>

          <SidebarSection id="timeline" title="LÍNEA DE TIEMPO">
            {graph ? (
              <Timeline
                graph={graph}
                previewOid={previewOid}
                onSelect={selectPreview}
                onStep={stepPreview}
                onJumpToPresent={() => void exitPreview()}
              />
            ) : (
              <div className="tree-empty">
                <p>Cargando línea de tiempo…</p>
              </div>
            )}
          </SidebarSection>

          <VaultSwitcher
            current={vault}
            vaults={vaults}
            onSwitch={(root) => void switchVault(root)}
            onManage={() => void openVault()}
            onNew={() => setNewVaultOpen(true)}
            onRemove={(v) => setRemoveVaultTarget(v)}
          />
        </aside>

        <div
          className="sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          title="Arrastrar para redimensionar"
          onPointerDown={startSidebarResize}
          onDoubleClick={() => {
            setSidebarWidth(250)
            localStorage.setItem('geode.sidebarWidth', '250')
          }}
        />

        <main className={`main${previewOid != null ? ' past' : ''}`}>
          <div className="pane-root">
            <PaneView
              node={panes}
              activePaneId={activePaneId}
              previewOid={previewOid}
              reloadNonces={reloadNonces}
              extraExtensions={host.listExtensions()}
              onFocusPane={focusPane}
              onSelectTab={selectTab}
              onPinTab={(paneId, path) => setPanes((prev) => pinTab(prev, paneId, path))}
              onCloseTab={(paneId, path) => void closeTab(paneId, path)}
              onReorderTab={reorderTabIn}
              onDropTab={(drag, dst, zone) => void dropTab(drag, dst, zone)}
              onSplit={splitPane}
              onNoteOpen={onPaneNoteOpen}
              onNoteChange={onPaneNoteChange}
              onSaved={onPaneSaved}
              onRequestAi={(paneId) => requestAi(paneId)}
              registerHandle={registerPaneHandle}
              onResize={onPaneResize}
            />
          </div>
        </main>

        {advanced && graphOpen && graph && (
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
              {(() => {
                const s = statusLabel(status, !!githubCfg?.connected, pushCount)
                if (!s) return null
                const { text, Icon, spin } = s
                return (
                  <span className="save-status" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon size={14} className={spin ? 'spin' : undefined} />
                    {text}
                  </span>
                )
              })()}
            </div>

            <div className="status-right">
              {/* Contador de líneas sin commitear (CHG-01): solo con cambios y en el
                  presente — se oculta durante el viaje en el tiempo (WR-02). */}
              {previewOid == null && lineStat.added + lineStat.removed > 0 && (
                <span className="line-stat">
                  <span className="added">+{lineStat.added}</span>
                  <span className="removed">−{lineStat.removed}</span>
                </span>
              )}

              <PluginStatusItems host={host} />

              {advanced && graph && graph.head.oid && (
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
                      <div className="pop-row"><span>Cambios sin subir</span><b>{pushCount}</b></div>
                      <div className="pop-row"><span>Subida automática</span><b>{githubCfg.autoPush ? 'sí' : 'no'}</b></div>
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

              {appInfo && (
                <div className="status-item" title="Versión de Geode">
                  <Info size={14} />
                  <span>v{appInfo.appVersion}</span>
                  <div className="status-pop">
                    <div className="pop-title"><Info size={13} /> Geode</div>
                    <div className="pop-row"><span>Versión</span><b>{appInfo.appVersion}</b></div>
                    <div className="pop-row"><span>Electron</span><b>{appInfo.electronVersion}</b></div>
                    <div className="pop-row"><span>Chromium</span><b>{appInfo.chromeVersion}</b></div>
                    <div className="pop-row"><span>Node</span><b>{appInfo.nodeVersion}</b></div>
                    <div className="pop-row"><span>Plataforma</span><b>{appInfo.platform}</b></div>
                  </div>
                </div>
              )}
            </div>
          </footer>

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

      {diffOid && (() => {
        // Resolver metadata humana (fecha + nombre) del commit; si no está en el
        // grafo, no pasar props: DiffView cae a su fallback humano sin hash.
        const c = graph?.commits.find((x) => x.oid === diffOid)
        return (
          <DiffView
            oid={diffOid}
            date={c ? relativeDate(c.timestamp) : undefined}
            label={c && graph ? entryLabel(c, graph.tags) : undefined}
            onClose={() => setDiffOid(null)}
          />
        )
      })()}

      {pendingDelete && (
        <ConfirmDeleteDialog
          node={pendingDelete}
          onConfirm={() => void confirmDelete()}
          onClose={() => setPendingDelete(null)}
        />
      )}

      {pendingDeleteBranch && (
        <ConfirmDeleteBranchDialog
          name={pendingDeleteBranch.name}
          merged={pendingDeleteBranch.merged}
          error={deleteBranchError}
          onConfirm={() => void confirmDeleteBranch()}
          onClose={() => {
            setPendingDeleteBranch(null)
            setDeleteBranchError(null)
          }}
        />
      )}

      {removeVaultTarget && (
        <ConfirmRemoveVaultDialog
          vaultName={removeVaultTarget.name}
          onConfirm={(fromDisk) => void removeVault(removeVaultTarget, fromDisk)}
          onClose={() => setRemoveVaultTarget(null)}
        />
      )}

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
          onClose={() => { setSettingsOpen(false); void refreshGithub(); void refreshAiUsage(); void refreshAdvanced() }}
          onConfigChange={setAiConfig}
        />
      )}

      {aiEdit && (
        <AiPromptModal
          context={aiEdit}
          onInsert={(text) => {
            (aiTargetRef.current ?? getActiveEditor())?.replaceRange(aiEdit.from, aiEdit.to, text)
            aiTargetRef.current = null
            setAiEdit(null)
            void refreshAiUsage()
          }}
          onClose={() => setAiEdit(null)}
        />
      )}

      {menu && (
        <div className="ctx-overlay" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}>
          <ul className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            {menu.node === null ? (
              // Menú de la zona vacía (raíz): solo crear nota o carpeta en la raíz.
              <>
                <li onClick={() => { setMenu(null); void newNoteIn('') }}>
                  <FilePlus size={14} /> Nueva nota
                </li>
                <li onClick={() => { setMenu(null); void newFolderIn('') }}>
                  <FolderPlus size={14} /> Nueva carpeta
                </li>
              </>
            ) : (
              // Menú de un nodo concreto (nota o carpeta).
              (() => {
                const n = menu.node
                return (
                  <>
                    {n.isDir && (
                      <>
                        <li onClick={() => { setMenu(null); void newNoteIn(n.path) }}>
                          <FilePlus size={14} /> Nueva nota
                        </li>
                        <li onClick={() => { setMenu(null); void newFolderIn(n.path) }}>
                          <FolderPlus size={14} /> Nueva carpeta
                        </li>
                        <li className="ctx-sep" />
                      </>
                    )}
                    <li onClick={() => { setRenameError(null); setRenameSeed(null); setEditingPath(n.path); setMenu(null) }}>
                      <Pencil size={14} /> Renombrar
                    </li>
                    <li className="ctx-danger" onClick={() => { setMenu(null); void deleteNode(n) }}>
                      <Trash2 size={14} /> Eliminar
                    </li>
                  </>
                )
              })()
            )}
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

/** true si `target` existe en el árbol como nota O como carpeta (recursivo).
 *  A diferencia de flattenPaths (solo hojas/notas), incluye las carpetas, para
 *  poder validar el borrado de una carpeta antes de tocar disco. */
function pathExistsInTree(nodes: TreeNode[], target: string): boolean {
  for (const n of nodes) {
    if (n.path === target) return true
    if (n.children && pathExistsInTree(n.children, target)) return true
  }
  return false
}

/** Descriptor del indicador de guardado: icono Lucide + texto humano (STAT-01). */
interface StatusDescriptor {
  text: string
  Icon: LucideIcon
  /** true ⇒ el icono gira (estado "guardando"). */
  spin?: boolean
}

/**
 * STAT-01: estado de guardado en lenguaje humano (4 frases exactas, sin hora).
 * Combina el estado de guardado con la conexión a GitHub y los cambios sin
 * subir para distinguir "Todo en la nube" de "Guardado en este dispositivo".
 *
 * Honestidad (valor central "nunca perdés nada"): "Todo en la nube" sólo puede
 * aparecer cuando el contenido está realmente confirmado Y subido — es decir
 * `clean` (== HEAD) con nada pendiente de subir. Un `saved` es sólo un
 * autoguardado en disco (contenido escrito localmente, aún sin commit), por lo
 * que siempre es "Guardado en este dispositivo": no afirmamos la nube ahí.
 */
function statusLabel(
  status: SaveStatus,
  githubConnected: boolean,
  pushCount: number
): StatusDescriptor | null {
  switch (status) {
    case 'saving':
      return { text: 'Guardando…', Icon: Loader2, spin: true }
    case 'saved':
      // Autoguardado en disco, sin commit: sólo vive en este dispositivo.
      return { text: 'Guardado en este dispositivo', Icon: HardDrive }
    case 'clean':
      // El árbol de trabajo coincide con HEAD. Sólo entonces la nube es honesta.
      if (githubConnected) {
        return pushCount === 0
          ? { text: 'Todo en la nube', Icon: Cloud }
          : { text: 'Guardado en este dispositivo', Icon: HardDrive }
      }
      return { text: 'Guardado', Icon: Check }
    default:
      return null
  }
}
