/**
 * Modelo del área de edición como un árbol de paneles recursivo (estilo VSCode).
 *
 * Un `LeafPane` es un grupo de tabs con una nota activa (equivale a un editor).
 * Un `SplitPane` divide el espacio en N hijos, horizontal (`row`) o vertical
 * (`col`), con tamaños proporcionales (`sizes`, suman 1).
 *
 * Todas las operaciones son PURAS: devuelven un árbol nuevo y nunca mutan el
 * original. Los `id` de las hojas son estables entre transformaciones para que
 * React preserve el montaje de cada editor.
 */

export interface LeafPane {
  kind: 'leaf'
  id: string
  /** Notas abiertas en el panel (rutas relativas). */
  tabs: string[]
  /** Nota activa del panel (una de `tabs`), o null si está vacío. */
  active: string | null
}

export interface SplitPane {
  kind: 'split'
  id: string
  dir: 'row' | 'col'
  children: PaneLayout[]
  /** Fracción del espacio por hijo (paralelo a `children`, suma 1). */
  sizes: number[]
}

export type PaneLayout = LeafPane | SplitPane

/** Lado donde cae una tab soltada sobre un panel: borde (divide) o centro (mueve). */
export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'

let counter = 0
/** id incremental estable (no usa Math.random para ser reproducible en tests). */
export function newId(prefix = 'p'): string {
  counter += 1
  return `${prefix}${counter}`
}

export function makeLeaf(tabs: string[] = [], active?: string | null): LeafPane {
  return {
    kind: 'leaf',
    id: newId(),
    tabs,
    active: active ?? (tabs.length ? tabs[tabs.length - 1] : null)
  }
}

// ── Consultas ───────────────────────────────────────────────────────────────

export function allLeaves(node: PaneLayout): LeafPane[] {
  return node.kind === 'leaf' ? [node] : node.children.flatMap(allLeaves)
}

export function findLeaf(node: PaneLayout, id: string): LeafPane | null {
  if (node.kind === 'leaf') return node.id === id ? node : null
  for (const c of node.children) {
    const found = findLeaf(c, id)
    if (found) return found
  }
  return null
}

export function firstLeaf(node: PaneLayout): LeafPane {
  return node.kind === 'leaf' ? node : firstLeaf(node.children[0])
}

// ── Transformaciones de hojas ────────────────────────────────────────────────

/** Aplica `fn` a cada hoja, reconstruyendo el árbol. */
export function mapLeaves(node: PaneLayout, fn: (leaf: LeafPane) => LeafPane): PaneLayout {
  if (node.kind === 'leaf') return fn(node)
  return { ...node, children: node.children.map((c) => mapLeaves(c, fn)) }
}

/** Reemplaza una hoja por el resultado de `fn` (solo esa hoja). */
export function updateLeaf(node: PaneLayout, id: string, fn: (leaf: LeafPane) => LeafPane): PaneLayout {
  return mapLeaves(node, (leaf) => (leaf.id === id ? fn(leaf) : leaf))
}

/** Abre (o activa) una nota en un panel: la agrega a tabs si falta y la activa. */
export function openInLeaf(node: PaneLayout, paneId: string, path: string): PaneLayout {
  return updateLeaf(node, paneId, (leaf) => ({
    ...leaf,
    tabs: leaf.tabs.includes(path) ? leaf.tabs : [...leaf.tabs, path],
    active: path
  }))
}

/** Reordena una tab dentro de un panel (mueve `path` a la posición `toIndex`). */
export function reorderTab(node: PaneLayout, paneId: string, path: string, toIndex: number): PaneLayout {
  return updateLeaf(node, paneId, (leaf) => {
    const from = leaf.tabs.indexOf(path)
    if (from === -1) return leaf
    const tabs = [...leaf.tabs]
    tabs.splice(from, 1)
    tabs.splice(Math.max(0, Math.min(tabs.length, toIndex)), 0, path)
    return { ...leaf, tabs }
  })
}

/** Quita una tab de un panel; si era la activa, pasa a una vecina. */
function dropTab(leaf: LeafPane, path: string): LeafPane {
  const idx = leaf.tabs.indexOf(path)
  if (idx === -1) return leaf
  const tabs = leaf.tabs.filter((p) => p !== path)
  const active = leaf.active === path ? (tabs[idx] ?? tabs[idx - 1] ?? null) : leaf.active
  return { ...leaf, tabs, active }
}

/** Cierra una tab en un panel; poda el panel si queda vacío (salvo el último). */
export function closeTabInLeaf(node: PaneLayout, paneId: string, path: string): PaneLayout {
  const next = updateLeaf(node, paneId, (leaf) => dropTab(leaf, path))
  return prune(next)
}

/** Quita una ruta (y sus descendientes) de TODOS los paneles. Para borrar/mover. */
export function removePathEverywhere(node: PaneLayout, path: string): PaneLayout {
  const affects = (p: string): boolean => p === path || p.startsWith(`${path}/`)
  const next = mapLeaves(node, (leaf) => {
    const tabs = leaf.tabs.filter((p) => !affects(p))
    if (tabs.length === leaf.tabs.length) return leaf
    const active = leaf.active && affects(leaf.active) ? (tabs[tabs.length - 1] ?? null) : leaf.active
    return { ...leaf, tabs, active }
  })
  return prune(next)
}

