---
phase: 1
slug: sidebar-sections
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-03
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test harness in the repo (see CONCERNS.md) |
| **Config file** | none — Wave 0 does NOT install a framework for this phase |
| **Quick run command** | `npm run typecheck` (tsc strict, `noUnusedLocals`/`noUnusedParameters`) |
| **Full suite command** | `npm run typecheck` + manual UAT checklist (§Manual-Only) |
| **Estimated runtime** | ~15 s typecheck; ~3 min manual UAT |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run typecheck` (must be clean; no new errors vs baseline)
- **Before `/gsd-verify-work`:** typecheck green + manual UAT checklist passed
- **Max feedback latency:** ~15 s (typecheck)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | SIDE-01 | — | N/A (renderer-only UI) | typecheck+manual | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | SIDE-02 | — | N/A | typecheck+manual | `npm run typecheck` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | SIDE-04 | — | N/A | typecheck+manual | `npm run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No test framework will be installed for this phase — introducing Vitest/Jest is out of scope for a pure visual restructure and would expand blast radius. Validation is `npm run typecheck` plus the manual UAT checklist below.*

- [x] Existing infrastructure (tsc strict) covers compile-time verification of all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar renders as a stack of collapsible sections; clicking the NOTAS header collapses/expands its body; chevron flips | SIDE-01 | Visual/interaction; no DOM test harness | Launch app, click NOTAS header → body hides, chevron → right; click again → body shows, chevron → down |
| Section collapse state persists across app restarts | SIDE-01 | Requires real localStorage + relaunch | Collapse NOTAS, quit and relaunch → NOTAS stays collapsed; check `localStorage['geode.section.notas.collapsed']` = "1" |
| New-note / new-folder / sort / collapse-all actions live on the NOTAS header, appear on hover, hidden when collapsed | SIDE-02 | Hover + visual state | Hover NOTAS header → 4 action icons appear; move away → fade; collapse section → actions gone; each action still performs its original behavior |
| Vault switching is an inline disclosure under a top vault header (no floating popover) | SIDE-04 | Visual/interaction | Click vault header → list expands in-flow pushing sections down (not an overlay); pick another vault → switches; "Abrir carpeta…"/"Clonar o crear…" still work |
| Behavior parity: sidebar resizer, sort toggle, collapse-all, keyboard (Del/rename), context menu, active-note highlight all unchanged | SIDE-01/02 | Regression surface across existing features | Run through each: drag resizer, toggle sort, collapse-all, Del a note, right-click context menu, open a note (highlight) |

---

## Validation Sign-Off

- [ ] All tasks have `npm run typecheck` verify or a manual UAT entry
- [ ] Sampling continuity: typecheck runs after every task (no 3 consecutive un-sampled tasks)
- [ ] Wave 0 covers all MISSING references (N/A — no framework install)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (typecheck)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
