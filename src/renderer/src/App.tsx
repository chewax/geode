import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { GitVersion, TreeNode, VaultInfo } from '@shared/ipc'
import { CodeMirrorEditor } from './editor/CodeMirrorEditor'
import { FileTree } from './FileTree'
import { HistoryPanel } from './HistoryPanel'

type SaveStatus = 'none' | 'clean' | 'saving' | 'saved'
const AUTOSAVE_MS = 600
const AUTOCOMMIT_MS = 5000

export function App(): JSX.Element {
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('none')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<GitVersion[]>([])

  // Guardado pendiente + timers (autosave y auto-commit) en refs.
  const pendingRef = useRef<{ path: string; content: string } | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const commitTimerRef = useRef<number | null>(null)
  // Ref para leer el openPath actual dentro de callbacks estables.
  const openPathRef = useRef<string | null>(null)
  openPathRef.current = openPath

  const refreshTree = useCallback(async () => {
    setTree(await window.geode.vault.tree())
  }, [])

  const refreshHistory = useCallback(async (path: string | null) => {
    setVersions(path ? await window.geode.git.history(path) : [])
  }, [])

  /** Persiste inmediatamente lo que haya pendiente (autosave o cambio de nota). */
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

  /** Agrupa cambios en un commit. Refresca el historial si hubo commit. */
  const commitNow = useCallback(async (message?: string) => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
    await flush() // el archivo tiene que estar escrito antes de commitear
    const oid = await window.geode.git.commit(message)
    if (oid) await refreshHistory(openPathRef.current)
    return oid
  }, [flush, refreshHistory])

  const handleChange = useCallback((doc: string) => {
    const path = openPathRef.current
    if (!path) return
    setContent(doc)
    pendingRef.current = { path, content: doc }
    setStatus('saving')

    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)

    // Auto-commit agrupado: se dispara tras una pausa de edición más larga.
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current)
    commitTimerRef.current = window.setTimeout(() => void commitNow(), AUTOCOMMIT_MS)
  }, [flush, commitNow])

  const loadIntoEditor = useCallback((path: string, text: string) => {
    setOpenPath(path)
    setContent(text)
    setEditorEpoch((e) => e + 1) // fuerza remonte del editor con el nuevo texto
    setStatus('clean')
  }, [])

  const openNote = useCallback(async (path: string) => {
    await flush() // no perder cambios de la nota anterior al cambiar
    const text = await window.geode.vault.readNote(path)
    loadIntoEditor(path, text)
    await refreshHistory(path)
  }, [flush, loadIntoEditor, refreshHistory])

  const openVault = useCallback(async () => {
    const info = await window.geode.vault.open()
    if (!info) return
    setVault(info)
    setOpenPath(null)
    setContent('')
    setStatus('none')
    setVersions([])
    await refreshTree()
  }, [refreshTree])

  const newNote = useCallback(async () => {
    const node = await window.geode.vault.createNote('')
    await refreshTree()
    await openNote(node.path)
  }, [refreshTree, openNote])

  const restore = useCallback(async (version: GitVersion) => {
    const path = openPathRef.current
    if (!path) return
    const text = await window.geode.git.readAt(version.oid, path)
    await window.geode.vault.writeNote(path, text)
    loadIntoEditor(path, text)
    setStatus('saved')
    setSavedAt(new Date())
    await commitNow(`Restaurar "${path}" a ${version.oid.slice(0, 7)}`)
  }, [loadIntoEditor, commitNow])

  const toggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      const next = !open
      if (next) void refreshHistory(openPathRef.current)
      return next
    })
  }, [refreshHistory])

  // Al arrancar: restaurar el vault del último uso.
  useEffect(() => {
    void (async () => {
      const info = await window.geode.vault.current()
      if (!info) return
      setVault(info)
      await refreshTree()
    })()
  }, [refreshTree])

  // Ctrl/Cmd+S: crea una versión (commit) inmediata.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void commitNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commitNow])

  const stats = useMemo(() => {
    const chars = content.length
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    const lines = content.split('\n').length
    return { chars, words, lines }
  }, [content])

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
        <span className="save-status">{statusLabel(status, savedAt)}</span>
        <div className="topbar-actions">
          <button title="Crear versión (Ctrl+S)" disabled={!openPath} onClick={() => void commitNow()}>
            Guardar versión
          </button>
          <button title="Historial de la nota" disabled={!openPath} onClick={toggleHistory}>
            Historial
          </button>
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

        {historyOpen && openPath && (
          <HistoryPanel
            versions={versions}
            onRestore={(v) => void restore(v)}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>
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
