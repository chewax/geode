import { Fragment } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import type { Extension } from '@codemirror/state'
import type { PaneLayout, DropZone } from './paneTree'
import { EditorPane, type PaneHandle, type TabDrag } from './EditorPane'

export interface PaneViewProps {
  node: PaneLayout
  activePaneId: string
  reloadNonces: Record<string, number>
  extraExtensions: Extension[]
  onFocusPane: (paneId: string) => void
  onSelectTab: (paneId: string, path: string) => void
  onCloseTab: (paneId: string, path: string) => void
  onReorderTab: (paneId: string, path: string, toIndex: number) => void
  onDropTab: (drag: TabDrag, dstPaneId: string, zone: DropZone) => void
  onSplit: (paneId: string, dir: 'row' | 'col') => void
  onNoteOpen: (paneId: string, path: string, content: string) => void
  onNoteChange: (paneId: string, path: string, content: string) => void
  onSaved: (paneId: string) => void
  onRequestAi: (paneId: string) => void
  registerHandle: (paneId: string, handle: PaneHandle | null) => void
  /** Ajuste de tamaños de un split (por su id). */
  onResize: (splitId: string, sizes: number[]) => void
}

/** Renderiza el árbol de paneles recursivamente: hojas = editores, splits =
 *  contenedores flex con divisores arrastrables. */
export function PaneView(props: PaneViewProps): JSX.Element {
  const { node } = props

  if (node.kind === 'leaf') {
    return (
      <EditorPane
        pane={node}
        isActive={node.id === props.activePaneId}
        reloadNonce={props.reloadNonces[node.id] ?? 0}
        extraExtensions={props.extraExtensions}
        onFocusPane={props.onFocusPane}
        onSelectTab={props.onSelectTab}
        onCloseTab={props.onCloseTab}
        onReorderTab={props.onReorderTab}
        onDropTab={props.onDropTab}
        onSplit={props.onSplit}
        onNoteOpen={props.onNoteOpen}
        onNoteChange={props.onNoteChange}
        onSaved={props.onSaved}
        onRequestAi={props.onRequestAi}
        registerHandle={props.registerHandle}
      />
    )
  }

  const dir = node.dir // 'row' = columnas lado a lado, 'col' = filas apiladas
  const startResize = (index: number) => (e: ReactPointerEvent): void => {
    e.preventDefault()
    const container = (e.currentTarget as HTMLElement).parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    const total = dir === 'row' ? rect.width : rect.height
    const sizes = [...node.sizes]
    const a = sizes[index]
    const b = sizes[index + 1]
    const startPos = dir === 'row' ? e.clientX : e.clientY
    const min = 0.08 // fracción mínima por panel

    const onMove = (ev: PointerEvent): void => {
      const pos = dir === 'row' ? ev.clientX : ev.clientY
      let delta = (pos - startPos) / total
      delta = Math.max(-a + min, Math.min(b - min, delta))
      const next = [...sizes]
      next[index] = a + delta
      next[index + 1] = b - delta
      props.onResize(node.id, next)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizing-col', 'resizing-row')
    }
    document.body.classList.add(dir === 'row' ? 'resizing-col' : 'resizing-row')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className={`psplit ${dir}`}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          <div className="psplit-slot" style={{ flexGrow: node.sizes[i], flexBasis: 0 }}>
            <PaneView {...props} node={child} />
          </div>
          {i < node.children.length - 1 && (
            <div className={`psplit-resizer ${dir}`} onPointerDown={startResize(i)} />
          )}
        </Fragment>
      ))}
    </div>
  )
}
