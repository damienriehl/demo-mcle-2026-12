---
topic: cle-90min-brainstorm
---

# Handoff: Matter Cockpit, brainstorm the 90-minute session additions

## Next action
Run `compound-engineering:ce-brainstorm` on Damien's new request (verbatim below), then continue through ce-plan and ce-work autonomously once scope is agreed.

> "It turns out that my session isn't 45 minutes — it's actually 90 minutes. So we can do some more cool things. Can we try finding some scheduling orders, and then uploading them live — and let the system figure out deadlines for all of them (based on the applicable rules, such as the Minnesota Rules of Civil Procedure and General Rules of Practice)? Any other ideas?"

## Ideas already offered (unconfirmed; start the brainstorm from these)
- **Scheduling-order upload (Damien's idea, recommended):** upload a scheduling order (PDF), extract court-set dates (copied and quoted with page cite, labeled "From the order") and rule-derived deadlines (computed by the engine, labeled "Code computed"), e.g. Minn. Gen. R. Prac. 115.03 dispositive-motion service 28 days before the hearing, Fed. R. Civ. P. 26(a)(3) pretrial disclosures 30 days before trial. Sources: real public D. Minn. orders from CourtListener plus fictional Minnesota state orders modeled on the state scheduling-order form.
- **Move the trial date:** drag one court date; every dependent deadline recomputes with its math.
- **Calendar export:** one-click `.ics` download into Outlook.
- **Docket-sheet paste:** filings become timeline events and triggers.
- **Two `/cook` rounds** in the longer session.

## Current state (all on `main`, repo now public)
- App, plan, rehearsal docs: `docs/plans/2026-11-08-1555-feat-matter-cockpit-cle-demo-plan.md`, `docs/rehearsal/runbook.md`, `docs/rehearsal/fallback-timings.md`, `docs/rehearsal/cook-dry-runs.md`. Six `fallback/*` branches pushed.
- Engine: `src/engine/` (about 25 rules, federal and Minnesota calendars 2024-2030; dates never from the model). Rules library: `data/rules/` (full FRCP, Minn. R. Civ. P., Minn. Gen. R. Prac.). Intake: `server/intake/` (Claude Sonnet 5.5, auto tool choice, today's date in each request).
- Backup video recorded (app side); default theme Law Review confirmed.
- The runbook's run of show assumes 45 minutes; a 90-minute version is part of this brainstorm.

## Conventions learned this session
- Decisions go through `cockpit-decide file --attended --no-wait`, then inline numbered questions; persist with `cockpit-answer`.
- Implementation goes to Codex workers via the cockpit wrapper in `~/worktrees/` worktrees; network-needing units go to Claude subagents; the orchestrator integrates by cherry-pick and verifies.
- Claude Sonnet 5.5 rejects forced `tool_choice`; use auto with a prompt instruction.
- Browser tests must stub `/api/events` rather than write `data/matters.json`; set `E2E_PORT` per worktree.
