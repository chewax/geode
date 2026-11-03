/**
 * Atajos de teclado reasignables.
 *
 * Formato canónico: el de los "accelerators" de Electron
 * (`CommandOrControl+Shift+F`), porque el atajo global del dictado lo registra
 * el main con `globalShortcut` y así no hay que traducir de ida y vuelta. El
 * renderer los compara contra los `KeyboardEvent` y el editor los traduce a la
 * notación de CodeMirror (`Mod-Shift-f`).
 *
 * Lógica pura (sin DOM ni Electron) para poder testearla y usarla en ambos lados.
 */

/** Dónde actúa el atajo: en todo el sistema, en la ventana de Geode o dentro del editor. */
export type ShortcutScope = 'global' | 'app' | 'editor'

export type ShortcutId =
  | 'dictation'
  | 'saveVersion'
  | 'commandPalette'
  | 'search'
  | 'dailyNote'
  | 'splitRight'
  | 'aiPrompt'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'

export interface ShortcutDef {
  id: ShortcutId
  /** Nombre visible en Ajustes. */
  title: string
  scope: ShortcutScope
  /** Atajo de fábrica (formato accelerator). */
  default: string
}

/** Catálogo de atajos reasignables, en el orden en que se muestran. */
export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: 'dictation', title: 'Dictar (empezar / terminar)', scope: 'global', default: 'CommandOrControl+Alt+Space' },
  { id: 'saveVersion', title: 'Guardar versión', scope: 'app', default: 'CommandOrControl+S' },
  { id: 'commandPalette', title: 'Paleta de comandos', scope: 'app', default: 'CommandOrControl+P' },
  { id: 'search', title: 'Buscar en todas las notas', scope: 'app', default: 'CommandOrControl+Shift+F' },
  { id: 'dailyNote', title: 'Abrir la nota de hoy', scope: 'app', default: 'CommandOrControl+Shift+D' },
  { id: 'splitRight', title: 'Dividir editor a la derecha', scope: 'app', default: 'CommandOrControl+\\' },
  { id: 'aiPrompt', title: 'Pedirle a la IA', scope: 'editor', default: 'CommandOrControl+K' },
  { id: 'bold', title: 'Negrita', scope: 'editor', default: 'CommandOrControl+B' },
  { id: 'italic', title: 'Cursiva', scope: 'editor', default: 'CommandOrControl+I' },
  { id: 'strikethrough', title: 'Tachado', scope: 'editor', default: 'CommandOrControl+Shift+X' },
  { id: 'inlineCode', title: 'Código en línea', scope: 'editor', default: 'CommandOrControl+E' }
]

/** Mapa id → atajo efectivo (accelerator). */
export type ShortcutMap = Record<ShortcutId, string>

/** Reasignaciones guardadas por la persona (sólo las que difieren del default). */
export type ShortcutOverrides = Partial<Record<ShortcutId, string>>

/** Orden canónico de los modificadores. */
const MODIFIERS = ['CommandOrControl', 'Control', 'Alt', 'Shift', 'Super'] as const
type Modifier = (typeof MODIFIERS)[number]

/** Sinónimos que acepta Electron, llevados a la forma canónica. */
const MOD_ALIASES: Record<string, Modifier> = {
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  mod: 'CommandOrControl',
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'Alt',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  command: 'Super',
  cmd: 'Super'
}

/** Teclas con nombre que se aceptan como tecla principal. */
const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'Up', 'Down', 'Left', 'Right', 'Escape',
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`)
])

export function isShortcutId(id: string): id is ShortcutId {
  return SHORTCUTS.some((s) => s.id === id)
}

export function shortcutDef(id: ShortcutId): ShortcutDef {
  return SHORTCUTS.find((s) => s.id === id) as ShortcutDef
}

/**
 * Normaliza un accelerator: modificadores sin repetir y en orden canónico,
 * letras en mayúscula. Devuelve null si no es válido (sin tecla principal,
 * dos teclas principales, modificador desconocido…).
 */
export function normalizeAccelerator(raw: string): string | null {
  if (typeof raw !== 'string') return null
  // `+` como tecla: "Ctrl++" → partes ['Ctrl', '', ''] → se reconstruye.
  const parts = raw.trim().split('+')
  const mods = new Set<Modifier>()
  let key: string | null = null
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i].trim()
    if (p === '' && i === parts.length - 1 && parts[i - 1] === '') p = 'Plus'
    if (p === '') continue
    const mod = MOD_ALIASES[p.toLowerCase()]
    if (mod) {
      mods.add(mod)
      continue
    }
    if (key !== null) return null
    key = normalizeKey(p)
    if (key === null) return null
  }
  if (key === null) return null
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join('+')
}

function normalizeKey(k: string): string | null {
  if (k.length === 1) return k === ' ' ? 'Space' : k.toUpperCase()
  const lower = k.toLowerCase()
  if (lower === 'plus') return 'Plus'
  if (lower === 'esc') return 'Escape'
  if (lower === 'return') return 'Enter'
  for (const n of NAMED_KEYS) if (n.toLowerCase() === lower) return n
  return null
}

/** Partes de un accelerator ya normalizado. */
function split(accel: string): { mods: Modifier[]; key: string } {
  const parts = accel.split('+')
  // "Control+Plus" → tecla Plus; nunca hay '+' literal en la forma normalizada.
  const key = parts.pop() as string
  return { mods: parts as Modifier[], key }
}

/**
 * Valida un atajo para un ámbito. Devuelve un mensaje en español si no sirve,
 * o null si está bien.
 */
export function validateShortcut(accel: string, scope: ShortcutScope): string | null {
  const norm = normalizeAccelerator(accel)
  if (!norm) return 'Esa combinación no se reconoce.'
  const { mods, key } = split(norm)
  const isFn = /^F\d+$/.test(key)
  const strong = mods.some((m) => m !== 'Shift')
  if (!strong && !isFn) {
    return 'Usá al menos Ctrl, Alt o Cmd: una tecla sola chocaría con la escritura.'
  }
  if (scope === 'global' && !strong) {
    return 'Un atajo global necesita Ctrl, Alt o Cmd para no robarle teclas a otras apps.'
  }
  return null
}

/** Atajos efectivos: defaults pisados por las reasignaciones válidas. */
export function resolveShortcuts(overrides: ShortcutOverrides | undefined | null): ShortcutMap {
  const map = {} as ShortcutMap
  for (const s of SHORTCUTS) {
    const o = overrides?.[s.id]
    const norm = typeof o === 'string' ? normalizeAccelerator(o) : null
    map[s.id] = norm && !validateShortcut(norm, s.scope) ? norm : s.default
  }
  return map
}

/** Id de otro atajo que ya usa `accel` (para avisar del choque), o null. */
export function findConflict(map: ShortcutMap, id: ShortcutId, accel: string): ShortcutId | null {
  const norm = normalizeAccelerator(accel)
  if (!norm) return null
  for (const s of SHORTCUTS) {
    if (s.id !== id && normalizeAccelerator(map[s.id]) === norm) return s.id
  }
  return null
}

/** Lo mínimo de un KeyboardEvent que hace falta (testeable sin DOM). */
export interface KeyLike {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const CODE_KEYS: Record<string, string> = {
  Backslash: '\\', Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`'
}

