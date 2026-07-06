# Phase 5: Advanced Mode & Capa-0 Polish - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 7 (all modifications — no new files)
**Analogs found:** 7 / 7

> Brownfield phase. Every file is an in-place modification that mirrors an existing pattern. The dominant analog is the **Phase 4 snapshots config** (`snapshots: { cadenceMinutes }` end-to-end wiring): the new `advanced: { enabled }` flag copies it verbatim across settings → ipc → preload → main → SettingsModal. The two Capa-0 polish files (App.tsx save-status, DiffView.tsx) modify existing helpers in place.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main/services/settings.ts` | service (config store) | file-I/O / CRUD | `snapshots` block + `setSnapshotCadence` (same file, L39-42, L156-163) | exact (same file) |
| `src/shared/ipc.ts` | config (IPC contract) | request-response | `SnapshotsApi` + `SnapshotsConfig` (same file, L65-66, L346-358, L415) | exact (same file) |
| `src/preload/index.ts` | provider (IPC bridge) | request-response | `snapshots` bridge (same file, L80-83) | exact (same file) |
| `src/main/index.ts` | controller (IPC handlers) | request-response | `snapshotsGet`/`snapshotsSet` handlers (same file, L437-457) | exact (same file) |
| `src/renderer/src/SettingsModal.tsx` | component (settings UI) | request-response | `section === 'snapshots'` "Guardado automático" section (same file, L168-170, L387-410) | exact (same file) |
| `src/renderer/src/App.tsx` | component (shell/statusbar) | request-response / event-driven | `aiConfig`/`githubCfg` load+read pattern (same file, L105/124, L675-689, L1216-1220) | role-match (same file) |
| `src/renderer/src/DiffView.tsx` | component (diff viewer) | transform | modify in place (`patchLines`, `statusLabel`, header) | in-place modify |

---

## Pattern Assignments

### `src/main/services/settings.ts` (service, file-I/O)

**Analog:** the `snapshots` config block + `setSnapshotCadence` in this same file.

**Config shape to copy** (add a sibling to `snapshots`, L39-42):
```typescript
  snapshots?: {
    /** minutos entre snapshots automáticos; null = manual (sin timer). */
    cadenceMinutes?: number | null
  }
```
New addition — mirror exactly:
```typescript
  advanced?: {
    /** Modo Avanzado: revela grafo/ramas/hashes. Ausente = off (default git-free). */
    enabled?: boolean
  }
```

**Setter pattern to copy** (L156-163):
```typescript
// ── Snapshots automáticos ─────────────────────────────────────────────────────

/** Fija la cadencia de snapshots (null = manual) sin tocar el resto de ajustes. */
export async function setSnapshotCadence(cadenceMinutes: number | null): Promise<void> {
  const settings = await loadSettings()
  settings.snapshots = { ...settings.snapshots, cadenceMinutes }
  await saveSettings(settings)
}
```
New addition — same load→spread→save shape:
```typescript
export async function setAdvanced(enabled: boolean): Promise<void> {
  const settings = await loadSettings()
  settings.advanced = { ...settings.advanced, enabled }
  await saveSettings(settings)
}
```

**Read pattern** (the handler reads via `loadSettings()`, no dedicated getter exists for snapshots — the get handler destructures directly; follow the same choice).

---

### `src/shared/ipc.ts` (config, request-response)

**Analog:** `SnapshotsConfig` / `SnapshotsApi` and their channel + `GeodeApi` registration.

**Channel names to copy** (L65-66, inside the `IPC` const):
```typescript
  snapshotsGet: 'geode:snapshots-get',
  snapshotsSet: 'geode:snapshots-set',
```
New addition:
```typescript
  advancedGet: 'geode:advanced-get',
  advancedSet: 'geode:advanced-set',
```

**Config + Api interface to copy** (L346-358):
```typescript
// ── Snapshots automáticos (guardado por cadencia, sin IA) ───────────────────

export interface SnapshotsConfig {
  /** minutos entre snapshots; null = manual (sin timer). */
  cadenceMinutes: number | null
}

export interface SnapshotsApi {
  /** Config actual; default 10 min si nunca se configuró. */
  get(): Promise<SnapshotsConfig>
  /** Fija la cadencia (null = manual) y reinicia el timer. */
  set(cadenceMinutes: number | null): Promise<SnapshotsConfig>
}
```
New addition — same shape (note default is `false`, git-free):
```typescript
export interface AdvancedConfig {
  /** Modo Avanzado activo. Default false: experiencia sin git. */
  enabled: boolean
}

