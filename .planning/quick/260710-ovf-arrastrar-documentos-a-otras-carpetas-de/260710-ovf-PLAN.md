---
phase: quick-260710-ovf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderer/src/FileTree.tsx
  - src/renderer/src/App.tsx
  - src/renderer/src/index.css
autonomous: true
requirements: [DND-01]
must_haves:
  truths:
    - "El usuario arrastra una nota o carpeta y la suelta sobre una carpeta del árbol; el elemento se mueve dentro de esa carpeta"
    - "El usuario suelta un elemento sobre el área vacía/raíz del árbol y el elemento se mueve a la raíz de la bóveda"
    - "Si en la carpeta destino ya existe un elemento con el mismo nombre, el move se rechaza con un aviso en español y no se sobrescribe nada"
    - "Las pestañas y la nota activa abiertas que apuntaban al elemento movido se actualizan a la nueva ruta (igual que al renombrar)"
    - "Mover una carpeta dentro de sí misma o de una descendiente es un no-op (no rompe ni pierde datos)"
  artifacts:
    - path: "src/renderer/src/FileTree.tsx"
      provides: "Drag & drop nativo HTML5: draggable + onDragStart en filas, drop targets en carpetas, prop onMoveNode"
      contains: "onMoveNode"
    - path: "src/renderer/src/App.tsx"
      provides: "Callback moveNode que reusa vault.rename y el remap de pestañas; zona de drop raíz en tree-scroll"
      contains: "moveNode"
    - path: "src/renderer/src/index.css"
      provides: "Estilo sobrio de resaltado de drop-target (carpeta y raíz)"
      contains: "drop-target"
  key_links:
    - from: "src/renderer/src/FileTree.tsx"
      to: "src/renderer/src/App.tsx (moveNode)"
      via: "prop onMoveNode(fromPath, toDir)"
      pattern: "onMoveNode"
    - from: "src/renderer/src/App.tsx (moveNode)"
      to: "window.geode.vault.rename"
      via: "reuso del canal de rename existente (que ya mueve entre carpetas)"
      pattern: "vault\\.rename"
---

<objective>
Permitir mover notas y carpetas del árbol lateral (FileTree) con drag & drop nativo:
soltar sobre una carpeta la mueve dentro; soltar sobre el área vacía/raíz del árbol
la mueve a la raíz de la bóveda.

Purpose: Paridad con VSCode/Obsidian para reorganizar cuadernos sin menú contextual.
Output: Drag & drop funcional en FileTree, callback moveNode en App, estilos de drop.

Hallazgo clave (no re-descubrir): NO hace falta un canal IPC nuevo. `vault.rename(from, to)`
(src/main/services/vault.ts:218) YA mueve entre carpetas — acepta cualquier ruta relativa
origen→destino, valida ambas con resolveInside, rechaza colisiones con `throw new Error("Ya existe: ...")`,
y git detecta el move por hash de contenido (racy-safe), así que el snapshot posterior lo refleja
sin trabajo extra. Además `renameNode` (App.tsx:650-687) ya tiene el remap exacto de pestañas/panes/
selección que un move necesita. Este trabajo es solo renderer + CSS.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/renderer/src/FileTree.tsx
@src/renderer/src/App.tsx
@src/renderer/src/index.css

# Referencia (NO modificar): rename ya mueve + valida colisión + racy-safe git
@src/main/services/vault.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Drag & drop nativo en FileTree — arrastre de filas y drop sobre carpetas</name>
  <files>src/renderer/src/FileTree.tsx</files>
  <action>
    Agregar drag & drop HTML5 nativo (sin librerías) al árbol.

    1. Extender FileTreeProps con una nueva prop:
       `onMoveNode: (fromPath: string, toDir: string) => void` — `toDir` es la ruta relativa
       de la carpeta destino ('' = raíz). Documentar en español el contrato.

    2. En TreeItem, hacer arrastrables tanto archivos (`<li className="tree-file">`) como
       carpetas (`<div className="tree-dir">`): añadir `draggable` y `onDragStart` que llame
       `e.dataTransfer.setData('text/geode-path', node.path)` y ponga
       `e.dataTransfer.effectAllowed = 'move'`. Usar el formato de dataTransfer para transportar
       la ruta origen (patrón idiomático HTML5, sin estado compartido entre TreeItems).
       No arrancar arrastre desde el input de rename: si `editing`, no setear `draggable`.

    3. Convertir SOLO las carpetas (`tree-dir`) en drop targets. En el `<div className="tree-dir">`:
       - `onDragOver`: `e.preventDefault()` + `e.dataTransfer.dropEffect = 'move'` y activar un
         estado local `dragOver` (useState booleano en TreeItem) para el resaltado.
       - `onDragLeave`: desactivar `dragOver`.
       - `onDrop`: `e.preventDefault(); e.stopPropagation()` (stopPropagation es load-bearing:
         evita que el drop burbujee a la zona raíz de tree-scroll y dispare un segundo move),
         leer `const from = e.dataTransfer.getData('text/geode-path')`, desactivar `dragOver`,
         y si `from` no está vacío llamar `onMoveNode(from, node.path)`.
       Aplicar clase CSS `drop-target` a la fila cuando `dragOver` es true
       (`className={\`tree-dir...${dragOver ? ' drop-target' : ''}\`}`).

    4. Los archivos NO son drop targets (solo origen de arrastre); las carpetas y la raíz
       (Task 2, en tree-scroll de App.tsx) son los únicos destinos, según el pedido.

    NO inline code fences aquí: seguir los patrones existentes de TreeItem (useState local ya
    se usa para `expanded`). Mantener strings/comentarios en español, TS strict con tipos explícitos.
  </action>
  <verify>
    <automated>npm run typecheck:web</automated>
  </verify>
  <done>FileTree compila; filas draggable con dataTransfer 'text/geode-path'; carpetas aceptan drop con resaltado `drop-target` y llaman onMoveNode(from, dirPath) con stopPropagation; los archivos no son drop targets.</done>
