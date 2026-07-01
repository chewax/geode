import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { CodeMirrorEditor } from './editor/CodeMirrorEditor'

const SAMPLE = `# Bienvenido a Geode

Editor **CodeMirror 6** con markdown, resaltado y line-wrapping.

- Probá listas
- \`código inline\`
- y bloques con resaltado:

\`\`\`ts
const saludo: string = 'hola geode'
console.log(saludo)
\`\`\`

> Esto todavía vive **solo en memoria**. La persistencia atómica y el
> versionado con Git llegan en el próximo paso (Fase 1).
`

export function App(): JSX.Element {
  const [doc, setDoc] = useState<string>(SAMPLE)

  const stats = useMemo(() => {
    const chars = doc.length
    const words = doc.trim() ? doc.trim().split(/\s+/).length : 0
    const lines = doc.split('\n').length
    return { chars, words, lines }
  }, [doc])

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Geode</span>
        <span className="doc-name">nota-sin-titulo.md</span>
        <span className="unsaved" title="Aún no persistido">● en memoria</span>
      </header>

      <div className="editor-pane">
        <CodeMirrorEditor initialDoc={SAMPLE} onChange={setDoc} />
      </div>

      <footer className="statusbar">
        <span>{stats.words} palabras</span>
        <span>{stats.chars} caracteres</span>
        <span>{stats.lines} líneas</span>
      </footer>
    </div>
  )
}
