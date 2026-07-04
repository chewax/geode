import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ChevronsUpDown, Check, FolderOpen, Cloud } from 'lucide-react'
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
  /** "Clonar o crear en GitHub…": abre el diálogo de nueva bóveda. */
  onNew: () => void
}

/**
 * Cabecera de bóveda estilo VSCode-Explorer: vive arriba del sidebar y muestra
 * el nombre de la bóveda activa; al hacer click revela un disclosure en flujo
 * (empuja las secciones hacia abajo, sin overlay ni popover flotante) con la
 * lista de bóvedas (check en la activa) y las acciones "Abrir carpeta…" /
 * "Clonar o crear en GitHub…". Se cierra con Escape; su estado no se persiste.
 */
export function VaultSwitcher({
  current,
  vaults,
  onSwitch,
  onManage,
  onNew
}: VaultSwitcherProps): JSX.Element {
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
    <div className="vault-header">
      <button
        className="vault-trigger"
        title={current.root}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronsUpDown size={14} className="twisty" />
        <span className="vault-trigger-name">{current.name}</span>
      </button>

      {open && (
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
            <FolderOpen size={14} /> Abrir carpeta…
          </li>
          <li
            className="vault-menu-manage"
            onClick={() => {
              setOpen(false)
              onNew()
            }}
          >
            <Cloud size={14} /> Clonar o crear en GitHub…
          </li>
        </ul>
      )}
    </div>
  )
}
