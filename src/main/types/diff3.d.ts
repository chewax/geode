/**
 * Tipos mínimos para `diff3` (merge 3-way por líneas; dependencia transitiva de
 * isomorphic-git que usamos directo en `GitService.sync` para integrar cambios
 * de la nube). El paquete no trae tipos.
 */
declare module 'diff3' {
  interface Diff3Conflict {
    a: string[]
    aIndex: number
    o: string[]
    oIndex: number
    b: string[]
    bIndex: number
  }
  interface Diff3Hunk {
    ok?: string[]
    conflict?: Diff3Conflict
  }
  /** `diff3Merge(ours, base, theirs)` → lista de hunks limpios o en conflicto. */
  function diff3Merge(a: string[], o: string[], b: string[]): Diff3Hunk[]
  export = diff3Merge
}
