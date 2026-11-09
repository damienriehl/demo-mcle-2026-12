---
topic: matter-cockpit-build
---

# Handoff: Matter Cockpit CLE demo, built and merged

## State
- `main` carries the full app (merge of `feat/matter-cockpit`): three views, Ramble intake on Claude Sonnet 5.5, deadline engine (2024-2030 calendars), Trust but Verify, three themes, `/cook` skill, README marked as a teaching demo. Clean-install `main`: typecheck clean, 145 unit tests pass; the feature branch also passed 33 browser tests.
- Code review (ce-code-review, full) verdict "Ready with fixes"; eight findings fixed and verified. Finding 15 (theme choice persists across reloads) left as advisory.
- Six `fallback/*` branches pushed, rebased onto `main`; timings in `docs/rehearsal/fallback-timings.md` (110-405 seconds each). Dry runs in `docs/rehearsal/cook-dry-runs.md`. Runbook in `docs/rehearsal/runbook.md`.
- Stage slides and design-directions canvas published as private claude.ai artifacts.

## Open items for Damien
- Flip the GitHub repo to public (session lacked the settings tool).
- Default theme pick (provisional: Law Review).
- Record one full rehearsal screen capture.
- Before the talk: follow the runbook's pre-talk checklist (rebase fallbacks, reset seeds, smoke-test Ramble).
