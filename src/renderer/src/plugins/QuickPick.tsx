import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import type { PluginHost, PickRequest } from './host'
import { t } from '@shared/i18n'

/**
 * Selector rápido genérico (mismo look que la paleta de comandos). Lo abren los
 * plugins con `ctx.ui.pick(...)`; se monta sólo mientras hay un pedido en curso.
 */
export function QuickPick({ host }: { host: PluginHost }): JSX.Element | null {
  useSyncExternalStore(host.subscribe, host.getVersion)
  const req = host.currentPick()
  if (!req) return null
  // `key` reinicia el estado interno con cada pedido nuevo.
  return <QuickPickInner key={req.id} req={req} />
}

function QuickPickInner({ req }: { req: PickRequest }): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q
      ? req.items.filter((i) => `${i.label} ${i.detail ?? ''}`.toLowerCase().includes(q))
      : req.items
  }, [req, query])

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results.length])

  const choose = (i: number): void => {
    const item = results[i]
    if (item) req.resolve(item.value)
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active) }
    else if (e.key === 'Escape') { e.preventDefault(); req.resolve(null) }
  }

  return (
    <div className="modal-overlay palette-overlay" onClick={() => req.resolve(null)}>
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={15} />
          <input ref={inputRef} value={query} placeholder={req.placeholder} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <ul className="palette-list">
          {results.length === 0 ? (
            <li className="palette-empty">{t('Sin resultados para «{query}»', { query })}</li>
          ) : (
            results.map((item, i) => (
              <li
                key={`${item.label}-${i}`}
                className={`palette-item${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="palette-title">{item.label}</span>
                {item.detail && <span className="palette-shortcut">{item.detail}</span>}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
