import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import { X } from 'lucide-react'
import type { PluginHost } from './host'
import type { BridgeMessage, ExternalPanelDef } from './types'
import { iconByName } from './iconByName'

/**
 * Panel de un plugin EXTERNO: su UI se renderiza DENTRO de su iframe (aislado). El
 * host solo dibuja el header (título + ícono Lucide por nombre + cerrar) y reserva
 * el rectángulo del cuerpo; el iframe del plugin se SUPERPONE sobre ese rectángulo.
 *
 * IMPORTANTE: NO se reparenta el `<iframe>` al panel-body — mover un iframe en el
 * DOM lo RECARGA y mataría el runtime del plugin (y su puente). El iframe vive de
 * forma persistente en `document.body` (aloja comandos/eventos/status aunque el
 * panel esté cerrado); acá se lo posiciona (`position: fixed`) sobre el rectángulo
 * del cuerpo y se le pasa el TAMAÑO de forma CONTINUA por un `ResizeObserver`.
 */
function ExternalPanel({
  host,
  def,
  iframe
}: {
  host: PluginHost
  def: ExternalPanelDef
  iframe: HTMLIFrameElement
}): JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    iframe.style.position = 'fixed'
    iframe.style.display = 'block'
    iframe.style.border = 'none'
    iframe.style.background = '#16161a'
    iframe.style.zIndex = '5'

    // Sincroniza posición + tamaño del iframe con el rectángulo del panel-body y
    // le postea el resize al contentWindow. Es CONTINUO: se dispara por el
    // ResizeObserver (cambios de dock) y por resize/scroll de la ventana.
    const sync = (): void => {
      const r = body.getBoundingClientRect()
      iframe.style.left = `${r.left}px`
      iframe.style.top = `${r.top}px`
      iframe.style.width = `${r.width}px`
      iframe.style.height = `${r.height}px`
      iframe.contentWindow?.postMessage(
        {
          type: 'panel',
          id: def.id,
          op: 'resize',
          width: Math.round(r.width),
          height: Math.round(r.height)
        } satisfies BridgeMessage,
        '*'
      )
    }

    const ro = new ResizeObserver(sync)
    ro.observe(body)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    sync()

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
      // Al cerrar/desmontar el panel se oculta el iframe (sigue vivo off-screen).
      iframe.style.display = 'none'
      iframe.style.position = ''
      iframe.style.left = ''
      iframe.style.top = ''
      iframe.style.width = ''
      iframe.style.height = ''
      iframe.style.zIndex = ''
    }
  }, [iframe, def.id])

  return (
    <section className="plugin-panel">
      <header className="plugin-panel-head">
        <span className="plugin-panel-title">
          {iconByName(def.icon, 14)}
          {def.title}
        </span>
        <button className="icon-btn" title="Cerrar panel" onClick={() => host.togglePanel(def.id)}>
          <X size={14} />
        </button>
      </header>
      {/* El cuerpo es un placeholder: reserva el rectángulo donde se superpone el
          iframe del plugin. Altura fija para darle un rectángulo real al observer. */}
      <div className="plugin-panel-body" ref={bodyRef} style={{ height: 240, padding: 0 }} />
    </section>
  )
}

/**
 * Dock lateral derecho con los paneles de plugins que estén abiertos. Bifurca por
 * origen: los built-ins renderizan su propio Component in-host (sin cambios); los
 * EXTERNOS renderizan la UI dentro de su iframe (ver ExternalPanel).
 */
export function PluginPanels({ host }: { host: PluginHost }): JSX.Element | null {
  useSyncExternalStore(host.subscribe, host.getVersion)
  const builtins = host.listPanels().filter((p) => host.isPanelOpen(p.id))
  const externals = host.listExternalPanels().filter((e) => host.isPanelOpen(e.def.id))
  if (builtins.length === 0 && externals.length === 0) return null
  return (
    <aside className="plugin-dock">
      {builtins.map((panel) => (
        <section key={panel.id} className="plugin-panel">
          <header className="plugin-panel-head">
            <span className="plugin-panel-title">
              {panel.icon}
              {panel.title}
            </span>
            <button
              className="icon-btn"
              title="Cerrar panel"
              onClick={() => host.togglePanel(panel.id)}
            >
              <X size={14} />
            </button>
          </header>
          <div className="plugin-panel-body">
            <panel.Component />
          </div>
        </section>
      ))}
      {externals.map((e) => (
        <ExternalPanel key={e.def.id} host={host} def={e.def} iframe={e.iframe} />
      ))}
    </aside>
  )
}
