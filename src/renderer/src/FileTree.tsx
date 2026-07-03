import { useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Folder, FileText, Trash2 } from 'lucide-react'
import type { TreeNode } from '@shared/ipc'

export interface FileTreeProps {
  nodes: TreeNode[]
  openPath: string | null
  /** Nodo seleccionado (archivo o carpeta), resaltado. El "+" crea acá dentro. */
  selectedPath: string | null
  /** Ruta que está en edición de nombre (input inline), o null. */
  editingPath: string | null
  /** Ruta a revelar: sus carpetas ancestro se auto-expanden (p. ej. al crear). */
  revealPath: string | null
  /** Estado por defecto de las carpetas (para colapsar/expandir todo). */
  defaultExpanded: boolean
  /** Cambia cada vez que se pide colapsar/expandir todo: reinicia el estado. */
  collapseVersion: number
  onOpen: (path: string) => void
  /** Selecciona un nodo (click en archivo o carpeta). */
  onSelect: (node: TreeNode) => void
  onContext: (node: TreeNode, x: number, y: number) => void
  onRename: (node: TreeNode, newName: string) => void
  onRenameCancel: () => void
  /** Del/Supr sobre el elemento enfocado. */
  onDelete: (node: TreeNode) => void
}

/** Nombre visible de un nodo (las notas se muestran sin la extensión .md). */
function displayName(node: TreeNode): string {
  return node.isDir ? node.name : node.name.replace(/\.md$/i, '')
}

/** Sangría por nivel (px). El fondo de la fila llega hasta el borde; solo el
 *  contenido se corre, como en VSCode. */
const INDENT = 14

/** Árbol de notas y carpetas. Carpetas colapsables; acciones por menú contextual. */
export function FileTree(props: FileTreeProps): JSX.Element {
  return (
    <ul className="tree">
      {props.nodes.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} {...props} />
      ))}
    </ul>
  )
}

function TreeItem({
  node,
  depth,
  ...props
}: { node: TreeNode; depth: number } & Omit<FileTreeProps, 'nodes'>): JSX.Element {
  const { openPath, selectedPath, editingPath, revealPath, defaultExpanded, collapseVersion, onOpen, onSelect, onContext, onRename, onRenameCancel, onDelete } = props
  const [expanded, setExpanded] = useState(defaultExpanded)

  // "Colapsar/expandir todo": al cambiar la señal, reiniciar al estado pedido.
  useEffect(() => setExpanded(defaultExpanded), [collapseVersion, defaultExpanded])

  // Auto-expandir si hay que revelar algo que está dentro de esta carpeta
  // (p. ej. una nota recién creada, para que aparezca su input de nombre).
  useEffect(() => {
    if (node.isDir && revealPath && revealPath.startsWith(`${node.path}/`)) setExpanded(true)
  }, [revealPath, node.isDir, node.path])

  const editing = editingPath === node.path
  const selected = selectedPath === node.path

  // Del/Supr borra el elemento enfocado. Se ignora si el foco está en el input
  // de renombrar (target ≠ currentTarget) para no borrar mientras se escribe.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Delete' && e.target === e.currentTarget) {
      e.preventDefault()
      onDelete(node)
    }
  }

  const nameEl = editing ? (
    <NameInput initial={displayName(node)} onCommit={(v) => onRename(node, v)} onCancel={onRenameCancel} />
  ) : (
    <span className="node-label">{displayName(node)}</span>
  )

  // Botón de eliminar que aparece al pasar el mouse por la fila.
  const delBtn = editing ? null : (
    <button
      className="node-del"
      title="Eliminar"
      aria-label="Eliminar"
      onClick={(e) => {
        e.stopPropagation()
        onDelete(node)
      }}
    >
      <Trash2 size={13} />
    </button>
  )

  // Sangría del contenido según profundidad (el fondo igual llega al borde).
  const indent = { paddingLeft: 8 + depth * INDENT }

  if (node.isDir) {
    return (
      <li>
        <div
          className={`tree-dir${selected ? ' selected' : ''}`}
          style={indent}
          tabIndex={0}
          onClick={() => {
            onSelect(node)
            setExpanded((v) => !v)
          }}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => {
            e.preventDefault()
            onSelect(node)
            onContext(node, e.clientX, e.clientY)
          }}
        >
          {expanded ? <ChevronDown className="twisty" size={14} /> : <ChevronRight className="twisty" size={14} />}
          <Folder className="node-icon" size={15} />
          {nameEl}
          {delBtn}
        </div>
        {expanded && node.children && node.children.length > 0 && (
          <ul className="tree-children">
            {node.children.map((child) => (
              <TreeItem key={child.path} node={child} depth={depth + 1} {...props} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li
      className={`tree-file${openPath === node.path ? ' active' : ''}${selected ? ' selected' : ''}`}
      style={indent}
      tabIndex={0}
      onClick={() => {
        if (editing) return
        onSelect(node)
        onOpen(node.path)
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault()
        onSelect(node)
        onContext(node, e.clientX, e.clientY)
      }}
      title={node.path}
    >
      {/* Espaciador del ancho del chevron, para que los iconos de archivos
          queden alineados con los de las carpetas del mismo nivel. */}
      <span className="twisty-spacer" />
      <FileText className="node-icon" size={15} />
      {nameEl}
      {delBtn}
    </li>
  )
}

/** Input inline para crear/renombrar. Enter confirma, Escape cancela, blur confirma. */
function NameInput({
  initial,
  onCommit,
  onCancel
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const [value, setValue] = useState(initial)
  // Enter y blur pueden dispararse juntos; commit corre una sola vez.
  const done = useRef(false)

  const commit = (): void => {
    if (done.current) return
    done.current = true
    const v = value.trim()
    if (!v || v === initial) onCancel()
    else onCommit(v)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <input
      className="tree-rename"
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
    />
  )
}
