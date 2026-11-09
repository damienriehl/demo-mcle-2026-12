---
topic: matter-cockpit-build
---

# Handoff: Matter Cockpit CLE demo, build nearly done

## State
- Plan: `docs/plans/2026-11-08-1555-feat-matter-cockpit-cle-demo-plan.md` (implementation-ready, doc-reviewed).
- Branch `feat/matter-cockpit` (pushed) holds U1-U10 integrated and simplified: scaffold, rules library, deadline engine (2024-2030 calendars), store, intake (live on Claude Sonnet 5.5, dates anchored to today), seeds, three views, verify drawer, three themes, `/cook` skill, README. 132 unit + 31 browser tests pass.
- Code review complete: verdict "Ready with fixes". A Codex worker (`worker/review-fixes`) is fixing findings 1, 2, 4, 6, 7, 8, 12, 13 (empty internalOnly wedge, CSRF content-type check, redaction test, canned Surprise labels, input-sourced dates labeled "Code computed", focus theft, duplicate React keys, multi-subdivision citations). Finding 15 (theme persists across reloads) is advisory for Damien.
- Stage slides Artifact published (primer six ideas, ecosystem, QR take-home). Design-directions canvas published.

## Next
1. Integrate `worker/review-fixes` (cherry-pick, typecheck, `npm test`, `E2E_PORT=<free> npm run e2e -- --trace off`), push.
2. Run the two `/cook` dry runs (spoken ripcord; late answer after the 240-second budget) on throwaway branches; record in `docs/rehearsal/cook-dry-runs.md` (review finding 14).
3. Open the PR to `main` (ce-commit-push-pr), include the review receipt and the unapplied finding 15; merge.
4. U11: build six `fallback/<slug>` branches from merged `main` by running `/cook` with scripted answers; record timings in `docs/rehearsal/fallback-timings.md`.
5. U12: runbook `docs/rehearsal/runbook.md` (run of show, sample rambles, fallback switch, reset, pre-talk checklist incl. rebasing fallbacks and `tailscale serve`).
6. Retire stale worker worktrees and `worker/*` branches after integration (they are local only).

## Open items for Damien
- Flip the GitHub repo to public (session lacks the GitHub settings tool; command given in chat).
- Default theme pick (provisional: Law Review).
- One full rehearsal screen recording.
