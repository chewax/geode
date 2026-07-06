# Phase 3: Save a Named Version - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 9 (all modifications — no new files)
**Analogs found:** 9 / 9 (every change point has an in-repo analog; most files ARE their own analog)

> This phase is a **reframe of existing primitives**, not greenfield. Every file below already exists and is modified in place. The "analog" is almost always a sibling method/component in the same file (e.g. `generateMessage` is the analog for the new `generateNamedVersion`). Copy the surrounding conventions verbatim: Spanish strings/comments, explicit return types, `import type`, Lucide icons, `geode:` IPC prefix.

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/main/services/ai.ts` | service (AI provider) | request-response (transform) | `OpenRouterProvider.generateMessage` + `toOneLine` (same file) | exact (sibling method) |
| `src/main/index.ts` | IPC handler (main) | request-response | `ipcMain.handle(IPC.aiSuggestMessage)` L312 (same file) | exact (sibling handler) |
| `src/shared/ipc.ts` | config (IPC contract) | request-response | `aiSuggestMessage` channel + `AiApi.suggestMessage` (same file) | exact (sibling contract) |
| `src/preload/index.ts` | bridge (preload, CommonJS) | request-response | `ai.suggestMessage` mapping L74 (same file) | exact (sibling mapping) |
| `src/main/services/git.ts` | service (git) | transform (diff scoping) | `changedFiles` `.md` filter L606 (same file) | exact (same filter idiom) |
| `src/renderer/src/CommitDialog.tsx` | component (modal) | request-response | the file itself (rebuilt in place) | self |
| `src/renderer/src/time/labels.ts` | utility (pure helper) | transform | `entryLabel` L12 (the function itself) | self |
| `src/renderer/src/App.tsx` | component (wiring) | event-driven | `openCommitDialog` L527 / `doCommit` L538 (same file) | self |
| `src/renderer/src/index.css` | config (styles) | — | `.field-label` / `.commit-message` / `.modal-error` blocks | exact (retire `.change-list`/`.modal-warn` usage) |

---

## Pattern Assignments

### `src/main/services/ai.ts` (service, transform)

**Analog:** `OpenRouterProvider.generateMessage` (L79-89) + `toOneLine` (L38-48) + private `chat` (L110-133), all same file.

**Provider method pattern to copy** (L79-89) — new `generateNamedVersion` mirrors this shape exactly, reusing the private `chat()` wrapper and `toOneLine()`:
```typescript
async generateMessage(diff: string): Promise<string> {
  const raw = await this.chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: diff }
    ],
    300,
    0.2
  )
  return toOneLine(raw)
}
```

**Prompt constant pattern to copy** (L16-26) — declare `NAMED_VERSION_PROMPT` as a module-level `const` string in Spanish, same as `SYSTEM_PROMPT`/`WRITER_PROMPT`:
```typescript
const SYSTEM_PROMPT = `Sos un asistente que resume, en español, qué se hizo en un conjunto de notas personales, para etiquetar una versión guardada.
...`
```

**Helper reuse** (`toOneLine`, L38-48) — the new `parseNamedVersion` MUST reuse `toOneLine` for the title line (strips bullets/quotes); do not duplicate that logic:
```typescript
/** Fuerza a una sola línea: primera línea no vacía, sin viñeta ni comillas. */
function toOneLine(text: string): string {
  const firstLine =
    text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? text.trim()
  return firstLine.replace(/^[-*]\s+/, '').replace(/^["'“”]+|["'“”]+$/g, '').trim()
}
```

**Interface export pattern** (L9-12) — add `export interface NamedVersion { title: string; description: string }` alongside `AiMessageProvider`. Note: RESEARCH recommends the shared `NamedVersion` type live in `@shared/ipc` (renderer needs it too); import it here with `import type` rather than declaring twice.

**Convention notes:** explicit return type `Promise<NamedVersion>`; Spanish comments; `import type { AiModel, AiUsage } from '@shared/ipc'` (L1) — extend to import `NamedVersion` too.

---

### `src/main/index.ts` (IPC handler, request-response)

**Analog:** `ipcMain.handle(IPC.aiSuggestMessage, …)` (L312-322), same file.

**Handler pattern to copy** (L312-322) — new `IPC.aiSuggestVersion` handler is nearly identical, only the return type and provider method change:
```typescript
ipcMain.handle(IPC.aiSuggestMessage, async (): Promise<string> => {
  const key = await getAiKey()
  const { ai } = await loadSettings()
  if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')

  const diff = await gitService.pendingDiff(requireRoot())
  if (!diff) return ''

  const provider = new OpenRouterProvider(key, ai.model)
  return provider.generateMessage(diff)
})
```
New handler returns `{ title: '', description: '' }` on empty diff (instead of `''`) and calls `provider.generateNamedVersion(diff)`. The `.md` filter is inside `pendingDiff`, so this handler needs no scope change. Keep `aiSuggestMessage` intact (additive, see Shared Patterns → Contract additivity).

---

### `src/shared/ipc.ts` (IPC contract, config)

**Analog:** `aiSuggestMessage: 'geode:ai-suggest-message'` channel (L61) + `AiApi.suggestMessage` (L322-323), same file.

**Channel table pattern** (L55-63) — add `aiSuggestVersion: 'geode:ai-suggest-version',` in the `ai*` block:
```typescript
aiSuggestMessage: 'geode:ai-suggest-message',
aiGenerateText: 'geode:ai-generate-text',
aiUsage: 'geode:ai-usage',
```

**AiApi method + result type pattern** (L313-328) — add the `NamedVersion` interface (exported, shared) and a `suggestVersion` method with a Spanish JSDoc, mirroring `suggestMessage`:
```typescript
export interface AiApi {
  ...
  /** Genera un mensaje de commit a partir del diff pendiente. '' si no hay cambios. */
  suggestMessage(): Promise<string>
  ...
}
```
Add: `export interface NamedVersion { title: string; description: string }` (near `AiUsage` L304-311) and `suggestVersion(): Promise<NamedVersion>` in `AiApi`.

---

### `src/preload/index.ts` (bridge, CommonJS)

**Analog:** `ai.suggestMessage` mapping (L74), same file.

**Bridge mapping pattern** (L67-78) — add one line in the `ai` block:
```typescript
ai: {
  ...
  suggestMessage: () => ipcRenderer.invoke(IPC.aiSuggestMessage),
  generateText: (instruction, selection, before) =>
    ipcRenderer.invoke(IPC.aiGenerateText, instruction, selection, before),
  ...
}
```
Add: `suggestVersion: () => ipcRenderer.invoke(IPC.aiSuggestVersion),`. **Note (CLAUDE.md constraint):** preload is CommonJS (`.cjs` output) — do not convert to ESM; keep the existing `contextBridge.exposeInMainWorld('geode', api)` shape (L87).

---

### `src/main/services/git.ts` (service, transform — diff scoping fix)

**Analog:** the `.md` filter idiom already used in `changedFiles` (L606), applied inside `pendingDiff` (L755-778).

**Filter idiom to copy** (L606) — the exact lowercase `.md` test to reuse:
```typescript
if (!filepath.toLowerCase().endsWith('.md')) return undefined
```

**Target site** (`pendingDiff` L755-757) — add the filter to the `changes` list ONLY here:
```typescript
async pendingDiff(dir: string): Promise<string> {
  const changes = await this.pendingChanges(dir)   // ← add .filter((c) => c.filepath.toLowerCase().endsWith('.md'))
  if (changes.length === 0) return ''
  ...
```

**CRITICAL constraint:** Do NOT filter `pendingChanges` (L848) or `changes()` (L746-748). `pendingChanges` is shared by `commit()` (stages files) and `changes()` (dialog count) — filtering it globally would stop the app versioning non-`.md` attachments. The bug is the AI diff scope only. (See Shared Patterns → Scope-split.)

---

### `src/renderer/src/CommitDialog.tsx` (component, rebuilt in place)

**Analog:** the file itself (L1-106) — rebuild per UI-SPEC. Keep the React hook + modal structure; change the fields, copy, IPC call, and error icon.

**Imports + hooks pattern to keep** (L1-3, 19-23):
```typescript
import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'   // both already imported
```
Props stay `{ changes, aiReady, onConfirm, onClose }` with explicit `JSX.Element` return. Add a second field state (`name` + `description` replacing single `message`).

**Auto-generate-on-open pattern to copy** (L25-41) — the new `generate` calls `window.geode.ai.suggestVersion()` and sets BOTH fields; the `useEffect(aiReady)` trigger is unchanged:
```typescript
const generate = useCallback(async () => {
  setGenerating(true)
  setError(null)
  try {
    const msg = await window.geode.ai.suggestMessage()   // → suggestVersion(): { title, description }
    setMessage(msg)                                       // → setName(title); setDescription(description)
  } catch (e) {
    setError(e instanceof Error ? e.message : 'No se pudo generar el mensaje')
  } finally {
    setGenerating(false)
  }
}, [])

useEffect(() => {
  if (aiReady) void generate()
}, [aiReady, generate])
```

**Modal skeleton + confirm pattern to keep** (L52-55, 43-50):
```typescript
<div className="modal-overlay" onClick={onClose}>
  <div className="modal" onClick={(e) => e.stopPropagation()}>
    <h2>Guardar versión</h2>
```
`confirm` composes the message per RESEARCH: `const message = [name.trim(), description.trim()].filter(Boolean).join('\n\n')` then `await onConfirm(message)`.

**Field/label pattern to copy** (L68-89) — the `field-label` + `link-btn` regenerate + `commit-message` textarea. Reuse for the Description field; add a top `text-input` (single-line, autofocus) for the Name field:
```typescript
<label className="field-label">
  Mensaje
  {aiReady && (
    <button className="link-btn" disabled={generating} onClick={() => void generate()}>
      <RefreshCw size={12} /> {generating ? 'generando…' : 'regenerar con IA'}
    </button>
  )}
</label>
<textarea className="commit-message" value={generating ? '' : message} ... rows={5} autoFocus />
```

**Error line — MUST change** (L91): replace the `⚠` glyph with a Lucide icon (CLAUDE.md forbids emojis/glyphs):
```typescript
{error && <p className="modal-error">⚠ {error}</p>}   // ← ⚠  →  <AlertTriangle size={13} />
```

**REMOVE** (do not carry forward): the file list `<ul className="change-list">` (L61-66) → replace with a single muted line from `changedSummary(names)`; the `<p className="modal-warn">…ledger…</p>` (L93-95) → remove entirely.

**Copy (verbatim from UI-SPEC):** title `Guardar versión`, sub `Ponle un nombre a este momento.`, Name label `Nombre` + placeholder `Dale un nombre a este momento (opcional)`, Description label `Descripción` + `regenerar con IA`, error `No se pudo generar la descripción`, CTA `Guardar versión` / `Guardando…`, secondary `Cancelar`.

---

### `src/renderer/src/time/labels.ts` (utility, pure transform)

**Analog:** `entryLabel` (L12-18) — the function itself; change one line.

**Current implementation** (L12-18):
```typescript
export function entryLabel(c: GitCommitNode, tags: GitTagRef[], now = Date.now()): string {
  const tag = tags.find((t) => t.oid === c.oid)
  if (tag) return tag.name
  const msg = c.message.trim()          // ← FIX: first non-empty line only, not whole message
  if (msg) return msg
  return relativeDate(c.timestamp, now)
}
```
Change the `msg` line to `c.message.split('\n').map((l) => l.trim()).find((l) => l.length > 0)` so only the title (first line) is returned; the tag-first and relative-date fallbacks stay. This is a no-op on existing one-line commits. `changedSummary` (L41-44) and `relativeDate` (L24-35) are unchanged — reuse as-is.

---

### `src/renderer/src/App.tsx` (component, wiring)

**Analog:** `openCommitDialog` (L527-535) + `doCommit` (L538-548) + dialog mount (L1207-1214), same file.

**Save-message fallback pattern to keep** (L538-541) — `doCommit` already falls back on empty message; the composed `title\n\ndescription` (empty-safe) flows straight in, no change needed to the fallback:
```typescript
const doCommit = useCallback(async (message: string) => {
  const fallback = `Versión ${new Date().toLocaleString()}`
  host.emit('note:beforeSave', { path: openPathRef.current })
  await window.geode.git.commit(message || fallback)
  ...
```

**"N notas cambiadas" count decision** (Open Question 1) — `openCommitDialog` (L529) sets `commitChanges` from `git.changes()` (ALL non-ignored files). Since the dialog now says "notas", filter to `.md` basenames here (renderer-side, low-risk) so the human summary is truthful and consistent with the AI diff scope:
```typescript
const changes = await window.geode.git.changes()   // ← filter to .md before passing to changedSummary
```

**Dialog mount pattern to keep** (L1207-1214) — props unchanged (`changes`, `aiReady`, `onConfirm={doCommit}`, `onClose`).

---

### `src/renderer/src/index.css` (config, styles)

**Analog:** existing modal blocks — `.modal-sub` (L1387), `.field-label` (L1393), `.commit-message` + `:focus` (L1418, L1434), `.modal-error` (L1463).

**Reuse (do not restyle, per UI-SPEC):** `.modal-overlay`, `.modal`, `.modal h2`, `.modal-sub`, `.field-label`, `.commit-message`, `.text-input`, `.link-btn`, `.modal-error`, `.modal-actions`, `button.primary`.

**Retire from THIS dialog (keep CSS definitions if used elsewhere, just stop rendering):** `.change-list` (L1404), `.modal-warn` (L1454).

**New spacing:** the gap between the two stacked fields MUST reuse the existing `.field-label` rhythm (`margin: 14px 0 6px`) — do not introduce a new spacing value. Likely zero new CSS needed if `.text-input` + `.field-label` are reused as-is.

---

## Shared Patterns

### AI IPC round-trip (main-only key, renderer consumes)
**Source:** `src/main/index.ts:312` (handler) + `src/preload/index.ts:74` (bridge) + `src/shared/ipc.ts:322` (contract)
**Apply to:** the new `suggestVersion` surface.
The OpenRouter key never leaves main (`getAiKey()` + `safeStorage`). Renderer calls `window.geode.ai.suggestVersion()`; main builds the diff and calls the provider. Same 3-layer wiring as `suggestMessage`: channel const → preload mapping → `ipcMain.handle`. Guard clause `if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')` is copied verbatim.

### Contract additivity (never break `aiSuggestMessage`)
**Source:** RESEARCH Pitfall 3.
**Apply to:** ipc.ts, preload, index.ts.
Add a NEW channel/method/handler rather than changing `suggestMessage(): Promise<string>` to return an object. Additive = zero blast radius on existing callers (`CommitDialog` is the only caller and switches to `suggestVersion`).

### Scope-split: commit stages all, AI sees only `.md`
**Source:** `git.ts` — `pendingChanges` (L848, shared by `commit()`/`changes()`) vs `pendingDiff` (L755, AI-only).
**Apply to:** the git.ts fix.
Filter `.md` in `pendingDiff` ONLY. `commit()` must keep versioning attachments; `changes()` count is filtered separately in the renderer (App.tsx), not in the shared main-side method.

### Spanish + Lucide + explicit types (project-wide)
**Source:** CLAUDE.md + every file above.
**Apply to:** all changes.
All user-facing strings and comments in Spanish; icons are Lucide (`size` prop, `currentColor`), never emojis or `⚠`; exported functions/methods/handlers need explicit return types (`Promise<NamedVersion>`, `JSX.Element`, `string`); `noUnusedLocals`/`noUnusedParameters` are on — remove any retired imports. Use `import type` for type-only imports.

### Pure, testable label helpers (DOM/IPC-free)
**Source:** `src/renderer/src/time/labels.ts` header (L3-6).
**Apply to:** the `entryLabel` first-line fix and the `changedSummary` reuse.
These are pure transforms; keep them side-effect-free so both `Timeline.tsx` and `App.tsx` call sites are covered by the single change.

---

## No Analog Found

None. Every change point has a direct in-repo analog (usually a sibling in the same file). This phase introduces no file, no new dependency, and no unfamiliar pattern.

---

## Metadata

**Analog search scope:** `src/main/services/` (ai.ts, git.ts), `src/main/index.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/` (CommitDialog.tsx, App.tsx, time/labels.ts, index.css).
**Files scanned:** 9 (all read directly, targeted ranges).
**Pattern extraction date:** 2026-07-04