</task>

<task type="auto">
  <name>Task 2: moveNode en App + zona de drop raíz + estilos sobrios de drop</name>
  <files>src/renderer/src/App.tsx, src/renderer/src/index.css</files>
  <action>
    Cablear el move en App.tsx y añadir el estilo del drop-target.

    1. App.tsx — crear `moveNode` con `useCallback` (espejando `renameNode`, App.tsx:650-687):
       Firma: `async (fromPath: string, toDir: string)`.
       - Calcular basename: `const base = fromPath.slice(fromPath.lastIndexOf('/') + 1)`.
       - Calcular destino: `const toRel = toDir ? \`${toDir}/${base}\` : base`.
       - Guardas (no-op silencioso, `return`): si `toRel === fromPath`;
         si `parentDir(fromPath) === toDir` (ya está en esa carpeta);
         si `toDir === fromPath || toDir.startsWith(\`${fromPath}/\`)` (mover una carpeta dentro
         de sí misma o de una descendiente — evita corromper el árbol).
       - `try { await window.geode.vault.rename(fromPath, toRel) } catch (e) { notify(...) }`:
         en el catch, mostrar el mensaje en español via el `notify`/toast ya usado en App
         (buscar el patrón existente de aviso de error; el error de colisión llega como
         "Ya existe: <ruta>" desde vault.rename). NO reintentar ni sobrescribir.
       - En éxito: aplicar EXACTAMENTE el mismo remap que renameNode (líneas 671-686):
         función `remap(p)` con `fromPath`→`toRel`, `setPanes(mapLeaves(...))` remapeando
         `tabs`, `active` y `preview`, `setSelected(...)`, y `await refreshTree()`.
         Reutilizar/extraer el remap si conviene, pero sin cambiar el comportamiento de renameNode.
       - Deps del useCallback: `[refreshTree]` (más lo que use el notify).

    2. App.tsx — pasar `onMoveNode={(from, toDir) => void moveNode(from, toDir)}` al `<FileTree>`
       (junto a las otras props, ~línea 1400-1417).

    3. App.tsx — zona de drop raíz en el `<div className="tree-scroll">` (~línea 1390):
       - `onDragOver`: `e.preventDefault()` + `dropEffect='move'`; si el target es el propio
         contenedor (área vacía) activar un estado `rootDragOver` para resaltar.
       - `onDragLeave`: desactivar `rootDragOver`.
       - `onDrop`: `e.preventDefault()`, leer `from = e.dataTransfer.getData('text/geode-path')`,
         desactivar `rootDragOver`, si `from` no vacío llamar `moveNode(from, '')`.
         (El drop sobre carpetas hace stopPropagation en Task 1, así que no llega acá.)
       - Añadir clase `root-drop-target` al div cuando `rootDragOver` es true.

    4. index.css — junto al bloque `.tree-*` (líneas ~688-809), agregar estilos SOBRIOS
       consistentes con la selección existente (que usa `box-shadow: inset 0 0 0 1px var(--accent)`):
       - `.tree-dir.drop-target { background: var(--panel-2); box-shadow: inset 0 0 0 1px var(--accent); }`
       - `.tree-scroll.root-drop-target { box-shadow: inset 0 0 0 1px var(--accent); }`
       Sin emojis, sin colores nuevos fuera de las variables del tema.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>Typecheck+build en verde; moveNode reusa vault.rename y el remap de pestañas; guardas de no-op y auto-descendencia presentes; colisión avisa en español sin sobrescribir; FileTree recibe onMoveNode; tree-scroll acepta drop raíz; drop-target/root-drop-target estilados sobriamente.</done>
</task>

</tasks>

<verification>
- `npm run typecheck` y `npm run build` en verde.
- Arrastrar una nota sobre otra carpeta la mueve dentro (aparece en el árbol tras refresh).
- Arrastrar una nota al área vacía del árbol la mueve a la raíz.
- Mover una nota abierta actualiza su pestaña a la nueva ruta.
- Soltar sobre una carpeta que ya tiene un archivo del mismo nombre muestra aviso en español y no pisa nada.
- Guardar versión después del move: el commit refleja el cambio de ruta (racy-safe existente, sin trabajo extra).
</verification>

<success_criteria>
Drag & drop nativo funcional en FileTree: mover a carpeta y a raíz, con actualización de pestañas,
rechazo de colisiones en español, guardas anti-descendencia, y resaltado de drop sobrio. Sin nuevas
dependencias ni canal IPC nuevo (reuso de vault.rename).
</success_criteria>

<output>
Create `.planning/quick/260710-ovf-arrastrar-documentos-a-otras-carpetas-de/260710-ovf-SUMMARY.md` when done
</output>
