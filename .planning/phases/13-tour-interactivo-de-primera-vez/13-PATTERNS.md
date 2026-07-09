# Phase 13: Tour interactivo de primera vez - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 10 (4 new, 6 modified)
**Analogs found:** 9 / 10 (TourOverlay spotlight has NO analog — first `createPortal` in repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/renderer/src/TourOverlay.tsx` (NEW) | component (overlay) | event-driven (measure/keyboard) | none for portal/spotlight; `BackupCard.tsx` for the coach-mark card shell | partial (card only) |
| `src/renderer/src/tour/steps.ts` (NEW) | model (data table) | transform (static config) | inline `cmds` array (App.tsx:1092-1099) | role-match |
| `src/renderer/src/tour/useTour.ts` (NEW, optional) | hook | request-response (get/set + state machine) | `backupOnboarding` state + startup load (App.tsx:169, 957-972) | role-match |
| `src/shared/ipc.ts` (EDIT) | config (IPC contract) | request-response | `BackupApi` + `backupOnboarding*` channels (ipc.ts:80-83, 324-343) | exact |
| `src/main/services/settings.ts` (EDIT) | service (persistence) | CRUD (settings.json) | `getBackupOnboarding`/`setBackupOnboarding` (settings.ts:63-71, 263-279) | exact |
| `src/main/index.ts` (EDIT) | route (IPC handler) | request-response | `backupOnboardingGet/Set` handlers (main/index.ts:945-961) | exact |
| `src/preload/index.ts` (EDIT) | route (bridge) | request-response | `backup` bridge (preload:73-78) | exact |
| `src/renderer/src/App.tsx` (EDIT) | component (host) | event-driven | `createLocalVault` + BackupCard gate + palette cmds | exact |
| `src/renderer/src/ActivityBar.tsx` (EDIT) | component | request-response (callback prop) | its own `onOpenSettings` prop + Settings button (ActivityBar.tsx:4-7, 27-34) | exact (self) |
| `src/renderer/src/index.css` (EDIT) | config (styles) | — | `.modal-overlay` (index.css:1419-1427) + `:root` tokens | role-match |

---

## Pattern Assignments

### `src/shared/ipc.ts` (config, request-response) — EXACT ANALOG

**Analog:** BackupOnboarding types + channels + API.

**Channel consts** (ipc.ts:80-83) — add `tourGet`/`tourSet` beside these:
```typescript
  backupOnboardingGet: 'geode:backup-onboarding-get',
  backupOnboardingSet: 'geode:backup-onboarding-set',
  backupOpenSignup: 'geode:backup-open-signup'
```
New (mirror): `tourGet: 'geode:tour-get'`, `tourSet: 'geode:tour-set'`.

**Types + API** (ipc.ts:324-343) — mirror `BackupOnboardingState` (tri-state) exactly:
```typescript
export type BackupOnboardingState = 'invitado' | 'diferido' | 'completado'

export interface BackupOnboarding {
  state: BackupOnboardingState | null
}

export interface BackupApi {
  getOnboarding(): Promise<BackupOnboarding>
  setOnboarding(state: BackupOnboardingState): Promise<BackupOnboarding>
}
```
New (mirror 1:1): `TourState = 'unseen' | 'started' | 'seen'`; `interface TourSnapshot { state: TourState }` (note: tour snapshot is never null — default is `'unseen'`, unlike backup's nullable); `interface TourApi { get(): Promise<TourSnapshot>; set(state: TourState): Promise<TourSnapshot> }`; add `tour: TourApi` to the root API interface (near ipc.ts:496).

---

### `src/main/services/settings.ts` (service, CRUD) — EXACT ANALOG

**Analog:** backup onboarding block + get/set.

**Settings shape** (settings.ts:63-71) — add a sibling `tour?` block after `backup?`:
```typescript
  backup?: {
    onboarding?: 'invitado' | 'diferido' | 'completado'
  }
```
New: `tour?: { state?: 'unseen' | 'started' | 'seen' }` (top-level per RESEARCH A2; planner may nest under a shared `onboarding` if the user prefers the literal `onboarding.tourSeen`).

**Get/Set** (settings.ts:263-279) — copy verbatim, swap names + default:
```typescript
export async function getBackupOnboarding(): Promise<
  'invitado' | 'diferido' | 'completado' | null
> {
  return (await loadSettings()).backup?.onboarding ?? null
}

export async function setBackupOnboarding(
  state: 'invitado' | 'diferido' | 'completado'
): Promise<void> {
  const settings = await loadSettings()
  settings.backup = { ...settings.backup, onboarding: state }
  await saveSettings(settings)
}
```
New: `getTourState()` returns `?? 'unseen'` (not null); `setTourState(state)` uses `settings.tour = { ...settings.tour, state }`. Same immutable-spread merge so unrelated keys survive.

---

### `src/main/index.ts` (route, request-response) — EXACT ANALOG

**Analog:** backup onboarding handlers with defensive enum coercion (main/index.ts:945-961). This is the V5 Input Validation control — copy the coercion guard verbatim.
```typescript
  ipcMain.handle(
    IPC.backupOnboardingGet,
    async (): Promise<BackupOnboarding> => ({ state: await getBackupOnboarding() })
  )

  ipcMain.handle(
    IPC.backupOnboardingSet,
    async (_e, state: BackupOnboardingState): Promise<BackupOnboarding> => {
      // Coerción defensiva (T-12-08): solo persistimos uno de los 3 estados
      // válidos; nunca el valor crudo del renderer. Si llega basura, no mutamos y
      // devolvemos el estado actual.
      const valid: BackupOnboardingState[] = ['invitado', 'diferido', 'completado']
      if (!valid.includes(state)) return { state: await getBackupOnboarding() }
      await setBackupOnboarding(state)
      return { state }
    }
  )
```
New: `IPC.tourGet` / `IPC.tourSet` with `valid: TourState[] = ['unseen', 'started', 'seen']`; invalid input returns current state without mutating. Add imports for `getTourState`/`setTourState` and `TourState`/`TourSnapshot`.

---

### `src/preload/index.ts` (route, request-response) — EXACT ANALOG

**Analog:** `backup` bridge (preload:73-78) — plain invoke passthrough (CommonJS, do NOT convert to ESM):
```typescript
  backup: {
    enable: () => ipcRenderer.invoke(IPC.vaultEnableBackup),
    getOnboarding: () => ipcRenderer.invoke(IPC.backupOnboardingGet),
    setOnboarding: (state) => ipcRenderer.invoke(IPC.backupOnboardingSet, state),
    openSignup: () => ipcRenderer.invoke(IPC.backupOpenSignup)
  },
```
New: `tour: { get: () => ipcRenderer.invoke(IPC.tourGet), set: (state) => ipcRenderer.invoke(IPC.tourSet, state) }`.

---

### `src/renderer/src/tour/steps.ts` (model, transform) — ROLE-MATCH ANALOG

**Analog:** the static `cmds` config array (App.tsx:1092-1099) — a typed array of objects consumed by a loop. steps.ts is a typed `TourStep[]`.

**Copy is LOCKED in UI-SPEC** (Copywriting Contract, lines 104-111). The 4 steps, exact strings, icons and placements are fixed. Use RESEARCH Code Examples block (RESEARCH.md:294-318) verbatim — `anchor`/`icon`/`title`/`body`/`placement` per step. Icons `PencilLine, Save, Cloud, History` from `lucide-react` (all verified present in 1.23.0). Anchor union: `'escribir' | 'guardar' | 'respaldo' | 'historial'`.

---

### `src/renderer/src/useTour.ts` (hook, state machine) — ROLE-MATCH ANALOG

**Analog:** the `backupOnboarding` state pattern.

**State declaration** (App.tsx:169-171):
```typescript
  const [backupOnboarding, setBackupOnboarding] = useState<BackupOnboarding['state']>(null)
  const [backupWizardOpen, setBackupWizardOpen] = useState(false)
```
New: `tourState` (`'unseen'|'started'|'seen'`), `tourActive` (boolean), `stepIndex` (number). The hook owns `launch()`, `next()`, `prev()`, `skip()`, `finish()`. `skip()`/`finish()`/Esc → `set('seen')` + `tourActive=false`. `launch()` from re-entry must NOT touch persistence when already `'seen'` (RESEARCH anti-pattern, line 237).

**Startup load** (App.tsx:957-972) — mirror the `getOnboarding` load, and add the "reappear once" recovery:
```typescript
  useEffect(() => {
    void (async () => {
      // ...
      setBackupOnboarding((await window.geode.backup.getOnboarding()).state)
      // ...
    })()
```
New: on startup read `tour.get()`; if `state === 'started'` (interrupted mid-tour), relaunch once and immediately `set('seen')` so a second interruption can't loop (RESEARCH Pitfall 4, lines 274-281).

**Esc-to-close** — mirror the global keydown listener (App.tsx:1125-1137):
```typescript
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { /* ... */ }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [splitPane])
```
New: `if (e.key === 'Escape') skip()`, gated on `active`, cleanup on unmount.

---

### `src/renderer/src/TourOverlay.tsx` (component, event-driven) — ⚠ NO PORTAL/SPOTLIGHT ANALOG

**FIRST `createPortal` in the repo — planner must spec it fully from UI-SPEC + RESEARCH; there is NO existing overlay to copy the portal/measurement machinery from.** The existing modals (`BackupWizard`, `CommitDialog`, `ConfirmRemoveVaultDialog`) render **inline** with `.modal-overlay` `position:fixed` — they do NOT use a portal, do NOT measure DOM, and DO trap like modals. The tour differs on all three (portal-to-body, global coordinate measurement, non-blocking veil). Use them only as a **CSS token** reference, not a structural analog.

**What has NO analog (spec from scratch, sources cited in RESEARCH):**
- `createPortal(node, document.body)` — RESEARCH Pattern 2 (RESEARCH.md:186-208).
- Spotlight clip via oversized box-shadow — RESEARCH Pattern 1 (RESEARCH.md:164-184); `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` + `2px solid var(--accent)` ring, 8px inflate, `border-radius:8px`, `z-index:300`.
- `useLayoutEffect` measurement lifecycle with `resize` + capture-phase `scroll` + `ResizeObserver` recompute — RESEARCH.md:195-208.
- Safe rect read (`readAnchorRect`) — RESEARCH Pattern 3 (RESEARCH.md:211-224): null / 0-area → centered card, no spotlight (avoids the historical rect-null crash). Large-anchor (editor `.pane-root`) → also centered per Pitfall 5 (RESEARCH.md:283-285).
- Auto-flip placement from each step's preferred `placement` (UI-SPEC §2 table, lines 171-176).
- Non-blocking veil: captures clicks so app controls don't fire, but veil-click does NOT advance/close; only Esc + "Saltar" exit (UI-SPEC invariant 1, lines 155-157).

**What CAN be copied — the coach-mark CARD shell** (analog: `BackupCard.tsx`, full file):
```tsx
export function BackupCard({ onBackup, onLater }: {
  onBackup: () => void
  onLater: () => void
}): JSX.Element {
  return (
    <div className="time-banner backup">
      <div className="time-banner-info">
        <CloudUpload size={15} />
        <span className="time-banner-title">Respaldá tu cuaderno en la nube</span>
        {/* ... */}
      </div>
      <div className="time-banner-actions">
        <button className="link-btn" onClick={onLater}>Hacerlo después</button>
        <button className="tb-btn cta" onClick={onBackup}>
          <CloudUpload size={16} /> Respaldar en la nube
        </button>
      </div>
    </div>
  )
}
```
Copy from this: props-only presentational component (actions arrive as callbacks), Lucide icon + title + body layout, `.link-btn` for the muted secondary action ("Saltar"/"Anterior"), `.primary`/`.cta` for the accent action ("Siguiente"/"Listo"). Card copy per UI-SPEC Copywriting Contract; card CSS classes `.tour-card`/`.tour-card-title`/`.tour-card-body`/`.tour-card-footer`/`.tour-progress`/`.tour-actions` (UI-SPEC §2, lines 159-169). `role="dialog"` + `aria-label` = step title (UI-SPEC Accessibility, line 199).

---

### `src/renderer/src/App.tsx` (component, event-driven) — EXACT ANALOGS

**1. Trigger** — extend `createLocalVault` (App.tsx:496-524). The backup-onboarding launch is the analog:
```typescript
      // Tras el primer cuaderno: invitamos a respaldar UNA sola vez. Marcamos
      // 'invitado' al mostrar la tarjeta para que no reaparezca sola si se difiere.
      if (backupOnboarding === null) {
        await window.geode.backup.setOnboarding('invitado')
        setBackupOnboarding('invitado')
      }
```
New: after `adoptVault` + `openNote`, `if (tourState === 'unseen') launchTour()`. Order: tour BEFORE the backup-card gating (RESEARCH Pitfall 3).

**2. BackupCard gate** — add `&& !tourActive` (App.tsx:1336):
```tsx
      {backupOnboarding === 'invitado' && !backupWizardOpen && vault && (
        <BackupCard onBackup={/* ... */} onLater={/* ... */} />
      )}
```
New condition: `... && vault && !tourActive`. When tour finishes, `tourActive=false` → card appears. Phase 12 state machine untouched (RESEARCH Pitfall 3, lines 268-272).

**3. Palette command** — add to the always-registered `cmds` array (App.tsx:1092-1099). Analog:
```typescript
      host.registerCommand({ id: 'core.saveVersion', title: 'Guardar versión', category: 'Núcleo', shortcut: 'Ctrl+S', run: () => api().saveVersion() }),
```
New: `host.registerCommand({ id: 'core.tour', title: 'Ver el recorrido guiado', category: 'Ayuda', run: () => launchTour() })`. Register in the NON-git block (line 1092), NEVER the `advanced`-gated block (1112-1122) — Ayuda is Capa 0. `registerCommand` returns a `Disposable`; add to `cmds` so it's disposed on cleanup (host.ts:65-69).

**4. ActivityBar render prop** (App.tsx:1347):
```tsx
        <ActivityBar onOpenSettings={() => setSettingsOpen(true)} />
```
New: add `onShowTour={launchTour}`.

**5. `data-tour` anchors** (add attribute only — see Shared Pattern below):
- `.pane-root` (App.tsx:1431) → `data-tour="escribir"`.
- Save button (App.tsx:1301-1308) → `data-tour="guardar"`.
- `<SidebarSection id="timeline" ...>` header/root (App.tsx:1392) OR the Timeline body → `data-tour="historial"` (see degradation Pattern below).
- `respaldo` already exists — do NOT add (BackupButton.tsx:90).

---

### `src/renderer/src/ActivityBar.tsx` (component) — EXACT SELF-ANALOG

**Analog:** its own existing `onOpenSettings` prop + Settings button — copy the prop + wired-button shape onto the disabled HelpCircle.

**Props** (ActivityBar.tsx:4-7):
```typescript
export interface ActivityBarProps {
  onOpenSettings: () => void
}
```
New: add `onShowTour: () => void`; destructure both in the signature (line 16).

**Enable button** — the disabled HelpCircle (line 24) becomes the Settings-button shape (lines 27-34):
```tsx
        <button className="activity-btn" title="Ayuda" aria-label="Ayuda" disabled>
          <HelpCircle size={20} />
        </button>
        <button className="activity-btn" title="Ajustes" aria-label="Ajustes" onClick={onOpenSettings}>
          <SettingsIcon size={20} />
        </button>
```
New: drop `disabled`, set `title`/`aria-label` = "Ver el recorrido guiado", `onClick={onShowTour}`. `HelpCircle` already imported (line 2).

---

### `src/renderer/src/index.css` (config, styles) — TOKEN-REUSE ANALOG

**Analog:** `.modal-overlay` (index.css:1419-1427) for the veil color; `:root` tokens (lines 6-9) for surfaces. **Introduce NO new values** (UI-SPEC "Regla de oro", line 14).
```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);   /* MISMO valor que el velo del spotlight */
  z-index: 100;
}
```
```css
  --panel-2: #202027;   /* superficie del cartel */
  --border: #2a2a32;    /* borde del cartel */
  --muted: #9a9aa6;     /* progreso "Paso N de M", Saltar/Anterior */
  --accent: #b794f6;    /* anillo del spotlight + .primary */
