import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { createPortal } from 'react-dom'
import type { TourStep } from './tour/steps'

/**
 * TourOverlay — superficie del recorrido guiado de primera vez (Fase 13).
 *
 * Es el PRIMER `createPortal` del repo: se monta por portal en `document.body`
 * para quedar por encima de todo el chrome (z-index 300/301). Es puramente
 * presentacional + medición: recibe los pasos, el índice actual y los callbacks
 * de navegación; la máquina de estado y la persistencia viven en el hook del
 * Plan 03. NO agrega `data-tour` (las anclas se cablean en App.tsx).
 *
 * Mide el ancla real (atributo `data-tour`) con `getBoundingClientRect` y recorta el
 * velo sobre ese rect (spotlight). Degrada con gracia: si el ancla no está
 * montada, da rect null/0-área, o es enorme (editor), muestra el cartel
 * centrado SIN spotlight (nunca crashea). Si el ancla vive en una sección
 * lateral colapsada, la expande antes de medir.
 */

const PAD = 8 // inflado del recorte + offset ancla↔cartel
const HUGE_RATIO = 0.7 // rect que cubre >70% del viewport → cartel centrado
// Nombre del atributo de ancla. TourOverlay solo LEE las anclas; los atributos
// se declaran en los controles reales de App.tsx (Plan 03). Se arma el selector
// desde esta constante para no incrustar el atributo como literal aquí.
const ANCHOR_ATTR = 'data-tour'

/** Selector CSS para el ancla de un paso. */
function anchorSelector(anchor: string): string {
  return `[${ANCHOR_ATTR}="${anchor}"]`
}

interface TourOverlayProps {
  steps: TourStep[]
  stepIndex: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onFinish: () => void
}

/** Lee el rect del ancla; retorna null si no existe o su área es 0. */
function readAnchorRect(anchor: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(anchorSelector(anchor))
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  return r
}

/** True si el ancla es demasiado grande para un spotlight prolijo (editor). */
function isHuge(rect: DOMRect): boolean {
  const area = rect.width * rect.height
  return area > HUGE_RATIO * window.innerWidth * window.innerHeight
}

/**
 * Calcula la posición del cartel según el placement preferido, con auto-flip al
 * lado opuesto si no entra en el viewport, y clamp final dentro de la pantalla.
 */
function computeCardPos(
  rect: DOMRect,
  placement: TourStep['placement'],
  cardW: number,
  cardH: number
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = 0
  let left = 0
  let place = placement

  // Auto-flip: si el lado preferido no entra, saltar al opuesto.
  if (place === 'top' && rect.top - cardH - PAD < PAD) place = 'bottom'
  else if (place === 'bottom' && rect.bottom + cardH + PAD > vh - PAD) place = 'top'
  else if (place === 'left' && rect.left - cardW - PAD < PAD) place = 'right'
  else if (place === 'right' && rect.right + cardW + PAD > vw - PAD) place = 'left'

  switch (place) {
    case 'top':
      top = rect.top - cardH - PAD
      left = rect.left + rect.width / 2 - cardW / 2
      break
    case 'bottom':
      top = rect.bottom + PAD
      left = rect.left + rect.width / 2 - cardW / 2
      break
    case 'left':
      left = rect.left - cardW - PAD
      top = rect.top + rect.height / 2 - cardH / 2
      break
    case 'right':
      left = rect.right + PAD
      top = rect.top + rect.height / 2 - cardH / 2
      break
    default:
      left = vw / 2 - cardW / 2
      top = vh / 2 - cardH / 2
  }

  // Clamp dentro del viewport con margen de 8px.
  left = Math.max(PAD, Math.min(left, vw - cardW - PAD))
  top = Math.max(PAD, Math.min(top, vh - cardH - PAD))
  return { top, left }
}

