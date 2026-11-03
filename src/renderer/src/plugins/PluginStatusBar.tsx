import { useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import type { PluginHost } from './host'
import { iconByName } from './iconByName'

/**
 * Ítems de barra de estado aportados por plugins. Bifurca por origen: los built-ins
 * renderizan su propio Component in-host (sin cambios); los EXTERNOS se dibujan
 * host-side desde un modelo serializable `{text,tooltip,icon}` (el ícono se resuelve
 * por NOMBRE con `iconByName`, sin dangerouslySetInnerHTML — T-12-06).
 */
export function PluginStatusItems({ host }: { host: PluginHost }): JSX.Element | null {
  useSyncExternalStore(host.subscribe, host.getVersion)
  const builtins = host.listStatusItems()
  const externals = host.listExternalStatusItems()
  if (builtins.length === 0 && externals.length === 0) return null
  return (
    <>
      {builtins.map((item) => (
        <div key={item.id} className="status-item plugin-status-item">
          <item.Component />
        </div>
      ))}
      {externals.map((item) => (
        <div
          key={item.id}
          className="status-item plugin-status-item"
          title={item.tooltip}
        >
          {iconByName(item.icon)}
          {item.text}
        </div>
      ))}
    </>
  )
}
