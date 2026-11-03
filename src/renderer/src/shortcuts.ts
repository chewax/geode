import { useSyncExternalStore } from 'react'
import type { ShortcutsState } from '@shared/ipc'
import {
  matchesShortcut,
  resolveShortcuts,
  shortcutLabel,
  type KeyLike,
  type ShortcutId,
  type ShortcutMap
} from '@shared/shortcuts'

/**
 * Atajos efectivos en el renderer: store externo (useSyncExternalStore) que
 * arranca con los de fábrica, se carga del main al iniciar y se actualiza cuando
 * se reasigna uno en Ajustes (evento `shortcuts.onChange`).
 */
export const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent)

let state: ShortcutsState = { bindings: resolveShortcuts(null), customized: [], globalRegistered: true }
const listeners = new Set<() => void>()

function emit(next: ShortcutsState): void {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// Carga inicial + cambios que vengan del main.
void window.geode.shortcuts.get().then(emit).catch(() => {})
window.geode.shortcuts.onChange(emit)

/** Estado actual (fuera de React, p. ej. en handlers de teclado). */
export function getShortcuts(): ShortcutsState {
  return state
}

/** Aplica un estado devuelto por `shortcuts.set` sin esperar al evento. */
export function applyShortcuts(next: ShortcutsState): void {
  emit(next)
}

/** Hook: atajos efectivos (re-renderiza al reasignar). */
export function useShortcuts(): ShortcutsState {
  return useSyncExternalStore(subscribe, () => state)
}

/** ¿El evento dispara la acción `id` según los atajos vigentes? */
export function isShortcut(e: KeyLike, id: ShortcutId, bindings: ShortcutMap = state.bindings): boolean {
  return matchesShortcut(e, bindings[id], IS_MAC)
}

/** Texto humano del atajo de una acción ("Ctrl+Shift+F"). */
export function labelOf(id: ShortcutId, bindings: ShortcutMap = state.bindings): string {
  return shortcutLabel(bindings[id], IS_MAC)
}

/** Comandos de la paleta cuyo atajo es reasignable (id de comando → id de atajo). */
export const COMMAND_SHORTCUTS: Record<string, ShortcutId> = {
  'core.saveVersion': 'saveVersion',
  'core.search': 'search',
  'core.dictate': 'dictation',
  'core.splitRight': 'splitRight',
  'daily-notes.today': 'dailyNote'
}
