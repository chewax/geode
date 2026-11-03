import type { Extension } from '@codemirror/state'
import type {
  Command,
  Disposable,
  GeodeEventName,
  GeodeEvents,
  PanelDef,
  PickItem,
  StatusItemDef
} from './types'

/** Pedido de selección en curso (lo muestra <QuickPick/>). */
export interface PickRequest {
  /** Identificador único del pedido (reinicia el estado del selector). */
  id: number
  items: PickItem<unknown>[]
  placeholder: string
  resolve: (value: unknown) => void
}

/**
 * Puente que la App le da al host para operaciones que dependen de la UI
 * (editor imperativo y avisos). Se setea una vez montada la App.
 */
export interface AppBridge {
  editor: {
    insertAtCursor(text: string): void
    getSelection(): string
    revealRange(from: number, to: number): void
  }
  notify(message: string): void
  /** Abre una nota (refrescando antes el árbol, por si se acaba de crear). */
  openNote(path: string): Promise<void>
}

/**
 * Núcleo del sistema de plugins (lado renderer). Mantiene los registros
 * (comandos, paneles, ítems de status, extensiones de editor), un event bus
 * tipado y el estado de la nota activa. Es también un "external store": los
 * componentes React se suscriben con subscribe()/getVersion() vía
 * useSyncExternalStore y se re-renderizan cuando cambian los registros.
 *
 * Separación intencional: los cambios de REGISTRO (registrar/togglear) bumpean
 * la versión y re-renderizan las listas; los EVENTOS de workspace (note:change,
 * etc.) NO bumpean — quien los necesita se suscribe con events.on. Así tipear no
 * re-renderiza la paleta.
 */
export class PluginHost {
  private commands = new Map<string, Command>()
  private panels = new Map<string, PanelDef>()
  private statusItems = new Map<string, StatusItemDef>()
  private extensions = new Map<string, Extension>()
  private openPanels = new Set<string>()
  private eventBus = new Map<string, Set<(payload: unknown) => void>>()
  private activeNoteState: { path: string; content: string } | null = null
  private bridge: AppBridge | null = null
  private pickRequest: PickRequest | null = null
  private pickSeq = 0

  // ── External store para React ──────────────────────────────────────────────
  private version = 0
  private listeners = new Set<() => void>()

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  getVersion = (): number => this.version
  private bump(): void {
    this.version++
    this.listeners.forEach((l) => l())
  }

  setBridge(bridge: AppBridge): void {
    this.bridge = bridge
  }

  // ── Comandos ────────────────────────────────────────────────────────────────
  registerCommand(cmd: Command): Disposable {
    this.commands.set(cmd.id, cmd)
    this.bump()
    return { dispose: () => { this.commands.delete(cmd.id); this.bump() } }
  }
  listCommands(): Command[] {
    return [...this.commands.values()]
  }
  runCommand(id: string): void {
    const cmd = this.commands.get(id)
    if (!cmd) return
    if (cmd.isEnabled && !cmd.isEnabled()) return
    void cmd.run()
  }

  // ── Paneles ──────────────────────────────────────────────────────────────────
  registerPanel(panel: PanelDef): Disposable {
    this.panels.set(panel.id, panel)
    this.bump()
    return {
      dispose: () => {
        this.panels.delete(panel.id)
        this.openPanels.delete(panel.id)
        this.bump()
      }
    }
  }
  listPanels(): PanelDef[] {
    return [...this.panels.values()]
  }
  togglePanel(id: string): void {
    if (!this.panels.has(id)) return
    if (this.openPanels.has(id)) this.openPanels.delete(id)
    else this.openPanels.add(id)
    this.bump()
  }
  isPanelOpen(id: string): boolean {
    return this.openPanels.has(id)
  }

  // ── Ítems de barra de estado ─────────────────────────────────────────────────
  addStatusItem(item: StatusItemDef): Disposable {
    this.statusItems.set(item.id, item)
    this.bump()
    return { dispose: () => { this.statusItems.delete(item.id); this.bump() } }
  }
  listStatusItems(): StatusItemDef[] {
    return [...this.statusItems.values()]
  }

  // ── Extensiones de editor ────────────────────────────────────────────────────
  addExtension(id: string, ext: Extension): Disposable {
    this.extensions.set(id, ext)
    this.bump()
    return { dispose: () => { this.extensions.delete(id); this.bump() } }
  }
  listExtensions(): Extension[] {
    return [...this.extensions.values()]
  }

  // ── Event bus ────────────────────────────────────────────────────────────────
  on<E extends GeodeEventName>(event: E, handler: (payload: GeodeEvents[E]) => void): Disposable {
    let set = this.eventBus.get(event)
    if (!set) {
      set = new Set()
      this.eventBus.set(event, set)
    }
    set.add(handler as (payload: unknown) => void)
    return { dispose: () => this.eventBus.get(event)?.delete(handler as (payload: unknown) => void) }
  }
  emit<E extends GeodeEventName>(event: E, payload: GeodeEvents[E]): void {
    // El host cachea la nota activa a partir de los eventos, para activeNote().
    if (event === 'note:open' || event === 'note:change') {
      this.activeNoteState = payload as GeodeEvents['note:open']
    } else if (event === 'vault:switch') {
      this.activeNoteState = null
    }
    this.eventBus.get(event)?.forEach((h) => h(payload))
  }
  activeNote(): { path: string; content: string } | null {
    return this.activeNoteState
  }

  // ── Puente a la UI (editor imperativo + avisos) ──────────────────────────────
  editorInsertAtCursor(text: string): void {
    this.bridge?.editor.insertAtCursor(text)
  }
  editorGetSelection(): string {
    return this.bridge?.editor.getSelection() ?? ''
  }
  editorRevealRange(from: number, to: number): void {
    this.bridge?.editor.revealRange(from, to)
  }
  notify(message: string): void {
    this.bridge?.notify(message)
  }
  openNote(path: string): Promise<void> {
    return this.bridge?.openNote(path) ?? Promise.resolve()
  }

  // ── Selector rápido ─────────────────────────────────────────────────────────
  /** Muestra un selector; si ya había uno abierto, se cancela (resuelve null). */
  pick<T>(items: PickItem<T>[], placeholder = 'Elegí una opción…'): Promise<T | null> {
    this.pickRequest?.resolve(null)
    return new Promise<T | null>((resolve) => {
      this.pickRequest = {
        id: ++this.pickSeq,
        items: items as PickItem<unknown>[],
        placeholder,
        resolve: (v) => {
          this.pickRequest = null
          this.bump()
          resolve(v as T | null)
        }
      }
      this.bump()
    })
  }
  currentPick(): PickRequest | null {
    return this.pickRequest
  }
}
