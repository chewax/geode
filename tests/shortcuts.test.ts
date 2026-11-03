import { describe, expect, it } from 'vitest'
import {
  acceleratorFromEvent,
  findConflict,
  matchesShortcut,
  normalizeAccelerator,
  resolveShortcuts,
  shortcutLabel,
  toCodeMirrorKey,
  validateShortcut,
  type KeyLike
} from '@shared/shortcuts'

const ev = (key: string, mods: Partial<KeyLike> = {}, code?: string): KeyLike => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

describe('normalizeAccelerator', () => {
  it('ordena modificadores, acepta sinónimos y pone la letra en mayúscula', () => {
    expect(normalizeAccelerator('shift+ctrl+f')).toBe('Control+Shift+F')
    expect(normalizeAccelerator('CmdOrCtrl+Alt+space')).toBe('CommandOrControl+Alt+Space')
    expect(normalizeAccelerator('CommandOrControl+\\')).toBe('CommandOrControl+\\')
    expect(normalizeAccelerator('Ctrl++')).toBe('Control+Plus')
  })
  it('rechaza combinaciones inválidas', () => {
    expect(normalizeAccelerator('Ctrl+Shift')).toBeNull()
    expect(normalizeAccelerator('A+B')).toBeNull()
    expect(normalizeAccelerator('Ctrl+Hyper')).toBeNull()
  })
})

describe('validateShortcut', () => {
  it('exige un modificador fuerte salvo teclas de función', () => {
    expect(validateShortcut('Shift+A', 'app')).not.toBeNull()
    expect(validateShortcut('F5', 'app')).toBeNull()
    expect(validateShortcut('F5', 'global')).not.toBeNull()
    expect(validateShortcut('Alt+Shift+D', 'global')).toBeNull()
  })
})

describe('resolveShortcuts / findConflict', () => {
  it('aplica reasignaciones válidas y descarta basura', () => {
    const map = resolveShortcuts({ dictation: 'ctrl+shift+space', search: 'Q' as string })
    expect(map.dictation).toBe('Control+Shift+Space')
    expect(map.search).toBe('CommandOrControl+Shift+F')
  })
  it('detecta choques con otra acción', () => {
    const map = resolveShortcuts(null)
    expect(findConflict(map, 'dictation', 'CmdOrCtrl+S')).toBe('saveVersion')
    expect(findConflict(map, 'saveVersion', 'CommandOrControl+S')).toBeNull()
  })
})

describe('acceleratorFromEvent / matchesShortcut', () => {
  it('Ctrl en Windows/Linux y Cmd en Mac son CommandOrControl', () => {
    expect(acceleratorFromEvent(ev('s', { ctrlKey: true }, 'KeyS'), false)).toBe('CommandOrControl+S')
    expect(acceleratorFromEvent(ev('s', { metaKey: true }, 'KeyS'), true)).toBe('CommandOrControl+S')
    expect(acceleratorFromEvent(ev('s', { ctrlKey: true }, 'KeyS'), true)).toBe('Control+S')
  })
  it('ignora pulsaciones de sólo modificadores', () => {
    expect(acceleratorFromEvent(ev('Control', { ctrlKey: true }), false)).toBeNull()
  })
  it('Shift+símbolo usa la tecla física, no el carácter con shift', () => {
    expect(acceleratorFromEvent(ev('|', { ctrlKey: true, shiftKey: true }, 'Backslash'), false)).toBe(
      'CommandOrControl+Shift+\\'
    )
    expect(acceleratorFromEvent(ev(' ', { ctrlKey: true, altKey: true }, 'Space'), false)).toBe(
      'CommandOrControl+Alt+Space'
    )
  })
  it('compara exacto: Ctrl+Shift+F no dispara Ctrl+F', () => {
    const e = ev('F', { ctrlKey: true, shiftKey: true }, 'KeyF')
    expect(matchesShortcut(e, 'CommandOrControl+Shift+F', false)).toBe(true)
    expect(matchesShortcut(e, 'CommandOrControl+F', false)).toBe(false)
  })
})

describe('toCodeMirrorKey / shortcutLabel', () => {
  it('traduce a la notación de CodeMirror', () => {
    expect(toCodeMirrorKey('CommandOrControl+Shift+X')).toBe('Mod-Shift-x')
    expect(toCodeMirrorKey('Control+Alt+Up')).toBe('Ctrl-Alt-ArrowUp')
  })
  it('muestra nombres humanos según la plataforma', () => {
    expect(shortcutLabel('CommandOrControl+Alt+Space', false)).toBe('Ctrl+Alt+Espacio')
    expect(shortcutLabel('CommandOrControl+Alt+Space', true)).toBe('Cmd+Option+Espacio')
  })
})