export interface AdvancedApi {
  get(): Promise<AdvancedConfig>
  set(enabled: boolean): Promise<AdvancedConfig>
}
```

**GeodeApi registration to copy** (L415, inside `interface GeodeApi`):
```typescript
  snapshots: SnapshotsApi
```
New addition:
```typescript
  advanced: AdvancedApi
```

---

### `src/preload/index.ts` (provider, request-response)

**Analog:** the `snapshots` bridge object (L80-83).

**Bridge pattern to copy** (L80-83):
```typescript
  snapshots: {
    get: () => ipcRenderer.invoke(IPC.snapshotsGet),
    set: (cadenceMinutes) => ipcRenderer.invoke(IPC.snapshotsSet, cadenceMinutes)
  },
```
New addition:
```typescript
  advanced: {
    get: () => ipcRenderer.invoke(IPC.advancedGet),
    set: (enabled) => ipcRenderer.invoke(IPC.advancedSet, enabled)
  },
```
Note: the whole `api` object is typed `const api: GeodeApi` (L9), so param types are inferred from the `AdvancedApi` interface — no explicit annotations needed.

---

### `src/main/index.ts` (controller, request-response)

**Analog:** the `snapshotsGet`/`snapshotsSet` `ipcMain.handle` handlers (L435-457).

**Import to copy** — add `setAdvanced` to the settings import block (L42-55) and `type AdvancedConfig` to the `@shared/ipc` type import block (near L13-15, alongside `type SnapshotsConfig`).

**Handler pattern to copy** (L437-457, but SIMPLER — no timer/validation side-effects; advanced is a pure flag):
```typescript
  ipcMain.handle(IPC.snapshotsGet, async (): Promise<SnapshotsConfig> => {
    const { snapshots } = await loadSettings()
    // Mismo resolver que el timer: undefined→10 ON, null→manual, inválido→manual.
    return { cadenceMinutes: resolveCadenceMinutes(snapshots?.cadenceMinutes) }
  })

  ipcMain.handle(
    IPC.snapshotsSet,
    async (_e, cadenceMinutes: number | null): Promise<SnapshotsConfig> => {
      ...
      await setSnapshotCadence(safe)
      await restartSnapshotTimer()
      return { cadenceMinutes: safe }
    }
  )
```
New addition — no `restartSnapshotTimer` equivalent, no validation resolver (bool coercion only), default `false`:
```typescript
  ipcMain.handle(IPC.advancedGet, async (): Promise<AdvancedConfig> => {
    const { advanced } = await loadSettings()
    return { enabled: advanced?.enabled ?? false }
  })

  ipcMain.handle(IPC.advancedSet, async (_e, enabled: boolean): Promise<AdvancedConfig> => {
    await setAdvanced(!!enabled)
    return { enabled: !!enabled }
  })
```

---

### `src/renderer/src/SettingsModal.tsx` (component, request-response)

**Analog:** the "Guardado automático" (`snapshots`) section — nav button, state, loader, and section block.

**Section union type to extend** (L19):
```typescript
type Section = 'ai' | 'github' | 'plugins' | 'snapshots'
```
→ add `'general'`. Note default `useState<Section>('ai')` (L33) — per UI-SPEC §1, General is the FIRST nav item; consider whether to leave default `'ai'` or switch initial section (planner decides; UI-SPEC says General renders first in the list, not necessarily the default open section).

**State + loader pattern to copy** (L48, L87, L96-99):
```typescript
  // Guardado automático (cadencia de snapshots; null = manual)
  const [cadence, setCadence] = useState<number | null>(10)
  ...
  setCadence((await window.geode.snapshots.get()).cadenceMinutes)   // inside the mount useEffect (L79-90)
  ...
  const changeCadence = async (value: number | null): Promise<void> => {
    const cfg = await window.geode.snapshots.set(value)
    setCadence(cfg.cadenceMinutes)
  }
```
New addition:
```typescript
  const [advanced, setAdvanced] = useState(false)
  ...
  setAdvanced((await window.geode.advanced.get()).enabled)          // add inside same mount useEffect
  ...
  const changeAdvanced = async (value: boolean): Promise<void> => {
    const cfg = await window.geode.advanced.set(value)
    setAdvanced(cfg.enabled)
  }
