# Phase 13: Tour interactivo de primera vez - Research

**Researched:** 2026-07-09
**Domain:** In-app first-run guided tour (React portal overlay + spotlight over real DOM anchors) inside an existing Electron + React 19 + TypeScript renderer. Pure codebase-integration feature — no new dependencies, no new backend surface beyond one IPC get/set pair.
**Confidence:** HIGH (all findings verified against the live codebase with exact file/line citations; no external library choices required)

## Summary

This phase is almost entirely **codebase integration**, not ecosystem research. The CONTEXT.md and UI-SPEC.md are LOCKED and fully specify the visual/interaction contract; my job was to resolve the 7 technical unknowns against the real source so the planner can write tasks that compile on the first try. Every unknown resolved cleanly — there are no blockers and no new packages. The tour is a renderer-only `TourOverlay` (React portal to `document.body`, `getBoundingClientRect` + box-shadow clip), four `data-tour` anchors (one already exists), a trigger wired into the existing `createLocalVault` path, and a new `settings.tour` persistence block that mirrors the existing `settings.backup.onboarding` IPC pattern verbatim.

The single most important integration risk is **sequencing with the Phase 12 BackupCard**: both are gated on the same post-first-vault moment. The BackupCard render is gated by `backupOnboarding === 'invitado' && !backupWizardOpen && vault` (App.tsx:1336). The clean fix is a `tourActive` state that adds `&& !tourActive` to that condition, so the card only appears after the tour ends — satisfying the LOCKED "tour first, never stacked" decision without touching Phase 12 logic. The second risk is the **Timeline anchor being inside a collapsible section** (`SidebarSection`, App.tsx:1392) whose collapse state is internal and `localStorage`-backed — so the tour cannot just flip a prop; it must either anchor to the always-rendered section header or programmatically click the section's toggle button before spotlighting.

**Primary recommendation:** Build `TourOverlay` as a self-contained renderer component using `createPortal` (from `react-dom`, already a dependency — React 19.2.7), a steps array `[{ anchor, title, body, icon, placement }]`, and a `useTour()` hook in App that owns `tourActive` + step index. Persist a tri-state `settings.tour.state: 'unseen' | 'started' | 'seen'` via two new `geode:tour-*` IPC channels copied structurally from `backupOnboardingGet/Set` (main/index.ts:945-961). Trigger after `createLocalVault` (App.tsx:496) when state is `unseen`; re-launch (unchanged persistence) from a `core.tour` palette command and the enabled ActivityBar `HelpCircle` button.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spotlight overlay + coach-mark card | Renderer (React) | — | Pure DOM measurement (`getBoundingClientRect`) + portal; no main-process involvement. Everything the tour highlights already lives in the renderer. |
| `data-tour` anchors on real controls | Renderer (React) | — | Attributes added to existing JSX (editor host, Save button, BackupButton, Timeline). |
| Trigger after first vault | Renderer (React) | — | `createLocalVault` (App.tsx:496) is a renderer callback; tour launch is a `setState`. |
| `tourSeen` persistence | Main (SettingsService) | Preload bridge + IPC contract | Settings live in `userData/settings.json` (main-only fs); renderer reaches it through the typed `geode:*` bridge, mirroring backup onboarding. |
| Re-launch (palette + Ayuda button) | Renderer (React) | — | `host.registerCommand` (renderer plugin host) + `ActivityBar` callback prop. |
| Graceful degradation (null rect) | Renderer (React) | — | Measurement + fallback logic is entirely client-side. |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pasos y anclas (TOUR-01)**
- **4 pasos** (cap ≤5): escribir → guardar → respaldar → ver historial.
- Anclas `data-tour` a agregar: **editor host = "escribir"**, **botón "Guardar versión" (App.tsx:1305, `<Save>`) = "guardar"**, **Timeline (App.tsx:1394) = "historial"**. El ancla **"respaldo" ya existe** (BackupButton, Fase 12) — reutilizarla.
- Contenido de cada cartel: microcopy corto, 2ª persona, español sin jerga (redacción exacta en 13-UI-SPEC.md, LOCKED).
- El paso "respaldar" **solo señala el botón** de respaldo — NO dispara el wizard/tarjeta de la Fase 12.

**Disparo, persistencia y re-lanzamiento (TOUR-02)**
- Se dispara **tras crear el primer cuaderno** (`createLocalVault`), **no al arrancar** la app, **una sola vez**.
- **Secuencia con la tarjeta de respaldo (Fase 12): el tour corre PRIMERO**; la tarjeta queda como invitación persistente. No se muestran encima uno del otro.
- Persistir **"tour visto"** en un campo nuevo del bloque de onboarding de settings + IPC get/set. Nunca se auto-repite.
- **Re-lanzable manualmente**: comando en la paleta ("Ver el recorrido guiado") + ítem de Ayuda (mínimo: comando en la paleta).