```
New classes reuse these: `.tour-overlay`/`.tour-spotlight` z-index **300**, `.tour-card` z-index **301** (clears the 210 ceiling — `.ctx-menu` at index.css:2046 is the current max; toasts 200; modal 100). Card: `background: var(--panel-2)`, `border: 1px solid var(--border)`, `border-radius: 8px`, `box-shadow: 0 8px 24px rgba(0,0,0,0.45)`, `max-width: 320px`, `padding: 16px` (all inherited per UI-SPEC §2).

---

## Shared Patterns

### Persistence via typed IPC (backup-onboarding template)
**Source:** `src/shared/ipc.ts:80-83,324-343` · `src/main/services/settings.ts:263-279` · `src/main/index.ts:945-961` · `src/preload/index.ts:73-78`
**Apply to:** the four persistence-layer edits (ipc.ts, settings.ts, main/index.ts, preload). Copy the four-file shape 1:1; the ONLY behavioral differences vs backup: (a) tri-state values are `unseen/started/seen`, (b) default is `'unseen'` not `null`, (c) same defensive enum-coercion guard in the main handler (never persist raw renderer input — V5 Input Validation).

### `data-tour` anchor attribute (Capa 0 ONLY)
**Source:** `src/renderer/src/BackupButton.tsx:88-90` (the one existing anchor).
**Apply to:** the editor host, Save button, Timeline section.
```tsx
    <button className="status-item backup-btn" data-tour="respaldo" ...>
