import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { X, FilePlus2, FilePen, FileMinus2 } from 'lucide-react'
import type { FileDiff } from '@shared/ipc'
import { t } from '@shared/i18n'

interface DiffViewProps {
  oid: string
  /** Fecha humana de la versión (resuelta por el llamador). */
  date?: string
  /** Nombre humano de la versión (tag o título del mensaje). */
  label?: string
  onClose: () => void
}

/** Visor de cambios de una versión respecto de su padre (diff por archivo). */
export function DiffView({ oid, date, label, onClose }: DiffViewProps): JSX.Element {
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
          <h2>{headLabel(date, label)}</h2>
          <button className="icon-btn" title={t('Cerrar')} onClick={onClose}><X size={16} /></button>
        </div>

        {diffs === null ? (
          <p className="modal-sub">{t('Cargando cambios…')}</p>
        ) : diffs.length === 0 ? (
          <p className="modal-sub">{t('Es la versión actual (o no difiere de ella).')}</p>
        ) : (
          <>
            <div className="diff-legend">
              <span className="diff-legend-item">
                <span className="diff-swatch diff-swatch-add" aria-hidden="true" />
                {t('agregado')}
              </span>
              <span className="diff-legend-item">
                <span className="diff-swatch diff-swatch-del" aria-hidden="true" />
                {t('quitado')}
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
            return <div key={i} className="diff-ln divider" aria-hidden="true" />
          }
          const aria =
            ln.kind === 'add' ? t('agregado: {text}', { text: ln.text }) : ln.kind === 'del' ? t('quitado: {text}', { text: ln.text }) : undefined
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

/**
 * Encabezado humano del visor: `Cambios del {fecha} — {nombre}`. Nunca muestra
 * el hash; si faltan fecha/nombre, cae a una etiqueta humana genérica.
 */
function headLabel(date?: string, label?: string): string {
  if (date && label) return t('Cambios del {date} — {label}', { date, label })
  if (label) return t('Cambios de la versión — {label}', { label })
  if (date) return t('Cambios del {date}', { date })
  return t('Cambios de la versión')
}

function statusLabel(s: FileDiff['status']): string {
  return s === 'added' ? t('agregado') : s === 'deleted' ? t('borrado') : t('modificado')
}