**UX del overlay (TOUR-01/02)**
- **`TourOverlay` propio y liviano**: spotlight que recorta el ancla + cartel posicionado. **Sin dependencia nueva.**
- Controles: **"Paso N de M"**, **"Saltar"** (cierra y marca visto), **"Siguiente"/"Anterior"**, **"Listo"** en el último paso. **Esc cierra**.
- Posicionamiento: cartel cerca del ancla con auto-flip; spotlight vía `getBoundingClientRect`, recálculo en resize/scroll.
- Overlay **semi-transparente, no totalmente bloqueante**: Esc/Saltar siempre; clic fuera no rompe.

**Degradación y seguridad (TOUR-03)**
- Ancla no montada / rect null o 0 → **saltar el paso o cartel centrado sin spotlight** (nunca romper).
- Los `data-tour` viven **solo en Capa 0**; **jamás** en rama/merge/grafo/Modo Avanzado.
- Cierre a mitad → se marca "visto" solo si termina o salta; un cierre a mitad **puede reaparecer una vez**.
- Timeline colapsado → el paso "historial" **la expande** (o ancla a su cabecera) antes del spotlight.

### Claude's Discretion
- Redacción exacta de los 4 microcopys y del label de re-lanzamiento. *(Nota: la UI-SPEC ya fijó la redacción LOCKED — ver Copywriting Contract. Tratar como fijado.)*
- Estructura interna del `TourOverlay` y del modelo de pasos (array de `{anchor, título, cuerpo, placement}`).
- CSS del spotlight/cartel reutilizando tokens/clases existentes.
- Superficie exacta del re-lanzamiento (mínimo: comando en la paleta).
- Cómo exactamente se coordina el gating tour-vs-tarjeta (mientras se cumpla "tour primero, no encimados").

