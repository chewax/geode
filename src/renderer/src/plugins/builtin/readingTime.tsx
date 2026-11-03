import { useEffect, useState } from 'react'
import { t } from '@shared/i18n'
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
    <span title={t('Tiempo de lectura estimado (~{wpm} palabras/min)', { wpm: WORDS_PER_MINUTE })}>
      <Clock size={13} /> {t('{mins} min', { mins })}
    </span>
  )
}

/**
 * Plugin interno: aporta un ítem a la barra de estado. Demuestra la contribución
 * de UI a la statusbar + la suscripción al event bus (note:open / note:change).
 */
export const readingTimePlugin: GeodePlugin = {
  id: 'reading-time',
  get name() {
    return t('Tiempo de lectura')
  },
  get description() {
    return t('Muestra el tiempo estimado de lectura de la nota en la barra de estado')
  },
  activate(ctx) {
    ctx.statusBar.addItem({ id: 'reading-time', Component: ReadingTime })
  }
}
