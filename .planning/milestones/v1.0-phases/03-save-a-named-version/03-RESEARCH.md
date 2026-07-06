# Phase 3: Save a Named Version - Research

**Researched:** 2026-07-04
**Domain:** Electron IPC + React modal reframe + OpenRouter AI provider extension (title/description discrimination) + isomorphic-git diff scoping
**Confidence:** HIGH

## Summary

This phase is a **reframe of existing primitives, not greenfield**. Everything needed already exists in the codebase: a working commit path (`GitService.commit`), a working AI provider (`OpenRouterProvider`), a working save dialog (`CommitDialog.tsx`), and pure timeline label helpers (`time/labels.ts`). The work is four surgical, well-bounded changes: (1) extend the AI surface to return a **discriminated `{ title, description }`** instead of a one-line string; (2) reframe the `CommitDialog` UX per the UI-SPEC (two stacked fields, no git jargon, Lucide error icon); (3) fix a **diff-scoping bug** in `git.ts:pendingDiff` so the AI only sees `.md` note changes; (4) change `entryLabel` to return only the **first line (title)** of a message.

The single most important architectural constraint discovered: **the `.md` filter must be scoped to `pendingDiff` ONLY, never to `pendingChanges`.** `pendingChanges` is shared by `commit()` (which stages files) and `changes()` (which powers the dialog's change count). Filtering it globally would silently stop the app from versioning non-`.md` attachments. The bug is that the *AI diff* is unfiltered — the fix is a local filter in `pendingDiff`, leaving the commit path untouched.

**Primary recommendation:** Add one new AI provider method `generateNamedVersion(diff) → { title, description }` using a **model-agnostic text-parse format** (first non-empty line = title, remainder after blank line = description), add one new IPC channel `geode:ai-suggest-version`, scope `pendingDiff` to `.md`, trim `entryLabel` to first line, and rebuild `CommitDialog` per UI-SPEC. Do NOT use OpenRouter JSON-schema structured outputs — it is model-dependent and this app is BYOK/arbitrary-model.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Data model — title + description (with user override):**
- The human name is the **TITLE = first line of the commit message** — NOT a git tag. Reason: tags must be unique and cannot repeat; a message title can repeat and has no such restriction. (Corrects the initial `addTag` proposal.) `[CITED: 03-CONTEXT.md]`
- The description is the **BODY of the message** (lines after the first), AI-generated (SAVE-02). `[CITED: 03-CONTEXT.md]`
- The AI must **generate title AND description discriminated** in a single pass (short title on line 1 + description in the body), not a single one-line blob as today. Requires a new provider method/prompt (e.g. `generateNamedVersion(diff) → { title, description }`) or a parseable output format. `[CITED: 03-CONTEXT.md]`
- **`entryLabel` (timeline) must show only the FIRST LINE (title)** of the message, not the whole message. Today it returns `c.message.trim()` entire; adjust to first line. `[CITED: 03-CONTEXT.md]`
- The title is **optional and editable**: the AI proposes it, the user can overwrite or empty it. `[CITED: 03-CONTEXT.md]`

**AI diff bug fix:**
- **Confirmed bug:** `pendingDiff` (which feeds `ai.suggestMessage`) uses `pendingChanges`, which only filters `IGNORED_TOP` (`.git`/`.geode`/`node_modules`/`.obsidian`) and includes **all** changed files. The timeline (`changedFiles`, git.ts:606) *does* filter to `.md`. So the AI describes non-note file changes. `[CITED: 03-CONTEXT.md]`
- **Fix:** `pendingDiff` must **filter to `.md` notes** (consistent with `changedFiles`/`changedSummary`) so generation describes only note content. `[CITED: 03-CONTEXT.md]`

**Dialog UX — no git jargon:**
- Dialog title: **"Guardar versión"**, copy centered on "put a name to this moment". `[CITED: 03-CONTEXT.md]`
- Replace the commit-framed file list with a **human summary** "N notas cambiadas" (reuse `changedSummary`), not file paths. `[CITED: 03-CONTEXT.md]`
- **Remove** the "permanent version in history (ledger)" warning — it is technical jargon; saving must feel light. `[CITED: 03-CONTEXT.md]`
- Field order: **Name/title (optional, top, autofocus)** → editable AI description below. `[CITED: 03-CONTEXT.md]`

**AI + save behavior:**
- With AI ready when the dialog opens: **auto-generate** title + description (as it auto-generates the message today). `[CITED: 03-CONTEXT.md]`
- Generated title and description are **editable** by the user. `[CITED: 03-CONTEXT.md]`
- With AI disabled: title and description **empty**, save still proceeds (SAVE-02); user may type a title by hand. `[CITED: 03-CONTEXT.md]`
- **Allow saving with no name and no description** (AI off): the version is identified by relative date (the final `entryLabel` fallback). Nothing blocks saving. `[CITED: 03-CONTEXT.md]`

### Claude's Discretion

- Exact mechanism for title/description discrimination: new provider method returning `{ title, description }` **OR** a parseable output format. (This research recommends the new method + text-parse format — see Standard Stack / Architecture Patterns.)
- Whether to add a new IPC channel `geode:ai-suggest-version` vs. changing the return type of the existing `aiSuggestMessage`. (This research recommends a new channel — see Pitfall 3.)
- How the dialog computes the "N notas cambiadas" count (filter the `changes` prop to `.md`, or add a helper). See Open Question 1.

### Deferred Ideas (OUT OF SCOPE)

- Preserving "pretty" names with spaces via annotated tags — discarded (tags don't fit as a human name). `[CITED: 03-CONTEXT.md]`
- Automatic snapshots and their cadence — Phase 4. `[CITED: 03-CONTEXT.md]`
- Advanced-mode toggle revealing git jargon / file list — Phase 5. `[CITED: 03-CONTEXT.md]`
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAVE-01 | Saving a version prompts for an **optional human name** for that point | `CommitDialog` gains a top autofocus `text-input` name field (optional); the name becomes the first line of the commit message. `entryLabel` first-line change makes that name the timeline label. No blocking validation. |
| SAVE-02 | The version **description is AI-generated** from the changes, or **empty when AI is disabled** | New `generateNamedVersion(diff) → { title, description }` on `OpenRouterProvider`; `aiReady` gate already exists (`App.tsx:724`). AI-off path leaves both fields empty and still allows save. |
| SAVE-03 | Saving is presented as **naming a point in time, not a git commit** (no required message, no commit-framed file list) | UI-SPEC copywriting contract: title "Guardar versión", human "N notas cambiadas" summary via `changedSummary`, remove `change-list` + `modal-warn`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Discriminate title vs. description from a diff | API / Backend (`ai.ts` provider, main process) | — | AI key + model live in main; renderer never holds the key. Parsing the model output belongs next to the fetch. `[VERIFIED: src/main/index.ts:312-322]` |
| Scope the AI diff to `.md` notes | API / Backend (`git.ts:pendingDiff`) | — | Diff is built in main from the working tree; `pendingChanges`/`workBlobs` are private main-side methods. `[VERIFIED: src/main/services/git.ts:755]` |
| Two-field save form + auto-generate on open | Renderer (React `CommitDialog`) | API (via `window.geode.ai.*`) | Form state, autofocus, regenerate button are pure UI; generation is delegated over IPC. `[VERIFIED: src/renderer/src/CommitDialog.tsx]` |
| First-line timeline label | Renderer (pure helper `time/labels.ts`) | — | `entryLabel` is a pure, DOM-free transform consumed by `Timeline.tsx` and `App.tsx`. `[VERIFIED: src/renderer/src/time/labels.ts:12]` |
| Assemble `title + "\n\n" + description` into the commit | Renderer (`App.tsx:doCommit`) | API (`git.commit`) | `doCommit` already owns the message-building fallback; it composes the final message string and passes to `git.commit`. `[VERIFIED: src/renderer/src/App.tsx:538-548]` |

## Standard Stack

No new packages. This phase uses only what is already installed and imported.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lucide-react` | 1.23.0 | `RefreshCw` (regenerate) + `AlertTriangle`/`TriangleAlert` (error) icons | CLAUDE.md mandates Lucide, never emojis. Both icons are already imported in `CommitDialog.tsx:3`. `[VERIFIED: src/renderer/src/CommitDialog.tsx:3]` |
| `isomorphic-git` | 1.38.6 | `git.walk`/`readBlob` already used by `pendingDiff` | Existing engine; the fix is a filter line, no new API surface. `[VERIFIED: src/main/services/git.ts]` |
| `diff` (`createPatch`) | 9.0.0 | Unified patch text for the AI diff | Already used in `pendingDiff`. `[VERIFIED: src/main/services/git.ts:775]` |
| React 19 hooks | 19.2.7 | `useState`/`useEffect`/`useCallback` for dialog state | Existing dialog pattern. `[VERIFIED: src/renderer/src/CommitDialog.tsx:1]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Text-parse `{ title, description }` (first line = title, blank line, body) | OpenRouter JSON-schema structured outputs (`response_format: { type: 'json_schema', … }`) | Structured outputs are **model-dependent** — only "select models" support strict schema mode. This app is BYOK with an arbitrary user-chosen model, so a schema request can silently fail or 400 on unsupported models. Text-parse is model-agnostic and matches the existing `toOneLine` philosophy. `[CITED: openrouter.ai/docs/guides/features/structured-outputs]` |
| New IPC channel `geode:ai-suggest-version` | Change return type of existing `aiSuggestMessage` | Changing the existing channel's return type from `string` to an object is a breaking contract change touching preload + `AiApi` + any other caller. A new channel is additive and lower-risk (see Pitfall 3). |

**Installation:** none — zero new dependencies.

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. All work reuses already-installed, already-imported dependencies (`lucide-react`, `isomorphic-git`, `diff`, `react`). No registry lookups, no slopcheck needed.

## Architecture Patterns

### System Architecture Diagram (Save-a-Named-Version flow)

```
[User clicks "Guardar versión"]
          │
          ▼
  App.openCommitDialog() ──flushAll()──▶ persist open editors
          │
          ├─ window.geode.git.changes()  ─────────▶ [main] GitService.changes()
          │        (count of changed files)             └─ pendingChanges (ALL non-ignored)
          │
          ▼ (if >0 changes)
  <CommitDialog changes aiReady onConfirm onClose>
          │
   on open, if aiReady:
          │  window.geode.ai.suggestVersion() ────▶ [main] IPC geode:ai-suggest-version
          │                                              ├─ pendingDiff(dir)  ← FIX: filter .md
          │                                              │     └─ createPatch per changed .md note
          │                                              └─ OpenRouterProvider.generateNamedVersion(diff)
          │                                                    └─ chat() → parse → { title, description }
          │  ◀──────────────── { title, description } ───────────┘
          │
   user edits Name (title) + Description fields (both optional/editable)
          │
   on "Guardar versión":
          │  onConfirm(message = title + "\n\n" + description)  [empty-safe]
          ▼
  App.doCommit(message) ──▶ window.geode.git.commit(message || fallback)
          │                       └─ [main] GitService.commit(): stage ALL pendingChanges, git.commit
          ▼
  refreshGraph() ──▶ git.graph() ──▶ Timeline / preview label via entryLabel()
                                            └─ FIX: return first line (title) only
```

Note the split responsibility: the **commit stages all changed files** (attachments included), but the **AI diff sees only `.md`**. These are intentionally different scopes.

### Recommended change map (files touched — no new files)
```
src/main/services/ai.ts        # + generateNamedVersion(diff) + NAMED_VERSION_PROMPT + parse helper
src/main/services/git.ts       # pendingDiff(): add .md filter (scoped, NOT pendingChanges)
src/main/index.ts              # + ipcMain.handle(IPC.aiSuggestVersion, …)
src/shared/ipc.ts              # + aiSuggestVersion channel + AiApi.suggestVersion + result type
src/preload/index.ts           # + ai.suggestVersion mapping
src/renderer/src/CommitDialog.tsx  # rebuild: two fields, human summary, Lucide error, remove warn
src/renderer/src/time/labels.ts    # entryLabel(): first line only
src/renderer/src/App.tsx       # doCommit composes title+body; dialog changes count (see OQ1)
src/renderer/src/index.css     # (optional) styles for the second stacked field / retire .change-list/.modal-warn usage
```

### Pattern 1: Discriminated AI result via text-parse (model-agnostic)
**What:** Add a new provider method that prompts for "line 1 = short title, blank line, then description" and splits deterministically. Reuse the existing private `chat()` wrapper.
**When to use:** Always here — BYOK arbitrary models.
**Example:**
```typescript
// Source: pattern derived from existing OpenRouterProvider.generateMessage (src/main/services/ai.ts:79)
// [VERIFIED: src/main/services/ai.ts:79-89, 110-133]
export interface NamedVersion { title: string; description: string }

const NAMED_VERSION_PROMPT = `Sos un asistente que, en español, le pone nombre a una
versión guardada de notas personales a partir de un diff (formato unificado).

Devolvé EXACTAMENTE este formato:
- PRIMERA LÍNEA: un título corto (60-80 caracteres, sin comillas, sin prefijos tipo "feat:").
- Luego UNA LÍNEA EN BLANCO.
- Luego una descripción de 1-3 frases sobre el CONTENIDO y el TEMA de lo que cambió.

No inventes nada que no esté en el diff. No uses jerga de git.`

// Split: first non-empty line = title; everything after the first blank line = description.
function parseNamedVersion(raw: string): NamedVersion {
  const lines = raw.replace(/\r/g, '').split('\n')
  const firstIdx = lines.findIndex((l) => l.trim().length > 0)
  if (firstIdx === -1) return { title: '', description: '' }
  const title = toOneLine(lines[firstIdx]) // reutiliza el helper existente
  const rest = lines.slice(firstIdx + 1).join('\n').trim()
  return { title, description: rest }
}

async generateNamedVersion(diff: string): Promise<NamedVersion> {
  const raw = await this.chat(
    [ { role: 'system', content: NAMED_VERSION_PROMPT }, { role: 'user', content: diff } ],
    500, 0.2
  )
  return parseNamedVersion(raw)
}
```
The existing `toOneLine` helper (ai.ts:38) already strips bullets/quotes from the title — reuse it, do not duplicate.

### Pattern 2: Scoped `.md` filter in `pendingDiff` (NOT `pendingChanges`)
**What:** Filter changed files to `.md` inside `pendingDiff` only.
**Example:**
```typescript
// Source: existing pendingDiff loop (src/main/services/git.ts:755-778) [VERIFIED]
async pendingDiff(dir: string): Promise<string> {
  const changes = (await this.pendingChanges(dir))
    .filter((c) => c.filepath.toLowerCase().endsWith('.md')) // FIX: solo notas
  if (changes.length === 0) return ''
  // … resto idéntico …
}
```
This mirrors the exact `.md` test used in `changedFiles` (`git.ts:606`: `filepath.toLowerCase().endsWith('.md')`). **Do not** add the filter to `pendingChanges` (git.ts:848) — see Anti-Patterns.

### Pattern 3: `entryLabel` first-line trim
```typescript
// Source: src/renderer/src/time/labels.ts:12 [VERIFIED]
export function entryLabel(c: GitCommitNode, tags: GitTagRef[], now = Date.now()): string {
  const tag = tags.find((t) => t.oid === c.oid)
  if (tag) return tag.name
  const firstLine = c.message.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  if (firstLine) return firstLine  // solo el título, no el cuerpo
  return relativeDate(c.timestamp, now)
}
```

### Anti-Patterns to Avoid
- **Filtering `pendingChanges` to `.md`:** would stop `commit()` from versioning non-`.md` attachments and would change the dialog's file count. The bug is the AI diff scope, not the commit scope. Filter in `pendingDiff` only. `[VERIFIED: pendingChanges shared by commit() git.ts:134 and changes() git.ts:747]`
- **Reusing/mutating the `aiSuggestMessage` channel's return type:** breaks the existing `string` contract and any current caller (`generateText` path is separate but the writing assistant, `bringBack`/safety snapshots must never trigger AI — keep surfaces distinct). Add a new channel.
- **Emoji or `⚠` glyph in the error line:** the current `CommitDialog.tsx:91` uses a literal `⚠` — UI-SPEC mandates replacing it with a Lucide `AlertTriangle`/`TriangleAlert`. Emojis are forbidden by CLAUDE.md.
- **English UI strings or comments:** all user-facing text and comments in Spanish (CLAUDE.md). Use the UI-SPEC copywriting table verbatim.
- **Blocking save on empty fields:** saving with empty title AND description is explicitly allowed; the primary CTA is disabled only while AI is actively generating.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Turning model text into title vs body | A regex-heavy multi-format parser or JSON-schema request | First-non-empty-line + first-blank-line split, reusing `toOneLine` | Deterministic, model-agnostic, already-proven helper. `[VERIFIED: ai.ts:38]` |
| Relative-date fallback for unnamed versions | New date formatter | Existing `relativeDate` via `entryLabel` fallback chain | Already localized (Spanish, singular/plural). `[VERIFIED: labels.ts:24]` |
| "N notas cambiadas" text | Ad-hoc pluralization | `changedSummary(names)` | Already handles singular/plural in Spanish. `[VERIFIED: labels.ts:41]` |
| Racy-safe change detection for the count | statusMatrix or new diff logic | Existing `pendingChanges` (content-hash vs HEAD) | CLAUDE.md racy-git landmine: never revert to statusMatrix. `[VERIFIED: git.ts:848-860]` |
| Commit staging | Manual add/remove in renderer | `git.commit(message)` | Already stages pendingChanges and handles detached-HEAD branching. `[VERIFIED: git.ts:133-153]` |

**Key insight:** Every hard part of this phase already has a tested implementation. The net-new code is one prompt + one ~6-line parse function + one filter line + one label trim + a UI re-layout.

## Runtime State Inventory

Not a rename/refactor/migration phase — this is a UX reframe + one bug fix + one AI method. No stored data keys, service configs, OS registrations, secrets, or build artifacts change identity.

- **Stored data:** None — commit messages are free-form and always have been; multi-line bodies are valid git and need no migration. Existing one-line commits keep working (`entryLabel` first-line trim is a no-op on them). Verified by inspecting `git.commit` (git.ts:152) and `entryLabel` (labels.ts:12).
- **Live service config:** None.
- **OS-registered state:** None.
- **Secrets/env vars:** None — the OpenRouter key (via `safeStorage`) and model are read unchanged by the new handler; no key/name changes. Verified in `src/main/index.ts:312-322`.
- **Build artifacts:** None.

## Common Pitfalls

### Pitfall 1: Filtering the wrong function scope
**What goes wrong:** Adding the `.md` filter to `pendingChanges` (or `changes()`) instead of `pendingDiff`.
**Why it happens:** They sit next to each other and share the same shape; the CONTEXT bug description names `pendingChanges` as the *source* of the leak.
**How to avoid:** The filter belongs ONLY in `pendingDiff` (git.ts:755). `pendingChanges` (git.ts:848) is used by `commit()` and `changes()`, which must still see attachments.
**Warning signs:** After the change, saving a version no longer versions a changed image/attachment; the dialog's change count drops.

### Pitfall 2: Description leaks into the timeline label
**What goes wrong:** Timeline shows the full multi-line message once descriptions exist.
**Why it happens:** `entryLabel` currently returns `c.message.trim()` whole (labels.ts:16), and `Timeline.tsx:118` + `App.tsx:971` both consume it.
**How to avoid:** Land the `entryLabel` first-line trim **before or in the same change** that introduces multi-line messages. Both call sites are covered by the single helper fix.
**Warning signs:** A timeline entry wraps to multiple lines or shows body prose.

### Pitfall 3: Breaking the existing `aiSuggestMessage` contract
**What goes wrong:** Renderer/preload type mismatch after changing `suggestMessage(): Promise<string>`.
**Why it happens:** `AiApi.suggestMessage` (ipc.ts:323) returns `string`; preload maps it (index.ts:74); changing it ripples.
**How to avoid:** Add a **new** channel `aiSuggestVersion: 'geode:ai-suggest-version'`, a new `AiApi.suggestVersion(): Promise<NamedVersion>`, a new preload mapping, and a new handler. Leave `aiSuggestMessage` intact (harmless if unused, or remove only after confirming no other caller).
**Warning signs:** TS build fails on `AiApi` shape, or `window.geode.ai.suggestMessage()` returns an object at runtime.

### Pitfall 4: Model ignores the format
**What goes wrong:** Model returns only a title, or a JSON blob, or no blank line.
**Why it happens:** Free-form BYOK models vary.
**How to avoid:** `parseNamedVersion` degrades gracefully — first non-empty line is always the title, remainder (possibly empty) is the description. Empty description is allowed by design. No throw.
**Warning signs:** Description field empty when it shouldn't be (acceptable; user edits) — never a crash.

### Pitfall 5: `noUnusedLocals` / explicit return types
**What goes wrong:** TS strict build fails (`noUnusedLocals`, `noUnusedParameters`, missing explicit return types on exported fns).
**How to avoid:** New exported functions/methods (`generateNamedVersion`, `parseNamedVersion`, IPC handler) need explicit return types; remove any retired imports (e.g. if `change-list`/`AlertTriangle`-for-warn usage changes). `AlertTriangle` stays (now used for the error line).
**Warning signs:** `npm run build` / `tsc` errors.

## Code Examples

### New IPC channel + contract
```typescript
// src/shared/ipc.ts — channel table (near line 61) [VERIFIED shape: existing entries]
aiSuggestVersion: 'geode:ai-suggest-version',

// src/shared/ipc.ts — result type + AiApi (near line 313)
export interface NamedVersion { title: string; description: string }
// in AiApi:
/** Genera título + descripción discriminados del diff pendiente (solo notas .md). */
suggestVersion(): Promise<NamedVersion>
```
```typescript
// src/preload/index.ts — ai block (near line 74) [VERIFIED pattern]
suggestVersion: () => ipcRenderer.invoke(IPC.aiSuggestVersion),
```
```typescript
// src/main/index.ts — new handler (near line 312, mirrors aiSuggestMessage) [VERIFIED pattern]
ipcMain.handle(IPC.aiSuggestVersion, async (): Promise<NamedVersion> => {
  const key = await getAiKey()
  const { ai } = await loadSettings()
  if (!key || !ai?.model) throw new Error('Configurá la API key y el modelo de IA en Ajustes')
  const diff = await gitService.pendingDiff(requireRoot())   // ya filtrado a .md
  if (!diff) return { title: '', description: '' }
  return new OpenRouterProvider(key, ai.model).generateNamedVersion(diff)
})
```

### Dialog result composition (renderer)
```typescript
// CommitDialog onConfirm — compose message from the two fields
const title = name.trim()
const body = description.trim()
const message = [title, body].filter(Boolean).join('\n\n') // title\n\ndescription, empty-safe
await onConfirm(message) // App.doCommit applies its own relative-date fallback if empty
```
`App.doCommit` (App.tsx:538) already falls back when `message` is empty (`message || fallback`), and `entryLabel`'s date fallback covers the label — so an empty message stays valid end to end.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One-line AI commit message (`generateMessage` + `toOneLine`) | Discriminated `{ title, description }` via `generateNamedVersion` | This phase | Save reads as "name a moment", timeline label = title, hover/detail = description body |
| Commit-framed file list + ledger warning in dialog | Human "N notas cambiadas" summary, no warning | This phase | Removes git jargon (SAVE-03) |
| `entryLabel` returns whole message | Returns first line only | This phase | Multi-line messages don't leak into labels |

**Deprecated/outdated in this phase:**
- `change-list` CSS usage and `modal-warn` in `CommitDialog` — retired (UI-SPEC "Classes being retired"). Keep the CSS definitions if used elsewhere; only stop rendering them here.
- The `⚠` glyph — replaced by Lucide `AlertTriangle`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenRouter JSON-schema structured outputs are model-dependent and unsafe for this app's BYOK/arbitrary-model setup, so text-parsing is preferred | Standard Stack / Alternatives | LOW — even if some models support schema mode, the text-parse approach still works universally; this only affects which mechanism we pick, and CONTEXT already lists parseable-format as an accepted option. |
| A2 | No other caller depends on `aiSuggestMessage` besides `CommitDialog` | Pitfalls 3 | LOW — grep shows only `CommitDialog.tsx:29` + preload mapping; adding a new channel sidesteps the risk entirely regardless. |

## Open Questions

1. **How does the reframed dialog count "N notas cambiadas"?**
   - What we know: `changedSummary(names)` counts `names.length`; the dialog's `changes` prop currently comes from `git.changes()` = ALL non-ignored files (may include non-`.md`). `changedSummary` says "notas", so counting non-notes would be inaccurate.
   - What's unclear: whether to (a) filter the `changes` prop to `.md` basenames in `App.openCommitDialog` before passing, or (b) pass raw and accept the count includes attachments.
   - Recommendation: filter to `.md` basenames in `App.tsx` (or a tiny helper) so the human summary is truthful — consistent with the `.md` scoping applied to the AI diff. This is renderer-side and low-risk. Flag for planner to make an explicit task decision.

2. **Keep or remove `aiSuggestMessage`?**
   - What we know: only `CommitDialog` calls it; it will be replaced by `suggestVersion`.
   - Recommendation: leave it in place for this phase (additive, zero risk) OR remove it plus its preload/handler in the same change if the planner wants no dead code (watch `noUnusedLocals`). Either is acceptable; removing is cleaner but slightly wider blast radius.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenRouter API (network) | AI description generation (SAVE-02) | Runtime/user-provided (BYOK) | — | `aiReady=false` path: both fields empty, save still proceeds (by design) |
| `lucide-react` | Error/regenerate icons | ✓ (installed) | 1.23.0 | — |
| `isomorphic-git`, `diff` | Diff scoping | ✓ (installed) | 1.38.6 / 9.0.0 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** OpenRouter connectivity/key — the AI-off path is a first-class, designed fallback (empty fields, manual entry, save allowed).

## Validation Architecture

**No automated test harness exists in this repo** (zero test config, zero test files — confirmed via CLAUDE.md "No explicit linter configured" and STATE.md "Zero automated test coverage"). Phases 1–2 validated via **typecheck/build gates + manual UAT**; Phase 3 mirrors that.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (no jest/vitest/pytest present) |
| Config file | none |
| Quick run command | `npx tsc -p tsconfig.web.json --noEmit && npx tsc -p tsconfig.node.json --noEmit` (typecheck both sides) |
| Full suite command | `npm run build` (electron-vite build = main + preload + renderer, the closest thing to a full gate) |

> Verify the exact scripts against `package.json` at plan time; use whatever `build`/typecheck scripts Phases 1–2 used. The pure helpers (`parseNamedVersion`, `entryLabel`) are DOM/IPC-free and *could* host the repo's first unit tests, but introducing a test runner is **out of scope** for this phase (not requested; mirror prior phases).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | Manual UAT |
|--------|----------|-----------|-------------------|------------|
| SAVE-01 | Optional name field, top, autofocus; empty allowed; name becomes timeline label | typecheck + manual | typecheck passes | Open dialog → name field focused; type name → save → timeline entry shows that name. Save with empty name → entry shows relative date. |
| SAVE-02 | AI generates title+description; empty when AI off; still saveable | typecheck + manual | typecheck passes | AI on: open dialog → both fields auto-populate, editable, "regenerar con IA" works. AI off: both empty, CTA enabled, save works. |
| SAVE-03 | No git jargon: "Guardar versión", "N notas cambiadas", no file list, no ledger warning, Lucide error icon | typecheck + manual | typecheck passes | Inspect dialog: no paths, no `⚠`, no "ledger" text, summary reads "N notas cambiadas". |
| (bug) | AI diff scoped to `.md` | manual | — | Change a `.md` note AND a non-`.md` file, open dialog with AI on → generated description references only the note content. |
| (label) | Timeline shows only the title line | manual | — | Save a version with a multi-line description → timeline entry shows only the first line. |

### Sampling Rate
- **Per task commit:** typecheck both tsconfigs (`--noEmit`).
- **Per plan/wave:** `npm run build` green.
- **Phase gate:** full build green + manual UAT script (above) signed off, mirroring Phase 1–2 verification style.

### Wave 0 Gaps
- None — no test infrastructure to stand up (intentionally, matching prior phases). If the planner wants belt-and-suspenders coverage for the two pure helpers, that is optional and additive, not a gate.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (from `.planning/config.json`). This phase adds one AI-generation IPC path and one string-composition path — no auth, no new persistence, no new external write surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface changed. |
| V3 Session Management | no | N/A. |
| V4 Access Control | no | IPC surface remains whitelisted `window.geode` only; no new privilege. |
| V5 Input Validation | yes | The AI-returned title/description are rendered as React text (auto-escaped) and stored as a git commit message (plain text, not executed). Model output must NOT be passed to `dangerouslySetInnerHTML` or any HTML sink. The diff sent to OpenRouter is note content the user already owns. |
| V6 Cryptography | no | OpenRouter key handling is unchanged (`safeStorage`, main-only); this phase never touches the key beyond the existing read. |
| V7 Error Handling / Logging | yes | Generation errors surface in `modal-error` (Spanish, no stack traces to UI); do not log the API key. Existing pattern in ai.ts already avoids key logging. |

### Known Threat Patterns for Electron + OpenRouter

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Model output rendered as HTML (stored-XSS via commit message/description) | Tampering / EoP | Render as React text nodes only (default escaping); never `dangerouslySetInnerHTML`. `[VERIFIED: dompurify used only for markdown preview, not for dialog fields]` |
| API key leak to renderer or logs | Information Disclosure | Key stays in main via `safeStorage`; renderer calls `window.geode.ai.suggestVersion()` and never sees the key. Unchanged by this phase. `[VERIFIED: src/main/index.ts:312-322]` |
| Path traversal via commit staging | Tampering | `commit()`/`pendingChanges` operate on `workBlobs` which is `IGNORED_TOP`-filtered and vault-scoped (`resolveInside`). Unchanged. `[VERIFIED: git.ts]` |
| Prompt injection from note content altering title/description | Tampering | Low impact: output is a non-executed label/description shown to the same user who wrote the notes; no downstream code trusts it. Accept. |

## Sources

### Primary (HIGH confidence)
- `src/main/services/ai.ts` (OpenRouterProvider, SYSTEM_PROMPT, toOneLine, chat) — the AI surface to extend.
- `src/main/services/git.ts` (pendingDiff L755, pendingChanges L848, changedFiles L593, commit L133, IGNORED_TOP L12) — diff/commit internals.
- `src/main/index.ts` (aiSuggestMessage handler L312) — IPC handler pattern.
- `src/shared/ipc.ts` (IPC channel table L25-68, AiApi L313) — contract shape.
- `src/preload/index.ts` (ai block L67-78) — preload mapping pattern.
- `src/renderer/src/CommitDialog.tsx` — dialog to rebuild.
- `src/renderer/src/time/labels.ts` (entryLabel L12, changedSummary L41, relativeDate L24) — label helpers.
- `src/renderer/src/App.tsx` (openCommitDialog L527, doCommit L538, aiReady L724, dialog mount L1207) — wiring.
- `src/renderer/src/Timeline.tsx` (entryLabel/changedFiles/changedSummary usage L46/L118/L121) — label consumers.
- `.planning/phases/03-save-a-named-version/03-CONTEXT.md`, `03-UI-SPEC.md`, `.planning/REQUIREMENTS.md`, `.planning/config.json`, `CLAUDE.md`.

### Secondary (MEDIUM confidence)
- OpenRouter Structured Outputs docs — confirms schema mode is model-dependent (basis for recommending text-parse). [openrouter.ai/docs/guides/features/structured-outputs](https://openrouter.ai/docs/guides/features/structured-outputs)

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all APIs verified in-repo.
- Architecture: HIGH — every change point read directly from source with line numbers.
- Pitfalls: HIGH — the scope-filter and contract-break pitfalls are grounded in the actual shared-function usage.
- AI mechanism: MEDIUM-HIGH — text-parse is verified feasible; the "avoid structured outputs" rationale is cited but the model-support boundary can shift.

**Research date:** 2026-07-04
**Valid until:** 2026-08-04 (stable — in-repo primitives; only the OpenRouter external API could drift, and the chosen approach avoids its variable surface)
