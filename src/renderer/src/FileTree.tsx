import { useEffect, useRef, useState } from 'react'
import type { DragEvent, JSX, KeyboardEvent } from 'react'
import { Triangle, Trash2, Image as ImageIcon } from 'lucide-react'
import { isImagePath } from '@shared/attachments'
import type { TreeNode } from '@shared/ipc'
import { t } from '@shared/i18n'

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
  /** Abre una nota. Sin `pinned` = preview temporal (un click); `{ pinned: true }` = permanente (doble click). */
  onOpen: (path: string, opts?: { pinned: boolean }) => void
  /** Selecciona un nodo (click en archivo o carpeta). */
  onSelect: (node: TreeNode) => void
  onContext: (node: TreeNode, x: number, y: number) => void
  onRename: (node: TreeNode, newName: string) => void
  onRenameCancel: () => void
  /** Del/Supr sobre el elemento enfocado. */
  onDelete: (node: TreeNode) => void
  /** F2 sobre el elemento enfocado inicia el rename inline. */
  onStartRename: (node: TreeNode) => void
  /** Mensaje de error del rename en curso, mostrado inline bajo el input; null si no hay error. */
  renameError: string | null
  /** Texto a sembrar en el input al reabrir tras un rename fallido (preserva lo
   *  tipeado); null = sembrar con el nombre actual del nodo. */
  renameSeed: string | null
  /** Mueve un nodo (nota o carpeta) a otra carpeta por drag & drop.
   *  `fromPath` es la ruta relativa del elemento arrastrado; `toDir` es la ruta
   *  relativa de la carpeta destino ('' = raíz de la bóveda). El move reusa el
   *  canal de rename existente en App (que valida colisión y es racy-safe). */
  onMoveNode: (fromPath: string, toDir: string) => void
}

/** Nombre visible de un nodo (las notas se muestran sin la extensión .md). */
function displayName(node: TreeNode): string {
  // Las imágenes conservan la extensión para distinguirlas de las notas.
  return node.isDir ? node.name : node.name.replace(/\.md$/i, '')
}

/** Sangría por nivel (px). El fondo de la fila llega hasta el borde; solo el
 *  contenido se corre, como en VSCode. */
const INDENT = 14

/** Sangría base del árbol (nivel 0). Mayor que la del chevron de la cabecera de
 *  sección (8px) para separar el contenido del título "EXPLORADOR" y que los
 *  chevrons de carpeta no se confundan con el del colapsable de sección. */
const BASE_INDENT = 16

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
  const { openPath, selectedPath, editingPath, revealPath, defaultExpanded, collapseVersion, onOpen, onSelect, onContext, onRename, onRenameCancel, onDelete, onStartRename, renameError, renameSeed, onMoveNode } = props
  const [expanded, setExpanded] = useState(defaultExpanded)
  // Resaltado del drop-target: solo las carpetas son destino de un arrastre.
  const [dragOver, setDragOver] = useState(false)

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
    } else if (e.key === 'F2' && e.target === e.currentTarget) {
      // F2 (estilo VSCode) inicia la edición inline del nombre del nodo enfocado.
      e.preventDefault()
      onStartRename(node)
    }
  }

  // Inicio del arrastre: transportamos la ruta origen en el dataTransfer (patrón
  // idiomático HTML5, sin estado compartido entre TreeItems). No se arrastra
  // mientras se edita el nombre (el input maneja su propia selección de texto).
  const onDragStart = (e: DragEvent<HTMLElement>): void => {
    e.dataTransfer.setData('text/geode-path', node.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const nameEl = editing ? (
    // Tras un rename fallido se resiembra con lo tipeado (renameSeed) para que el
    // usuario corrija; en un rename nuevo, con el nombre actual del nodo.
    <NameInput initial={renameSeed ?? displayName(node)} onCommit={(v) => onRename(node, v)} onCancel={onRenameCancel} error={renameError} />
  ) : (
    <span className="node-label">{displayName(node)}</span>
  )

  // Botón de eliminar que aparece al pasar el mouse por la fila.
  const delBtn = editing ? null : (
    <button
      className="node-del"
      title={t('Eliminar')}
      aria-label={t('Eliminar')}
      onClick={(e) => {
        e.stopPropagation()
        onDelete(node)
      }}
    >
      <Trash2 size={13} />
    </button>
  )

  // Sangría del contenido según profundidad (el fondo igual llega al borde).
  const indent = { paddingLeft: BASE_INDENT + depth * INDENT }

  if (node.isDir) {
    return (
      <li>
        <div
          className={`tree-dir${selected ? ' selected' : ''}${dragOver ? ' drop-target' : ''}`}
          style={indent}
          tabIndex={0}
          draggable={!editing}
          onDragStart={onDragStart}
          onDragOver={(e) => {
            // preventDefault habilita el drop; marcamos el efecto y resaltamos.
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            // stopPropagation es load-bearing: evita que el drop burbujee a la zona
            // raíz de tree-scroll (App) y dispare un segundo move a la raíz.
            e.stopPropagation()
            setDragOver(false)
            const from = e.dataTransfer.getData('text/geode-path')
            if (from) onMoveNode(from, node.path)
          }}
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
          {/* Estilo VSCode: sin icono de carpeta. El triángulo relleno (rotado
              según estado — derecha colapsado / abajo expandido) es el único
              distintivo de carpeta; los archivos no lo llevan. */}
          <Triangle
            className="twisty tree-twisty"
            size={10}
            fill="currentColor"
            strokeWidth={0}
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(90deg)' }}
          />
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
      draggable={!editing}
      onDragStart={onDragStart}
      onClick={() => {
        if (editing) return
        onSelect(node)
        onOpen(node.path)
      }}
      onDoubleClick={() => {
        if (editing) return
        onSelect(node)
        // Doble click fija la nota como tab permanente (misma ruta, idempotente).
        onOpen(node.path, { pinned: true })
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault()
        onSelect(node)
        onContext(node, e.clientX, e.clientY)
      }}
      title={node.path}
    >
      {/* Espaciador del ancho del triángulo, para que el nombre del archivo
          quede alineado con el de las carpetas del mismo nivel (que sí lo llevan). */}
      {isImagePath(node.path) ? (
        <ImageIcon className="tree-file-icon" size={13} aria-label={t('Imagen')} />
      ) : (
        <span className="twisty-spacer" />
      )}
      {nameEl}
      {delBtn}
    </li>
  )
}

/** Input inline para crear/renombrar. Enter confirma, Escape cancela, blur confirma. */
function NameInput({
  initial,
  onCommit,
  onCancel,
  error
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
  /** Error de validación del rename, mostrado inline bajo el input; null/undefined si no hay. */
  error?: string | null
}): JSX.Element {
  const [value, setValue] = useState(initial)
  // Enter y blur pueden dispararse juntos; commit corre una sola vez.
  const done = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reclamar el foco en el siguiente frame. `autoFocus` corre en el montaje, pero
  // al crear una nota nueva el editor CodeMirror se monta después y le roba el
  // foco al input recién montado. Enfocar por rAF (después de ese montaje) asegura
  // que el input quede enfocado y con el texto seleccionado, tanto para nota como
  // para carpeta.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [])

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
    <>
      <input
        ref={inputRef}
        className="tree-rename"
        value={value}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
      />
      {error ? <p className="modal-error">{error}</p> : null}
    </>
  )
}
