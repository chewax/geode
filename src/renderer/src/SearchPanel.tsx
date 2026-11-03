import { t } from '@shared/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** Consulta a cargar desde afuera (p. ej. click en un #tag); cambia el nonce para reaplicar. */
  seed?: { text: string; nonce: number } | null
}

const DEBOUNCE_MS = 220

/**
 * Búsqueda de texto completo en la bóveda (Ctrl+Shift+F). Ignora mayúsculas y
 * tildes. Los resultados se agrupan por nota; un click abre la nota con la
 * coincidencia seleccionada.
 */
export function SearchPanel({ focusNonce, disabled, onOpen, onClose, seed }: SearchPanelProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)
  /**
   * Resultados descartados por el usuario (estilo VSCode): claves `ruta` para una
   * nota entera o `ruta:línea:col` para una coincidencia. Sólo ocultan de la
   * lista; se olvidan al cambiar la consulta.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusNonce])

  useEffect(() => {
    if (seed) setQuery(seed.text)
  }, [seed])

  useEffect(() => {
    setDismissed(new Set())
  }, [query])

  const dismiss = (key: string): void => setDismissed((prev) => new Set(prev).add(key))

  /** Resultados visibles: sin las notas ni coincidencias descartadas. */
  const visible = useMemo(() => {
    if (!results) return null
    return results
      .filter((r) => !dismissed.has(r.path))
      .map((r) => ({ ...r, matches: r.matches.filter((m) => !dismissed.has(`${r.path}:${m.line}:${m.col}`)) }))
      // Una nota que sólo coincidía por contenido y perdió todas sus coincidencias, se va.
      .filter((r) => r.nameMatch || r.matches.length > 0)
  }, [results, dismissed])

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

  const total = visible?.reduce((n, r) => n + r.matches.length, 0) ?? 0

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
            } else if (e.key === 'Enter' && visible && visible[0]) {
              const r = visible[0]
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

      {!query.trim() && !disabled && (
        <div className="search-hint">
          <p>{t('También podés filtrar:')}</p>
          <ul>
            <li><code>estado:pendiente</code> {t('por propiedad')}</li>
            <li><code>fecha:&gt;2026-01-01</code> {t('mayor, menor (>, <, >=, <=)')}</li>
            <li><code>#trabajo</code> {t('por etiqueta')}</li>
            <li><code>-estado:hecho</code> {t('excluir')}</li>
          </ul>
        </div>
      )}

      {visible && (
        <div className="search-summary">
          <span>
            {visible.length === 0
              ? 'Sin resultados'
              : `${total} ${total === 1 ? 'coincidencia' : 'coincidencias'} en ${visible.length} ${visible.length === 1 ? 'nota' : 'notas'}`}
          </span>
          {dismissed.size > 0 && (
            <button className="link-btn search-restore" onClick={() => setDismissed(new Set())}>
              Mostrar descartados
            </button>
          )}
        </div>
      )}

      {visible && visible.length > 0 && (
        <ul className="search-results">
          {visible.map((r) => (
            <li key={r.path} className="search-file">
              <div className="search-row">
                <button className="search-file-head" title={r.path} onClick={() => onOpen(r.path, r.matches[0])}>
                  <FileText size={13} />
                  <span className="search-file-name">{displayName(r.path)}</span>
                  {dirName(r.path) && <span className="search-file-dir">{dirName(r.path)}</span>}
                  {r.matches.length > 0 && <span className="search-count">{r.matches.length}</span>}
                </button>
                <button
                  className="icon-btn search-dismiss"
                  title="Descartar esta nota de los resultados"
                  aria-label={`Descartar ${displayName(r.path)} de los resultados`}
                  onClick={() => dismiss(r.path)}
                >
                  <X size={12} />
                </button>
              </div>
              {r.matches.length > 0 && (
                <ul className="search-matches">
                  {r.matches.map((m) => (
                    <li key={`${m.line}:${m.col}`} className="search-row">
                      <button className="search-match" onClick={() => onOpen(r.path, m)}>
                        <span>{m.before}</span>
                        <mark>{m.text}</mark>
                        <span>{m.after}</span>
                      </button>
                      <button
                        className="icon-btn search-dismiss"
                        title="Descartar esta coincidencia"
                        aria-label="Descartar esta coincidencia"
                        onClick={() => dismiss(`${r.path}:${m.line}:${m.col}`)}
                      >
                        <X size={12} />
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
