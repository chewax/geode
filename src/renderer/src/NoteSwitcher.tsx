import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode } from 'react'
import { FilePlus, FileText, Search, Star } from 'lucide-react'
import { fuzzyNotes } from '@shared/fuzzy'
import { dirName, displayName, isNotePath } from '@shared/links'
import { t } from '@shared/i18n'

export interface NoteSwitcherProps {
  /** Todos los archivos de la bóveda (rutas relativas). */
  files: string[]
  /** Notas abiertas hace poco, la más reciente primero (se muestran sin consulta). */
  recent: string[]
  /** Notas marcadas como favoritas (se muestran con estrella). */
  bookmarks: string[]
  onOpen: (path: string) => void
  /** Crear una nota nueva con ese nombre (si no hay una que coincida exacto). */
  onCreate: (name: string) => void
  onClose: () => void
}

type Row = { kind: 'note'; path: string; hits: number[] } | { kind: 'create'; name: string }

/**
 * Ctrl+O: abrir una nota por su nombre. Sin consulta muestra las recientes;
 * con consulta, búsqueda difusa por nombre y carpeta. Enter abre; si no hay una
 * nota con ese nombre exacto, la última opción la crea.
 */
export function NoteSwitcher({ files, recent, bookmarks, onOpen, onCreate, onClose }: NoteSwitcherProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const notes = useMemo(() => files.filter(isNotePath), [files])
  const marked = useMemo(() => new Set(bookmarks), [bookmarks])

  const rows = useMemo((): Row[] => {
    const q = query.trim()
    if (!q) {
      const existing = new Set(notes)
      const first = [...bookmarks, ...recent].filter((p, i, a) => existing.has(p) && a.indexOf(p) === i)
      const rest = notes.filter((p) => !first.includes(p)).sort((a, b) => a.localeCompare(b))
      return [...first, ...rest].slice(0, 50).map((path) => ({ kind: 'note', path, hits: [] }))
    }
    const found: Row[] = fuzzyNotes(notes, q).map((h) => ({ kind: 'note', path: h.path, hits: h.nameHits }))
    const exact = notes.some((p) => displayName(p).toLowerCase() === q.toLowerCase() || p.toLowerCase() === `${q.toLowerCase()}.md`)
    if (!exact) found.push({ kind: 'create', name: q })
    return found
  }, [query, notes, recent, bookmarks])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (i: number): void => {
    const row = rows[i]
    if (!row) return
    onClose()
    if (row.kind === 'note') onOpen(row.path)
    else onCreate(row.name)
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Shift+Enter: crear siempre, aunque haya coincidencias (como Obsidian).
      if (e.shiftKey && query.trim()) {
        onClose()
        onCreate(query.trim())
      } else choose(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div className="palette" role="dialog" aria-label={t('Abrir nota')} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t('Buscá una nota por su nombre…')}
            aria-label={t('Nombre de la nota')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="palette-list" ref={listRef}>
          {rows.length === 0 && <li className="palette-empty">{t('Todavía no hay notas')}</li>}
          {rows.map((row, i) => (
            <li
              key={row.kind === 'note' ? row.path : '\0create'}
              className={`palette-item switcher-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {row.kind === 'note' ? (
                <>
                  {marked.has(row.path) ? <Star size={14} className="switcher-icon starred" /> : <FileText size={14} className="switcher-icon" />}
                  <span className="palette-title">{highlight(displayName(row.path), row.hits)}</span>
                  {dirName(row.path) && <span className="palette-shortcut">{dirName(row.path)}</span>}
                </>
              ) : (
                <>
                  <FilePlus size={14} className="switcher-icon" />
                  <span className="palette-title">{t('Crear «{name}»', { name: row.name })}</span>
                  <span className="palette-shortcut">Shift+Enter</span>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Resalta las letras que coincidieron con la búsqueda. */
function highlight(text: string, hits: number[]): ReactNode {
  if (hits.length === 0) return text
  const set = new Set(hits)
  const out: ReactNode[] = []
  let buf = ''
  let on = false
  const push = (): void => {
    if (!buf) return
    out.push(on ? <b key={out.length}>{buf}</b> : buf)
    buf = ''
  }
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i)
    if (hit !== on) {
      push()
      on = hit
    }
    buf += text[i]
  }
  push()
  return out
}