const EVENT_KEYS: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Esc: 'Escape', '+': 'Plus'
}

/**
 * Accelerator de un evento de teclado, o null si sólo se apretaron
 * modificadores. En Mac, Cmd = CommandOrControl y Ctrl = Control; en el resto,
 * Ctrl = CommandOrControl y la tecla Windows/Super = Super.
 */
export function acceleratorFromEvent(e: KeyLike, isMac: boolean): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'OS', 'Dead', 'Unidentified'].includes(e.key)) {
    return null
  }
  let key: string | null = null
  const code = e.code ?? ''
  if (/^[a-z]$/i.test(e.key)) key = e.key.toUpperCase()
  else if (/^Digit\d$/.test(code)) key = code.slice(5)
  else if (/^Key[A-Z]$/.test(code)) key = code.slice(3) // Alt+letra en Mac da símbolos raros
  else if (code === 'Space') key = 'Space'
  else if (EVENT_KEYS[e.key]) key = EVENT_KEYS[e.key]
  else if (NAMED_KEYS.has(e.key)) key = e.key
  else if (CODE_KEYS[code] && (e.shiftKey || e.altKey || e.key.length !== 1)) key = CODE_KEYS[code]
  else if (e.key.length === 1) key = e.key
  if (!key) return null
  const mods: string[] = []
  if (isMac ? e.metaKey : e.ctrlKey) mods.push('CommandOrControl')
  if (isMac && e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (!isMac && e.metaKey) mods.push('Super')
  return normalizeAccelerator([...mods, key].join('+'))
}

/** ¿El evento corresponde al atajo? */
export function matchesShortcut(e: KeyLike, accel: string, isMac: boolean): boolean {
  const got = acceleratorFromEvent(e, isMac)
  return got !== null && got === normalizeAccelerator(accel)
}

/** Traducción a la notación de keymap de CodeMirror (`Mod-Shift-x`). */
export function toCodeMirrorKey(accel: string): string {
  const norm = normalizeAccelerator(accel)
  if (!norm) return ''
  const { mods, key } = split(norm)
  const cmMods = mods.map((m) =>
    m === 'CommandOrControl' ? 'Mod' : m === 'Control' ? 'Ctrl' : m === 'Super' ? 'Meta' : m
  )
  const cmKey =
    key.length === 1 ? key.toLowerCase()
      : key === 'Plus' ? '+'
        : key === 'Up' ? 'ArrowUp'
          : key === 'Down' ? 'ArrowDown'
            : key === 'Left' ? 'ArrowLeft'
              : key === 'Right' ? 'ArrowRight'
                : key
  return [...cmMods, cmKey].join('-')
}

/** Texto humano del atajo ("Ctrl+Shift+F", "Cmd+Option+Espacio"). */
export function shortcutLabel(accel: string, isMac: boolean): string {
  const norm = normalizeAccelerator(accel)
  if (!norm) return accel
  const { mods, key } = split(norm)
  const names: Record<Modifier, string> = isMac
    ? { CommandOrControl: 'Cmd', Control: 'Ctrl', Alt: 'Option', Shift: 'Shift', Super: 'Cmd' }
    : { CommandOrControl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Super' }
  const keyName =
    key === 'Space' ? 'Espacio'
      : key === 'Plus' ? '+'
        : key === 'Up' ? '↑' : key === 'Down' ? '↓' : key === 'Left' ? '←' : key === 'Right' ? '→'
          : key === 'Escape' ? 'Esc'
            : key
  return [...mods.map((m) => names[m]), keyName].join('+')
}