/** Conserva solo las tabs cuyas rutas siguen existiendo (tras un checkout). */
export function keepOnly(node: PaneLayout, existing: Set<string>): PaneLayout {
  const next = mapLeaves(node, (leaf) => {
    const tabs = leaf.tabs.filter((p) => existing.has(p))
    if (tabs.length === leaf.tabs.length) return leaf
    const active = leaf.active && existing.has(leaf.active) ? leaf.active : (tabs[tabs.length - 1] ?? null)
    return { ...leaf, tabs, active }
  })
  return prune(next)
}

// ── División y movimiento entre paneles ──────────────────────────────────────

/**
 * Divide un panel destino soltando una tab (`path`) en un borde. La tab se saca
 * del panel de origen y se abre en una hoja nueva junto al destino. Si origen y
 * destino son el mismo y el zone es "center", no hace nada.
 */
export function splitWithTab(
  node: PaneLayout,
  srcPaneId: string,
  path: string,
  dstPaneId: string,
  zone: DropZone
): PaneLayout {
  // "center": mover la tab al panel destino (sin dividir).
  if (zone === 'center') {
    if (srcPaneId === dstPaneId) return node
    const removed = updateLeaf(node, srcPaneId, (leaf) => dropTab(leaf, path))
    return prune(openInLeaf(removed, dstPaneId, path))
  }

  // Borde: crear una hoja nueva con la tab y colocarla junto al destino.
  const dir: 'row' | 'col' = zone === 'left' || zone === 'right' ? 'row' : 'col'
  const before = zone === 'left' || zone === 'top'
  const newLeaf = makeLeaf([path], path)

  // Primero sacar la tab del origen.
  let tree = updateLeaf(node, srcPaneId, (leaf) => dropTab(leaf, path))

  // Envolver el destino en un split con la hoja nueva al lado indicado.
  tree = replaceNode(tree, dstPaneId, (target) => ({
    kind: 'split',
    id: newId('s'),
    dir,
    children: before ? [newLeaf, target] : [target, newLeaf],
    sizes: [0.5, 0.5]
  }))

  return prune(normalize(tree))
}

/** Divide el panel activo abriendo su nota activa en una hoja nueva al lado. */
export function splitLeaf(node: PaneLayout, paneId: string, dir: 'row' | 'col'): { tree: PaneLayout; newPaneId: string } {
  const leaf = findLeaf(node, paneId)
  const path = leaf?.active ?? null
  const newLeaf = makeLeaf(path ? [path] : [], path)
  const tree = replaceNode(node, paneId, (target) => ({
    kind: 'split',
    id: newId('s'),
    dir,
    children: [target, newLeaf],
    sizes: [0.5, 0.5]
  }))
  return { tree: normalize(tree), newPaneId: newLeaf.id }
}

/** Reemplaza un nodo (hoja o split) por su id, aplicando `fn` al nodo hallado. */
function replaceNode(node: PaneLayout, id: string, fn: (n: PaneLayout) => PaneLayout): PaneLayout {
  if (node.id === id) return fn(node)
  if (node.kind === 'leaf') return node
  return { ...node, children: node.children.map((c) => replaceNode(c, id, fn)) }
}

/** Ajusta los tamaños de un split por su id (los normaliza para que sumen 1). */
export function setSizes(node: PaneLayout, splitId: string, sizes: number[]): PaneLayout {
  if (node.kind === 'leaf') return node
  if (node.id === splitId) {
    const sum = sizes.reduce((a, b) => a + b, 0) || 1
    return { ...node, sizes: sizes.map((s) => s / sum) }
  }
  return { ...node, children: node.children.map((c) => setSizes(c, splitId, sizes)) }
}

// ── Limpieza estructural ─────────────────────────────────────────────────────

/**
 * Poda hojas vacías y colapsa splits triviales:
 *  - hoja sin tabs → se elimina (su hermano ocupa el lugar).
 *  - split con un solo hijo → se reemplaza por ese hijo.
 * Garantiza que siempre quede al menos una hoja (aunque esté vacía).
 */
export function prune(node: PaneLayout): PaneLayout {
  const pruned = pruneInner(node)
  return pruned ?? makeLeaf()
}

function pruneInner(node: PaneLayout): PaneLayout | null {
  if (node.kind === 'leaf') {
    return node.tabs.length === 0 ? null : node
  }
  const kept: PaneLayout[] = []
  const sizes: number[] = []
  node.children.forEach((c, i) => {
    const p = pruneInner(c)
    if (p) {
      kept.push(p)
      sizes.push(node.sizes[i] ?? 1 / node.children.length)
    }
  })
  if (kept.length === 0) return null
  if (kept.length === 1) return kept[0]
  const sum = sizes.reduce((a, b) => a + b, 0) || 1
  return { ...node, children: kept, sizes: sizes.map((s) => s / sum) }
}

/**
 * Aplana splits anidados de la misma dirección (grid plano, como VSCode): un
 * split `row` cuyo hijo también es `row` absorbe a sus nietos en su lugar,
 * repartiendo proporcionalmente el tamaño del hueco.
 */
export function normalize(node: PaneLayout): PaneLayout {
  if (node.kind === 'leaf') return node
  const children: PaneLayout[] = []
  const sizes: number[] = []
  node.children.forEach((raw, i) => {
    const child = normalize(raw)
    const slot = node.sizes[i] ?? 1 / node.children.length
    if (child.kind === 'split' && child.dir === node.dir) {
      child.children.forEach((gc, j) => {
        children.push(gc)
        sizes.push(slot * (child.sizes[j] ?? 1 / child.children.length))
      })
    } else {
      children.push(child)
      sizes.push(slot)
    }
  })
  const sum = sizes.reduce((a, b) => a + b, 0) || 1
  return { ...node, children, sizes: sizes.map((s) => s / sum) }
}
