import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { List } from 'lucide-react'
import { useGeode } from '../react'
import type { GeodePlugin } from '../types'

interface Heading {
  level: number
  text: string
  from: number
  to: number
}

/** Extrae encabezados Markdown (#..######), ignorando los que están en ```fences```. */
function parseHeadings(content: string): Heading[] {
  const out: Heading[] = []
  let offset = 0
  let inFence = false
  for (const line of content.split('\n')) {
    const fence = /^\s*(```|~~~)/.test(line)
    if (fence) inFence = !inFence
    if (!inFence && !fence) {
      const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line)
      if (m) out.push({ level: m[1].length, text: m[2], from: offset, to: offset + line.length })
    }
    offset += line.length + 1 // +1 por el \n
  }
  return out
}

/** Panel de esquema: lista de encabezados; click salta al encabezado en el editor. */
function Outline(): JSX.Element {
  const geode = useGeode()
  const [content, setContent] = useState(() => geode.activeNote()?.content ?? '')

  useEffect(() => {
    const subs = [
      geode.events.on('note:open', (p) => setContent(p.content)),
      geode.events.on('note:change', (p) => setContent(p.content)),
      geode.events.on('vault:switch', () => setContent(''))
    ]
    return () => subs.forEach((s) => s.dispose())
  }, [geode])

  const headings = useMemo(() => parseHeadings(content), [content])
  if (headings.length === 0) {
    return <p className="plugin-empty">Sin encabezados en esta nota.</p>
  }
  return (
    <ul className="outline-list">
      {headings.map((h) => (
        <li
          key={`${h.from}-${h.text}`}
          className="outline-item"
          style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
          title="Ir al encabezado"
          onClick={() => geode.editor.revealRange(h.from, h.to)}
        >
          {h.text}
        </li>
      ))}
    </ul>
  )
}

/**
 * Plugin interno: panel de esquema (outline) de la nota activa. Demuestra el
 * registro de un panel/vista + lectura del workspace + interacción con el editor
 * (revealRange). Se abre/cierra con el comando "Alternar panel de esquema".
 */
export const outlinePlugin: GeodePlugin = {
  id: 'outline',
  name: 'Esquema',
  description: 'Panel de esquema con los encabezados de la nota; salta al encabezado al hacer click',
  activate(ctx) {
    ctx.panels.register({ id: 'outline', title: 'Esquema', icon: <List size={14} />, Component: Outline })
    ctx.commands.register({
      id: 'outline.toggle',
      title: 'Alternar panel de esquema',
      category: 'Vista',
      run: () => ctx.panels.toggle('outline')
    })
  }
}