### Deferred Ideas (OUT OF SCOPE)
- Coach marks just-in-time de features profundos (tags, diff, volver-atrás) → v2 (ONBX-01).
- Tour de Modo Avanzado (ramas/grafo) como recorrido opt-in separado → v2 (ONBX-04).
- Checklist de onboarding multi-sesión → v2 (ONBX-02).
- Contenido sembrado personalizado por caso de uso → v2 (ONBX-03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOUR-01 | `TourOverlay` propio (spotlight + cartel anclado vía `data-tour`) recorre ≤5 pasos (escribir → guardar → respaldar → historial) disparado tras crear el primer cuaderno, no al arrancar. | Anchors resolved (Unknown 1): `data-tour="respaldo"` already on BackupButton.tsx:90; add `escribir` to `.pane-root` (App.tsx:1431), `guardar` to Save button (App.tsx:1301-1308), `historial` to Timeline/its section (App.tsx:1392-1406). Overlay technique resolved (Unknown 2): portal to `document.body`, `getBoundingClientRect` + 8px inflate + `box-shadow 0 0 0 9999px` clip, z-index 300/301 clears the 210 ceiling. Trigger resolved (Unknown 3): fire in `createLocalVault` (App.tsx:496-524) post-`adoptVault`. |
| TOUR-02 | Muestra progreso ("Paso N de M"), "Saltar", re-lanzable desde Ayuda, persiste "tour visto", nunca se auto-repite. | Persistence resolved (Unknown 4): new `settings.tour` block + `geode:tour-get`/`geode:tour-set` mirroring backup onboarding (settings.ts:263-279, ipc.ts:324-343, main/index.ts:945-961, preload:73-78). Re-launch resolved (Unknown 5): `host.registerCommand({ id:'core.tour', … })` (pattern App.tsx:1093) + enable `HelpCircle` button (ActivityBar.tsx:24) via a new `onShowTour` prop. Progress/controls copy LOCKED in UI-SPEC Copywriting Contract. |
| TOUR-03 | Degrada con gracia cuando el ancla no está montada (evita `getBoundingClientRect` null) y nunca ancla Modo Avanzado. | Degradation resolved (Unknown 6): measure inside `try`, null/0-area rect → centered card, no spotlight. Lifecycle audited: `respaldo` always mounted (BackupButton, non-conditional); `escribir`/`guardar`/`historial` mounted whenever a vault is open; `historial` may be `display:none` when its `SidebarSection` is collapsed → expand-first logic needed. Advanced-Mode surfaces (`advanced && …`, App.tsx:1281/1291/1309) are conditionally rendered and must never receive `data-tour`. |
</phase_requirements>

## Standard Stack

**No new packages.** Everything the tour needs is already a project dependency. This is a deliberate LOCKED decision ("sin dependencia nueva") and rules out react-joyride / shepherd.js / driver.js / intro.js.

### Core (all already installed — verified in package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.2.7 | Component + hooks (`useState`, `useEffect`, `useCallback`, `useRef`, `useLayoutEffect`) | Already the renderer framework. |
| react-dom | ^19.2.7 | `createPortal(node, document.body)` for the overlay | Ships with React; the LOCKED "portal to document.body" (UI-SPEC §1) uses this. No existing `createPortal` usage in the repo yet — this phase introduces the first, which is fine. |
| lucide-react | ^1.23.0 | Step icons | `PencilLine`, `Save`, `Cloud`, `History`, `HelpCircle` all **verified present** in 1.23.0 via `node -e "require('lucide-react')"`. The UI-SPEC's fallback (`Pencil`/`Clock`) is unnecessary — `PencilLine` and `History` exist. |

### Alternatives Considered — REJECTED (LOCKED)
| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| Custom `TourOverlay` | react-joyride / shepherd.js / driver.js / intro.js | Violates the LOCKED "sin dependencia nueva" decision and CLAUDE.md's "no new deps in Capa 0" posture. These libraries also inject their own DOM/CSS and would fight the manual design system. |
| Portal to `document.body` | Inline render in App tree (like existing modals) | UI-SPEC §1 LOCKS portal-to-body. Existing modals render inline with `position:fixed`; the tour differs because it must sit above everything and measure global coordinates. Either works technically, but portal is specced. |

**Installation:** none.

## Package Legitimacy Audit

Not applicable — this phase installs **zero external packages**. All capabilities are covered by existing dependencies (`react`, `react-dom`, `lucide-react`), which were vetted in prior phases. No registry lookups, no slopcheck run required.

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
  User creates 1st        │                 App.tsx (renderer)          │
  cuaderno ──────────────►│  createLocalVault() [App.tsx:496]           │
                          │     ├─ adoptVault(info)                     │
                          │     ├─ openNote('Bienvenida.md')            │
                          │     ├─ if backupOnboarding===null → set     │
                          │     │     'invitado'  (Phase 12)            │
                          │     └─ if tourState==='unseen' → launchTour()◄── NEW trigger
                          │                    │                        │
                          │      ┌─────────────▼───────────────┐        │
   Re-launch:             │      │  useTour() hook             │        │
   • core.tour palette ──►│      │  { active, stepIndex,       │        │
   • HelpCircle button ──►│      │    launch(), next(), prev(),│        │
     [ActivityBar]        │      │    skip(), finish() }       │        │
                          │      └─────────────┬───────────────┘        │
                          │                    │ active && steps[i]     │
                          │      ┌─────────────▼───────────────┐        │
                          │      │  <TourOverlay/> (portal)    │        │
                          │      │   createPortal(_, body)     │        │
                          │      │   1. query [data-tour=…]    │        │
                          │      │   2. getBoundingClientRect  │──rect?─┼─► null/0 → centered card
                          │      │   3. spotlight clip + card  │        │      (no spotlight)
                          │      │   4. resize/scroll recompute│        │
                          │      └─────────────────────────────┘        │
                          │                    │ finish()/skip()/Esc    │
                          │                    ▼                        │
                          │   window.geode.tour.set('seen') ────────────┼──┐
                          │   tourActive=false → BackupCard may show    │  │
                          └─────────────────────────────────────────────┘  │
                                                                            │  IPC geode:tour-set
                    ┌───────────────────────────────────────────────────┐  │
                    │ preload (window.geode.tour.get/set) [CommonJS]     │◄─┘
                    └───────────────────────┬───────────────────────────┘
                                            │ ipcRenderer.invoke
                    ┌───────────────────────▼───────────────────────────┐
                    │ main/index.ts  ipcMain.handle(IPC.tourGet/tourSet) │
                    │   → getTourState() / setTourState()  [settings.ts] │
                    │   → userData/settings.json { tour: { state } }     │
                    └────────────────────────────────────────────────────┘
```

### Recommended file structure (renderer-only additions)
```
src/renderer/src/
├── TourOverlay.tsx        # NEW — portal, spotlight clip, coach-mark card, keyboard (Esc)
├── tour/
│   └── steps.ts           # NEW — the 4-step array (anchor, title, body, icon, placement) + copy from UI-SPEC
│   └── useTour.ts         # NEW (optional) — hook owning active/stepIndex + measurement; or inline in App
├── App.tsx                # EDIT — trigger, tourActive gate on BackupCard, palette cmd, ActivityBar prop, data-tour attrs
├── ActivityBar.tsx        # EDIT — enable HelpCircle, add onShowTour prop
├── index.css              # EDIT — .tour-overlay/.tour-spotlight/.tour-card/.tour-card-* (reuse existing tokens)
src/main/services/settings.ts   # EDIT — getTourState/setTourState + settings.tour block
src/main/index.ts               # EDIT — IPC.tourGet/tourSet handlers
src/shared/ipc.ts               # EDIT — channel consts + TourApi + TourState type
src/preload/index.ts            # EDIT — window.geode.tour bridge
```

### Pattern 1: Spotlight clip via oversized box-shadow (LOCKED technique)
**What:** A single absolutely-positioned element over the anchor's rect, with a huge spread box-shadow that darkens everything *outside* it, plus an accent ring.
**When to use:** every step whose anchor produced a valid, reasonably-sized rect.
```tsx
// Source: technique specified in 13-UI-SPEC.md §1 (verified against index.css tokens)
// rect = anchor.getBoundingClientRect(); inflate 8px per side
const PAD = 8
const style: CSSProperties = {
  position: 'fixed',
  top: rect.top - PAD,
  left: rect.left - PAD,
  width: rect.width + PAD * 2,
  height: rect.height + PAD * 2,
  borderRadius: 8,
  boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)', // MISMO valor que .modal-overlay (index.css:1422)
  border: '2px solid var(--accent)',
  pointerEvents: 'none',
  zIndex: 300,
  transition: 'all 0.12s ease'
}
```

### Pattern 2: Portal + measurement lifecycle
**What:** Render the overlay through a portal, measure in `useLayoutEffect` before paint, and recompute on the events that move anchors.
**When to use:** the whole overlay.
```tsx
// Source: React 19 createPortal + standard rect-measurement pattern (no repo precedent — first portal use)
import { createPortal } from 'react-dom'

