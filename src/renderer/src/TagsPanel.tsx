import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { ChevronDown, ChevronRight, Hash } from 'lucide-react'

export interface TagsPanelProps {
  /** Cambia cuando algo se guardó o cambió el árbol: recalcular. */
  refreshKey: number
  disabled: boolean
  onOpenTag: (tag: string) => void
}

interface TagNode {
  name: string
  full: string
  count: number
  children: TagNode[]
}

/** Arma el árbol de etiquetas anidadas (`trabajo/urgente` cuelga de `trabajo`). */
function buildTree(tags: { tag: string; count: number }[]): TagNode[] {
  const roots: TagNode[] = []
  const index = new Map<string, TagNode>()
  for (const { tag, count } of [...tags].sort((a, b) => a.tag.localeCompare(b.tag))) {
    const parts = tag.split('/').filter(Boolean)
    let level = roots
    let path = ''
    parts.forEach((part, i) => {
      path = path ? `${path}/${part}` : part
      const key = path.toLowerCase()
      let node = index.get(key)
      if (!node) {
        node = { name: part, full: path, count: 0, children: [] }
        index.set(key, node)
        level.push(node)
      }
      if (i === parts.length - 1) node.count += count
      level = node.children
    })
  }
  return roots
}

/** Sección ETIQUETAS: todas las `#etiquetas` de la bóveda con su cantidad de notas. */
export function TagsPanel({ refreshKey, disabled, onOpenTag }: TagsPanelProps): JSX.Element {
  const [tags, setTags] = useState<{ tag: string; count: number }[] | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (disabled) return
    let cancelled = false
    const id = window.setTimeout(async () => {
      try {
        const res = await window.geode.vault.tags()
        if (!cancelled) setTags(res)
      } catch {
        if (!cancelled) setTags([])
      }
    }, refreshKey === 0 ? 0 : 1000)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [refreshKey, disabled])

  const tree = useMemo(() => buildTree(tags ?? []), [tags])

  if (disabled) return <div className="tree-empty"><p>Disponible en el presente.</p></div>
  if (tags === null) return <div className="tree-empty"><p>Buscando etiquetas…</p></div>
  if (tags.length === 0) {
    return (
      <div className="tree-empty">
        <p>Todavía no hay etiquetas.</p>
        <p>Escribí <code>#algo</code> en una nota para agruparla con otras.</p>
      </div>
    )
  }

  const render = (nodes: TagNode[], depth: number): JSX.Element => (
    <ul className="tags-list">
      {nodes.map((n) => {
        const isOpen = open.has(n.full)
        return (
          <li key={n.full}>
            <div className="tag-row" style={{ paddingLeft: 6 + depth * 12 }}>
              {n.children.length > 0 ? (
                <button
                  className="icon-btn tag-twisty"
                  aria-label={isOpen ? 'Colapsar' : 'Expandir'}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev)
                      if (next.has(n.full)) next.delete(n.full)
                      else next.add(n.full)
                      return next
                    })
                  }
                >
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              ) : (
                <span className="tag-twisty-spacer" />
              )}
              <button className="tag-name" title={`Ver notas con #${n.full}`} onClick={() => onOpenTag(n.full)}>
                <Hash size={12} />
                {n.name}
              </button>
              {n.count > 0 && <span className="search-count">{n.count}</span>}
            </div>
            {isOpen && n.children.length > 0 && render(n.children, depth + 1)}
          </li>
        )
      })}
    </ul>
  )

  return <div className="tags-panel">{render(tree, 0)}</div>
}
