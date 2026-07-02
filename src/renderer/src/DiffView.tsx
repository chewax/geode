import { useEffect, useState } from 'react'
import type { JSX } from 'react'
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
          <h2>Cambios de la versión <span className="diff-oid">{oid.slice(0, 7)}</span></h2>
          <button className="icon-btn" title="Cerrar" onClick={onClose}><X size={16} /></button>
        </div>

        {diffs === null ? (
          <p className="modal-sub">Cargando cambios…</p>
        ) : diffs.length === 0 ? (
          <p className="modal-sub">Sin cambios respecto de la versión anterior.</p>
        ) : (
          <div className="diff-files">
            {diffs.map((f) => (
              <FileDiffBlock key={f.path} file={f} />
            ))}
          </div>
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
        {patchLines(file.patch).map((ln, i) => (
          <div key={i} className={`diff-ln ${ln.kind}`}>{ln.text || ' '}</div>
        ))}
      </pre>
    </div>
  )
}

type LnKind = 'add' | 'del' | 'hunk' | 'ctx'

/** Parsea el patch unificado (jsdiff) a líneas clasificadas, salteando el encabezado. */
function patchLines(patch: string): { kind: LnKind; text: string }[] {
  const out: { kind: LnKind; text: string }[] = []
  for (const line of patch.split('\n')) {
    if (
      line.startsWith('Index:') ||
      line.startsWith('===') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue
    }
    if (line.startsWith('@@')) out.push({ kind: 'hunk', text: line })
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
