import { useState } from 'react'
import type { JSX } from 'react'
import type { TreeNode } from '@shared/ipc'

interface FileTreeProps {
  nodes: TreeNode[]
  openPath: string | null
  onOpen: (path: string) => void
}

/** Árbol de notas del vault. Carpetas colapsables, notas .md clicables. */
export function FileTree({ nodes, openPath, onOpen }: FileTreeProps): JSX.Element {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <TreeItem key={node.path} node={node} openPath={openPath} onOpen={onOpen} />
      ))}
    </ul>
  )
}

function TreeItem({ node, openPath, onOpen }: { node: TreeNode } & Omit<FileTreeProps, 'nodes'>): JSX.Element {
  const [expanded, setExpanded] = useState(true)

  if (node.isDir) {
    return (
      <li>
        <div className="tree-dir" onClick={() => setExpanded((v) => !v)}>
          <span className="twisty">{expanded ? '▾' : '▸'}</span>
          {node.name}
        </div>
        {expanded && node.children && node.children.length > 0 && (
          <ul className="tree-children">
            {node.children.map((child) => (
              <TreeItem key={child.path} node={child} openPath={openPath} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const label = node.name.replace(/\.md$/i, '')
  return (
    <li
      className={`tree-file${openPath === node.path ? ' active' : ''}`}
      onClick={() => onOpen(node.path)}
      title={node.path}
    >
      {label}
    </li>
  )
}
