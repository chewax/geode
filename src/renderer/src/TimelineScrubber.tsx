import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { History, RotateCcw, X } from 'lucide-react'
import type { NoteVersion } from '@shared/ipc'

/**
 * Línea de tiempo de UNA nota: un slider para "rebobinar" y ver el contenido en
 * cada versión guardada (commit donde la nota cambió), con fecha y mensaje.
 * "Restaurar" trae ese contenido a la nota como cambio pendiente (no reescribe
 * historia): el usuario decide guardarlo como una versión nueva.
 */

function noteName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '')
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function TimelineScrubber({
  path,
  onRestore,
  onClose
}: {
  path: string
  onRestore: (content: string) => void
  onClose: () => void
}): JSX.Element {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cache = useMemo(() => new Map<string, string>(), [path]) // contenido por oid

  // Cargar el historial al abrir; arrancar en la versión más nueva.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await window.geode.git.noteHistory(path)
        if (cancelled) return
        setVersions(list)
        setIdx(list.length > 0 ? list.length - 1 : 0)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  const current = versions && versions[idx]

  // Cargar el contenido de la versión seleccionada (cache por oid).
  useEffect(() => {
    if (!current) return
    const oid = current.oid
    if (cache.has(oid)) {
      setContent(cache.get(oid) as string)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const text = await window.geode.git.readNoteAt(oid, path)
        if (cancelled) return
        cache.set(oid, text)
        setContent(text)
      } catch (e) {
        if (!cancelled) setContent(`(no se pudo leer esta versión: ${(e as Error).message})`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [current, path, cache])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal timeline-modal" onClick={(e) => e.stopPropagation()}>
        <div className="timeline-head">
          <h2>
            <History size={16} /> Línea de tiempo — {noteName(path)}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {error ? (
          <p className="modal-error">⚠ {error}</p>
        ) : !versions ? (
          <p className="plugin-empty">Cargando historial…</p>
        ) : versions.length === 0 ? (
          <p className="plugin-empty">Esta nota todavía no tiene versiones guardadas.</p>
        ) : (
          current && (
            <>
              <div className="timeline-meta">
                <span className="tl-pos">
                  Versión {idx + 1} de {versions.length}
                </span>
                <span className="tl-date">{fmtDate(current.timestamp)}</span>
              </div>
              <div className="tl-msg" title={current.message}>
                {current.message || '(sin mensaje)'}
              </div>

              <input
                className="tl-slider"
                type="range"
                min={0}
                max={versions.length - 1}
                value={idx}
                onChange={(e) => setIdx(Number(e.target.value))}
              />
              <div className="tl-ends">
                <span>más vieja</span>
                <span>más nueva</span>
              </div>

              <pre className={`tl-preview${loading ? ' loading' : ''}`}>{content}</pre>

              <div className="modal-actions timeline-actions">
                <button onClick={onClose}>Cerrar</button>
                <button
                  className="primary"
                  title="Trae este contenido a la nota (queda como cambio sin guardar)"
                  onClick={() => onRestore(content)}
                >
                  <RotateCcw size={14} /> Restaurar esta versión
                </button>
              </div>
            </>
          )
        )}
      </div>
    </div>
  )
}
