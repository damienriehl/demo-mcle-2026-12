# Stage runbook

The live build runs in roughly 15 of the session's 45 minutes. Everything below assumes Claude Code runs on the presenter's machine and the presentation browser shows the app.

## Pre-talk checklist (the day before, then again an hour before)

1. On `main`, `git pull`, then `git status` shows a clean tree.
2. Rebase every `fallback/*` branch onto final `main`, run `npm test` and `npm run e2e -- --trace off` on each, and update the tips in `docs/rehearsal/fallback-timings.md`.
3. `npm ci`, then `npm run reset` so the Radar's "This week" band holds three deadlines.
4. Confirm the Claude key file exists (`ls ~/.config/matter-cockpit/api-key`); never print it.
5. `npm run dev`. If the presentation browser runs on another machine, publish the app with `tailscale serve` and set `MATTER_COCKPIT_ALLOWED_HOSTS` to that host name; never bind 0.0.0.0.
6. Open the app in the presentation browser at 1920×1080, Law Review theme, Deadline Radar showing.
7. Open the stage slides and a Claude Code session in the repo; zoom the terminal so it reads from the back row.
8. Run one Ramble end to end as a smoke test, then `npm run reset` again.

## Run of show

| Minute | Beat | What to do |
|---|---|---|
| 0–14 | Background talk | Your deck |
| 14–16 | Seed tour | Radar ("This week" band), then one Cockpit matter, then the same matter's Client Portal |
| 16–20 | Ramble intake | Take two crowd matters by voice; answer one follow-up from the room; press Embellish on the second; toggle "Show what I said" |
| 20–22 | Trust but Verify | Open the interrogatories deadline; flip service to Mail and back; point at the rule's own words and the Rule 6(d) step |
| 22–23 | Primer slide | "What should we build?" |
| 23–26 | `/cook` scoping | Dictate the room's idea; relay answers; say "answer everything else yourself" when time runs short |
| 26–33 | Claude Code cooks | Fill the wait with the Portal tour or early questions |
| 33–35 | Reveal | Follow the skill's final "Look at…" line |
| 35–37 | Design last | Switch themes; take one tweak from the room ("make the accent Vikings purple") as a token edit |
| 37–45 | Q&A | Leave the take-home slide up |

## Sample rambles (one per practice area)

- **Litigation:** "So a fabricator in Minneapolis says our client stiffed them on an exhibit build, they served the complaint in person last Tuesday, it's Hennepin County…"
- **Employment:** "Warehouse guy in Bloomington, fired around October 3rd right after he complained about overtime, he's 58 and thinks it's age…"
- **Bankruptcy:** "A bakery that owes our client for ovens just filed Chapter 7 in Minnesota, maybe seven weeks ago…"
- **Patent:** "We got a non-final Office action on a folding shade canopy last month, three-month period…"
- **Family:** "Dissolution in Hennepin County, two kids, temporary custody hearing in about four weeks…"
- **Transactional:** "Asset purchase of a small design studio, the inspection objection is due under section 4.2 next week…"
- **Regulatory:** "Our client wants to comment on a proposed kiln labeling rule; the notice closes at the end of the month…"

## If something goes wrong

- **The build stalls or fails:** say "here's one I made earlier," stop the session, and `git switch fallback/<slug>` for the closest primer idea; the dev server reloads on its own.
- **A new crowd idea has no fallback:** let `/cook` shrink it aloud; if it still stalls, switch to the nearest fallback and say so.
- **Intake errors:** press Surprise Me, or ask Claude Code to add the matter to `data/matters.json` (trigger dates only, never due dates).
- **The app shows stale or odd matters:** `npm run reset`.
- **No network:** Surprise Me draws from the canned pool, and every view and the verify drawer still work; skip live intake.

## Afterward

`git switch main && git restore . && git clean -fd src/features server/features tests` removes the live build, then `npm run reset`. Never merge a fallback or live-built feature into `main`.

## Backup

Record one full rehearsal as a screen capture, Claude Code pane included, as the last-resort backup video.
