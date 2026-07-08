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
    // z-index BAJO y acotado: el overlay opaco sólo debe tapar SU rectángulo de
    // panel-body dentro del dock, nunca las capas transitorias del host (tooltips
    // y autocompletado de CodeMirror, paleta, modales, toasts) que usan z-index
    // >= 50. Si esto sube, el iframe capturaría clics destinados a esos popups.
    iframe.style.zIndex = '1'

    // Reconcilia posición + tamaño del iframe con el rectángulo del panel-body.
    // Sólo escribe estilos cuando el rectángulo CAMBIÓ y sólo postea el `resize`
    // al contentWindow cuando cambió el TAMAÑO (evita spamear cada frame).
    const last = { left: -1, top: -1, width: -1, height: -1 }
    const sync = (): void => {
      const r = body.getBoundingClientRect()
      const left = Math.round(r.left)
      const top = Math.round(r.top)
      const width = Math.round(r.width)
      const height = Math.round(r.height)
      if (left === last.left && top === last.top && width === last.width && height === last.height) {
        return
      }
      const sizeChanged = width !== last.width || height !== last.height
      last.left = left
      last.top = top
      last.width = width
      last.height = height
      iframe.style.left = `${left}px`
      iframe.style.top = `${top}px`
      iframe.style.width = `${width}px`
      iframe.style.height = `${height}px`
      if (sizeChanged) {
        iframe.contentWindow?.postMessage(
          { type: 'panel', id: def.id, op: 'resize', width, height } satisfies BridgeMessage,
          '*'
        )
      }
    }

    // Lazo de reconciliación por requestAnimationFrame mientras el panel está
    // abierto. A diferencia de un ResizeObserver (que NO dispara cuando el
    // panel-body se MUEVE sin cambiar de tamaño: apilar/cerrar otro panel del
    // dock, reflow, scroll), el rAF cubre TODOS esos casos de deriva. `sync` es
    // barato, así que sondear cada frame es aceptable y evita el drift del overlay.
    let raf = 0
    const loop = (): void => {
      sync()
      raf = window.requestAnimationFrame(loop)
    }
    sync()
    raf = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(raf)
      // Al cerrar/desmontar el panel se OCULTA el iframe (display:none, no sólo se
      // mueve) para que no intercepte clics en otras zonas; sigue vivo off-screen.
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
