import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { AiConfig, GitGraph, TreeNode, VaultInfo } from '@shared/ipc'
import { CodeMirrorEditor } from './editor/CodeMirrorEditor'
import { FileTree } from './FileTree'
import { VersionGraph } from './VersionGraph'
import { CommitDialog } from './CommitDialog'
import { SettingsModal } from './SettingsModal'

type SaveStatus = 'none' | 'clean' | 'saving' | 'saved'
const AUTOSAVE_MS = 600

export function App(): JSX.Element {
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('none')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graph, setGraph] = useState<GitGraph | null>(null)
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commitChanges, setCommitChanges] = useState<string[] | null>(null)

  // Journal: guardado pendiente + timer de autosave, en refs.
  const pendingRef = useRef<{ path: string; content: string } | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const openPathRef = useRef<string | null>(null)
  openPathRef.current = openPath

  const refreshTree = useCallback(async () => {
    setTree(await window.geode.vault.tree())
  }, [])

  const refreshGraph = useCallback(async () => {
    setGraph(await window.geode.git.graph())
  }, [])

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
  }, [flush])

  const loadIntoEditor = useCallback((path: string, text: string) => {
    setOpenPath(path)
    setContent(text)
    setEditorEpoch((e) => e + 1) // fuerza remonte del editor con el nuevo texto
    setStatus('clean')
  }, [])

  const openNote = useCallback(async (path: string) => {
    await flush() // journal: no perder lo tipeado al cambiar de nota
    const text = await window.geode.vault.readNote(path)
    loadIntoEditor(path, text)
  }, [flush, loadIntoEditor])

  const openVault = useCallback(async () => {
    const info = await window.geode.vault.open()
    if (!info) return
    setVault(info)
    setOpenPath(null)
    setContent('')
    setStatus('none')
    await refreshTree()
    await refreshGraph()
  }, [refreshTree, refreshGraph])

  const newNote = useCallback(async () => {
    const node = await window.geode.vault.createNote('')
    await refreshTree()
    await openNote(node.path)
  }, [refreshTree, openNote])

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
    await window.geode.git.commit(message || fallback)
    setCommitChanges(null)
    await refreshGraph()
  }, [refreshGraph])

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
    await refreshTree()
    const path = openPathRef.current
    if (path) {
      try {
        const text = await window.geode.vault.readNote(path)
        loadIntoEditor(path, text)
      } catch {
        setOpenPath(null)
        setContent('')
        setStatus('none')
      }
    }
    await refreshGraph()
  }, [flush, refreshTree, loadIntoEditor, refreshGraph])

  const toggleGraph = useCallback(() => setGraphOpen((open) => !open), [])

  // Al arrancar: restaurar vault y cargar config de IA.
  useEffect(() => {
    void (async () => {
      setAiConfig(await window.geode.ai.getConfig())
      const info = await window.geode.vault.current()
      if (!info) return
      setVault(info)
      await refreshTree()
      await refreshGraph()
    })()
  }, [refreshTree, refreshGraph])

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

  const detached = !!graph && graph.head.oid !== null && graph.head.branch === null
  const aiReady = !!aiConfig && aiConfig.enabled && aiConfig.hasKey && !!aiConfig.model

  // Red de seguridad: si el preload no cargó, window.geode no existe.
  if (typeof window.geode === 'undefined') {
    return (
      <div className="welcome">
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
        <h1>Geode</h1>
        <p className="tagline">Notas versionadas sobre Git — local-first.</p>
        <button className="primary" onClick={() => void openVault()}>
          Abrir carpeta como vault
        </button>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Geode</span>
        <span className="doc-name">{openPath ?? vault.name}</span>
        {detached && (
          <span className="detached" title="HEAD en una versión anterior">
            ⚠ versión anterior · editá para bifurcar
          </span>
        )}
        <span className="save-status">{statusLabel(status, savedAt)}</span>
        <div className="topbar-actions">
          <button title="Crear versión (Ctrl+S)" onClick={() => void openCommitDialog()}>
            Guardar versión
          </button>
          <button title="Árbol de versiones" className={graphOpen ? 'active' : ''} onClick={toggleGraph}>
            Versiones
          </button>
          <button title="Ajustes" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="vault-name" title={vault.root}>{vault.name}</span>
            <div className="sidebar-actions">
              <button title="Nueva nota" onClick={() => void newNote()}>＋</button>
              <button title="Cambiar de vault" onClick={() => void openVault()}>⏏</button>
            </div>
          </div>
          {tree.length > 0 ? (
            <FileTree nodes={tree} openPath={openPath} onOpen={(p) => void openNote(p)} />
          ) : (
            <p className="tree-empty">Vault vacío. Creá una nota con ＋.</p>
          )}
        </aside>

        <main className="main">
          <div className="editor-pane">
            {openPath ? (
              <CodeMirrorEditor
                key={`${openPath}#${editorEpoch}`}
                initialDoc={content}
                onChange={handleChange}
              />
            ) : (
              <div className="placeholder">Elegí una nota del panel, o creá una con ＋.</div>
            )}
          </div>
          <footer className="statusbar">
            {openPath ? (
              <>
                <span>{stats.words} palabras</span>
                <span>{stats.chars} caracteres</span>
                <span>{stats.lines} líneas</span>
              </>
            ) : (
              <span>Ninguna nota abierta</span>
            )}
          </footer>
        </main>

        {graphOpen && graph && (
          <VersionGraph
            graph={graph}
            onSelect={(oid) => void goToVersion(oid)}
            onClose={() => setGraphOpen(false)}
          />
        )}
      </div>

      {commitChanges && (
        <CommitDialog
          changes={commitChanges}
          aiReady={aiReady}
          onConfirm={doCommit}
          onClose={() => setCommitChanges(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onConfigChange={setAiConfig} />
      )}
    </div>
  )
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
