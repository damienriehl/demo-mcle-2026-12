---
topic: matter-cockpit-build
---

# Handoff: Matter Cockpit CLE demo, build in progress

## State
- Plan (implementation-ready, reviewed): `docs/plans/2026-11-08-1555-feat-matter-cockpit-cle-demo-plan.md`.
- Build branch: `feat/matter-cockpit` (pushed). Integrated so far: scaffold, rules library (408 verbatim records), deadline engine (25 rules), matter store with engine wiring. 81 tests pass.
- In flight as Codex workers on `worker/*` branches: seed matters, intake AI service, three views plus slot registry, `/cook` stage skill.
- Remaining after those: Trust but Verify panel, final themes, six fallback branches with timed `/cook` dry runs, runbook, slides, README polish, PR and merge.

## Open items for Damien
- Default theme pick (filed; provisional default is Law Review).
- Which Claude API key the app should use for live intake (none provisioned for this project yet).
- One full rehearsal screen recording.

## Conventions
- Workers get shared contracts for rule IDs, the engine interface, the intake API, and the slot registry; the orchestrator integrates by cherry-pick, verifies, and commits.
