import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ChevronRight, ChevronDown, Check, FolderOpen, CloudDownload, Plus, Trash2 } from 'lucide-react'
import type { VaultInfo } from '@shared/ipc'
import { t } from '@shared/i18n'

export interface VaultSwitcherProps {
  /** Cuaderno activo (para marcarlo con el check). */
  current: VaultInfo
  /** Cuadernos conocidos a listar. */
  vaults: VaultInfo[]
  /** Cambiar a un cuaderno ya conocido por su ruta. */
  onSwitch: (root: string) => void
  /** "Abrir carpeta…": abre una carpeta existente como cuaderno. */
  onManage: () => void
  /** "Nuevo cuaderno…" / "Traer de GitHub…": abre el diálogo de cuaderno nuevo en esa pestaña. */
  onNew: (mode: 'local' | 'clone') => void
  /** Da de baja un cuaderno: abre el diálogo de confirmación de baja. */
  onRemove: (vault: VaultInfo) => void
}

/**
 * Selector de cuadernos: vive ABAJO del sidebar y muestra la etiqueta fija
 * "Cuadernos" (es el lugar donde se gestionan los cuadernos, no el nombre del
 * activo). Al hacer click revela un disclosure en flujo que se despliega hacia
 * arriba (empuja la sección de notas, sin overlay ni popover flotante) con la
 * lista de cuadernos (check en el activo) y las acciones "Nuevo cuaderno…" (local,
 * sin cuenta), "Abrir carpeta…" y "Traer de GitHub…". Se cierra con Escape; su
 * estado no se persiste.
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
        title={t('Gestionar cuadernos')}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={14} className="twisty" />
        ) : (
          <ChevronRight size={14} className="twisty" />
        )}
        <span className="vault-trigger-name">{t('Cuadernos')}</span>
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
                title={t('Quitar cuaderno…')}
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
              onNew('local')
            }}
          >
            <Plus size={14} /> {t('Nuevo cuaderno…')}
          </li>
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
              onNew('clone')
            }}
          >
            <CloudDownload size={14} /> {t('Traer de GitHub…')}
          </li>
        </ul>
      )}
    </div>
  )
}