```
Add the attribute to UNCONDITIONALLY-rendered Capa-0 elements only. NEVER on `advanced &&`-gated elements (App.tsx:1281 merge-into-parent, 1291 merge, 1309 graph toggle) — they mount/unmount with the flag and would leak Modo Avanzado into the tour (RESEARCH anti-pattern, line 234; TOUR-03).

### Graceful degradation for the `historial` anchor (collapsed section)
**Source:** `src/renderer/src/SidebarSection.tsx:35-45,73` — collapse is internal `useState` seeded from `localStorage['geode.section.timeline.collapsed']`; body is `display:none` when collapsed (line 73). Toggle is `<button class="sidebar-section-toggle" aria-expanded="false">` (lines 56-61). Writing the localStorage key does NOT re-render it.
**Apply to:** step 4 ("historial"). Planner picks one (RESEARCH Pitfall 2, lines 259-266):
- **(A)** anchor `data-tour="historial"` on the always-rendered `SidebarSection` header (App.tsx:1392) — spotlight lands on "LÍNEA DE TIEMPO" header; simplest.
- **(B)** on entering step 4, if `readAnchorRect('historial')` is null, `document.querySelector('.sidebar-section-toggle[aria-expanded="false"]')` scoped to the timeline section `.click()`, then re-measure next frame.
Both satisfy UI-SPEC. Do NOT flip collapse via a prop (it's uncontrolled).

### Global keydown listener (Esc-to-close)
**Source:** `src/renderer/src/App.tsx:1125-1137` (Ctrl+P palette).
**Apply to:** TourOverlay/useTour Esc handling — same `window.addEventListener('keydown', ...)` + cleanup shape, gated on `active`, `e.key === 'Escape'` → `skip()`.

---

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `TourOverlay.tsx` — `createPortal` + spotlight clip + `getBoundingClientRect` measurement lifecycle + auto-flip placement + non-blocking veil | component | event-driven | **First `createPortal` usage in the entire repo.** Existing modals render inline (`.modal-overlay`, `position:fixed`), trap focus, and never measure DOM coordinates. There is NO structural precedent for a portal-based measuring spotlight overlay. Planner must spec this from UI-SPEC §1-2 + RESEARCH Patterns 1-3 (RESEARCH.md:164-224), NOT by copying an existing file. Only the coach-mark CARD (props-only presentational shell, `.link-btn`/`.primary` buttons, Lucide+title+body) has an analog in `BackupCard.tsx`. |

---

## Metadata

**Analog search scope:** `src/renderer/src/` (components, hooks, CSS), `src/main/services/`, `src/main/index.ts`, `src/preload/`, `src/shared/`.
**Files scanned:** settings.ts, ipc.ts, main/index.ts, preload/index.ts, BackupButton.tsx, BackupCard.tsx, ActivityBar.tsx, SidebarSection.tsx, App.tsx (createLocalVault, palette, Save button, Timeline, BackupCard gate, ActivityBar render, startup, keydown), host.ts, index.css.
**Pattern extraction date:** 2026-07-09
