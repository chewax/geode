---
phase: 03-save-a-named-version
reviewed: 2026-07-04T00:00:00Z
depth: deep
files_reviewed: 7
files_reviewed_list:
  - src/main/services/ai.ts
  - src/main/index.ts
  - src/main/services/git.ts
  - src/preload/index.ts
  - src/shared/ipc.ts
  - src/renderer/src/time/labels.ts
  - src/renderer/src/CommitDialog.tsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** deep
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 3 adds a named-version save flow: a new `ai.suggestVersion` round-trip that returns a discriminated `{ title, description }`, an IPC handler mirroring `aiSuggestMessage`, a `.md`-scoped `pendingDiff`, a first-line-only `entryLabel`, and a reframed two-field `CommitDialog`.

The highest-risk item — the non-destructive-editing guarantee — is **clean**. The `.md` filter is correctly isolated to `pendingDiff` (`git.ts:757`); `pendingChanges` (`git.ts:851`), `changes()` (`git.ts:746`), and `commit()` (`git.ts:133-135`) all remain unfiltered, so non-`.md` attachments continue to be versioned. The AI parse (`parseNamedVersion`) degrades without throwing on empty/single-line/missing-blank-line/body-only input, and the empty-message save path is handled downstream via `doCommit`'s `message || fallback` (`App.tsx:539,541`). IPC contract additions are additive and type-consistent across `ipc.ts` → `ai.ts` → `main/index.ts` → `preload`. No emojis/glyphs remain (`AlertTriangle` replaces `⚠`), UI strings and comments are Spanish, and explicit return types are present.

No Critical issues. Two Warnings (a misleading change count and transient input clobbering) and two Info items (duplicated filter logic, uncapped title length).

## Warnings

### WR-01: "N notas cambiadas" can display "0 notas cambiadas" while a real save proceeds

**File:** `src/renderer/src/CommitDialog.tsx:29,67`
**Issue:** `noteNames` filters the incoming `changes` to `.md` only, and the summary line renders `changedSummary(noteNames)`. The dialog is opened whenever `changes.length > 0` (`App.tsx:530`, unfiltered). If a change set contains only non-`.md` attachments, the dialog shows **"0 notas cambiadas"** even though a valid version (including those attachments) will be committed. This contradicts the visible count and can make the user think nothing will be saved.
**Fix:** Fall back to a mixed/attachment-aware summary when there are non-note changes, e.g.:
```tsx
const noteNames = changes.filter((p) => p.toLowerCase().endsWith('.md'))
const summary =
  noteNames.length > 0
    ? changedSummary(noteNames)
    : `${changes.length} ${changes.length === 1 ? 'adjunto' : 'adjuntos'} cambiado(s)`
// ...
<p className="modal-sub">{summary}</p>
```

### WR-02: Auto-generate silently overwrites text the user typed in the Nombre/Descripción fields

**File:** `src/renderer/src/CommitDialog.tsx:31-48,70-76`
**Issue:** On mount, `aiReady` triggers `generate()` (`useEffect`, line 46-48), which after the network round-trip calls `setName(v.title)` / `setDescription(v.description)`. The Nombre input has `autoFocus` (line 75) and is *not* disabled while `generating` is true, so a user who starts typing a name during the AI call has it clobbered when the suggestion resolves. The same applies to the explicit "regenerar con IA" button after the user has edited the fields.
**Fix:** Only overwrite fields the user has not touched, e.g. track a `dirty` flag or skip auto-fill when the field is non-empty:
```tsx
const v = await window.geode.ai.suggestVersion()
setName((prev) => (prev.trim() ? prev : v.title))
setDescription((prev) => (prev.trim() ? prev : v.description))
```
For the explicit regenerate button, overwriting is acceptable (user intent), so gate this only on the mount-time auto-generate.

## Info

### IN-01: `.md` "what is a note" rule is duplicated across main and renderer

**File:** `src/renderer/src/CommitDialog.tsx:29` and `src/main/services/git.ts:757`
**Issue:** The magic string `'.md'` and the `toLowerCase().endsWith('.md')` predicate now live independently in both the renderer (for the change count) and the main process (for the AI diff scope). Two sources of truth for the same domain concept ("a note") will drift if the app later supports another note extension.
**Fix:** Extract a shared helper (e.g. `isNote(path: string): boolean` in a shared/util module) and use it on both sides.

### IN-02: Suggested title has no length cap despite the 60-80 char prompt contract

**File:** `src/main/services/ai.ts:72-82`
**Issue:** `parseNamedVersion` returns `title = toOneLine(lines[firstIdx])` verbatim. The prompt requests 60-80 characters, but a non-compliant model can return an arbitrarily long first line, which then becomes the commit title and the timeline label (`entryLabel`), potentially overflowing the UI.
**Fix:** Defensively clamp the title, e.g. `const title = toOneLine(lines[firstIdx]).slice(0, 120)` (or truncate with an ellipsis), so a misbehaving model cannot produce an unbounded label.

---

## Resolution (2026-07-04)

| Finding | Severity | Disposition | Rationale |
|---------|----------|-------------|-----------|
| WR-01 — "0 notas cambiadas" en guardados de solo-adjuntos | Warning | **Fixed** | `CommitDialog` ahora muestra "N archivos cambiados" cuando ninguna nota `.md` cambió, en vez de un "0 notas" engañoso. |
| WR-02 — la autogeneración pisa el texto tipeado durante la llamada de IA | Warning | **Fixed** | Los campos Nombre y Descripción quedan `disabled` mientras `generating`, con placeholder "Generando…"; no se puede perder input tipeado. |
| IN-01 — regla ".md = nota" duplicada (renderer + main) | Info | **Accepted** | Duplicación menor de una heurística de una línea; extraer un helper compartido cruza la frontera IPC sin beneficio proporcional. Diferido. |
| IN-02 — el título sugerido no tiene tope de longitud | Info | **Accepted** | El prompt pide 60-80 chars; un modelo no conforme es raro y el usuario ve/edita el título antes de guardar. Diferido. |

Verificado tras los fixes: `npm run typecheck` exit 0.

---

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
