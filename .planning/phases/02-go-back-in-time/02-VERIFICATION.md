---
phase: 02-go-back-in-time
verified: 2026-07-04T20:26:36Z
status: passed
score: 13/13 requirements verified (5/5 success criteria)
overrides_applied: 0
re_verification:
  # No prior VERIFICATION.md existed — this is the initial verification.
  # (field retained empty intentionally; initial mode)
gaps: []
deferred: []
---

# Phase 2: Go Back in Time — Verification Report

**Phase Goal:** Users can rewind the entire vault to any past version as a read-only preview and either return to the present or bring that moment back — linearly, with nothing lost.
**Verified:** 2026-07-04T20:26:36Z
**Status:** PASSED
**Mode:** mvp (goal is a capability statement, not strict `As a…, I want…, so that…` — verified against the 5 ROADMAP success criteria + the 13 in-scope requirements, per the standard per-requirement contract requested)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | Repo-level timeline section below Notes, available with no note open, human labels only + what changed | ✓ VERIFIED | `App.tsx:1000` `<SidebarSection id="timeline" title="LÍNEA DE TIEMPO">` placed after the `notas` section; `Timeline.tsx` renders from `git.graph()` (repo-level, not per-note); labels via `entryLabel` (tag→message→relativeDate, never hash) `labels.ts:12`; "qué cambió" via lazy `git.changedFiles` + `changedSummary` `Timeline.tsx:46,120` |
| 2 | Transport drives whole-app read-only preview with unmistakable "past" chrome; previewed + present entries each persistently marked | ✓ VERIFIED | `previewOid` switch drives tree (`refreshTree`→`git.treeAt` `App.tsx:184-189`), tabs/editor (`EditorPane` `previewOid`), and read-only editor `readOnly={props.previewOid != null}` `EditorPane.tsx:319`; `TimeTravelBanner` "Estás viendo el pasado" `App.tsx:962`; `main.past` tint class `App.tsx:1037`; chips `presente` + `viendo` rendered simultaneously `Timeline.tsx:135-136`; transport `stepPreview`/`onJumpToPresent` `Timeline.tsx:79-106` |
| 3 | Ghost tab when open note didn't exist at previewed version | ✓ VERIFIED | `git.readNoteAt` throws when blob absent → `setGhost(true)` `EditorPane.tsx:132-135`; ghost placeholder "Esta nota no existía todavía / …aún no había sido creada" `EditorPane.tsx:301-308`; tab gets `ghost` class `EditorPane.tsx:239` |
| 4 | Jumping to present restores full prior state incl. previously-open note | ✓ VERIFIED | `enterPreview` snapshots `{panes, activePaneId}` into `layoutSnapshotRef` `App.tsx:200-203`; `exitPreview`→`restoreLayoutSnapshot()` restores exact layout `App.tsx:209-222`; `bringBack` also restores it `App.tsx:513` |
| 5 | "Volver aquí" brings previewed version back as working state, HEAD not moved, no branch/detached-HEAD, editing re-enabled | ✓ VERIFIED | `bringBack` → `git.restoreTree(oid)` "sólo working-dir; HEAD intacto" `App.tsx:511`; `restoreTree` writes/deletes working files only, no `git.checkout`, no ref/index mutation `git.ts:631-647`; safety snapshot when dirty `App.tsx:506-510`; `setPreviewOid(null)` re-enables editing; git evidence in §D/§E below |

