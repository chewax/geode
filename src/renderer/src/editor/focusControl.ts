/**
 * Control puntual para suprimir el auto-foco del editor UNA sola vez.
 *
 * Al crear una nota nueva la abrimos en el editor, pero el foco debe quedarse en el
 * input de nombre del árbol para poder nombrarla al instante. El editor, al montarse
 * o al recargar la nota (cambio de reloadKey), llama `view.focus()` dentro de un
 * passive-effect que corre DESPUÉS del paint — es decir, después del rAF con que el
 * input reclama el foco — y se lo roba. Este flag le indica saltarse ese foco esa
 * única vez, sin tener que enhebrar una prop por toda la jerarquía de paneles.
 */
let suppress = false

/** Marca que el próximo auto-foco del editor debe saltarse (lo consume una vez). */
export function suppressNextEditorAutoFocus(): void {
  suppress = true
}

/** Devuelve true (y se resetea) si corresponde saltarse el auto-foco esta vez. */
export function consumeEditorAutoFocusSuppression(): boolean {
  if (!suppress) return false
  suppress = false
  return true
}
