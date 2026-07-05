import { useEffect, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { X, FilePlus2, FilePen, FileMinus2 } from 'lucide-react'
import type { FileDiff } from '@shared/ipc'

interface DiffViewProps {
  oid: string
  onClose: () => void
}

/** Visor de cambios de una versión respecto de su padre (diff por archivo). */
export function DiffView({ oid, onClose }: DiffViewProps): JSX.Element {
  const [diffs, setDiffs] = useState<FileDiff[] | null>(null)

  useEffect(() => {
    let live = true
    void window.geode.git.commitDiff(oid).then((d) => { if (live) setDiffs(d) })
    return () => { live = false }
  }, [oid])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal diff-modal" onClick={(e) => e.stopPropagation()}>
        <div className="diff-head">
          <h2>
            Versión <span className="diff-oid">{oid.slice(0, 7)}</span> vs. actual
          </h2>
          <button className="icon-btn" title="Cerrar" onClick={onClose}><X size={16} /></button>
        </div>

        {diffs === null ? (
          <p className="modal-sub">Cargando cambios…</p>
        ) : diffs.length === 0 ? (
          <p className="modal-sub">Es la versión actual (o no difiere de ella).</p>
        ) : (
          <>
            <div className="diff-legend" style={LEGEND_STYLE}>
              <span className="diff-legend-item" style={LEGEND_ITEM_STYLE}>
                <span className="diff-swatch diff-swatch-add" aria-hidden="true" style={SWATCH_ADD_STYLE} />
                agregado
              </span>
              <span className="diff-legend-item" style={LEGEND_ITEM_STYLE}>
                <span className="diff-swatch diff-swatch-del" aria-hidden="true" style={SWATCH_DEL_STYLE} />
                quitado
              </span>
            </div>
            <div className="diff-files">
              {diffs.map((f) => (
                <FileDiffBlock key={f.path} file={f} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FileDiffBlock({ file }: { file: FileDiff }): JSX.Element {
  const Icon = file.status === 'added' ? FilePlus2 : file.status === 'deleted' ? FileMinus2 : FilePen
  return (
    <div className="diff-file">
      <div className={`diff-file-head ${file.status}`}>
        <Icon size={14} />
        <span className="diff-file-path">{file.path}</span>
        <span className="diff-file-status">{statusLabel(file.status)}</span>
      </div>
      <pre className="diff-body">
        {patchLines(file.patch).map((ln, i) => {
          if (ln.kind === 'divider') {
            return <div key={i} className="diff-ln divider" aria-hidden="true" style={DIVIDER_STYLE} />
          }
          const aria =
            ln.kind === 'add' ? `agregado: ${ln.text}` : ln.kind === 'del' ? `quitado: ${ln.text}` : undefined
          return (
            <div key={i} className={`diff-ln ${ln.kind}`} aria-label={aria}>
              {ln.text || ' '}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

type LnKind = 'add' | 'del' | 'divider' | 'ctx'

/** Parsea el patch unificado (jsdiff) a líneas clasificadas, salteando el encabezado. */
function patchLines(patch: string): { kind: LnKind; text: string }[] {
  const out: { kind: LnKind; text: string }[] = []
  for (const line of patch.split('\n')) {
    if (
      line.startsWith('Index:') ||
      line.startsWith('===') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('\\ No newline')
    ) {
      continue
    }
    // Los encabezados de hunk `@@` no se muestran: se emiten como divisor mudo.
    if (line.startsWith('@@')) out.push({ kind: 'divider', text: '' })
    else if (line.startsWith('+')) out.push({ kind: 'add', text: line.slice(1) })
    else if (line.startsWith('-')) out.push({ kind: 'del', text: line.slice(1) })
    else out.push({ kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line })
  }
  // Quita líneas vacías finales del patch.
  while (out.length && out[out.length - 1].text === '' && out[out.length - 1].kind === 'ctx') out.pop()
  return out
}

function statusLabel(s: FileDiff['status']): string {
  return s === 'added' ? 'agregado' : s === 'deleted' ? 'borrado' : 'modificado'
}

// Estilos inline del diff (colores semánticos verde/rojo, sólo dentro del visor).
const LEGEND_STYLE: CSSProperties = {
  display: 'flex',
  gap: '16px',
  padding: '4px 12px 8px',
  fontSize: '12px',
  color: 'var(--muted)',
}
const LEGEND_ITEM_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
}
const SWATCH_ADD_STYLE: CSSProperties = {
  display: 'inline-block',
  width: '10px',
  height: '10px',
  borderRadius: '2px',
  background: '#68d391',
}
const SWATCH_DEL_STYLE: CSSProperties = {
  display: 'inline-block',
  width: '10px',
  height: '10px',
  borderRadius: '2px',
  background: '#ff6b6b',
}
// Divisor mudo entre hunks: una regla fina, sin texto.
const DIVIDER_STYLE: CSSProperties = {
  height: '0',
  padding: '0',
  margin: '6px 0',
  borderTop: '1px solid var(--border)',
}
