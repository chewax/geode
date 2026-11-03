import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { MarkdownPreview } from './MarkdownPreview'

export interface PrintViewProps {
  path: string
  content: string
  files: string[]
  loadNote: (path: string) => Promise<string>
  /** Se llama cuando la vista está lista para imprimir (diagramas, fórmulas e imágenes cargados). */
  onReady: () => void
}

/** Tiempo máximo esperando diagramas/imágenes antes de exportar igual. */
const MAX_WAIT_MS = 8000

/**
 * Copia de la nota dibujada sólo para exportar a PDF. Se monta fuera de la UI
 * (portal en <body>) y el CSS de impresión oculta todo lo demás, así el PDF
 * sale con el mismo dibujo que la vista previa, pero sin la app alrededor.
 */
export function PrintView({ path, content, files, loadNote, onReady }: PrintViewProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  useEffect(() => {
    const started = Date.now()
    let done = false
    const check = (): void => {
      if (done) return
      const root = rootRef.current
      const pending = root?.querySelector('.plugin-block-pending, .embed:empty') != null
      const images = Array.from(root?.querySelectorAll('img') ?? [])
      const imagesReady = images.every((img) => img.complete)
      if ((!pending && imagesReady) || Date.now() - started > MAX_WAIT_MS) {
        done = true
        // Un cuadro más para que se apliquen estilos y fuentes.
        requestAnimationFrame(() => requestAnimationFrame(() => readyRef.current()))
        return
      }
      window.setTimeout(check, 150)
    }
    // Damos tiempo a que arranquen los dibujos asíncronos de los plugins.
    const id = window.setTimeout(check, 300)
    return () => {
      done = true
      window.clearTimeout(id)
    }
  }, [])

  return createPortal(
    <div className="print-root" ref={rootRef}>
      <MarkdownPreview source={content} notePath={path} files={files} loadNote={loadNote} />
    </div>,
    document.body
  )
}
