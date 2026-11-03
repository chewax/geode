import { useEffect, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Code2, Plus, Trash2, X } from 'lucide-react'
import { deleteProperty, readProperties, renameProperty, setProperty, type PropValue } from '@shared/obsidian'
import { t } from '@shared/i18n'

export interface PropertiesPanelProps {
  /** Texto completo de la nota (con su frontmatter). */
  content: string
  /** Aplica el texto nuevo de la nota (el panel nunca escribe a disco directo). */
  onChange: (next: string) => void
  /** Mostrar/ocultar el YAML crudo en el editor. */
  showRaw: boolean
  onToggleRaw: () => void
  /** Pedido externo de "agregar propiedad" (botón de la barra de formato). */
  addNonce: number
  onOpenTag: (tag: string) => void
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LIST_KEYS = new Set(['tags', 'tag', 'aliases', 'alias', 'cssclasses'])

/**
 * Panel de propiedades (frontmatter) estilo Obsidian/Notion: campos editables
 * arriba de la nota, sin YAML a la vista. Cada cambio reescribe sólo el bloque
 * de propiedades (conservando comentarios y orden) a través del editor, así que
 * Ctrl+Z lo deshace y el autoguardado/versionado funcionan como siempre.
 */
export function PropertiesPanel(props: PropertiesPanelProps): JSX.Element | null {
  const { content, onChange, showRaw, onToggleRaw, addNonce, onOpenTag } = props
  const list = readProperties(content)
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')

  useEffect(() => {
    if (addNonce > 0) {
      setCollapsed(false)
      setAdding(true)
    }
  }, [addNonce])

  if (list === null) {
    return (
      <div className="props-panel props-invalid">
        {t('Las propiedades de esta nota tienen un formato que Geode no puede leer. Podés corregirlas en el texto.')}
      </div>
    )
  }
  if (list.length === 0 && !adding) return null

  const set = (key: string, value: PropValue): void => onChange(setProperty(content, key, value))

  const commitNew = (): void => {
    const key = newKey.trim().replace(/:/g, '')
    setAdding(false)
    setNewKey('')
    if (!key || list.some((p) => p.key === key)) return
    set(key, LIST_KEYS.has(key) ? [] : '')
  }

  return (
    <div className="props-panel">
      <div className="props-head">
        <button className="props-toggle" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          {t('Propiedades')}
          <span className="props-count">{list.length}</span>
        </button>
        <button
          className={`icon-btn props-raw${showRaw ? ' active' : ''}`}
          title={showRaw ? t('Ocultar el texto YAML') : t('Ver como texto (YAML)')}
          onClick={onToggleRaw}
        >
          <Code2 size={13} />
        </button>
      </div>
      {!collapsed && (
        <div className="props-body">
          {list.map((p) => (
            <PropRow
              key={p.key}
              name={p.key}
              value={p.value}
              onRename={(to) => onChange(renameProperty(content, p.key, to))}
              onSet={(v) => set(p.key, v)}
              onDelete={() => onChange(deleteProperty(content, p.key))}
              onOpenTag={onOpenTag}
            />
          ))}
          {adding ? (
            <div className="props-row">
              <input
                autoFocus
                className="props-key-input"
                placeholder={t('nombre (p. ej. estado)')}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onBlur={commitNew}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNew()
                  if (e.key === 'Escape') {
                    setAdding(false)
                    setNewKey('')
                  }
                }}
              />
            </div>
          ) : (
            <button className="link-btn props-add" onClick={() => setAdding(true)}>
              <Plus size={13} /> {t('Agregar propiedad')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PropRow(p: {
  name: string
  value: PropValue
  onRename: (to: string) => void
  onSet: (v: PropValue) => void
  onDelete: () => void
  onOpenTag: (tag: string) => void
}): JSX.Element {
  const { name, value, onRename, onSet, onDelete, onOpenTag } = p
  const [keyDraft, setKeyDraft] = useState(name)
  useEffect(() => setKeyDraft(name), [name])

  return (
    <div className="props-row">
      <input
        className="props-key-input"
        value={keyDraft}
        aria-label={t('Nombre de la propiedad')}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={() => keyDraft.trim() && keyDraft.trim() !== name && onRename(keyDraft.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <div className="props-value">
        <ValueEditor name={name} value={value} onSet={onSet} onOpenTag={onOpenTag} />
      </div>
      <button className="icon-btn props-del" title={t('Quitar propiedad')} onClick={onDelete}>
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function ValueEditor(p: {
  name: string
  value: PropValue
  onSet: (v: PropValue) => void
  onOpenTag: (tag: string) => void
}): JSX.Element {
  const { name, value, onSet, onOpenTag } = p
  const [draft, setDraft] = useState(value === null || Array.isArray(value) ? '' : String(value))
  useEffect(() => {
    if (!Array.isArray(value)) setDraft(value === null ? '' : String(value))
  }, [value])

  if (typeof value === 'boolean') {
    return <input type="checkbox" checked={value} onChange={(e) => onSet(e.target.checked)} aria-label={name} />
  }

  if (Array.isArray(value) || LIST_KEYS.has(name)) {
    const items = Array.isArray(value) ? value : value ? [String(value)] : []
    const isTags = name === 'tags' || name === 'tag'
    const add = (e: KeyboardEvent<HTMLInputElement>): void => {
      const input = e.target as HTMLInputElement
      if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
        e.preventDefault()
        const v = input.value.trim().replace(/^#/, '')
        if (!items.includes(v)) onSet([...items, v])
        input.value = ''
      } else if (e.key === 'Backspace' && !input.value && items.length) {
        onSet(items.slice(0, -1))
      }
    }
    return (
      <div className="props-chips">
        {items.map((v) => (
          <span key={v} className={`props-chip${isTags ? ' is-tag' : ''}`}>
            {isTags ? (
              <a href="#" onClick={(e) => { e.preventDefault(); onOpenTag(v) }}>#{v}</a>
            ) : (
              v
            )}
            <button className="props-chip-x" title={t('Quitar')} onClick={() => onSet(items.filter((x) => x !== v))}>
              <X size={10} />
            </button>
          </span>
        ))}
        <input className="props-chip-input" placeholder={items.length ? '' : t('Escribí y Enter…')} onKeyDown={add} />
      </div>
    )
  }

  const isNumber = typeof value === 'number'
  const isDate = typeof value === 'string' && DATE_RE.test(value)
  const commit = (): void => {
    if (isNumber) {
      const n = Number(draft)
      if (draft.trim() !== '' && Number.isFinite(n) && n !== value) onSet(n)
      return
    }
    if (draft !== (value ?? '')) onSet(draft)
  }
  return (
    <input
      className="props-value-input"
      type={isDate ? 'date' : isNumber ? 'number' : 'text'}
      value={draft}
      aria-label={name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}
