# Stage runbook

The session runs 90 minutes. The scheduling-order segment takes 10 of them, and two live builds take about 30. Everything below assumes Claude Code runs on the presenter's machine and the presentation browser shows the app.

## Pre-talk checklist (the day before, then again an hour before)

1. On `main`, `git pull`, then `git status` shows a clean tree.
2. Rebase every `fallback/*` branch onto final `main`, run `npm test` and `npm run e2e -- --trace off` on each, and update the tips in `docs/rehearsal/fallback-timings.md`.
3. `npm ci`, then `npm run reset` so the Radar's "This week" band holds three deadlines and the three order matters (Lanternfish, Copperleaf, Quillfeather) wait without court dates.
   Keep `data/seed/orders/` open in a file window for drag-and-drop.
   Put the two real orders and their `.extraction.json` files in one local folder outside the repo (for example `~/Documents/matter-cockpit-real-orders/`), and start the dev server with `MATTER_COCKPIT_EXTRA_ORDERS_DIR` set to that folder so they replay without a key.
4. Confirm the Claude key file exists (`ls ~/.config/matter-cockpit/api-key`); never print it.
5. `npm run dev`. If the presentation browser runs on another machine, publish the app with `tailscale serve` and set `MATTER_COCKPIT_ALLOWED_HOSTS` to that host name; never bind 0.0.0.0.
6. Open the app in the presentation browser at 1920×1080, Law Review theme, Deadline Radar showing.
7. Open the stage slides and a Claude Code session in the repo; zoom the terminal so it reads from the back row.
8. Run one Ramble and one scheduling-order upload end to end as a smoke test, then `npm run reset` again.

## Run of show

| Minute | Beat | What to do |
|---|---|---|
| 0–20 | Background talk | Your deck |
| 20–23 | Seed tour | Radar ("This week" band), then one Cockpit matter, then the same matter's Client Portal |
| 23–29 | Ramble intake | Take two crowd matters by voice; answer one follow-up from the room; press Embellish on the second; toggle "Show what I said" |
| 29–32 | Trust but Verify | Open the interrogatories deadline; flip service to Mail and back; point at the rule's own words and the Rule 6(d) step |
| 32–42 | Scheduling order | See "Scheduling-order segment" below |
| 42–43 | Primer slide | "What should we build?" |
| 43–58 | First `/cook` | Scope (3 min), cook (about 8 min; fill with questions), reveal (2 min) |
| 58–73 | Second `/cook` | A different practice area's idea; say "answer everything else yourself" early |
| 73–76 | Design last | Switch themes; take one tweak from the room ("make the accent Vikings purple") as a token edit |
| 76–90 | Q&A | Leave the take-home slide up |

## Scheduling-order segment (minutes 32–42)

1. Open the **Quillfeather** matter (federal) and its **Scheduling order** tab. Drag `data/seed/orders/dminn-quillfeather.pdf` onto the drop zone.
2. As dates stream in, read one quote aloud: "From the order, page 2." Say: the model copied these; the server checked every quote against the page before saving it.
3. Point at the trial group: pretrial disclosures land on a Saturday and roll back to Friday, May 14; objections follow 14 days later. Open the pretrial card in Trust but Verify and show Rule 26(a)(3)(B) and the Rule 6(a)(5) step.
4. Point at the struck-through expert default: Rule 26(a)(2)(D) says 90 days "absent a stipulation or a court order," and this order sets February 1. Open it and show the "unless the court orders otherwise" line.
5. Switch to **Lanternfish** (Hennepin County) and drop `hennepin-lanternfish.pdf`. The Minnesota rules apply: Gen. R. Prac. 115.03 motion papers count back from the hearing, and the reply skips the observed July 4 holiday.
6. Move the trial date a week later in the tab. Every dependent deadline moves with its math; the order's own dates stay put.
7. Press **Export to calendar** and open the `.ics` in Outlook or Google Calendar.
8. **Now a real one.** In the tab, choose **Open a public order as a new matter** and drop the real *Pulling Guard Productions v. Lambert* order (D. Minn. No. 26-cv-2305, Oct. 28, 2026). It opens as a new matter marked "Public record" with its case number. Point out that its expert dates supersede the Rule 26(a)(2)(D) default and that pretrial disclosures fall 30 days before the March 15, 2028 trial-ready date. If time allows, open *Old National Bank v. Adams* (No. 25-cv-4636) the same way.
   - On this order's text layer a footnote marker sits on the trial year ("20288"); the app quotes the date without it, and the checker still matches the page text.
   - Both orders are public court records from CourtListener's free RECAP archive and name real parties, including eight individual former employees in *Old National Bank*. Public-record matters live only in the running app: they never reach the repository, the Client Portal hides them, and `npm run reset` removes them.

If someone in the room offers an order, use it only if it is a public court record; open it as a new public-record matter, never on a fictional matter.

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
- **A scheduling-order upload fails or shows needs-key:** with no key, the bundled orders replay a checked extraction automatically; otherwise run `npm run reset` and upload again, or switch to the next bundled order.
- **No network:** Surprise Me draws from the canned pool, and every view and the verify drawer still work; skip live intake.

## Afterward

`git switch main && git restore . && git clean -fd src/features server/features tests` removes the live build, then `npm run reset`. Never merge a fallback or live-built feature into `main`.

## Backup

Record one full rehearsal as a screen capture, Claude Code pane included, as the last-resort backup video.
