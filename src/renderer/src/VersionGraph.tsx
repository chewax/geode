import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { X, Cloud, Tag, Plus, Check, ListFilter, GitBranch, GitBranchPlus, GitCompare, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react'
import type { GitBranchRef, GitCommitNode, GitGraph } from '@shared/ipc'
import { intlLocale, t } from '@shared/i18n'

interface VersionGraphProps {
  graph: GitGraph
  onSelect: (oid: string) => void
  onClose: () => void
  onAddTag: (oid: string, name: string) => void
  onRemoveTag: (name: string) => void
  /** Abre el diálogo de confirmación de borrado de una rama. */
  onDeleteBranch: (name: string, merged: boolean) => void
  /** Crea una rama desde el commit dado (y cambia a ella). */
  onCreateBranch: (fromOid: string) => void
  /** Abre el visor de cambios de la versión (diff vs su padre). */
  onShowDiff: (oid: string) => void
}

const ROW = 54
const LANE = 18
const PAD = 16
const DOT = 5
/** Nombre de la rama de producción (coincide con PROD del servicio git). */
const PROD = 'main'
// Colores por columna (lane). El 0 es la línea principal.
const LANE_COLORS = ['#b794f6', '#63b3ed', '#68d391', '#f6ad55', '#fc8181', '#f687b3']

/**
 * Árbol de versiones de todo el vault, estilo git. Cada commit es un punto en
 * su columna (lane); las aristas van a los padres. La línea de HEAD se muestra
 * plena y el resto atenuado. Click en un commit = checkout (mover HEAD ahí).
 *
 * Etiquetas (tags de git): cada fila muestra sus etiquetas como chips y un botón
 * para editarlas. La barra superior permite filtrar el árbol por etiqueta.
 */
export function VersionGraph({
  graph,
  onSelect,
  onClose,
  onAddTag,
  onRemoveTag,
  onDeleteBranch,
  onCreateBranch,
  onShowDiff
}: VersionGraphProps): JSX.Element {
  const { commits, head, onCurrentLine, branches } = graph

  // Editor de etiquetas abierto sobre un commit (posición del click).
  const [editor, setEditor] = useState<{ oid: string; x: number; y: number } | null>(null)
  // Etiquetas seleccionadas para filtrar (vacío = sin filtro).
  const [filter, setFilter] = useState<string[]>([])
  // Popover de búsqueda de etiquetas para filtrar (escala a infinitas etiquetas).
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  // Ramas OCULTAS (todas visibles por defecto; togglear oculta esa rama).
  const [hiddenBranches, setHiddenBranches] = useState<string[]>([])
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)

  const toggleFilter = (tag: string): void =>
    setFilter((f) => (f.includes(tag) ? f.filter((x) => x !== tag) : [...f, tag]))
  const toggleBranchHidden = (name: string): void =>
    setHiddenBranches((f) => (f.includes(name) ? f.filter((x) => x !== name) : [...f, name]))

  const model = useMemo(() => {
    const index = new Map(commits.map((c, i) => [c.oid, i]))
    const onLine = new Set(onCurrentLine)
    const tipToBranch = new Map<string, string[]>()
    for (const b of branches) {
      const list = tipToBranch.get(b.tip) ?? []
      list.push(b.name)
      tipToBranch.set(b.tip, list)
    }
    const oidToTags = new Map<string, string[]>()
    for (const tag of graph.tags) {
      const list = oidToTags.get(tag.oid) ?? []
      list.push(tag.name)
      oidToTags.set(tag.oid, list)
    }
    const maxLane = commits.reduce((m, c) => Math.max(m, c.lane), 0)
    const pushedSet = new Set(graph.pushed)

    // Ancestros (incluido) de un tip, recorriendo padres. Para filtrar por rama
    // y para saber qué ramas ya están fusionadas en main (podables sin pérdida).
    const parentsOf = new Map(commits.map((c) => [c.oid, c.parents]))
    const ancestors = (tip: string): Set<string> => {
      const seen = new Set<string>()
      const stack = [tip]
      while (stack.length) {
        const oid = stack.pop() as string
        if (seen.has(oid)) continue
        seen.add(oid)
        for (const p of parentsOf.get(oid) ?? []) stack.push(p)
      }
      return seen
    }
    const mainTip = branches.find((b) => b.name === PROD)?.tip
    const mainReachable = mainTip ? ancestors(mainTip) : new Set<string>()

    return { index, onLine, tipToBranch, oidToTags, maxLane, pushedSet, parentsOf, ancestors, mainReachable }
  }, [commits, onCurrentLine, branches, graph.tags, graph.pushed])

  const allTags = useMemo(
    () => [...new Set(graph.tags.map((tag) => tag.name))].sort((a, b) => a.localeCompare(b)),
    [graph.tags]
  )

  const laneX = (lane: number): number => PAD + lane * LANE
  const rowY = (i: number): number => i * ROW + ROW / 2

  const tagsOf = (oid: string): string[] => model.oidToTags.get(oid) ?? []

  // Commits visibles por rama = unión de ancestros de las ramas NO ocultas. Un
  // commit compartido sigue visible si alguna rama visible lo alcanza; se ocultan
  // solo los commits exclusivos de las ramas ocultas.
  const branchVisible = useMemo(() => {
    if (hiddenBranches.length === 0) return null
    const set = new Set<string>()
    for (const b of branches) {
      if (hiddenBranches.includes(b.name)) continue
      for (const oid of model.ancestors(b.tip)) set.add(oid)
    }
    return set
  }, [hiddenBranches, branches, model])

  // Commits visibles según el filtro. El grafo se dibuja SIEMPRE (mostrar/ocultar
  // líneas), nunca se cambia a una lista tipo git log.
  const visible = commits.filter(
    (c) =>
      (filter.length === 0 || tagsOf(c.oid).some((tag) => filter.includes(tag))) &&
      (!branchVisible || branchVisible.has(c.oid))
  )

  // Layout sobre el subconjunto visible: fila por índice visible y lanes
  // compactadas (se cierran los huecos de las líneas ocultas).
  const rowIndex = new Map(visible.map((c, i) => [c.oid, i]))
  const usedLanes = [...new Set(visible.map((c) => c.lane))].sort((a, b) => a - b)
  const laneMap = new Map(usedLanes.map((l, i) => [l, i]))
  const laneOf = (c: GitCommitNode): number => laneMap.get(c.lane) ?? 0
  const colorOf = (c: GitCommitNode): string => LANE_COLORS[Math.min(laneOf(c), LANE_COLORS.length - 1)]
  const gutterW = PAD * 2 + Math.max(usedLanes.length - 1, 0) * LANE
  const svgH = Math.max(visible.length * ROW, ROW)

  // Ancestro visible más cercano de un oid (puentea commits ocultos por el
  // filtro, p. ej. al filtrar por etiqueta). Mantiene el grafo conectado.
  const nearestVisible = (oid: string): string | null => {
    const seen = new Set<string>()
    const queue = [oid]
    while (queue.length) {
      const o = queue.shift() as string
      if (seen.has(o)) continue
      seen.add(o)
      if (rowIndex.has(o)) return o
      for (const p of model.parentsOf.get(o) ?? []) queue.push(p)
    }
    return null
  }

  // Aristas commit → ancestro visible (puenteando lo oculto).
  const edges: JSX.Element[] = []
  visible.forEach((c, i) => {
    for (const parent of c.parents) {
      const target = nearestVisible(parent)
      const pi = target === null ? undefined : rowIndex.get(target)
      if (pi === undefined) continue
      const x1 = laneX(laneOf(c))
      const y1 = rowY(i)
      const x2 = laneX(laneOf(visible[pi]))
      const y2 = rowY(pi)
      const color = colorOf(c)
      const dim = !model.onLine.has(c.oid)

      let d: string
      if (x1 === x2) {
        d = `M ${x1} ${y1} L ${x2} ${y2}`
      } else {
        const curveH = Math.min(ROW, y2 - y1)
        const bend = y2 - curveH
        const mid = y2 - curveH / 2
        d = `M ${x1} ${y1} L ${x1} ${bend} C ${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`
      }

      edges.push(
        <path key={`${c.oid}-${parent}`} d={d} fill="none" stroke={color} strokeWidth={2} opacity={dim ? 0.25 : 0.9} />
      )
    }
  })

  /** Contenido de una fila de commit. `graphRow` alinea el alto con el SVG. */
  const renderRow = (c: GitCommitNode, graphRow: boolean): JSX.Element => {
    const isHead = head.oid === c.oid
    const dim = graphRow && !model.onLine.has(c.oid)
    const tips = model.tipToBranch.get(c.oid) ?? []
    const tags = tagsOf(c.oid)
    return (
      <li
        key={c.oid}
        className={`graph-row${isHead ? ' head' : ''}${dim ? ' dim' : ''}`}
        style={graphRow ? { height: ROW } : undefined}
        onClick={() => !isHead && onSelect(c.oid)}
        title={isHead ? t('Estás en esta versión') : t('Ir a esta versión (checkout)')}
      >
        <div className="row-top">
          <span className="g-msg" title={c.message}>{c.message}</span>
          {tips.map((name) => (
            <span
              key={name}
              className={`chip branch-chip${name === head.branch ? ' current' : ''}`}
              style={{ borderColor: colorOf(c) }}
              title={name === head.branch ? t('Rama actual') : t('Rama {name}', { name })}
            >
              <GitBranch size={10} /> {name}
            </span>
          ))}
          {tags.map((tag) => (
            <span key={tag} className="chip tag-chip"><Tag size={10} /> {tag}</span>
          ))}
          {isHead && <span className="chip head-chip">HEAD</span>}
          {model.pushedSet.has(c.oid) && (
            <span className="chip pushed-chip" title={t('Última versión subida a GitHub')}>
              <Cloud size={11} /> {t('en GitHub')}
            </span>
          )}
          <button
            className="tag-btn"
            title={t('Comparar con la versión actual')}
            aria-label={t('Comparar con la versión actual')}
            onClick={(e) => {
              e.stopPropagation()
              onShowDiff(c.oid)
            }}
          >
            <GitCompare size={13} />
          </button>
          <button
            className="tag-btn"
            title={t('Crear rama desde esta versión')}
            aria-label={t('Crear rama desde esta versión')}
            onClick={(e) => {
              e.stopPropagation()
              onCreateBranch(c.oid)
            }}
          >
            <GitBranchPlus size={13} />
          </button>
          <button
            className="tag-btn"
            title={t('Etiquetas')}
            aria-label={t('Editar etiquetas')}
            onClick={(e) => {
              e.stopPropagation()
              setEditor({ oid: c.oid, x: e.clientX, y: e.clientY })
            }}
          >
            <Tag size={13} />
          </button>
        </div>
        <div className="g-meta">
          {new Date(c.timestamp).toLocaleString(intlLocale())} · {c.oid.slice(0, 7)}
        </div>
      </li>
    )
  }

  // Ramas ya fusionadas en main: se pueden podar sin perder versiones.
  const mergedBranchNames = new Set(
    branches.filter((b) => b.name !== PROD && model.mainReachable.has(b.tip)).map((b) => b.name)
  )

  const handleDeleteBranch = (name: string): void => {
    // Solo abre el diálogo de confirmación; el borrado real ocurre en App tras la
    // confirmación explícita y la rama desaparece del grafo vía refreshGraph.
    onDeleteBranch(name, mergedBranchNames.has(name))
  }

  return (
    <aside className="graph">
      <div className="graph-head">
        <span>{t('Árbol de versiones')}</span>
        <button className="icon-btn" title={t('Cerrar')} onClick={onClose}><X size={15} /></button>
      </div>

      {(allTags.length > 0 || branches.length > 1) && (
        <div className="tag-filter">
          {allTags.length > 0 && (
            <button
              className={`tag-filter-btn${filter.length ? ' on' : ''}`}
              title={t('Filtrar por etiqueta')}
              onClick={() => { setFilterMenuOpen((o) => !o); setBranchMenuOpen(false) }}
            >
              <ListFilter size={13} /> {t('Etiquetas')}{filter.length ? ` (${filter.length})` : ''}
            </button>
          )}
          {branches.length > 1 && (
            <button
              className={`tag-filter-btn${hiddenBranches.length ? ' on' : ''}${branchMenuOpen ? ' open' : ''}`}
              title={t('Mostrar, ocultar, podar o borrar ramas')}
              aria-haspopup="menu"
              aria-expanded={branchMenuOpen}
              onClick={() => { setBranchMenuOpen((o) => !o); setFilterMenuOpen(false) }}
            >
              <GitBranch size={13} />{' '}
              {hiddenBranches.length
                ? t('Ramas ({n} ocultas)', { n: hiddenBranches.length })
                : t('Ramas')}
              <ChevronDown size={12} className="menu-caret" />
            </button>
          )}

          {filter.map((tag) => (
            <span key={tag} className="chip tag-chip removable">
              <Tag size={10} /> {tag}
              <button className="chip-x" title={t('Quitar filtro')} onClick={() => toggleFilter(tag)}>
                <X size={11} />
              </button>
            </span>
          ))}
          {hiddenBranches.map((name) => (
            <span key={name} className="chip branch-filter-chip removable">
              <EyeOff size={10} /> {name}
              <button className="chip-x" title={t('Mostrar de nuevo')} onClick={() => toggleBranchHidden(name)}>
                <X size={11} />
              </button>
            </span>
          ))}

          {filterMenuOpen && (
            <TagFilterMenu
              allTags={allTags}
              selected={filter}
              onToggle={toggleFilter}
              onClear={() => setFilter([])}
              onClose={() => setFilterMenuOpen(false)}
            />
          )}
          {branchMenuOpen && (
            <BranchMenu
              branches={branches}
              currentBranch={head.branch}
              hidden={hiddenBranches}
              mergedNames={mergedBranchNames}
              onToggle={toggleBranchHidden}
              onShowAll={() => setHiddenBranches([])}
              onDelete={handleDeleteBranch}
              onClose={() => setBranchMenuOpen(false)}
            />
          )}
        </div>
      )}

      {commits.length === 0 ? (
        <p className="tree-empty">{t('Todavía no hay versiones. Editá y guardá una nota.')}</p>
      ) : visible.length === 0 ? (
        <p className="tree-empty">{t('Ninguna versión con ese filtro.')}</p>
      ) : (
        <div className="graph-body" style={{ minHeight: svgH }}>
          <svg className="graph-svg" width={gutterW} height={svgH} style={{ width: gutterW }}>
            {edges}
            {visible.map((c, i) => {
              const isHead = head.oid === c.oid
              const dim = !model.onLine.has(c.oid)
              const color = colorOf(c)
              // ¿Es cabeza de alguna rama? Se le pone un halo para que las ramas
              // se reconozcan de un vistazo aunque compartan carril (no divergieron).
              const isTip = model.tipToBranch.has(c.oid)
              return (
                <g key={c.oid} opacity={dim ? 0.35 : 1}>
                  {isTip && (
                    <circle
                      cx={laneX(laneOf(c))}
                      cy={rowY(i)}
                      r={(isHead ? DOT + 2 : DOT) + 3}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      opacity={0.55}
                    />
                  )}
                  <circle
                    cx={laneX(laneOf(c))}
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
            {visible.map((c) => renderRow(c, true))}
          </ul>
        </div>
      )}

      {editor && (
        <TagEditor
          x={editor.x}
          y={editor.y}
          tags={tagsOf(editor.oid)}
          allTags={allTags}
          onAdd={(name) => onAddTag(editor.oid, name)}
          onRemove={(name) => onRemoveTag(name)}
          onClose={() => setEditor(null)}
        />
      )}
    </aside>
  )
}

interface TagEditorProps {
  x: number
  y: number
  tags: string[]
  allTags: string[]
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onClose: () => void
}

/** Popover para agregar/quitar etiquetas de un commit. */
function TagEditor({ x, y, tags, allTags, onAdd, onRemove, onClose }: TagEditorProps): JSX.Element {
  const [value, setValue] = useState('')
  const suggestions = allTags.filter((tag) => !tags.includes(tag))

  const submit = (): void => {
    const v = value.trim()
    if (!v) return
    onAdd(v)
    setValue('')
  }

  // Clamp para que el popover no se salga de la ventana.
  const left = Math.min(x, window.innerWidth - 260)
  const top = Math.min(y, window.innerHeight - 220)

  return (
    <div
      className="ctx-overlay"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose() }}
    >
      <div className="tag-editor" style={{ left, top }} onClick={(e) => e.stopPropagation()}>
        <div className="tag-editor-title"><Tag size={13} /> {t('Etiquetas')}</div>

        {tags.length > 0 && (
          <div className="tag-editor-current">
            {tags.map((tag) => (
              <span key={tag} className="chip tag-chip removable">
                {tag}
                <button className="chip-x" title={t('Quitar etiqueta')} onClick={() => onRemove(tag)}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="tag-editor-add">
          <input
            className="tag-input"
            autoFocus
            placeholder={t('Nueva etiqueta…')}
            list="tag-suggestions"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              else if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
          />
          <datalist id="tag-suggestions">
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
          <button className="icon-btn" title={t('Agregar')} onClick={submit}><Plus size={15} /></button>
        </div>

        <p className="tag-hint">{t('Los espacios se convierten en guiones. Debe ser única.')}</p>
      </div>
    </div>
  )
}

interface TagFilterMenuProps {
  allTags: string[]
  selected: string[]
  onToggle: (name: string) => void
  onClear: () => void
  onClose: () => void
}

/**
 * Popover con búsqueda para filtrar por etiqueta. En vez de listar todas las
 * etiquetas (no escala), se buscan al tipear; solo los filtros activos ocupan
 * lugar en la barra. Soporta catálogos de etiquetas arbitrariamente grandes.
 */
function TagFilterMenu({ allTags, selected, onToggle, onClear, onClose }: TagFilterMenuProps): JSX.Element {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const shown = query ? allTags.filter((tag) => tag.toLowerCase().includes(query)) : allTags

  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="tag-filter-menu" onClick={(e) => e.stopPropagation()}>
        <input
          className="tag-input"
          autoFocus
          placeholder={t('Buscar etiqueta…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose() }
          }}
        />
        <ul className="tag-filter-list">
          {shown.length === 0 ? (
            <li className="tag-filter-empty">{t('Sin resultados')}</li>
          ) : (
            shown.map((tag) => (
              <li
                key={tag}
                className={selected.includes(tag) ? 'sel' : ''}
                onClick={() => onToggle(tag)}
              >
                <Tag size={12} className="tag-filter-icon" />
                <span className="vault-menu-name">{tag}</span>
                {selected.includes(tag) && <Check size={14} />}
              </li>
            ))
          )}
        </ul>
        {selected.length > 0 && (
          <button className="link-btn tag-filter-clear" onClick={onClear}>
            {t('Limpiar filtros ({n})', { n: selected.length })}
          </button>
        )}
      </div>
    </>
  )
}

interface BranchMenuProps {
  branches: GitBranchRef[]
  currentBranch: string | null
  hidden: string[]
  mergedNames: Set<string>
  onToggle: (name: string) => void
  onShowAll: () => void
  onDelete: (name: string) => void
  onClose: () => void
}

/**
 * Popover de ramas: muestra/oculta líneas del grafo y poda ramas. Buscador para
 * escalar. Click en la fila (o el ojo) alterna visibilidad; el tacho borra (con
 * confirmación en App). main es indestructible; la actual se puede descartar.
 */
function BranchMenu({
  branches,
  currentBranch,
  hidden,
  mergedNames,
  onToggle,
  onShowAll,
  onDelete,
  onClose
}: BranchMenuProps): JSX.Element {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const sorted = [...branches].sort((a, b) =>
    a.name === PROD ? -1 : b.name === PROD ? 1 : a.name.localeCompare(b.name)
  )
  const shown = query ? sorted.filter((b) => b.name.toLowerCase().includes(query)) : sorted

  return (
    <>
      <div className="vault-overlay" onClick={onClose} />
      <div className="tag-filter-menu" onClick={(e) => e.stopPropagation()}>
        <input
          className="tag-input"
          autoFocus
          placeholder={t('Buscar rama…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }}
        />
        <ul className="tag-filter-list">
          {shown.length === 0 ? (
            <li className="tag-filter-empty">{t('Sin resultados')}</li>
          ) : (
            shown.map((b) => {
              const isProd = b.name === PROD
              const isCurrent = b.name === currentBranch
              const merged = mergedNames.has(b.name)
              const isHidden = hidden.includes(b.name)
              const canDelete = !isProd // la actual se descarta cambiando a su base
              return (
                <li
                  key={b.name}
                  className={isHidden ? 'off' : ''}
                  title={isHidden ? t('Oculta — click para mostrar') : t('Visible — click para ocultar')}
                  onClick={() => onToggle(b.name)}
                >
                  {isHidden ? (
                    <EyeOff size={12} className="tag-filter-icon" />
                  ) : (
                    <Eye size={12} className="tag-filter-icon" />
                  )}
                  <span className="vault-menu-name">{b.name}</span>
                  {isProd && <span className="branch-tag prod">{t('prod')}</span>}
                  {isCurrent && <span className="branch-tag current">{t('actual')}</span>}
                  {!isProd && merged && <span className="branch-tag merged">{t('fusionada')}</span>}
                  {canDelete && (
                    <button
                      className="branch-del"
                      title={merged ? t('Borrar rama (ya fusionada)') : t('Borrar rama (no fusionada)')}
                      aria-label={t('Borrar la rama {name}', { name: b.name })}
                      onClick={(e) => { e.stopPropagation(); onDelete(b.name) }}
                    >
                      <Trash2 size={13} />
                      <span className="branch-del-label">{t('Borrar')}</span>
                    </button>
                  )}
                </li>
              )
            })
          )}
        </ul>
        {hidden.length > 0 && (
          <button className="link-btn tag-filter-clear" onClick={onShowAll}>
            {t('Mostrar todas ({n} ocultas)', { n: hidden.length })}
          </button>
        )}
      </div>
    </>
  )
}
