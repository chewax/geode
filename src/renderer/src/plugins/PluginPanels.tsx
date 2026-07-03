import { useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import { X } from 'lucide-react'
import type { PluginHost } from './host'

/**
 * Dock lateral derecho con los paneles de plugins que estén abiertos. Cada panel
 * renderiza su propio componente (que puede usar useGeode() para leer el vault).
 */
export function PluginPanels({ host }: { host: PluginHost }): JSX.Element | null {
  useSyncExternalStore(host.subscribe, host.getVersion)
  const open = host.listPanels().filter((p) => host.isPanelOpen(p.id))
  if (open.length === 0) return null
  return (
    <aside className="plugin-dock">
      {open.map((panel) => (
        <section key={panel.id} className="plugin-panel">
          <header className="plugin-panel-head">
            <span className="plugin-panel-title">
              {panel.icon}
              {panel.title}
            </span>
            <button className="icon-btn" title="Cerrar panel" onClick={() => host.togglePanel(panel.id)}>
              <X size={14} />
            </button>
          </header>
          <div className="plugin-panel-body">
            <panel.Component />
          </div>
        </section>
      ))}
    </aside>
  )
}
