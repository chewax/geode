import { useMemo } from 'react'
import type { JSX } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Vista previa del Markdown de la nota. Renderiza a HTML con `marked` y lo
 * sanea con DOMPurify antes de inyectarlo (defensa aunque el vault sea propio).
 */
export function MarkdownPreview({ source }: { source: string }): JSX.Element {
  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false, gfm: true, breaks: true }) as string
    return DOMPurify.sanitize(raw)
  }, [source])

  return <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />
}
