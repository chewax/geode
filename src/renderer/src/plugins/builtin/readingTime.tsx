import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Clock } from 'lucide-react'
import { useGeode } from '../react'
import type { GeodePlugin } from '../types'

const WORDS_PER_MINUTE = 200

/** Ítem de status: tiempo de lectura estimado de la nota activa. */
function ReadingTime(): JSX.Element | null {
  const geode = useGeode()
  const [content, setContent] = useState(() => geode.activeNote()?.content ?? '')
  const [hasNote, setHasNote] = useState(() => !!geode.activeNote())

  useEffect(() => {
    const subs = [
      geode.events.on('note:open', (p) => { setContent(p.content); setHasNote(true) }),
      geode.events.on('note:change', (p) => setContent(p.content)),
      geode.events.on('vault:switch', () => { setContent(''); setHasNote(false) })
    ]
    return () => subs.forEach((s) => s.dispose())
  }, [geode])

  if (!hasNote) return null
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  const mins = Math.max(1, Math.round(words / WORDS_PER_MINUTE))
  return (
    <span title={`Tiempo de lectura estimado (~${WORDS_PER_MINUTE} palabras/min)`}>
      <Clock size={13} /> {mins} min
    </span>
  )
}

/**
 * Plugin interno: aporta un ítem a la barra de estado. Demuestra la contribución
 * de UI a la statusbar + la suscripción al event bus (note:open / note:change).
 */
export const readingTimePlugin: GeodePlugin = {
  id: 'reading-time',
  name: 'Tiempo de lectura',
  activate(ctx) {
    ctx.statusBar.addItem({ id: 'reading-time', Component: ReadingTime })
  }
}
