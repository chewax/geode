import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ChevronLeft, ChevronRight, ChevronsRight, History } from 'lucide-react'
import type { GitGraph } from '@shared/ipc'
import { entryLabel, relativeDate, changedSummary } from './time/labels'

/**
 * Cuerpo de la LÍNEA DE TIEMPO a nivel de todo el vault: una barra de transporte
 * fija + la lista de versiones (más nueva primero) con marcadores persistentes.
 *
 * Todo sale de `git.graph()` (pasado por props desde App): la Timeline no busca
 * historia por su cuenta. Las etiquetas son siempre humanas (nombre → mensaje →
 * fecha relativa, NUNCA un hash, TIME-03). El "qué cambió" (TIME-04) se trae de
 * forma perezosa por entrada y se cachea por oid para no recorrer árboles de más.
 */
export function Timeline({
  graph,
  previewOid,
  onStep,
  onJumpToPresent,
  onSelect
}: {
  graph: GitGraph
  previewOid: string | null
  onStep: (dir: 'back' | 'forward') => void
  onJumpToPresent: () => void
  onSelect: (oid: string) => void
}): JSX.Element {
  const commits = graph.commits // ya viene más nuevo primero
  const idx = previewOid ? commits.findIndex((c) => c.oid === previewOid) : 0
  const atPresent = previewOid === null
  const atOldest = idx >= commits.length - 1

  // Cache de basenames cambiados por oid; se rehace si cambia el grafo (Pitfall 6).
  const changedCache = useMemo(() => new Map<string, string[]>(), [graph])
  const [, forceRender] = useState(0)
  const viewingRef = useRef<HTMLLIElement | null>(null)

  // TIME-04: traer perezosamente qué cambió por entrada, cacheado por oid.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const c of commits) {
        if (changedCache.has(c.oid)) continue
        try {
          const names = await window.geode.git.changedFiles(c.oid)
          if (cancelled) return
          changedCache.set(c.oid, names)
        } catch {
          if (cancelled) return
          changedCache.set(c.oid, [])
        }
        if (!cancelled) forceRender((n) => n + 1)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [commits, changedCache])

  // TIME-05: mantener la entrada activa a la vista al cambiar el preview.
  useEffect(() => {
    viewingRef.current?.scrollIntoView({ block: 'nearest' })
  }, [previewOid])

  if (commits.length === 0) {
    return (
      <div className="tree-empty">
        <History size={16} />
        <p className="tree-empty-title">Todavía no hay versiones</p>
        <p>Guardá una versión para empezar tu línea de tiempo.</p>
      </div>
    )
  }

  return (
    <div className="timeline">
      {/* Transporte fijo: un paso atrás/adelante y saltar al presente. */}
      <div className="tl-transport">
        <button
          className="icon-btn"
          title="Un paso atrás"
          aria-label="Un paso atrás"
          disabled={atOldest}
          onClick={() => onStep('back')}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          className="icon-btn"
          title="Un paso adelante"
          aria-label="Un paso adelante"
          disabled={atPresent}
          onClick={() => onStep('forward')}
        >
          <ChevronRight size={14} />
        </button>
        <button
          className="icon-btn"
          title="Saltar al presente"
          aria-label="Saltar al presente"
          disabled={atPresent}
          onClick={onJumpToPresent}
        >
          <ChevronsRight size={14} />
        </button>
        <span className={`tl-pos${atPresent ? '' : ' viewing'}`}>
          {atPresent ? 'en el presente' : relativeDate(commits[idx].timestamp)}
        </span>
      </div>

      {/* Lista de versiones (más nueva primero) con marcadores persistentes. */}
      <ul className="tl-list">
        {commits.map((c, i) => {
          const isNewest = i === 0
          const isViewing = c.oid === previewOid
          const label = entryLabel(c, graph.tags)
          const rel = relativeDate(c.timestamp)
          const names = changedCache.get(c.oid)
          const changed = names ? changedSummary(names) : '…'
          // Evitar duplicar la fecha si la etiqueta ya cayó a la fecha relativa.
          const secondary = label === rel ? changed : `${rel} · ${changed}`
          return (
            <li
              key={c.oid}
              ref={isViewing ? viewingRef : undefined}
              className={`tl-entry${isViewing ? ' viewing' : ''}`}
              title={names && names.length > 0 ? names.join(', ') : undefined}
              onClick={() => (isNewest ? onJumpToPresent() : onSelect(c.oid))}
            >
              <div className="tl-entry-main">
                <span className="tl-entry-label">{label}</span>
                <span className="tl-entry-chips">
                  {/* TIME-06: ambos marcadores visibles a la vez durante el viaje. */}
                  {isNewest && <span className="chip current">presente</span>}
                  {isViewing && <span className="chip head-chip">viendo</span>}
                </span>
              </div>
              <div className="tl-entry-sub">{secondary}</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
