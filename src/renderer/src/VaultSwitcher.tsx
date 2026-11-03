import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ChevronRight, ChevronDown, Check, FolderOpen, Cloud, Trash2 } from 'lucide-react'
import type { VaultInfo } from '@shared/ipc'
import { t } from '@shared/i18n'

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
  /** Da de baja una bóveda: abre el diálogo de confirmación de baja. */
  onRemove: (vault: VaultInfo) => void
}

/**
 * Selector de bóvedas: vive ABAJO del sidebar y muestra la etiqueta fija
 * "Bóvedas" (es el lugar donde se gestionan las bóvedas, no el nombre de la
 * activa). Al hacer click revela un disclosure en flujo que se despliega hacia
 * arriba (empuja la sección de notas, sin overlay ni popover flotante) con la
 * lista de bóvedas (check en la activa) y las acciones "Abrir carpeta…" /
 * "Clonar o crear en GitHub…". Se cierra con Escape; su estado no se persiste.
 */
export function VaultSwitcher({
  current,
  vaults,
  onSwitch,
  onManage,
  onNew,
  onRemove
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
        title={t('Gestionar bóvedas')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={14} className="twisty" />
        ) : (
          <ChevronRight size={14} className="twisty" />
        )}
        <span className="vault-trigger-name">{t('Bóvedas')}</span>
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
              <button
                className="icon-btn vault-menu-remove"
                title={t('Quitar bóveda…')}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  onRemove(v)
                }}
              >
                <Trash2 size={14} />
              </button>
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
            <FolderOpen size={14} /> {t('Abrir carpeta…')}
          </li>
          <li
            className="vault-menu-manage"
            onClick={() => {
              setOpen(false)
              onNew()
            }}
          >
            <Cloud size={14} /> {t('Clonar o crear en GitHub…')}
          </li>
        </ul>
      )}
    </div>
  )
}
