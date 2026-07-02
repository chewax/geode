import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ChevronsUpDown, Check, FolderOpen } from 'lucide-react'
import type { VaultInfo } from '@shared/ipc'

export interface VaultSwitcherProps {
  /** Bóveda activa (para marcarla con el check). */
  current: VaultInfo
  /** Bóvedas conocidas a listar. */
  vaults: VaultInfo[]
  /** Cambiar a una bóveda ya conocida por su ruta. */
  onSwitch: (root: string) => void
  /** "Gestionar bóvedas…": abre el diálogo de carpeta. */
  onManage: () => void
}

/**
 * Selector de bóveda estilo Obsidian: chip con el nombre en la barra inferior
 * del sidebar; al hacer click abre un popover hacia arriba con la lista de
 * bóvedas (check en la activa) y "Gestionar bóvedas…".
 */
export function VaultSwitcher({ current, vaults, onSwitch, onManage }: VaultSwitcherProps): JSX.Element {
  const [open, setOpen] = useState(false)

  // Cerrar con Escape mientras está abierto.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="vault-switcher">
      <button
        className="vault-trigger"
        title={current.root}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronsUpDown size={14} className="twisty" />
        <span className="vault-trigger-name">{current.name}</span>
      </button>

      {open && (
        <>
          <div className="vault-overlay" onClick={() => setOpen(false)} />
          <ul className="vault-menu">
            {vaults.map((v) => (
              <li
                key={v.root}
                className={v.root === current.root ? 'sel' : ''}
                title={v.root}
                onClick={() => {
                  setOpen(false)
                  if (v.root !== current.root) onSwitch(v.root)
                }}
              >
                <span className="vault-menu-name">{v.name}</span>
                {v.root === current.root && <Check size={14} />}
              </li>
            ))}
            <li className="vault-menu-sep" />
            <li
              className="vault-menu-manage"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <FolderOpen size={14} /> Gestionar bóvedas…
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