**Score:** 5/5 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/main/services/git.ts` `treeAt` | Whole-vault tree at a commit (vault.tree() shape) | ✓ VERIFIED | `git.ts:535-544`, filters IGNORED_TOP + non-.md, reuses private `treeBlobs`; substantive (`buildTree`) |
| `src/main/services/git.ts` `restoreTree` | Materialize commit tree to working dir, HEAD untouched, no checkout | ✓ VERIFIED | `git.ts:631-647`; atomic writes + `rm` of files absent in target; delete-set from racy-safe `workBlobs`; explicitly "NO usa git.checkout()" |
| `src/main/services/git.ts` `changedFiles` | Human "what changed" per entry (commit-vs-parent, .md basenames) | ✓ VERIFIED | `git.ts:593-619`; git.walk parent-diff, returns basenames sans .md |
| `src/shared/ipc.ts` | Typed channels + GitApi surface | ✓ VERIFIED | channels `geode:git-tree-at/-restore-tree/-changed-files` `ipc.ts:45-47`; GitApi `treeAt/restoreTree/changedFiles` `ipc.ts:231-235` |
| `src/preload/index.ts` | Preload bridge for the 3 methods | ✓ VERIFIED | `preload/index.ts:54-56` |
| `src/main/index.ts` | ipcMain handlers | ✓ VERIFIED | `main/index.ts:275-278` |
| `src/renderer/src/Timeline.tsx` | Repo-level timeline UI, transport, markers | ✓ VERIFIED | full component, git.graph()-sourced, no hashes |
| `src/renderer/src/TimeTravelBanner.tsx` | "Estás viendo el pasado" chrome + actions | ✓ VERIFIED | full component, Lucide icons |
| `src/renderer/src/time/labels.ts` | Pure label/date/summary helpers | ✓ VERIFIED | `entryLabel`/`relativeDate`/`changedSummary`, no hash path |
| `src/renderer/src/editor/CodeMirrorEditor.tsx` `readOnly` | Hot-swappable read-only during preview | ✓ VERIFIED | Compartment reconfigure: `EditorState.readOnly` + `EditorView.editable` `CodeMirrorEditor.tsx:134-136,180-182` |
| `src/renderer/src/App.tsx` orchestration | `previewOid` switch, enter/exit/bringBack, Timeline + banner | ✓ VERIFIED | `previewOid` state `App.tsx:104`; `enterPreview/exitPreview/stepPreview/selectPreview/bringBack` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Timeline UI | preview state | `onSelect=selectPreview`, `onStep=stepPreview`, `onJumpToPresent=exitPreview` | ✓ WIRED | `App.tsx:1005-1007` — timeline drives preview, NOT checkout |
| `enterPreview` | tree source | `refreshTree(oid)`→`git.treeAt(oid)` | ✓ WIRED | `App.tsx:186,205` |
| `EditorPane` | file content | `previewOid ? git.readNoteAt : vault.readNote` | ✓ WIRED | `EditorPane.tsx:124-126` |
| `bringBack` | working dir | `git.restoreTree(oid)` (HEAD intact) | ✓ WIRED | `App.tsx:511` |
| `bringBack` | safety snapshot | `git.changes()` dirty → `git.commit('Instantánea de seguridad…')` (no-AI, explicit msg) | ✓ WIRED | `App.tsx:506-510` |
| `goToVersion` (checkout) | — | `git.checkout(oid)` | ✓ ISOLATED | Only wired to `VersionGraph` (`App.tsx:1064`, behind `graphOpen` modal) and `BranchSwitcher` (`App.tsx:1101`) — pre-existing Advanced/graph surfaces; NOT reachable from the Timeline/preview/bringBack paths |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Timeline list | `graph.commits` | `git.graph()` (all-branch commit log) | Yes — real repo history | ✓ FLOWING |
| Timeline "what changed" | `changedCache[oid]` | `git.changedFiles(oid)` → git.walk parent diff | Yes — real per-commit diff | ✓ FLOWING |
| Preview tree | `tree` | `git.treeAt(previewOid)` → `treeBlobs` | Yes — real commit tree | ✓ FLOWING |
| Preview editor | `content` | `git.readNoteAt(previewOid, path)` → readBlob | Yes — real blob; throws → ghost | ✓ FLOWING |
| bringBack result | working dir | `git.restoreTree` readBlob→atomicWrite / rm | Yes — real materialization | ✓ FLOWING |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| SOFT-01 | Whole-app reflects a past moment as read-only preview | ✓ SATISFIED | `previewOid` drives tree+tabs+editor; §B/§D UAT pass |
| SOFT-02 | Soft linear restore: working tree set, HEAD unmoved, no branch/detached | ✓ SATISFIED | `restoreTree` (no checkout) `git.ts:631`; §E git evidence HEAD e0f68de unchanged, `main` not detached |
| SOFT-03 | Ghost tab when note didn't exist then | ✓ SATISFIED | `EditorPane.tsx:132-135,301-308`; §C UAT pass. NOTE: REQUIREMENTS.md traceability still lists this "Pending" — doc lag, code + UAT deliver it (see Gaps Summary) |
| SOFT-04 | Return to present restores full prior state incl. open note | ✓ SATISFIED | layout snapshot/restore `App.tsx:200-222`; §C UAT pass |
| SOFT-05 | Unmistakable "past" chrome, no direct editing of previewed content | ✓ SATISFIED | banner `App.tsx:962`, `.main.past` tint, `readOnly` Compartment, flush write-guard `EditorPane.tsx:78` |
| SOFT-06 | "Volver aquí" materializes previewed version, re-enables editing | ✓ SATISFIED | `bringBack` restoreTree + `setPreviewOid(null)`; §E UAT pass |
| TIME-01 | Timeline is repo-level (whole vault) | ✓ SATISFIED | sourced from `git.graph()`, not `noteHistory`; per-note `TimelineScrubber` retired (0 refs) |
| TIME-02 | Timeline always available (no note required) | ✓ SATISFIED | own `SidebarSection`, renders whenever `graph` present `App.tsx:1000-1013` |
| TIME-03 | Human labels only, never a hash | ✓ SATISFIED | `entryLabel` tag→message→relativeDate `labels.ts:12`; no oid in UI |
| TIME-04 | Each entry shows what changed (human wording) | ✓ SATISFIED | `git.changedFiles` + `changedSummary` "N notas cambiadas" `Timeline.tsx:120` |
| TIME-05 | Transport (back/forward/present) drives preview + keeps active entry in view | ✓ SATISFIED | transport buttons + `stepPreview`; `scrollIntoView` on previewOid change `Timeline.tsx:62-64` |
| TIME-06 | Previewed + present entries each persistently marked | ✓ SATISFIED | `presente` + `viendo` chips shown simultaneously `Timeline.tsx:135-136` |
| SIDE-03 | Timeline is a collapsible section below Notes | ✓ SATISFIED | `SidebarSection id="timeline"` after `id="notas"` `App.tsx:975,1000` |

**Coverage: 13/13 in-scope requirements satisfied.** No orphaned requirements (all Phase-2-mapped IDs appear in the executed plans).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Current working tree compiles (incl. uncommitted App/EditorPane/css changes) | `npm run typecheck` | node + web exit 0 | ✓ PASS |
| Preview/restore paths free of checkout | grep `checkout`/`goToVersion` in enter/exit/bringBack | none — only in VersionGraph/BranchSwitcher | ✓ PASS |
| No hash leak in default time-travel UI | read Timeline/Banner/labels | labels are tag→message→relativeDate; chips human; no oid rendered | ✓ PASS |
| Per-note scrubber retired | grep `TimelineScrubber` in src | 0 references | ✓ PASS |

*(App-level non-destructive behavior — HEAD/branch/detached — is exercised by the §D/§E manual UAT, already signed off; see below. No automated harness this milestone by design, out of scope.)*

### Probe Execution

Not applicable — no `scripts/*/tests/probe-*.sh` in the repo; no probe-based verification declared. Behavioral confirmation is the §A–§E manual UAT (signed off) plus typecheck/build gates.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| git.ts | 304, 652 | "TODO"/"TODOS" | ℹ️ Info | False positive — Spanish word "todo/todos" (all), not a debt marker |

No `FIXME`/`XXX`/`HACK`/`PLACEHOLDER`, no stub returns, no unwired empty handlers in phase files.

### Human Verification Required

None outstanding. The one class of assertions that static analysis cannot reach — HEAD stays put, no detached HEAD, no new branch across preview + "Volver aquí" — was already executed and signed off in 02-06 with captured git state:

- Before: `git rev-parse HEAD` → `e0f68de`, branch `main` (not detached), branches `main` + pre-existing `noche/…`.
- After navigating previews and exercising "Volver aquí": HEAD `e0f68de` UNCHANGED, branch `main` (not detached), no new branch, reflog shows no `checkout`/detached entry.
- User sign-off: "esta todo ok" (§A–§E in a running build).

This corroborates the code-level finding that `restoreTree` never calls `git.checkout` and touches only the working dir.

### Gaps Summary

No blocking gaps. Phase goal is achieved: the codebase delivers repo-level timeline navigation, whole-vault read-only preview with unmistakable past-chrome and read-only editor, ghost tabs, exact layout restore, and a non-destructive soft "Volver aquí" that writes only the working dir (HEAD/branch/detached untouched, with a no-AI safety snapshot for dirty state). All 13 in-scope requirements map to concrete, wired, data-flowing code, and the non-destructive guarantee is corroborated by captured git evidence.

Two non-blocking observations for follow-up housekeeping (documentation / repo state, not code defects):

1. **Traceability doc lag (informational).** `.planning/REQUIREMENTS.md` still lists **SOFT-03 as "Pending"** (line 98) with its checkbox unchecked (line 24), and the ROADMAP status table shows Phase 2 as "5/6 · In Progress" (line 123). The code fully implements ghost tabs and §C UAT passed, so this is a stale doc, not a missing feature. Recommend flipping SOFT-03 → Complete and Phase 2 → 6/6 · Complete when the orchestrator finalizes the phase.

2. **Uncommitted working-tree changes (repo hygiene).** At verification time `git status` shows uncommitted modifications to `src/renderer/src/App.tsx`, `src/renderer/src/EditorPane.tsx`, and `src/renderer/src/index.css`. These are the exact files verified above and they typecheck clean (exit 0), so the verdict reflects real, compiling code — but the orchestrator should ensure these are committed so the phase's delivered state is captured in history.

---

_Verified: 2026-07-04T20:26:36Z_
_Verifier: Claude (gsd-verifier)_
