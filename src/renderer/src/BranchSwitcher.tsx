import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ChevronsUpDown, Check, GitBranch, AlertTriangle } from 'lucide-react'
import type { GitBranchRef } from '@shared/ipc'
import { t } from '@shared/i18n'

/** Nombre de la rama de producción (coincide con PROD del servicio git). */
const PROD = 'main'

interface BranchSwitcherProps {
  branches: GitBranchRef[]
  head: { oid: string | null; branch: string | null }
  /** Cambia a la rama cuyo tip es `tip` (via checkout, con guarda de cambios). */
  onSwitch: (tip: string) => void
  /** Abre el popover hacia arriba (para usarlo en la status bar de abajo). */
  menuUp?: boolean
}

/**
 * Selector de rama para la status bar (estilo VS Code): muestra la rama actual y
 * abre un popover con las ramas para cambiar de una a otra (checkout). Si HEAD
 * está detached, avisa "versión anterior" y el popover permite volver a una rama.
 */
export function BranchSwitcher({ branches, head, onSwitch, menuUp }: BranchSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const current = head.branch
  const detached = head.oid !== null && current === null
  const isProd = current === PROD
  const sorted = [...branches].sort((a, b) =>
    a.name === PROD ? -1 : b.name === PROD ? 1 : a.name.localeCompare(b.name)
  )

  const chipClass = `branch-switch ${detached ? 'detached' : isProd ? 'prod' : 'work'}`
  const label = detached ? t('versión anterior') : current ?? '—'

  return (
    <div className="branch-switcher">
      <button
        className={chipClass}
        title={detached ? t('HEAD en una versión anterior — elegí una rama') : t('Cambiar de rama')}
        onClick={() => setOpen((o) => !o)}
      >
        {detached ? <AlertTriangle size={12} /> : <GitBranch size={12} />}
        <span className="branch-switch-name">{label}</span>
        <ChevronsUpDown size={12} className="branch-switch-chevron" />
      </button>

      {open && (
        <>
          <div className="vault-overlay" onClick={() => setOpen(false)} />
          <ul className={`branch-switch-menu${menuUp ? ' up' : ''}`}>
            {sorted.map((b) => (
              <li
                key={b.name}
                className={b.name === current ? 'sel' : ''}
                onClick={() => {
                  setOpen(false)
                  if (b.name !== current) onSwitch(b.tip)
                }}
              >
                <GitBranch size={12} className="tag-filter-icon" />
                <span className="vault-menu-name">{b.name}</span>
                {b.name === PROD && <span className="branch-tag prod">{t('prod')}</span>}
                {b.name === current && <Check size={14} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
