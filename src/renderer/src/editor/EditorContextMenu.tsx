import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import type { EditorView } from '@codemirror/view'
import { ClipboardPaste, Copy, FilePlus2, Scissors, TextSelect } from 'lucide-react'
import { linkTargetFromSelection } from '@shared/links'
import { IS_MAC } from '../shortcuts'

/** Posición (en pantalla) donde se abrió el menú contextual del editor. */
export interface EditorMenuAt {
  x: number
  y: number
}

/**
 * Convierte la selección del editor en `[[destino]]` (con alias si el nombre
 * tuvo que limpiarse) y devuelve el destino, o null si no se pudo.
 */
export function linkSelection(view: EditorView): string | null {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  const target = linkTargetFromSelection(sel)
  if (!target) return null
  // Conservar los espacios de los bordes fuera del enlace.
  const lead = sel.length - sel.trimStart().length
  const trail = sel.length - sel.trimEnd().length
  const text = sel.trim()
  const alias = text !== target && !/[[\]]/.test(text) ? `|${text}` : ''
  const link = `[[${target}${alias}]]`
  const a = from + lead
  const b = to - trail
  view.dispatch({
    changes: { from: a, to: b, insert: link },
    selection: { anchor: a + link.length },
    userEvent: 'input'
  })
  return target
}

interface EditorContextMenuProps {
  view: EditorView
  at: EditorMenuAt
  onClose: () => void
  /** Crea la nota destino del enlace recién insertado (si la app lo permite). */
  onCreateLinkedNote?: (target: string) => void
}

const MOD = IS_MAC ? '⌘' : 'Ctrl+'

/**
 * Menú contextual del editor: crear una nota enlazada a partir de la selección
 * y las acciones clásicas (cortar, copiar, pegar, seleccionar todo). Usa el
 * portapapeles del sistema vía `navigator.clipboard`.
 */
export function EditorContextMenu({ view, at, onClose, onCreateLinkedNote }: EditorContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState(at)
  const readOnly = view.state.readOnly
  const { from, to } = view.state.selection.main
  const selection = view.state.sliceDoc(from, to)
  const hasSel = from !== to
  const canLink = !readOnly && !!onCreateLinkedNote && linkTargetFromSelection(selection) !== ''

  // Que el menú no se salga de la ventana (cerca de los bordes, se abre hacia adentro).
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4))
    const y = Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4))
    if (x !== at.x || y !== at.y) setPos({ x, y })
  }, [at])

  // Escape cierra el menú.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        view.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, view])

  /** Cierra el menú, ejecuta la acción y devuelve el foco al editor. */
  const act = (fn: () => void | Promise<void>) => (): void => {
    onClose()
    void (async () => {
      try {
        await fn()
      } catch (e) {
        console.warn('[editor] acción del menú contextual falló:', e)
      }
      view.focus()
    })()
  }

  const copy = async (): Promise<void> => {
    if (hasSel) await navigator.clipboard.writeText(selection)
  }

  const cut = async (): Promise<void> => {
    if (!hasSel || readOnly) return
    await navigator.clipboard.writeText(selection)
    view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from }, userEvent: 'delete.cut' })
  }

  const paste = async (): Promise<void> => {
    if (readOnly) return
    const text = await navigator.clipboard.readText()
    if (!text) return
    const r = view.state.selection.main
    view.dispatch({
      changes: { from: r.from, to: r.to, insert: text },
      selection: { anchor: r.from + text.length },
      scrollIntoView: true,
      userEvent: 'input.paste'
    })
  }

  const selectAll = (): void => {
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
  }

  const createLinked = (): void => {
    const target = linkSelection(view)
    if (target) onCreateLinkedNote?.(target)
  }

  const item = (
    label: string,
    icon: JSX.Element,
    run: () => void | Promise<void>,
    enabled: boolean,
    kbd?: string,
    title?: string
  ): JSX.Element => (
    <li
      className={enabled ? undefined : 'ctx-disabled'}
      aria-disabled={!enabled}
      title={title}
      onClick={enabled ? act(run) : undefined}
    >
      {icon} {label}
      {kbd && <span className="ctx-kbd">{kbd}</span>}
    </li>
  )

  return createPortal(
    <div
      className="ctx-overlay"
      onMouseDown={(e) => {
        // Click fuera del menú: cerrar sin mover el cursor del editor.
        if (e.target === e.currentTarget) {
          e.preventDefault()
          onClose()
          view.focus()
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <ul
        ref={menuRef}
        className="ctx-menu"
        style={{ left: pos.x, top: pos.y }}
        // Evita que el editor pierda la selección al clickear en el menú.
        onMouseDown={(e) => e.preventDefault()}
      >
        {!readOnly && (
          <>
            {item(
              'Crear nota enlazada',
              <FilePlus2 size={14} />,
              createLinked,
              canLink,
              undefined,
              canLink
                ? 'Convierte la selección en un enlace [[…]] y crea esa nota'
                : 'Seleccioná una palabra o frase (de una sola línea) para crear una nota enlazada'
            )}
            <li className="ctx-sep" />
            {item('Cortar', <Scissors size={14} />, cut, hasSel, `${MOD}X`)}
          </>
        )}
        {item('Copiar', <Copy size={14} />, copy, hasSel, `${MOD}C`)}
        {!readOnly && item('Pegar', <ClipboardPaste size={14} />, paste, true, `${MOD}V`)}
        <li className="ctx-sep" />
        {item('Seleccionar todo', <TextSelect size={14} />, selectAll, view.state.doc.length > 0, `${MOD}A`)}
      </ul>
    </div>,
    document.body
  )
}