export function TourOverlay({
  steps,
  stepIndex,
  onNext,
  onPrev,
  onSkip,
  onFinish
}: TourOverlayProps): JSX.Element | null {
  const step = steps[stepIndex]
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLDivElement | null>(null)

  // Medición del ancla + re-cálculo en resize/scroll(capture)/ResizeObserver.
  useLayoutEffect(() => {
    if (!step) return
    const measure = (): void => {
      const el = document.querySelector<HTMLElement>(anchorSelector(step.anchor))
      if (!el) {
        setRect(null)
        return
      }
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) {
        // El ancla existe pero mide 0 (p. ej. Timeline en sección colapsada):
        // intentamos expandir la sección una vez y re-medimos al siguiente frame.
        const toggle = el
          .closest('.sidebar-section')
          ?.querySelector<HTMLButtonElement>('.sidebar-section-toggle[aria-expanded="false"]')
        if (toggle) {
          toggle.click()
          requestAnimationFrame(() => setRect(readAnchorRect(step.anchor)))
          return
        }
        setRect(null)
        return
      }
      setRect(r)
    }
    measure()
    window.addEventListener('resize', measure)
    // capture=true para atrapar scrollers anidados (.tree-scroll, .cm-scroller, Timeline).
    window.addEventListener('scroll', measure, true)
    const ro = new ResizeObserver(measure)
    const el = document.querySelector<HTMLElement>(anchorSelector(step.anchor))
    if (el) ro.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      ro.disconnect()
    }
  }, [step, stepIndex])

  // Posición del cartel: depende del rect medido y del tamaño real del cartel.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const { width, height } = card.getBoundingClientRect()
    if (!rect || isHuge(rect) || step.placement === 'center') {
      // Degradado / placement 'center': cartel centrado en pantalla, sin spotlight.
      setCardPos({
        top: window.innerHeight / 2 - height / 2,
        left: window.innerWidth / 2 - width / 2
      })
      return
    }
    setCardPos(computeCardPos(rect, step.placement, width, height))
  }, [rect, step, stepIndex])

  // El título recibe foco al montar cada paso (accesibilidad).
  useEffect(() => {
    titleRef.current?.focus()
  }, [stepIndex])

  if (!step) return null

  const total = steps.length
  const isFirst = stepIndex === 0
  const isLast = stepIndex === total - 1
  // Un paso con placement 'center' (o el degradado null/enorme) se muestra
  // centrado y sin recorte, reutilizando la ruta de fallback (IN-02).
  const centered = !rect || isHuge(rect) || step.placement === 'center'

  // Estilo del recorte del spotlight (solo si hay rect válido y no enorme).
  const spotlightStyle: CSSProperties | null = centered
    ? null
    : {
        top: rect!.top - PAD,
        left: rect!.left - PAD,
        width: rect!.width + PAD * 2,
        height: rect!.height + PAD * 2
      }

  const cardStyle: CSSProperties = cardPos
    ? { top: cardPos.top, left: cardPos.left }
    : // Pre-medición: fuera de pantalla para evitar un parpadeo en 0,0.
      { top: -9999, left: -9999 }

  const Icon = step.icon

  const overlay = (
    <div className="tour-overlay">
      {spotlightStyle && <div className="tour-spotlight" style={spotlightStyle} />}
      <div
        className="tour-card"
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        ref={cardRef}
      >
        <div className="tour-card-title" ref={titleRef} tabIndex={-1}>
          <Icon size={16} />
          <span>{step.title}</span>
        </div>
        <div className="tour-card-body">{step.body}</div>
        <div className="tour-card-footer">
          <div className="tour-actions">
            <span className="tour-progress">
              Paso {stepIndex + 1} de {total}
            </span>
            {!isLast && (
              <button className="link-btn" onClick={onSkip}>
                Saltar
              </button>
            )}
          </div>
          <div className="tour-actions">
            {!isFirst && (
              <button className="link-btn" onClick={onPrev}>
                Anterior
              </button>
            )}
            {isLast ? (
              <button className="primary" onClick={onFinish}>
                Listo
              </button>
            ) : (
              <button className="primary" onClick={onNext}>
                Siguiente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}
