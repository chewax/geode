---
phase: 2
slug: go-back-in-time
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test harness in the repo (see CONCERNS.md); NOT added this phase |
| **Config file** | none |
| **Quick run command** | `npm run typecheck` (tsc strict, `noUnusedLocals`/`noUnusedParameters`) |
| **Full suite command** | `npm run typecheck` + manual UAT checklist (§A–§E) |
| **Estimated runtime** | ~15 s typecheck; ~5 min manual UAT |

---

## Sampling Rate

- **After every task commit:** `npm run typecheck`
- **After every plan wave:** `npm run typecheck` (clean; no new errors vs baseline)
- **Before `/gsd-verify-work`:** typecheck green + manual UAT §A–§E passed
- **Max feedback latency:** ~15 s (typecheck)

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | Manual Ref | Status |
|---------|-------------|-----------|-------------------|-----------|--------|
| main IPC: tree-at / changed-files / restore-tree | SOFT-01/02/06, TIME-04 | typecheck + manual | `npm run typecheck` | §B, §E | ⬜ |
| Timeline section (git.graph source, labels, transport, markers) | SIDE-03, TIME-01..06 | typecheck + manual | `npm run typecheck` | §A | ⬜ |
| Read-only preview (previewOid, tree+tabs+editor, readOnly) | SOFT-01/05 | typecheck + manual | `npm run typecheck` | §B | ⬜ |
| Past-mode banner + editor tint | SOFT-05 | typecheck + manual | `npm run typecheck` | §B | ⬜ |
| Ghost tab | SOFT-03 | typecheck + manual | `npm run typecheck` | §C | ⬜ |
| Exit / jump-to-present layout restore | SOFT-04 | typecheck + manual | `npm run typecheck` | §C | ⬜ |
| "Volver aquí" materialize + safety snapshot (no HEAD move) | SOFT-02/06 | typecheck + manual | `npm run typecheck` | §E | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red*

---

## Wave 0 Requirements

*No test framework installed (out of scope for this milestone per CONCERNS.md). Compile-time verification via tsc strict covers type/contract correctness; behavior is confirmed by the §A–§E manual UAT below.*

- [x] Existing infrastructure (tsc strict) covers compile-time verification.

**Pure helpers worth extracting (unit-testable IF a harness existed — not mandated here):**
- label-fallback (tag → message → relative date)
- relative-date formatter
- changed-files → human summary ("N notas cambiadas: …")
- restore-tree write/delete set computation (write set from tree, delete set from working blobs minus tree)

Keep these as small pure functions so a future harness can cover them without refactor.

---

## Manual-Only Verifications

| § | Behavior | Requirement | Test Instructions |
|---|----------|-------------|-------------------|
| A | Timeline section below Notes, always available (even with no note open); entries labeled human-only (name/tag → message → relative date, never a hash) with "what changed"; transport (back/forward/present); newest badged "presente", previewed badged "viendo", both visible at once | SIDE-03, TIME-01..06 | Open app with no note; expand Timeline; step back/forward; confirm labels/markers/what-changed; confirm no hashes anywhere |
| B | Selecting a past version puts the whole app in read-only preview: tree + tabs + editor reflect that moment; top "Estás viendo el pasado" banner; editor teal-tinted and not editable | SOFT-01, SOFT-05 | Pick an older version; try to type in editor (blocked); verify tree shows past files; verify banner + tint |
| C | Ghost tab when the open note didn't exist then ("no existía en este momento"); jumping to present restores the exact prior layout incl. the previously-open note | SOFT-03, SOFT-04 | Open note X (created recently); preview a version before X existed → tab is ghost; jump to present → X reopens as before |
| D | Non-destructive: during preview NOTHING is written to disk; HEAD never moves | SOFT-01, SOFT-02 | Before/after preview: `git rev-parse HEAD` unchanged; `git status` shows no new changes from previewing |
| E | "Volver aquí" brings the previewed version back as pending changes (HEAD not moved, no branch/detached-HEAD); prior dirty state safety-snapshotted so nothing is lost; editing re-enabled | SOFT-02, SOFT-06 | Make a dirty edit; preview old version; "Volver aquí"; verify `git rev-parse HEAD` unchanged, `git branch` shows only main (no detached/new branch), working tree now matches old version as pending, and the pre-existing dirty edit is preserved in history (safety commit) |

---

## Validation Sign-Off

- [ ] Every task has `npm run typecheck` verify or a manual UAT entry
- [ ] typecheck runs after every task (sampling continuity)
- [ ] §D explicitly asserts HEAD unchanged + no disk writes during preview (core non-destructive guarantee)
- [ ] §E explicitly asserts no detached-HEAD / no new branch after "Volver aquí"
- [ ] Feedback latency < 15s (typecheck)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
