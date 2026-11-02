import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { FileText, Loader2, Search, X } from 'lucide-react'
import type { SearchResult } from '@shared/ipc'
import { dirName, displayName } from '@shared/links'

export interface SearchPanelProps {
  /** Cambia para re-enfocar el input (al reabrir con Ctrl+Shift+F). */
  focusNonce: number
  /** Durante el viaje en el tiempo la búsqueda se deshabilita (busca en el presente). */
  disabled: boolean
  /** Abre una nota y, si viene, selecciona la coincidencia. */
  onOpen: (path: string, at?: { line: number; col: number; length: number }) => void
  onClose: () => void
}

const DEBOUNCE_MS = 220

/**
 * Búsqueda de texto completo en la bóveda (Ctrl+Shift+F). Ignora mayúsculas y
 * tildes. Los resultados se agrupan por nota; un click abre la nota con la
 * coincidencia seleccionada.
 */
export function SearchPanel({ focusNonce, disabled, onOpen, onClose }: SearchPanelProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusNonce])

  useEffect(() => {
    const q = query.trim()
    if (!q || disabled) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const seq = ++seqRef.current
    const id = window.setTimeout(async () => {
      try {
        const res = await window.geode.vault.search(q)
        if (seq !== seqRef.current) return // llegó una consulta más nueva
        setResults(res)
        setError(null)
      } catch (e) {
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : 'No se pudo buscar')
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [query, disabled])

  const total = results?.reduce((n, r) => n + r.matches.length, 0) ?? 0

  return (
    <div className="search-panel">
      <div className="search-input">
        <Search size={14} />
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          placeholder={disabled ? 'Volvé al presente para buscar' : 'Buscar en todas las notas…'}
          aria-label="Buscar en todas las notas"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              if (query) setQuery('')
              else onClose()
            } else if (e.key === 'Enter' && results && results[0]) {
              const r = results[0]
              onOpen(r.path, r.matches[0])
            }
          }}
        />
        {loading ? (
          <Loader2 size={14} className="spin" />
        ) : query ? (
          <button className="icon-btn search-clear" title="Limpiar" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}>
            <X size={12} />
          </button>
        ) : null}
      </div>

      {error && <p className="modal-error">{error}</p>}

      {results && (
        <div className="search-summary">
          {results.length === 0
            ? 'Sin resultados'
            : `${total} ${total === 1 ? 'coincidencia' : 'coincidencias'} en ${results.length} ${results.length === 1 ? 'nota' : 'notas'}`}
        </div>
      )}

      {results && results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.path} className="search-file">
              <button className="search-file-head" title={r.path} onClick={() => onOpen(r.path, r.matches[0])}>
                <FileText size={13} />
                <span className="search-file-name">{displayName(r.path)}</span>
                {dirName(r.path) && <span className="search-file-dir">{dirName(r.path)}</span>}
                {r.matches.length > 0 && <span className="search-count">{r.matches.length}</span>}
              </button>
              {r.matches.length > 0 && (
                <ul className="search-matches">
                  {r.matches.map((m) => (
                    <li key={`${m.line}:${m.col}`}>
                      <button className="search-match" onClick={() => onOpen(r.path, m)}>
                        <span>{m.before}</span>
                        <mark>{m.text}</mark>
                        <span>{m.after}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
