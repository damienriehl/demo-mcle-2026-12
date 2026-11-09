---
topic: scheduling-order-build
---

# Handoff: Matter Cockpit, build the scheduling-order upload

## Next action
Continue `compound-engineering:ce-work` on `docs/plans/2026-11-08-1937-feat-scheduling-order-upload-plan.md` from the first unit that is not yet on branch `feat/scheduling-order` (check `git log feat/scheduling-order`).

## State
- Brainstorm and plan are on `main` (the plan file above; Product Contract R1–R12, units U1–U7, derivation table).
- Branch `feat/scheduling-order` (worktree under `~/worktrees/`) adds `unpdf@1.9.1`.
- Wave 1 (U1 engine rules, U2 deadline chains, U3 fictional orders + PDF text + quote check) runs as Codex workers on `worker/sched-u1..u3`; the orchestrator cherry-picks each onto the feature branch after verifying.
- U4 (extraction route) task spec is written; U5 (tab, date edit, .ics) and U6 (verify panel) follow U4; U7 (90-minute runbook) last.
- Two taste questions are filed (`scheduling-order-taste` ask: real orders, run-of-show placement) and marked provisional on their recommendations. The older ideation ask is dismissed as superseded.

## Conventions
- Workers: cockpit wrapper, one worktree per unit, `E2E_PORT` per worktree, no network (the orchestrator installs dependencies).
- Browser tests stub `/api/events`; never write `data/matters.json` in tests.
- Claude Sonnet 5.5 rejects forced `tool_choice`; use auto plus a prompt instruction.
