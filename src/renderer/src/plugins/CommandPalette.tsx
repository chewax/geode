import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import { Search } from 'lucide-react'
import type { PluginHost } from './host'
import type { Command } from './types'
import { t } from '@shared/i18n'
import { COMMAND_SHORTCUTS, labelOf, useShortcuts } from '../shortcuts'

interface CommandPaletteProps {
  host: PluginHost
  onClose: () => void
}

/**
 * Paleta de comandos (Ctrl+P). Lista los comandos registrados por el core y los
 * plugins, filtra por texto y ejecuta con Enter/click. Es en sí una superficie de
 * extensión: cualquier plugin que registre un comando aparece acá.
 */
export function CommandPalette({ host, onClose }: CommandPaletteProps): JSX.Element {
  useSyncExternalStore(host.subscribe, host.getVersion) // re-render si cambian los comandos
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const all = host.listCommands()
    const q = query.trim().toLowerCase()
    const matches = q
      ? all.filter((c) => `${c.category ?? ''} ${c.title}`.toLowerCase().includes(q))
      : all
    return matches.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.title.localeCompare(b.title))
  }, [host, query])

  // Mantener el índice activo dentro de rango cuando cambia el filtro.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results.length])

  const runAt = (i: number): void => {
    const cmd = results[i]
    if (!cmd) return
    if (cmd.isEnabled && !cmd.isEnabled()) return
    onClose()
    void cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(active) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder={t('Buscar un comando…')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="palette-list">
          {results.length === 0 ? (
            <li className="palette-empty">{t('Sin comandos para «{query}»', { query })}</li>
          ) : (
            results.map((cmd, i) => (
              <CommandRow
                key={cmd.id}
                cmd={cmd}
                active={i === active}
                onHover={() => setActive(i)}
                onClick={() => runAt(i)}
              />
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

function CommandRow({
  cmd,
  active,
  onHover,
  onClick
}: {
  cmd: Command
  active: boolean
  onHover: () => void
  onClick: () => void
}): JSX.Element {
  const disabled = cmd.isEnabled ? !cmd.isEnabled() : false
  // Los atajos reasignables muestran el vigente, no el que se registró al arrancar.
  const { bindings } = useShortcuts()
  const remappable = COMMAND_SHORTCUTS[cmd.id]
  const shortcut = remappable ? labelOf(remappable, bindings) : cmd.shortcut
  return (
    <li
      className={`palette-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      {cmd.category && <span className="palette-cat">{cmd.category}</span>}
      <span className="palette-title">{cmd.title}</span>
      {shortcut && <span className="palette-shortcut">{shortcut}</span>}
    </li>
  )
}
