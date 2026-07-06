# Phase 1: Sidebar Sections - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Convierte el sidebar en una pila de secciones colapsables estilo VSCode-Explorer, con un switcher de bóveda inline en una cabecera superior. Esta fase construye el **contenedor de secciones** (el primitivo reutilizable) y migra la sección de Notas a ese contenedor; la sección de Timeline se acopla en la Fase 2 sin retrabajo.

Cubre: SIDE-01 (pila de secciones colapsables), SIDE-02 (acciones del árbol de notas en la cabecera de su sección), SIDE-04 (cambio de bóveda como disclosure inline, no popover flotante).

Fuera de alcance: la sección de Timeline (SIDE-03, Fase 2), cualquier cambio funcional en el árbol de archivos o en la lógica de git. Es una reestructuración visual pura sin regresiones de comportamiento.

</domain>

<decisions>
## Implementation Decisions

### Section Framework
- El colapso/expansión se controla haciendo click en la cabecera de la sección; twisty (chevron) a la izquierda, reutilizando `ChevronDown`/`ChevronRight` como en `FileTree`.
- El estado de colapso se persiste por sección en `localStorage`, siguiendo el patrón existente de `geode.sidebarWidth`.
- En esta fase existe una sola sección — **Notas** — pero el contenedor/primitivo de sección se construye para aceptar la sección de Timeline (Fase 2) sin rediseño.
- Las secciones no son reordenables ni redimensionables por drag; orden fijo, Notas ocupa el espacio disponible (flex). Reordenar queda fuera de alcance.

### Vault Header & Inline Switcher (SIDE-04)
- El switcher de bóveda vive en una **cabecera de bóveda arriba del sidebar** (estilo título "Explorer" de VSCode), reemplazando el popover del footer.
- Revela la lista como disclosure inline: se expande en el lugar y empuja las secciones hacia abajo (sin overlay flotante).
- Se mantienen las acciones "Abrir carpeta…" y "Clonar o crear en GitHub…" al final de la lista inline, como hoy.
- Settings y Ayuda permanecen en el footer; solo el switcher de bóveda sube a la cabecera.

### Notes Section Header & Toolbar (SIDE-02)
- Las acciones (nueva nota, nueva carpeta, ordenar, colapsar/expandir todo) se mueven a la **cabecera de la sección Notas** (alineadas a la derecha), no en una fila de toolbar aparte.
- Las acciones se muestran al hacer hover sobre la cabecera de la sección (estilo VSCode); reduce el desorden.
- Cuando la sección Notas está colapsada, sus acciones se ocultan (pertenecen a la sección).
- Etiqueta de la cabecera en mayúsculas "NOTAS", estilo VSCode.

### Visual Density & Styling
- Cabeceras de sección de ~22px de alto, 11px bold en mayúsculas, color atenuado — igual que VSCode.
- Reutilizar los iconos Lucide ya importados (`FilePlus`, `FolderPlus`, `ArrowDownUp`, `FoldVertical`/`UnfoldVertical`).
- Chevron a la izquierda de la etiqueta (leading), como las carpetas del `FileTree`.
- Se preservan todos los comportamientos actuales (resizer del sidebar, orden, colapsar/expandir todo, teclado) — reestructuración pura, sin regresiones funcionales.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FileTree.tsx` — árbol de notas ya colapsable; usa `ChevronDown`/`ChevronRight` como twisty. Se reutiliza tal cual dentro de la sección Notas.
- `VaultSwitcher.tsx` — hoy es un popover (estado `open`, overlay, `vault-menu`). Se refactoriza a disclosure inline en la cabecera; su lógica de lista de bóvedas + acciones "Abrir carpeta"/"Clonar" se conserva.
- Iconos Lucide ya importados en `App.tsx`: `FilePlus`, `FolderPlus`, `ArrowDownUp`, `FoldVertical`, `UnfoldVertical`, `HelpCircle`, `Settings`, `ChevronsUpDown`, `Check`, `FolderOpen`, `Cloud`.
- Patrón de persistencia en `localStorage` ya usado para `geode.sidebarWidth` (App.tsx ~L115).

### Established Patterns
- Componentes funcionales con hooks; `useState`/`useCallback`/`useEffect`; sin componentes de clase.
- Estilos en `src/renderer/src/index.css` con clases kebab-case (`.sidebar`, `.sidebar-toolbar`, `.sidebar-tree`, `.sidebar-footer`, `.vault-switcher`, `.vault-menu`).
- Strings de UI y comentarios en español; iconos Lucide monocromo, nunca emojis.
- La estructura actual del sidebar está en `App.tsx` ~L855-926: `.sidebar-toolbar` → `.sidebar-tree` (FileTree) → `.sidebar-footer` (VaultSwitcher + settings/help).

### Integration Points
- `App.tsx` renderiza el `<aside className="sidebar">`; ahí se introduce el nuevo contenedor de secciones y la cabecera de bóveda.
- El nuevo primitivo de sección probablemente es un componente nuevo (p. ej. `SidebarSection.tsx`) en `src/renderer/src/`, siguiendo el patrón de un componente React por archivo (PascalCase).
- `index.css` recibe las clases nuevas de sección/cabecera; se retiran o adaptan `.sidebar-toolbar` y el popover `.vault-menu`.
- El `.sidebar-resizer` y su lógica (`startSidebarResize`, `sidebarWidth`) se mantienen sin cambios.

</code_context>

<specifics>
## Specific Ideas

- Referencia visual explícita: el panel Explorer de VSCode — secciones con cabeceras compactas en mayúsculas, twisty a la izquierda, acciones a la derecha visibles al hover.
- El contenedor de sección debe quedar listo para recibir la sección Timeline en la Fase 2 (SIDE-03) sin rediseño.

</specifics>

<deferred>
## Deferred Ideas

- Sección de Timeline (SIDE-03) — Fase 2.
- Reordenar/redimensionar secciones por drag — fuera de alcance de este milestone.

</deferred>
