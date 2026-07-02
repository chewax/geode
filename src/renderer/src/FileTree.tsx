import { useEffect, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react'
import type { TreeNode } from '@shared/ipc'

export interface FileTreeProps {
  nodes: TreeNode[]
  openPath: string | null
  /** Ruta que está en edición de nombre (input inline), o null. */
  editingPath: string | null
  /** Estado por defecto de las carpetas (para colapsar/expandir todo). */
  defaultExpanded: boolean
  /** Cambia cada vez que se pide colapsar/expandir todo: reinicia el estado. */
  collapseVersion: number
  onOpen: (path: string) => void
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

/** Árbol de notas y carpetas. Carpetas colapsables; acciones por menú contextual. */
export function FileTree(props: FileTreeProps): JSX.Element {
  return (
    <ul className="tree">
      {props.nodes.map((node) => (
        <TreeItem key={node.path} node={node} {...props} />
      ))}
    </ul>
  )
}

function TreeItem({ node, ...props }: { node: TreeNode } & Omit<FileTreeProps, 'nodes'>): JSX.Element {
  const { openPath, editingPath, defaultExpanded, collapseVersion, onOpen, onContext, onRename, onRenameCancel, onDelete } = props
  const [expanded, setExpanded] = useState(defaultExpanded)

  // "Colapsar/expandir todo": al cambiar la señal, reiniciar al estado pedido.
  useEffect(() => setExpanded(defaultExpanded), [collapseVersion, defaultExpanded])

  const editing = editingPath === node.path

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

  if (node.isDir) {
    return (
      <li>
        <div
          className="tree-dir"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={onKeyDown}
          onContextMenu={(e) => {
            e.preventDefault()
            onContext(node, e.clientX, e.clientY)
          }}
        >
          {expanded ? <ChevronDown className="twisty" size={14} /> : <ChevronRight className="twisty" size={14} />}
          <Folder className="node-icon" size={15} />
          {nameEl}
        </div>
        {expanded && node.children && node.children.length > 0 && (
          <ul className="tree-children">
            {node.children.map((child) => (
              <TreeItem key={child.path} node={child} {...props} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li
      className={`tree-file${openPath === node.path ? ' active' : ''}`}
      tabIndex={0}
      onClick={() => !editing && onOpen(node.path)}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault()
        onContext(node, e.clientX, e.clientY)
      }}
      title={node.path}
    >
      <FileText className="node-icon" size={15} />
      {nameEl}
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

  const commit = (): void => {
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
