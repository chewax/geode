import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { t } from '@shared/i18n'

/**
 * Como `t()`, pero las `{variables}` pueden ser elementos de React (negritas,
 * atajos, enlaces). Así la frase se traduce entera y el orden de las partes lo
 * decide cada idioma:
 *
 *   tx('Abrí la paleta con {key} para ver los comandos.', { key: <b>Ctrl+P</b> })
 */
export function tx(text: string, parts: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = []
  const translated = t(text)
  const re = /\{(\w+)\}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(translated)) !== null) {
    if (m.index > last) out.push(translated.slice(last, m.index))
    out.push(m[1] in parts ? <Fragment key={out.length}>{parts[m[1]]}</Fragment> : m[0])
    last = m.index + m[0].length
  }
  if (last < translated.length) out.push(translated.slice(last))
  return out
}