// recompute triggers: window resize + ANY scroll (capture=true catches nested scrollers:
//   .tree-scroll sidebar, the CodeMirror .cm-scroller, the Timeline body) + ResizeObserver on anchor.
useLayoutEffect(() => {
  const measure = (): void => setRect(readAnchorRect(steps[i].anchor))
  measure()
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true) // true = capture nested scroll
  const ro = new ResizeObserver(measure)
  const el = document.querySelector(`[data-tour="${steps[i].anchor}"]`)
  if (el) ro.observe(el)
  return () => {
    window.removeEventListener('resize', measure)
    window.removeEventListener('scroll', measure, true)
    ro.disconnect()
  }
}, [i])
```

### Pattern 3: Safe rect read (degradation core — TOUR-03)
```tsx
// Source: 13-UI-SPEC.md §"Estados sin datos" + STATE.md PITFALLS #1 (rect-null crash history)
function readAnchorRect(anchor: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  // display:none (collapsed section) or unmounted → 0-area → treat as "no spotlight"
  if (r.width === 0 || r.height === 0) return null
  return r
}
// rect === null  → placement = 'center', no clip, no ring, same title/body.
// rect very large (editor host) → optionally also fall back to centered per UI-SPEC §1 last bullet.
```

### Pattern 4: Persistence IPC — copy the backup-onboarding shape exactly
The existing backup onboarding is the template. Mirror it 1:1 for the tour:
- **ipc.ts** channels (near ipc.ts:80-83): add `tourGet: 'geode:tour-get'`, `tourSet: 'geode:tour-set'`; add `TourState` type + `TourApi { get(): Promise<TourSnapshot>; set(state): Promise<TourSnapshot> }`; add `tour: TourApi` to the root API (ipc.ts:496 area).
- **settings.ts** (after the backup block, settings.ts:263-279): add `settings.tour?: { state?: TourState }` + `getTourState()` / `setTourState(state)` with the same defensive validation.
- **main/index.ts** (after main/index.ts:945-961): `ipcMain.handle(IPC.tourGet, …)` and `ipcMain.handle(IPC.tourSet, …)` with the same enum-coercion guard (main/index.ts:956-957 pattern — never persist raw renderer input).
- **preload/index.ts** (after preload:73-78): `tour: { get: () => ipcRenderer.invoke(IPC.tourGet), set: (state) => ipcRenderer.invoke(IPC.tourSet, state) }`.

### Anti-Patterns to Avoid
- **Putting `data-tour` on a conditionally-rendered element.** The Advanced-Mode buttons (App.tsx:1281 `advanced && hasHead`, 1291 `advanced && canMerge`, 1309 `advanced && …`) mount/unmount with the `advanced` flag. Never anchor there (violates TOUR-03 and the "Capa 0 only" invariant). The four Capa-0 anchors are all unconditionally rendered when a vault is open.
- **Trapping focus like a modal.** UI-SPEC §1: the veil captures clicks (so app controls don't fire accidentally) but a click on the veil must NOT advance or close the tour. No hard focus trap — Esc and "Saltar" are the only exits.
- **Flipping `SidebarSection` collapse via a prop.** `SidebarSection` owns its collapse in internal `useState` seeded once from `localStorage` (SidebarSection.tsx:37). Writing the `localStorage` key does NOT re-render it. See Pitfall 2 for the correct approaches.
- **Marking `tourState='seen'` on re-launch.** Re-launching from the palette/Ayuda must not touch persistence — already-seen stays seen; the overlay just replays.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Portal into `document.body` | Manual `appendChild` + cleanup | `react-dom` `createPortal` | React manages mount/unmount + event bubbling correctly. |
| Reacting to anchor size changes | `setInterval` polling of rects | `ResizeObserver` + `scroll`(capture)/`resize` listeners | Precise, cheap, no polling jank. |
| Overlay veil color / card surface | New color values | Existing tokens: `rgba(0,0,0,0.55)` (index.css:1422), `--panel-2`, `--border`, `0 8px 24px rgba(0,0,0,0.45)` | LOCKED: reuse-only; introducing values fails the UI-checker. |
| Persistence get/set + IPC | A fresh ad-hoc channel design | The backup-onboarding template (settings.ts:263-279 / ipc.ts:324-343 / main/index.ts:945-961 / preload:73-78) | Proven, typed, defensive-coerced pattern already in the tree; consistency + free correctness. |
| Step icons | Inline SVG | `lucide-react` (`PencilLine`,`Save`,`Cloud`,`History`) | Already the icon system; emojis are banned (CLAUDE.md). |

**Key insight:** This phase's risk is not "which library" — it's **DOM lifecycle correctness** (measuring anchors that may be collapsed/large/unmounted) and **sequencing** (tour-before-card). Both are solved with existing primitives; adding a tour library would import more risk than it removes.

## Common Pitfalls

### Pitfall 1: `getBoundingClientRect` on a null / display:none anchor (the historical crash)
**What goes wrong:** Querying `[data-tour="…"]` returns `null` (not mounted) or a 0×0 rect (`display:none`), and code that assumes a valid rect throws or spotlights empty space.
**Why it happens:** `historial` lives inside a collapsible `SidebarSection` that hides its body with `display:none` (SidebarSection.tsx:73) rather than unmounting. `graph` may briefly be `null` so the Timeline renders a "Cargando…" placeholder instead (App.tsx:1393/1401). The editor `.pane-root` only exists when `vault` is truthy (App.tsx:1160 returns the welcome screen otherwise).
**How to avoid:** Always route measurement through `readAnchorRect` (Pattern 3): `null`/0-area ⇒ centered card, no spotlight, same copy. Never call `getBoundingClientRect` outside that guarded helper.
**Warning signs:** a dark screen with a ring in the top-left corner (rect defaulted to 0,0), or a thrown "Cannot read properties of null".

### Pitfall 2: Timeline anchor hidden because its section is collapsed
**What goes wrong:** User previously collapsed the "LÍNEA DE TIEMPO" section; step 4 finds a 0-area rect and silently degrades to a centered card, so the tour never actually points at the history.
**Why it happens:** `SidebarSection` collapse is internal `useState` seeded from `localStorage['geode.section.timeline.collapsed']` (SidebarSection.tsx:35-37); the body is `display:none` when collapsed. External code can't flip it via a prop.
**How to avoid — choose one (planner's discretion, both are clean):**
- **(A) Anchor to the always-visible section header.** Put `data-tour="historial"` on the `SidebarSection` root/header for the timeline (App.tsx:1392), which is rendered even when collapsed. Simplest; the spotlight lands on the "LÍNEA DE TIEMPO" header — acceptable per UI-SPEC ("o se ancla a su cabecera").
- **(B) Programmatically expand before spotlighting.** On entering step 4, if `readAnchorRect('historial')` is null, find the section's toggle `<button class="sidebar-section-toggle">` (it carries `aria-expanded="false"`) and `.click()` it, then re-measure on the next frame. Honors "se expande la sección". Requires the toggle to be locatable — scope the query to the timeline section.
- **(C) Lift collapse state** (bigger change): give `SidebarSection` an optional controlled `collapsed`/`onToggle` or an imperative `expand()` via `forwardRef`. Cleanest long-term but touches a shared component — only if the planner wants it.
**Recommendation:** (A) for minimal surface, or (B) if the spec's "expand the section" behavior is desired. Avoid (C) unless there's appetite.

### Pitfall 3: Tour and BackupCard rendering on top of each other
**What goes wrong:** Both are gated on the first-vault moment; without coordination the BackupCard (App.tsx:1336) appears under/over the tour overlay.
**Why it happens:** `createLocalVault` sets `backupOnboarding='invitado'` (App.tsx:507-510), and the BackupCard renders whenever `backupOnboarding === 'invitado' && !backupWizardOpen && vault` (App.tsx:1336). The tour launches at the same instant.
**How to avoid:** Introduce a `tourActive` boolean state. (1) In `createLocalVault`, after the existing logic, `if (tourState === 'unseen') launchTour()` which sets `tourActive=true`. (2) Extend the BackupCard condition to `backupOnboarding === 'invitado' && !backupWizardOpen && vault && !tourActive`. When the tour finishes/skips, `tourActive=false` and the card appears — "tour first, card as persistent re-entry". The BackupCard's own state machine (Phase 12) is untouched.
**Warning signs:** the invitation card flashing behind the veil during the tour.

### Pitfall 4: Re-appear-once semantics modeled as a single boolean
**What goes wrong:** A single `tourSeen: boolean` can't distinguish "never started" from "started but the app was closed mid-tour", so you either never recover an interrupted tour or you loop forever.
**Why it happens:** The LOCKED rule is: mark seen only on finish/skip; a mid-tour close **may reappear once**.
**How to avoid:** Model a tri-state `TourState = 'unseen' | 'started' | 'seen'` (mirrors `BackupOnboardingState`'s tri-state, ipc.ts:327):
- `unseen` → after `createLocalVault`, launch and persist `'started'`.
- finish/skip/Esc → persist `'seen'` (terminal; never auto-shows again).
- On app startup (after vault restore, App.tsx:957-969), if state is `'started'` (interrupted), re-launch the tour **once** and immediately persist `'seen'` at that recovery launch, so a second interruption can't loop. This is exactly "puede reaparecer una vez".
**Warning signs:** tour never returning after a crash, or tour re-showing on every launch.

### Pitfall 5: Large-anchor spotlight (editor host)
**What goes wrong:** `escribir` anchored to `.pane-root` (the whole editor) produces a huge rect; the 2px ring around nearly the entire screen looks broken.
**How to avoid:** UI-SPEC §1 last bullet permits degrading a very large anchor to a centered card with no clip. Add a size threshold (e.g., if rect covers > ~70% of viewport area) → centered placement. Keep the copy identical.

## Runtime State Inventory

Not a rename/refactor/migration phase — this is a greenfield feature addition. Section omitted per the rule (nothing to inventory: no stored strings renamed, no OS-registered state, no build-artifact churn beyond the new files).

## Code Examples

### Steps array (structure — copy the LOCKED copy from UI-SPEC)
```ts
// Source: 13-UI-SPEC.md Copywriting Contract (LOCKED) + verified anchors/icons
import { PencilLine, Save, Cloud, History } from 'lucide-react'
export interface TourStep {
  anchor: 'escribir' | 'guardar' | 'respaldo' | 'historial'
  icon: LucideIcon
  title: string
  body: string
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
}
export const TOUR_STEPS: TourStep[] = [
  { anchor: 'escribir', icon: PencilLine, title: 'Escribí sin miedo',
    body: 'Este es tu cuaderno. Escribí lo que quieras acá: se guarda solo y nunca vas a perder nada.',
    placement: 'bottom' },
  { anchor: 'guardar', icon: Save, title: 'Marcá una versión',
    body: 'Cuando algo te importe, guardá una versión desde acá. Vas a poder volver a este momento más adelante.',
    placement: 'top' },
  { anchor: 'respaldo', icon: Cloud, title: 'Respaldá en la nube',
    body: 'Desde este botón guardás una copia de seguridad en la nube, por si algo le pasa a este dispositivo.',
    placement: 'top' },
  { anchor: 'historial', icon: History, title: 'Volvé cuando quieras',
    body: 'Acá está el historial de tu cuaderno. Podés mirar los cambios y volver a cualquier versión anterior.',
    placement: 'left' }
]
```

### Palette command + ActivityBar wiring (re-launch)
```tsx
// Palette: add to the always-registered cmds array (App.tsx:1092-1099 pattern)
host.registerCommand({ id: 'core.tour', title: 'Ver el recorrido guiado', category: 'Ayuda', run: () => launchTour() })

