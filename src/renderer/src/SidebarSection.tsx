import { useState, useCallback } from 'react'
import type { JSX, ReactNode, KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface SidebarSectionProps {
  /** Identificador estable; sirve de clave de persistencia del colapso. */
  id: string
  /** Etiqueta de la cabecera, en mayúsculas (estilo VSCode-Explorer). */
  title: string
  /** Acciones alineadas a la derecha de la cabecera; se revelan al hacer hover. */
  actions?: ReactNode
  /** Si el cuerpo crece para llenar el alto disponible del sidebar. */
  flex?: boolean
  /** Contenido de la sección (p. ej. el árbol de notas). */
  children: ReactNode
}

/**
 * Sección colapsable reutilizable estilo VSCode-Explorer: cabecera compacta con
 * twisty a la izquierda, etiqueta en mayúsculas y acciones a la derecha visibles
 * al hover; el cuerpo se oculta con display:none al colapsar (sin desmontar, para
 * conservar el estado interno de expansión de sus hijos, p. ej. FileTree).
 *
 * Posee su propio estado de colapso y lo persiste en localStorage bajo la clave
 * `geode.section.${id}.collapsed`, siguiendo el idioma de `geode.sidebarWidth`.
 * Lista para acoger la sección Timeline (Fase 2) con id="timeline" sin cambios.
 */
export function SidebarSection({
  id,
  title,
  actions,
  flex,
  children
}: SidebarSectionProps): JSX.Element {
  const key = `geode.section.${id}.collapsed`
  // Lectura defensiva: cualquier valor ausente/manipulado degrada a "expandido".
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(key) === '1')

  const toggle = useCallback((): void => {
    setCollapsed((v) => {
      const next = !v
      localStorage.setItem(key, next ? '1' : '0')
      return next
    })
  }, [key])

  // Enter y Space alternan el colapso cuando la cabecera tiene el foco.
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    },
    [toggle]
  )

  return (
    <section className={`sidebar-section${flex && !collapsed ? ' flex' : ''}`}>
      <div
        className="sidebar-section-header"
        tabIndex={0}
        role="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expandir sección ${title}` : `Colapsar sección ${title}`}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        {collapsed ? (
          <ChevronRight className="twisty" size={14} />
        ) : (
          <ChevronDown className="twisty" size={14} />
        )}
        <span className="sidebar-section-label">{title}</span>
        {/* Las acciones solo existen cuando la sección está expandida; un click en
            ellas no debe alternar el colapso (stopPropagation). */}
        {!collapsed && actions && (
          <div className="sidebar-section-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      <div className="sidebar-section-body" style={collapsed ? { display: 'none' } : undefined}>
        {children}
      </div>
    </section>
  )
}
