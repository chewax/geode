---
phase: 03-save-a-named-version
verified: 2026-07-04T00:00:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
---

# Phase 3: Save a Named Version — Verification Report

**Phase Goal:** Saving a version is framed as naming a point in time rather than making a git commit, with the description written by AI.
**Verified:** 2026-07-04
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Saving prompts for an OPTIONAL human name (no required message) | ✓ VERIFIED | `CommitDialog.tsx:74-84` — autofocused "Nombre" input, placeholder "…(opcional)", no `required`; `confirm()` (l.55-60) joins `name`+`description` with `filter(Boolean)` so both may be empty; `App.tsx doCommit` (l.538-541) supplies `Versión <fecha>` fallback when message is empty → save always proceeds |
| 2 | Description is AI-generated from the changes, or empty when AI is disabled | ✓ VERIFIED | `CommitDialog.tsx:51-53` auto-generates on open only when `aiReady`; `ai.ts generateNamedVersion` (l.140-150) returns discriminated `{title,description}`; main handler `aiSuggestVersion` (index.ts:331-341) returns `{title:'',description:''}` when no diff and throws only if invoked without key; when AI off, dialog leaves fields empty and Save still works |
| 3 | Default save flow shows no git vocabulary / no commit-framed file list; entered names become timeline labels | ✓ VERIFIED | `CommitDialog.tsx` title "Guardar versión", sub "Ponle un nombre a este momento", human summary "N notas cambiadas" via `changedSummary` (l.30-34) — no path list, no "permanente/ledger" warning, Lucide `AlertTriangle` used only for errors (no ⚠ glyph); `labels.ts entryLabel` (l.12-22) returns first non-empty line of message (the title) with tag→message→relativeDate fallback; empty name → relative date |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/renderer/src/CommitDialog.tsx` | Optional autofocused name field, AI description, human framing | ✓ VERIFIED | 124 lines; name+description state, autoFocus, no required, human summary |
| `src/renderer/src/time/labels.ts` | `entryLabel` first-line-of-message with tag→message→date fallback | ✓ VERIFIED | l.12-22 exact fallback chain, title-only (firstLine), never a hash |
| `src/main/services/ai.ts` | `generateNamedVersion` → discriminated `{title,description}` | ✓ VERIFIED | l.140-150 + `parseNamedVersion` l.78-93; degrades to empty fields without throwing |
| `src/main/services/git.ts` | `.md`-scoped diff for AI, unfiltered commit path | ✓ VERIFIED | `pendingDiff` l.755-783 filters `.md`; `pendingChanges` l.853-865, `changes` l.746-748, `commit` l.133-153 all UNFILTERED |
| `src/shared/ipc.ts` | `NamedVersion` type + `suggestVersion` channel/method | ✓ VERIFIED | `NamedVersion` l.309-314; `aiSuggestVersion` channel l.62; `AiApi.suggestVersion` l.337 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| CommitDialog | ai.suggestVersion | `window.geode.ai.suggestVersion()` | ✓ WIRED | CommitDialog.tsx:40 → preload:75 → IPC → index.ts:331 → ai.generateNamedVersion |
| App | CommitDialog | `<CommitDialog changes aiReady onConfirm={doCommit}/>` | ✓ WIRED | App.tsx:1207-1214; `changes` from `git.changes()` (l.529), `aiReady` computed l.724 |
| CommitDialog confirm | git.commit | `onConfirm(message)` → `doCommit` → `git.commit` | ✓ WIRED | App.tsx:538-541, empty→fallback message |
| Timeline/App | entryLabel | `entryLabel(c, graph.tags)` | ✓ WIRED | Timeline.tsx:118, App.tsx:971 — title becomes human label |
| index.ts aiSuggestVersion | git.pendingDiff | `.md`-scoped diff | ✓ WIRED | index.ts:337 comment confirms scope; git.ts:755-759 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| CommitDialog name/description | `name`,`description` | `ai.suggestVersion()` → OpenRouter diff of real `.md` changes | Yes (live model call on real pendingDiff) | ✓ FLOWING |
| Timeline label | `entryLabel(...)` | real commit message / tag / timestamp | Yes | ✓ FLOWING |
| Dialog summary | `changes` prop | `git.changes()` (real pendingChanges) | Yes | ✓ FLOWING |

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| SAVE-01 | REQUIREMENTS.md:47 | Optional human name for the point | ✓ SATISFIED | Optional autofocused "Nombre" field; save never blocked on it |
| SAVE-02 | REQUIREMENTS.md:48 | AI description from changes, empty when AI off | ✓ SATISFIED | `generateNamedVersion` via `aiSuggestVersion`; empty fields when disabled |
| SAVE-03 | REQUIREMENTS.md:49 | Named-point framing, no git commit vocab / file list | ✓ SATISFIED | Human copy + "N notas cambiadas", no required message, no path list |

### Non-Destructive Invariant Check (Core Value)

| Check | Status | Evidence |
| --- | --- | --- |
| `pendingChanges` unfiltered (all files) | ✓ | git.ts:853-865 compares all work vs head blobs |
| `changes()` unfiltered | ✓ | git.ts:746-748 maps every pending change |
| `commit()` versions all files incl. attachments | ✓ | git.ts:133-153 stages every `pendingChanges` entry |
| `workBlobs` walks all files, not just `.md` | ✓ | git.ts:904-922 |
| `.md` filter isolated to AI diff only | ✓ | git.ts:755-759 (`pendingDiff` only) |

Non-destructive editing is preserved: the `.md` scoping applies solely to what the AI sees, never to what is committed. Attachments remain versioned.

### Additive-Contract Check

| Check | Status | Evidence |
| --- | --- | --- |
| `aiSuggestMessage` still returns `Promise<string>` | ✓ | ipc.ts:335, index.ts:319-329, ai.ts:124-134 unchanged |
| `suggestVersion` added, not replacing `suggestMessage` | ✓ | Both present in `AiApi` (l.335, 337) and preload (l.74, 75) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| CommitDialog.tsx | 34 | User-visible "archivo cambiado" fallback | ℹ️ Info | Only shown when ONLY attachments (no notes) changed; "archivo"=Spanish "file", not git jargon (commit/diff/blob); acceptable edge-case copy |

No TBD/FIXME/XXX debt markers. No stubs (all data flows). Lucide-only icons; UI strings in Spanish per conventions.

### Human Verification Required

None outstanding. Per milestone policy (typecheck + build + manual UAT), the human UAT sign-off for §1–§7 is already recorded as "approved" in `03-03-SUMMARY.md`; `npm run typecheck` and `npm run build` exit 0; `03-REVIEW.md` reports 0 Critical.

### Gaps Summary

None. All three success criteria are observably achieved in the codebase, all requirements (SAVE-01/02/03) map to concrete wired code, the non-destructive core-value invariant is preserved (AI `.md` scoping isolated to `pendingDiff`), and the `aiSuggestMessage` string contract was extended additively.

---

_Verified: 2026-07-04_
_Verifier: Claude (gsd-verifier)_
