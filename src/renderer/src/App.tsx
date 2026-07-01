import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { TreeNode, VaultInfo } from '@shared/ipc'
import { CodeMirrorEditor } from './editor/CodeMirrorEditor'
import { FileTree } from './FileTree'

type SaveStatus = 'none' | 'clean' | 'saving' | 'saved'
const AUTOSAVE_MS = 600

export function App(): JSX.Element {
  const [vault, setVault] = useState<VaultInfo | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SaveStatus>('none')
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Guardado pendiente + timer del debounce, en refs para no recrear callbacks.
  const pendingRef = useRef<{ path: string; content: string } | null>(null)
  const timerRef = useRef<number | null>(null)

  const refreshTree = useCallback(async () => {
    setTree(await window.geode.vault.tree())
  }, [])

  /** Persiste inmediatamente lo que haya pendiente (autosave o cambio de nota). */
  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    await window.geode.vault.writeNote(pending.path, pending.content)
    setStatus('saved')
    setSavedAt(new Date())
  }, [])

  const handleChange = useCallback((doc: string) => {
    if (!openPath) return
    setContent(doc)
    pendingRef.current = { path: openPath, content: doc }
    setStatus('saving')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
  }, [openPath, flush])

  const openNote = useCallback(async (path: string) => {
    await flush() // no perder cambios de la nota anterior al cambiar
    const text = await window.geode.vault.readNote(path)
    setOpenPath(path)
    setContent(text)
    setStatus('clean')
  }, [flush])

  const openVault = useCallback(async () => {
    const info = await window.geode.vault.open()
    if (!info) return
    setVault(info)
    setOpenPath(null)
    setContent('')
    setStatus('none')
    await refreshTree()
  }, [refreshTree])

  const newNote = useCallback(async () => {
    const node = await window.geode.vault.createNote('')
    await refreshTree()
    await openNote(node.path)
  }, [refreshTree, openNote])

  // Al arrancar: restaurar el vault del último uso.
  useEffect(() => {
    void (async () => {
      const info = await window.geode.vault.current()
      if (!info) return
      setVault(info)
      await refreshTree()
    })()
  }, [refreshTree])

  // Ctrl/Cmd+S: guardado manual inmediato.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void flush()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flush])

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
              <CodeMirrorEditor key={openPath} initialDoc={content} onChange={handleChange} />
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