```
Per UI-SPEC §1: on IPC failure fall back to Off silently (wrap the `advanced.get()` read so a throw leaves `advanced` at `false`).

**Nav button pattern to copy** (L168-170) — icon `size={15}` + label:
```typescript
            <button className={section === 'snapshots' ? 'active' : ''} onClick={() => setSection('snapshots')}>
              <Clock size={15} /> Guardado automático
            </button>
```
New addition (FIRST in `.settings-nav`, icon `SlidersHorizontal`):
```typescript
            <button className={section === 'general' ? 'active' : ''} onClick={() => setSection('general')}>
              <SlidersHorizontal size={15} /> General
            </button>
```
Add `SlidersHorizontal` to the lucide import (L3).

**Section block pattern to copy** (L387-410) — heading `size={18}`, `.modal-sub`, `.field-label`, control:
```typescript
            {section === 'snapshots' && (
              <section className="settings-section">
                <h2><Clock size={18} /> Guardado automático</h2>
                <p className="modal-sub">La bóveda se guarda sola cada cierto tiempo...</p>
                <label className="field-label">Cadencia</label>
                <select className="text-input" value={...} onChange={...}>...</select>
                <p className="hint">Por defecto: cada 10 minutos.</p>
              </section>
            )}
```
New addition (FIRST in `.settings-content`) — copy uses UI-SPEC Copywriting Contract strings; control is a checkbox-as-switch styled with `--accent` when on (CSS class is Claude's discretion, kebab-case):
```typescript
            {section === 'general' && (
              <section className="settings-section">
                <h2><SlidersHorizontal size={18} /> General</h2>
                <p className="modal-sub">
                  Modo Avanzado muestra el historial técnico de versiones (ramas, etiquetas y grafo).
                  Desactivado por defecto.
                </p>
                <label className="field-label">Modo Avanzado</label>
                {/* checkbox semántico estilado como switch, con label accesible */}
              </section>
            )}
```

**Settings close → App re-read:** the modal already re-reads config on close via `onClose` in App.tsx (see App section). No new callback needed if App re-reads `advanced` in the existing `onClose` handler.

---

### `src/renderer/src/App.tsx` (component, request-response / event-driven)

Two distinct changes: (A) the humanized save-status helper + call site (STAT-01), and (B) gating git surfaces behind an `advanced` flag loaded into state (ADV-03), mirroring how `aiConfig`/`githubCfg` are loaded and read.

#### (A) Save-status — STAT-01

**Current helper to rewrite in place** (L1310-1321):
```typescript
function statusLabel(status: SaveStatus, savedAt: Date | null): string {
  switch (status) {
    case 'saving':
      return '● guardando…'
    case 'saved':
      return savedAt ? `✓ guardado ${savedAt.toLocaleTimeString()}` : '✓ guardado'
    case 'clean':
      return '✓ sin cambios'
    default:
      return ''
  }
}
```
Rewrite per State Matrix (UI-SPEC §Save Status): the four EXACT strings `Guardando…` / `Todo en la nube` / `Guardado en este dispositivo` / `Guardado`. **Remove `savedAt.toLocaleTimeString()` entirely.** The helper now needs GitHub-sync inputs (`githubConnected`, `pushCount`) — change its signature and drop the `savedAt` param, OR return a `{ text, icon }` descriptor since the glyphs `✓`/`●` are replaced by Lucide icons (`Loader2.spin` / `Cloud` / `HardDrive` / `Check`). Recommended: return an icon-key + text so the call site renders `<Icon size={14} /> {text}`.

**Current call site to update** (L1095-1097) — glyph is inline in the string today:
```typescript
              {statusLabel(status, savedAt) && (
                <span className="save-status">{statusLabel(status, savedAt)}</span>
              )}
```
New: render Lucide icon (size 14, `currentColor`, stays `--muted` per UI-SPEC Color §Save-status) + text, gap 4px. Feed it `status`, `githubCfg?.connected`, `pushCount` (both already in scope — see L124-125).

#### (B) Advanced-flag gating — ADV-03

**State declaration analog** (`githubCfg`/`aiConfig`, L105/124-125):
```typescript
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  ...
  const [githubCfg, setGithubCfg] = useState<GithubConfig | null>(null)
  const [pushCount, setPushCount] = useState(0)
```
New addition:
```typescript
  const [advanced, setAdvanced] = useState(false)
```

**Load analog** — mount `useEffect` (L675-689) loads AI/GitHub config once at startup:
```typescript
  // Al arrancar: restaurar vault y cargar config de IA/GitHub.
  useEffect(() => {
    void (async () => {
      setAppInfo(await window.geode.getAppInfo())
      const cfg = await window.geode.ai.getConfig()
      setAiConfig(cfg)
      ...
      await refreshGithub()
      ...
    })()
  }, [refreshTree, refreshGraph, refreshGithub, refreshAiUsage, refreshVaults])
