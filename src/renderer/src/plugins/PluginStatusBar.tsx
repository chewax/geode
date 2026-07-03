import { useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import type { PluginHost } from './host'

/** Ítems de barra de estado aportados por plugins (se renderizan en la statusbar). */
export function PluginStatusItems({ host }: { host: PluginHost }): JSX.Element | null {
  useSyncExternalStore(host.subscribe, host.getVersion)
  const items = host.listStatusItems()
  if (items.length === 0) return null
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className="status-item plugin-status-item">
          <item.Component />
        </div>
      ))}
    </>
  )
}
