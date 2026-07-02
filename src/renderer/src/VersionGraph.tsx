import { useMemo } from 'react'
import type { JSX } from 'react'
import { X, Cloud } from 'lucide-react'
import type { GitGraph } from '@shared/ipc'

interface VersionGraphProps {
  graph: GitGraph
  onSelect: (oid: string) => void
  onClose: () => void
}

const ROW = 54
const LANE = 18
const PAD = 16
const DOT = 5
// Colores por columna (lane). El 0 es la línea principal.
const LANE_COLORS = ['#b794f6', '#63b3ed', '#68d391', '#f6ad55', '#fc8181', '#f687b3']

/**
 * Árbol de versiones de todo el vault, estilo git. Cada commit es un punto en
 * su columna (lane); las aristas van a los padres. La línea de HEAD se muestra
 * plena y el resto atenuado. Click en un commit = checkout (mover HEAD ahí);
 * si es un commit viejo, editar después bifurca automáticamente.
 */
export function VersionGraph({ graph, onSelect, onClose }: VersionGraphProps): JSX.Element {
  const { commits, head, onCurrentLine, branches } = graph

  const model = useMemo(() => {
    const index = new Map(commits.map((c, i) => [c.oid, i]))
    const onLine = new Set(onCurrentLine)
    const tipToBranch = new Map<string, string[]>()
    for (const b of branches) {
      const list = tipToBranch.get(b.tip) ?? []
      list.push(b.name)
      tipToBranch.set(b.tip, list)
    }
    const maxLane = commits.reduce((m, c) => Math.max(m, c.lane), 0)
    const pushedSet = new Set(graph.pushed)
    return { index, onLine, tipToBranch, maxLane, pushedSet }
  }, [commits, onCurrentLine, branches, graph.pushed])

  const laneX = (lane: number): number => PAD + lane * LANE
  const rowY = (i: number): number => i * ROW + ROW / 2
  const gutterW = PAD * 2 + model.maxLane * LANE
  const svgH = Math.max(commits.length * ROW, ROW)

  // Aristas commit → padre. La línea baja RECTA en la columna del hijo (para que
  // las ramas se vean paralelas) y sólo hace una "S" (ogee) al entrar en la
  // columna del padre, junto al punto de bifurcación — como git.
  const edges: JSX.Element[] = []
  commits.forEach((c, i) => {
    for (const parent of c.parents) {
      const pi = model.index.get(parent)
      if (pi === undefined) continue
      const parentLane = commits[pi].lane
      const x1 = laneX(c.lane)
      const y1 = rowY(i)
      const x2 = laneX(parentLane)
      const y2 = rowY(pi)
      // La arista lleva el color de la rama del hijo (la línea que se bifurca).
      const color = LANE_COLORS[Math.min(c.lane, LANE_COLORS.length - 1)]
      const dim = !model.onLine.has(c.oid)

      let d: string
      if (x1 === x2) {
        d = `M ${x1} ${y1} L ${x2} ${y2}` // misma columna: recta vertical
      } else {
        // Tramo recto vertical en la columna del hijo, luego S hacia la del padre.
        const curveH = Math.min(ROW, y2 - y1)
        const bend = y2 - curveH
        const mid = y2 - curveH / 2
        d = `M ${x1} ${y1} L ${x1} ${bend} C ${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`
      }

      edges.push(
        <path
          key={`${c.oid}-${parent}`}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={dim ? 0.25 : 0.9}
        />
      )
    }
  })

  return (
    <aside className="graph">
      <div className="graph-head">
        <span>Árbol de versiones</span>
        <button className="icon-btn" title="Cerrar" onClick={onClose}><X size={15} /></button>
      </div>

      {commits.length === 0 ? (
        <p className="tree-empty">Todavía no hay versiones. Editá y guardá una nota.</p>
      ) : (
        <div className="graph-body" style={{ minHeight: svgH }}>
          <svg className="graph-svg" width={gutterW} height={svgH} style={{ width: gutterW }}>
            {edges}
            {commits.map((c, i) => {
              const isHead = head.oid === c.oid
              const dim = !model.onLine.has(c.oid)
              const color = LANE_COLORS[Math.min(c.lane, LANE_COLORS.length - 1)]
              return (
                <g key={c.oid} opacity={dim ? 0.35 : 1}>
                  <circle
                    cx={laneX(c.lane)}
                    cy={rowY(i)}
                    r={isHead ? DOT + 2 : DOT}
                    fill={isHead ? color : '#1c1c22'}
                    stroke={color}
                    strokeWidth={2}
                  />
                </g>
              )
            })}
          </svg>

          <ul className="graph-rows" style={{ paddingLeft: gutterW }}>
            {commits.map((c) => {
              const isHead = head.oid === c.oid
              const dim = !model.onLine.has(c.oid)
              const tips = model.tipToBranch.get(c.oid) ?? []
              return (
                <li
                  key={c.oid}
                  className={`graph-row${isHead ? ' head' : ''}${dim ? ' dim' : ''}`}
                  style={{ height: ROW }}
                  onClick={() => !isHead && onSelect(c.oid)}
                  title={isHead ? 'Estás en esta versión' : 'Ir a esta versión (checkout)'}
                >
                  <div className="row-top">
                    <span className="g-msg" title={c.message}>{c.message}</span>
                    {tips.map((name) => (
                      <span key={name} className={`chip${name === head.branch ? ' current' : ''}`}>
                        {name}
                      </span>
                    ))}
                    {isHead && <span className="chip head-chip">HEAD</span>}
                    {model.pushedSet.has(c.oid) && (
                      <span className="chip pushed-chip" title="Última versión subida a GitHub">
                        <Cloud size={11} /> en GitHub
                      </span>
                    )}
                  </div>
                  <div className="g-meta">
                    {new Date(c.timestamp).toLocaleString()} · {c.oid.slice(0, 7)}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}