```
Add a `refreshAdvanced` callback (mirror `refreshGithub` at L255-259) and call it here:
```typescript
  const refreshAdvanced = useCallback(async () => {
    try { setAdvanced((await window.geode.advanced.get()).enabled) }
    catch { setAdvanced(false) }   // fallback git-free (UI-SPEC error state)
  }, [])
```

**Re-read on Settings close analog** (L1216-1220):
```typescript
      {settingsOpen && (
        <SettingsModal
          onClose={() => { setSettingsOpen(false); void refreshGithub(); void refreshAiUsage() }}
          onConfigChange={setAiConfig}
        />
      )}
```
Add `void refreshAdvanced()` to the `onClose` chain.

**Gating call sites** — wrap each git surface in `advanced &&` (mirroring how `githubCfg?.connected && ...` already guards the push button at L952):

| Surface | Line | Current guard | New guard |
|---------|------|---------------|-----------|
| "Crear rama" `GitBranchPlus` button | L916-925 | `hasHead &&` | `advanced && hasHead &&` |
| "Integrar rama" `GitMerge` button | L926-935 | `canMerge &&` | `advanced && canMerge &&` |
| "Árbol de versiones" `GitBranch` toolbar button | L944-951 | (always) | `advanced && (...)` |
| `VersionGraph` modal | L1068-1079 | `graphOpen && graph &&` | `advanced && graphOpen && graph &&` |
| `BranchSwitcher` statusbar | L1103-1110 | `graph && graph.head.oid &&` | `advanced && graph && graph.head.oid &&` |

**Kept-visible-but-humanized GitHub popover** (L1112-1131) — NOT gated. Rewrite the git-jargon rows in DEFAULT mode:
```typescript
                      <div className="pop-row"><span>Sin pushear</span><b>{pushCount} commit(s)</b></div>
```
→ humanized per UI-SPEC Copywriting (`Cambios sin subir` · `N`, drop "commit"). Also audit the push toolbar button `title`/`aria-label` (L955-956 use "Push a GitHub") for the ADV-01 leak audit (no "push"/"commit"/hash in default-mode visible text, `title`, or `aria-label`).

**Leak audit reference (ADV-01):** grep the default-mode render tree for `commit`, `branch`, `merge`, `push`, `HEAD`, and 7-char hashes in visible text / `title` / `aria-label`. The gated surfaces above cover the graph/branch jargon; the residual leaks are the GitHub popover + push button tooltip.

---

### `src/renderer/src/DiffView.tsx` (component, transform) — modify in place

No external analog — modify the four existing pieces. Current full file is 92 lines.

**Header to replace** (L24-29):
```typescript
        <div className="diff-head">
          <h2>
            Versión <span className="diff-oid">{oid.slice(0, 7)}</span> vs. actual
          </h2>
          <button className="icon-btn" title="Cerrar" onClick={onClose}><X size={16} /></button>
        </div>
```
Replace with human label `Cambios del {fecha} — {nombre de versión}`; drop the `.diff-oid` span. The component must RECEIVE version metadata (date + human name) instead of rendering `oid.slice(0,7)`. **Metadata source:** the human label helpers already exist in `src/renderer/src/time/labels.ts` — `entryLabel(commit, tags)` (human name: tag → AI message first line → relative date) and `relativeDate(commit.timestamp)` / a `Date` format for `{fecha}`. The diff is opened from `VersionGraph` `onShowDiff(oid)` → `setDiffOid(oid)` (App.tsx L1077, L111, L1194); the matching `GitCommitNode` (has `.timestamp`, `.message`) and `graph.tags` are available in App.tsx. Recommended: pass a resolved `{ date, label }` prop from App's `<DiffView>` render site (App.tsx L1194) rather than re-querying by oid. Keep the `X` close button (`.icon-btn`, size 16) unchanged.

**`patchLines()` to modify** (L65-87) — hide hunks and drop "No newline":
```typescript
type LnKind = 'add' | 'del' | 'hunk' | 'ctx'

