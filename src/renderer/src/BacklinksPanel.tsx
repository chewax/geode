import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { FileText } from 'lucide-react'
import type { Backlink } from '@shared/ipc'
import { displayName } from '@shared/links'
import { t } from '@shared/i18n'
import { tx } from './i18n'

export interface BacklinksPanelProps {
  /** Nota activa (null = ninguna). */
  path: string | null
  /** Cambia cuando algo se guardó: dispara un recálculo (con debounce). */
  refreshKey: number
  /** Durante el viaje en el tiempo no se calcula (los enlaces son del presente). */
  disabled: boolean
  onOpen: (path: string, line: number) => void
}

const DEBOUNCE_MS = 800

/**
 * "Enlaces entrantes": qué notas mencionan a la nota activa con `[[...]]`. Es la
 * mitad que hace que los enlaces sirvan para pensar: ver desde dónde llegás.
 */
export function BacklinksPanel({ path, refreshKey, disabled, onOpen }: BacklinksPanelProps): JSX.Element {
  const [links, setLinks] = useState<Backlink[] | null>(null)

  useEffect(() => {
    if (!path || disabled) {
      setLinks(null)
      return
    }
    let cancelled = false
    const id = window.setTimeout(async () => {
      try {
        const res = await window.geode.vault.backlinks(path)
        if (!cancelled) setLinks(res)
      } catch {
        if (!cancelled) setLinks([])
      }
    }, refreshKey === 0 ? 0 : DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [path, refreshKey, disabled])

  if (disabled) return <div className="tree-empty"><p>{t('Disponible en el presente.')}</p></div>
  if (!path) return <div className="tree-empty"><p>{t('Abrí una nota para ver qué notas la enlazan.')}</p></div>
  if (links === null) return <div className="tree-empty"><p>{t('Buscando enlaces…')}</p></div>
  if (links.length === 0) {
    return (
      <div className="tree-empty">
        <p>{t('Ninguna nota enlaza a «{name}» todavía.', { name: displayName(path) })}</p>
        <p>{tx('Escribí {link} en otra nota para conectarlas.', { link: <code>[[{displayName(path)}]]</code> })}</p>
      </div>
    )
  }

  return (
    <ul className="backlinks">
      {links.map((l) => (
        <li key={`${l.path}:${l.line}`}>
          <button className="backlink" title={l.path} onClick={() => onOpen(l.path, l.line)}>
            <span className="backlink-name">
              <FileText size={12} /> {displayName(l.path)}
            </span>
            <span className="backlink-context">{l.context}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