// ActivityBar.tsx — add prop + enable the HelpCircle button (currently disabled at ActivityBar.tsx:24)
export interface ActivityBarProps { onOpenSettings: () => void; onShowTour: () => void }
// …
<button className="activity-btn" title="Ver el recorrido guiado"
        aria-label="Ver el recorrido guiado" onClick={onShowTour}>
  <HelpCircle size={20} />
</button>

// App.tsx render site (App.tsx:1347): <ActivityBar onOpenSettings={…} onShowTour={launchTour} />
```

### Esc-to-close (global while overlay mounted)
```tsx
// Source: mirrors the existing global keydown pattern in App.tsx:1125-1137 (Ctrl+P palette)
useEffect(() => {
  if (!active) return
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') skip() /* skip() persists 'seen' */ }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [active, skip])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tour libraries (intro.js/joyride) that inject DOM+CSS | Lightweight app-owned overlay reusing the design system | Deliberate for this app | No new dep, full visual control, no CSS conflicts. |
| Single `seen` boolean | Tri-state `unseen/started/seen` | This phase | Enables "reappear once after interruption" without loops. |

**Deprecated/outdated:** none relevant. Note `settings.github.remote` and `settings.github.pushed` are `@deprecated` (settings.ts:32/41) but are unrelated to this phase — do not touch.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `.pane-root` (App.tsx:1431) is the best "escribir" anchor (always mounted when vault open, represents the editor). Alternative: the active pane's editor host. | Anchors / Pitfall 5 | LOW — if too large, the centered-card fallback (Pitfall 5) already covers it; planner may instead anchor to a per-pane element. |
| A2 | New top-level `settings.tour` block is cleaner than `settings.backup.tourSeen`. CONTEXT hinted "onboarding.tourSeen"; there is no top-level `onboarding` block today (backup onboarding is at `settings.backup.onboarding`). | Persistence | LOW — purely a naming/placement choice; both work. Planner may instead nest under a shared `settings.onboarding`. Confirm with user if they prefer the literal `onboarding.tourSeen`. |
| A3 | Startup recovery of an interrupted (`'started'`) tour should re-launch once and immediately mark `'seen'`. | Pitfall 4 | LOW — matches "puede reaparecer una vez"; exact recovery timing is a design detail the planner can refine. |
| A4 | Timeline anchor approach (A) header vs (B) programmatic-expand is planner's discretion; UI-SPEC permits both. | Pitfall 2 | LOW — both satisfy the spec. |

**All package/version claims are VERIFIED against package.json and a live `require('lucide-react')` check.** The assumptions above are design-placement choices, not factual uncertainties.

## Open Questions

1. **Which "escribir" anchor element?**
   - What we know: `.pane-root` (App.tsx:1431) always wraps the editor and is mounted whenever a vault is open; simplest and safe.
   - What's unclear: whether the planner prefers a tighter anchor (the active CodeMirror `.cm-editor` inside the focused pane) for a smaller spotlight.
   - Recommendation: use `.pane-root` with the large-anchor centered-card fallback (Pitfall 5). Revisit only if UAT finds the spotlight too big.

2. **`historial` anchor: header vs. auto-expand.**
   - What we know: the section can be collapsed (`display:none`); both header-anchor (A) and programmatic-expand (B) satisfy the spec.
   - What's unclear: product preference for pointing at the header vs. the actual timeline rows.
   - Recommendation: default to (B) programmatic-expand for a more meaningful spotlight; fall back to (A) if expanding proves fiddly.

## Environment Availability

Skipped — no external tools, services, or runtimes beyond the already-established Electron/React/TypeScript toolchain. This is a renderer + settings change; `npm run dev` (per project memory, run with `env -u ELECTRON_RUN_AS_NODE npm run dev` in the Bash tool) is the only thing needed to exercise it.

## Validation Architecture

> `workflow.nyquist_validation` is `true`, but the repo has **zero automated tests** (confirmed in STATE.md Blockers: "Cero cobertura de tests automatizados"; no test config/dirs exist). Validation for this milestone is typecheck + build + human UAT, consistent with v1.0–v1.2.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none installed (no jest/vitest/playwright config, no `test/` dir) |
| Config file | none |
| Quick run command | `npx tsc -p tsconfig.web.json --noEmit` (renderer typecheck) |
| Full suite command | `npm run build` (electron-vite build = main+preload+renderer typecheck+bundle) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOUR-01 | 4-step overlay anchors + fires after first vault | manual UAT + typecheck | `npm run build` (compiles new components/IPC) | ❌ manual — no test harness |
| TOUR-02 | progress/skip/persist/never-repeat/re-launch | manual UAT + typecheck | `npm run build` | ❌ manual |
| TOUR-03 | graceful degradation (null rect), no Advanced anchors | manual UAT + typecheck | `npm run build` | ❌ manual |

### Sampling Rate
- **Per task commit:** `npx tsc -p tsconfig.web.json --noEmit` (fast renderer typecheck) for renderer-only tasks; add `tsconfig.node.json` typecheck for main/preload/settings tasks.
- **Per plan/phase gate:** `npm run build` green.
- **Phase gate:** `npm run build` green + human UAT script (create first vault → tour fires → 4 steps → skip → BackupCard appears → relaunch from palette + HelpCircle → collapsed-timeline step still works → close mid-tour → reopens once).

### Wave 0 Gaps
- None practical to add — introducing a test framework is out of scope for this milestone (explicit project decision). Validation stays typecheck + build + manual UAT.
- Recommended **manual UAT checklist** to author in the plan (not a code gap): first-run trigger, sequencing vs BackupCard, Esc/Saltar exits, collapsed-Timeline expansion, null-anchor centered fallback, re-launch does not reset `seen`, interrupted-tour reappears exactly once.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`. This is a renderer UI overlay plus one settings get/set IPC pair. No auth, sessions, access control, or crypto are introduced.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | The `geode:tour-set` handler must coerce its argument to the allowed enum (`'unseen'|'started'|'seen'`) and never persist raw renderer input — copy the guard at main/index.ts:956-957. |
| V6 Cryptography | no | — |

### Known Threat Patterns for Electron renderer/IPC
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted renderer value persisted to settings.json | Tampering | Enum whitelist coercion in the main handler (existing backup pattern); reject/ignore invalid, return current state. |
| DOM injection via `data-tour` query | Tampering/Injection | Anchor names are a fixed internal union (not user input); no `innerHTML`. Card body is static Spanish copy rendered as text — no `dangerouslySetInnerHTML`. |
| Overlay covering security-relevant UI | (n/a) | Tour is non-blocking, Esc-dismissable, never traps focus; cannot lock the user out. |

The renderer stays sandboxed (contextIsolation=true, nodeIntegration=false); the tour touches the main process only through the existing typed `geode:*` bridge. No CSP change (no `unsafe-eval` needed; no external resources loaded).

## Project Constraints (from CLAUDE.md)

- **Icons:** Lucide monochrome `currentColor` only; **never emojis** — step icons `PencilLine/Save/Cloud/History`, all verified in lucide-react@1.23.0.
- **Language:** all UI strings and code comments in **Spanish** (rioplatense/voseo per UI-SPEC copy).
- **Preload stays CommonJS** — the new `window.geode.tour` bridge is added to the existing `.cjs`-compiled preload, not converted to ESM.
- **Sandboxed renderer** (contextIsolation=true, nodeIntegration=false) — tour reaches settings only via IPC; no direct fs.
- **IPC channels prefixed `geode:`** — new channels `geode:tour-get`, `geode:tour-set`.
- **No Advanced-Mode leakage in Capa 0** — `data-tour` only on the four Capa-0 controls; never on `advanced &&`-gated branch/merge/graph buttons (App.tsx:1281/1291/1309, 1116-1119).
- **TS strict, explicit return types** on all exported functions/handlers.
- **No new dependency** (LOCKED + CLAUDE.md posture).

## Sources

### Primary (HIGH confidence — live codebase, exact citations)
- `src/renderer/src/BackupButton.tsx:88-90` — existing `data-tour="respaldo"` anchor (always mounted).
- `src/renderer/src/App.tsx` — createLocalVault (496-524), backup onboarding set (507-510), startup load (957-969), palette cmds (1092-1099), advanced cmds (1112-1122), global keydown (1125-1137), Save button (1301-1308), advanced-gated buttons (1281/1291/1309), BackupCard gate (1336-1344), ActivityBar render (1347), `.pane-root`/PaneView (1431-1452), Timeline section (1392-1406), BackupButton render (1520-1530), backedUp derivation (1017).
- `src/renderer/src/ActivityBar.tsx:16-37` — disabled HelpCircle button (24) + props shape.
- `src/renderer/src/SidebarSection.tsx:35-73` — internal localStorage-backed collapse; `display:none` body.
- `src/main/services/settings.ts:63-71, 263-279` — backup onboarding block + get/set template.
- `src/shared/ipc.ts:80-83, 324-343, 496` — channel consts, BackupOnboarding types/API, root API.
- `src/preload/index.ts:73-78` — backup bridge template.
- `src/main/index.ts:945-961` — backup onboarding handlers with enum coercion.
- `src/renderer/src/index.css` — z-index inventory (max 210 at :2046, toasts/ctx 200, modal 100), veil `rgba(0,0,0,0.55)` (:1422).
- `src/renderer/src/plugins/host.ts:65-76` — `registerCommand` signature.
- `package.json` — react/react-dom ^19.2.7, lucide-react ^1.23.0.
- `node -e require('lucide-react')` — verified `PencilLine`, `History`, `Cloud`, `Save`, `HelpCircle` all exported.
- `.planning/config.json` — nyquist_validation true, security_enforcement true (ASVS L1).

### Secondary / Tertiary
- None needed — no external documentation or web sources; this is a closed-codebase integration.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all deps verified in package.json + runtime icon check.
- Architecture / anchors / IPC: HIGH — every integration point cited to exact file:line and cross-checked against the mirrored Phase 12 pattern.
- Pitfalls: HIGH — the two real risks (collapsed-section anchor, tour/card sequencing) are grounded in the actual `SidebarSection` and BackupCard-gate code.
- Design placement choices (A2/A4): flagged in Assumptions Log as planner discretion, not uncertainty.

**Research date:** 2026-07-09
**Valid until:** ~2026-08-09 (stable — internal codebase; only invalidated if App.tsx line references shift materially before planning, which the planner should re-grep at task time).