function patchLines(patch: string): { kind: LnKind; text: string }[] {
  const out: { kind: LnKind; text: string }[] = []
  for (const line of patch.split('\n')) {
    if (line.startsWith('Index:') || line.startsWith('===') ||
        line.startsWith('--- ') || line.startsWith('+++ ')) {
      continue
    }
    if (line.startsWith('@@')) out.push({ kind: 'hunk', text: line })   // ← stop emitting text; emit divider marker
    else if (line.startsWith('+')) out.push({ kind: 'add', text: line.slice(1) })
    else if (line.startsWith('-')) out.push({ kind: 'del', text: line.slice(1) })
    else out.push({ kind: 'ctx', text: line.startsWith(' ') ? line.slice(1) : line })
  }
  ...
}
```
Changes (UI-SPEC §4):
- `@@` lines → emit a `kind: 'divider'` marker with no text (renders as a thin `--border` rule, `aria-hidden`), NOT the raw `@@ ... @@` text.
- Filter/drop `\ No newline at end of file` lines (add a `continue` for lines starting with `\ No newline` — jsdiff emits these).

**Render loop to update** (L56-60) — add per-line `aria-label` + divider handling:
```typescript
      <pre className="diff-body">
        {patchLines(file.patch).map((ln, i) => (
          <div key={i} className={`diff-ln ${ln.kind}`}>{ln.text || ' '}</div>
        ))}
      </pre>
```
Each `add`/`del` line gets `aria-label` prefixed with `"agregado"`/`"quitado"`; the `divider` kind renders as an `aria-hidden` rule.

**Legend to ADD** (new row above `.diff-files`, L36) — required by DIFF-02:
- green swatch + `agregado`, red swatch + `quitado`. Swatch = small filled dot/square using existing add-green `#68d391` / del-red `#ff6b6b` (UI-SPEC Color). These semantic colors are diff-only.

**`statusLabel()` (file-level)** (L89-91) — already human ("agregado/borrado/modificado"); KEEP as-is. Note: this is a DIFFERENT `statusLabel` than App.tsx's save-status one — do not conflate.

---

## Shared Patterns

### Persisted-config-flag round-trip (settings → ipc → preload → main → renderer)
**Source of truth:** the Phase 4 `snapshots` wiring, spanning:
- `src/main/services/settings.ts` L39-42 (shape), L156-163 (setter)
- `src/shared/ipc.ts` L65-66 (channels), L346-358 (Config+Api), L415 (GeodeApi)
- `src/preload/index.ts` L80-83 (bridge)
- `src/main/index.ts` L13 (type import), L54 (setter import), L437-457 (handlers)

**Apply to:** the new `advanced` flag. Copy the exact 5-file shape; the only behavioral differences are: default `false` (not 10), no timer restart side-effect, no numeric validation resolver (boolean coercion only).

### Config loaded once into App state, re-read on Settings close
**Source:** `aiConfig`/`githubCfg` in App.tsx — declared L105/124, `refreshGithub` L255-259, loaded in mount `useEffect` L675-689, re-read in `SettingsModal` `onClose` L1218.
**Apply to:** the `advanced` flag drives all ADV-03 conditional renders. Add `refreshAdvanced` + `advanced` state following this exact rhythm.

### Human-label helpers (no hashes, no timestamps)
**Source:** `src/renderer/src/time/labels.ts` — `entryLabel(commit, tags)`, `relativeDate(ts)`. Pure, testable, Spanish, fallback chain that NEVER returns a hash.
**Apply to:** DiffView header (`{nombre de versión}` = `entryLabel`), and conceptually aligns the save-status humanization. Reuse these instead of formatting oids/timestamps ad hoc.

### Lucide-icon + text UI idiom (never glyphs/emojis)
**Source:** statusbar `.status-item` (App.tsx L1112-1114: `<Cloud size={14} .../> <span>...`) and Settings nav/headings (`<Icon size={15} /> Label`, `<Icon size={18} /> Heading`).
**Apply to:** the STAT-01 save-status (replaces `✓`/`●` glyphs), the General nav/heading (`SlidersHorizontal`), and the diff legend swatches. Icons are `currentColor`, sized via `size` prop.

---

## No Analog Found

None. Every file is an in-place modification of an existing surface with a direct pattern to mirror. The closest thing to "new" is the `advanced` config, which copies the Phase 4 `snapshots` wiring exactly.

---

## Metadata

**Analog search scope:** `src/main/services/`, `src/shared/`, `src/preload/`, `src/renderer/src/` (+ `src/renderer/src/time/`)
**Files scanned:** settings.ts, ipc.ts, preload/index.ts, main/index.ts, SettingsModal.tsx, App.tsx, DiffView.tsx, time/labels.ts
**Pattern extraction date:** 2026-07-05
