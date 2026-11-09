---
title: Scheduling Order Upload - Plan
type: feat
date: 2026-11-08
topic: scheduling-order-upload
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Scheduling Order Upload - Plan

## Goal Capsule

- **Objective:** In the new 90-minute CLE session, Damien drops a scheduling order into Matter Cockpit live. The room watches the app list every court-set date, each quoted from the order with its page, and then every deadline the Minnesota and federal rules derive from those dates. Each derived deadline shows its rule text and date math, and the room sees which dates the court set and which the code computed.
- **Means:** A scheduling-order upload on the Cockpit, new engine rules keyed to trial and hearing dates, an order-controls precedence step, a calendar export, and a 90-minute run of show.
- **Product authority:** Damien asked for this feature ("try finding some scheduling orders, and then uploading them live — and let the system figure out deadlines for all of them") and owns product direction, taste, and the run of show. Technical choices follow the Decision Bar.
- **Open blockers:** None. Two taste questions (real public orders, run-of-show balance) proceed on their recommendations; see Outstanding Questions.

## Product Contract

### Summary

Add a scheduling-order upload to the Cockpit. The model reads the order and copies out each court-set date with a quote and page number. Code checks every quote against the order's text, then computes the rule-derived deadlines (pretrial disclosures, expert disclosures, motion papers) from those dates. Moving the trial date recomputes everything that depends on it, and one click exports the whole schedule to a calendar.

### Problem Frame

The session grew from 45 to 90 minutes, which adds roughly 30 minutes of demo time. Scheduling orders cause more calendaring mistakes in practice than any single rule does: an order sets a handful of dates, and the rules hang more deadlines off each one, some stated in the order and some only in the rules. A demo that takes a real-looking order and shows which dates came from the judge and which came from the rules hits the room's daily pain, and it extends the Trust but Verify message to documents the lawyer did not write.

### Key Decisions

- **The model copies dates; code computes deadlines.** The intake contract already forbids model-computed dates. Court-set dates are copied text, so the model may extract them, but each one must carry a quote that code verifies. Governs R3, R4, R6.
- **The order controls over default rules.** FRCP 26(a)(2)(D), 26(a)(3)(B), and the Minn. Gen. R. Prac. 115 timelines apply "unless the court orders otherwise." When the order sets a date for the same item, the order's date governs and the derived default shows as superseded with that reason. Governs R8.
- **Synthetic orders only in the store.** The repository's matter store holds synthetic matters only, so the demo orders are fictional Minnesota state and D. Minn. orders modeled on real forms. Governs R11.
- **Move the trial date and calendar export ride along.** Both reuse derived-on-read deadlines and stretch the beat into a ten-minute segment with no new trust surface. Governs R9, R10.

### Actors

- A1. Damien, presenting: uploads the order and moves the trial date.
- A2. The model (Claude Sonnet 5.5 via `server/ai.ts`): reads the order and proposes court-set dates with quotes and pages.
- A3. The deadline engine (`src/engine/`): verifies nothing about text, computes every rule-derived date.

### Requirements

**Upload and extraction**

- R1. The Cockpit accepts a scheduling order as a PDF (drag-and-drop or file picker) or as pasted text and attaches it to the active matter. Each bundled order has a seeded matter waiting for it.
- R2. Extraction streams onto the screen progressively, one court-set date at a time, so the room watches it happen.
- R3. Each court-set date carries the event name, the ISO date, an exact quote from the order, and the page number. The UI labels it "From the order, p. N".
- R4. Code accepts a court-set date only when its quote appears on the cited page of the order's text and the quote contains the date. A failed check shows the date as "Unverified quote" and the engine does not compute from it.
- R5. With no API key configured, the upload answers with the standard needs-key message, and a canned extraction of each bundled demo order still runs offline.

**Derived deadlines**

- R6. The engine derives, from the court-set dates:
  - Fed. R. Civ. P. 26(a)(3)(B) pretrial disclosures, 30 days before trial, and objections 14 days after those disclosures.
  - Fed. R. Civ. P. 26(a)(2)(D)(i) expert disclosures, 90 days before trial.
  - Minn. Gen. R. Prac. 115.03 dispositive-motion service (28 days), response (14 days), and reply (7 days) before a dispositive hearing.
  - Minn. Gen. R. Prac. 115.04 nondispositive-motion service (21 days), response (14 days), and reply (7 days) before a nondispositive hearing.
- R7. Every derived deadline opens the existing Trust but Verify panel with rule text, steps, and a weekend or holiday roll. The panel shows the court-set date it counts from as the trigger, labeled "From the order, p. N".
- R8. When the order itself sets a date for an item a rule would otherwise default, the order's date governs. The rule-derived default stays visible as "Superseded: the order sets this date (p. N)", and the verify panel cites the rule's "unless the court orders otherwise" language.

**Live changes and export**

- R9. Editing one court-set date, such as the trial date, recomputes every dependent deadline on screen with its new math. No due date is stored.
- R10. One click downloads the matter's schedule as an `.ics` calendar file that Outlook and Google Calendar import, with each event's source label and citation in its description.

**Demo materials**

- R11. The repository bundles at least three fictional scheduling orders as PDFs: two Minnesota district court orders (one modeled on the Gen. R. Prac. 111 scheduling-order form) and one D. Minn. pretrial scheduling order. Each has dates that land inside the 2024–2030 calendars and at least one weekend or holiday landing.
- R12. The runbook carries a 90-minute run of show that adds the scheduling-order beat and a second `/cook` round, and a fallback for an upload failure.

### Key Flows

- F1. Upload. **Trigger:** Damien drops `order-hennepin.pdf` on a matter's Cockpit. Court-set dates stream in with page quotes (R2, R3). Code checks each quote (R4). Derived deadlines appear grouped under their court-set date (R6), with superseded defaults marked (R8). Damien opens one derived deadline and walks the rule text and roll (R7).
- F2. Move the trial date. **Trigger:** Damien changes the trial date from the order. Every dependent deadline recomputes and its math updates (R9). Damien exports the calendar (R10).

### Acceptance Examples

- AE1. **Covers R4.** The model returns "Trial: 2027-06-14" with a quote from page 2 that reads "Trial ready date: June 14, 2027". The check passes and the date is accepted. If the quote appears only on page 3, or names June 15, the date shows "Unverified quote" and nothing derives from it.
- AE2. **Covers R6, R7.** A federal trial set for Monday, 2027-06-14: the 26(a)(3)(B) count lands on Saturday 2027-05-15. Counting backward, the roll moves earlier to Friday 2027-05-14, and the panel shows the Rule 6(a)(5) step.
- AE3. **Covers R8.** The D. Minn. order sets expert disclosures for 2027-02-01. The 90-day default shows as superseded with the order's page, and the governing expert-disclosure date is 2027-02-01.
- AE4. **Covers R9.** Moving the trial date forward one week moves the pretrial-disclosure and objection deadlines, but not the order-set expert date.

### Scope Boundaries

- Deferred: docket-sheet paste, D. Minn. Local Rule 7.1 motion timelines (not in the bundled rules library), and chained deadlines beyond one hop (26(a)(3) objections are the only chain).
- Deferred: real public orders from CourtListener in the store; see Outstanding Questions.
- Not in scope: writing back to any court system or a real calendar account; the export is a file download.

### Outstanding Questions

**Deferred to Planning**

- How the server gets per-page text from a PDF for the R4 check, and how the model receives the PDF.
- How the `court-order` catalog entry represents its citation (page pinpoint) so the verify panel renders it.

**Taste, for Damien after the build (proceeding on the recommendation)**

- Should the demo also show one real public D. Minn. scheduling order, display-only and outside the store? Recommendation: no for the build; fictional orders keep the synthetic-only rule intact. A real order can sit in the deck as a screenshot.
- Where does the scheduling-order beat sit in the 90 minutes, and does the second `/cook` round stay? Recommendation: scheduling order right after Trust but Verify, then two `/cook` rounds.

### Sources / Research

- Rule text from the bundled library: `data/rules/frcp.json` (Rules 6, 16(b), 26(a)(2)(D), 26(a)(3)(B)) and `data/rules/mn-gp.json` (Rules 111, 115.03, 115.04). Rule 115.04(a) requires 21 days for nondispositive motions, not 14.
- Engine shape: `src/engine/rules.ts` (`civil()` helper, backward direction, `notice` and `contract` kinds that store a stated date), `src/engine/compute.ts`.
- Intake conventions: `server/intake/routes.ts` (streamed tool fields, auto tool choice, one retry), `server/intake/prompts.ts` (today's date line).
- Prior plan and run of show: `docs/plans/2026-11-08-1555-feat-matter-cockpit-cle-demo-plan.md`, `docs/rehearsal/runbook.md`.

## Planning Contract

### Key Technical Decisions

- **Court-set dates are stored deadlines of a new `court-order-date` catalog kind.** Inputs carry `date`, `page`, and `quote`; the engine returns the stated date with an `{ ruleId: 'order', subdivision: 'p. N' }` citation and an `inputKey`, so the existing "from the matter" labeling applies and no due date is stored. The matter schema stays unchanged for this kind.
- **Derived deadlines count from another deadline.** `trigger` becomes `{ event, date }` or `{ event, fromDeadline }`, where `fromDeadline` names a deadline in the same matter. The store computes deadlines in dependency order and substitutes the upstream computed due date. A missing, cyclic, or uncomputable upstream makes the dependent uncomputable with a reason that names it. This one schema change makes R9 (move the trial date) and the 26(a)(3) objection chain fall out of derive-on-read.
- **Supersession is a stored link.** A deadline may carry `supersededBy: <deadline id>`; the default still computes, and views mark it superseded and drop it from the Radar.
- **Code, not the model, picks the derived rules.** The model tags each court-set date with a fixed `kind` (trial, dispositive-hearing, nondispositive-hearing, expert-disclosure, pretrial-disclosure, plus other order dates that derive nothing) and the order's `court` (`minnesota` or `federal`). A deterministic table maps kind and court to the derived deadlines and to supersession.
- **Server-side per-page PDF text with `unpdf`.** The server extracts page text, sends it to the model with page markers, and verifies each quote against the cited page after whitespace, quote-mark, and dash normalization, plus a check that the quote names the same date. Pasted text counts as page 1. `unpdf@1.9.1` (MIT; newest release at least two weeks old) is the one new dependency, logged in `THIRD-PARTY.md`.
- **Only verified dates are written.** Unverified ones stream to the screen with their label and never reach the store.
- **Fictional order PDFs are generated from HTML by Playwright's `page.pdf()`.** Both the HTML sources and the PDFs are committed, so the PDF step needs no new dependency.
- **Keyless fallback is a canned extraction keyed by the bundled order's file name and text hash.** It replays through the same verify-and-write path.
- **The feature is a registered folder** (`src/features/scheduling-order/`, `cockpit.tab`) with `server/features/scheduling-order.ts`, following the slot contract. The verify panel and deadline card get small core edits for the `order` citation, the `fromDeadline` trigger, and the superseded state.

### Derivation table

| Court-set kind | Minnesota (Minn. R. Civ. P. / Gen. R. Prac.) | Federal (Fed. R. Civ. P.) |
|---|---|---|
| trial | 26.01(b)(4)(A) experts 90 days before; 26.01(c)(2) pretrial disclosures 30 days before, then objections 14 days after | 26(a)(2)(D)(i) experts 90 days before; 26(a)(3)(B) pretrial disclosures 30 days before, then objections 14 days after |
| dispositive-hearing | 115.03(a), (b), (c): 28, 14, and 7 days before | none (D. Minn. LR 7.1 not in the library); hearing shown alone |
| nondispositive-hearing | 115.04(a), (b), (c): 21, 14, and 7 days before | none, same reason |
| expert-disclosure, pretrial-disclosure | supersedes the matching trial-derived default | same |

### Risks

- The model mislabels a kind. The verify panel shows the quote next to the derived rule, so the error is visible; the canned fallback replays a checked extraction.
- PDF text order differs from visual order in generated PDFs. Simple single-column HTML keeps extraction order stable; a test asserts every bundled order's canned quotes verify against the extracted text.

## Implementation Units

### U1. Engine rules and court-order kind
- **Files:** `src/engine/rules.ts`, `src/engine/compute.ts`, `src/engine/types.ts`, `tests/engine.test.ts`.
- Add the table's rules (federal and Minnesota Rule 26 trial-based, objection rules counted forward from the pretrial-disclosure date, Gen. R. Prac. 115.04 a/b/c) and the `court-order-date` kind.
- **Tests:** AE2 date math; each new rule's period, direction, and citation; court-order result carries the `order` citation and `inputKey: 'date'`.

### U2. Deadline chains and supersession in the store
- **Files:** `src/data/schema.ts`, `src/data/engine-types.ts` (if needed), `server/store.ts`, `tests/store.test.ts`.
- `trigger.fromDeadline` union, `supersededBy`, dependency-ordered compute, uncomputable on missing, cyclic, or uncomputable upstream, and validation that the referenced IDs exist in the matter.
- **Tests:** AE4 (moving a trial date moves the chain but not an order-set date), cycle, missing reference, uncomputable upstream.

### U3. Fictional orders, PDF text, and canned extractions
- **Files:** `data/seed/orders/*.html|*.pdf|*.extraction.json`, `scripts/build-orders.ts`, `server/orders/pdf-text.ts`, `server/orders/verify-quote.ts`, three seeded matters in `data/seed/matters/`, `tests/orders.test.ts`.
- Three orders per R11 with a weekend or holiday landing in each and one order-set expert date in the D. Minn. order (AE3).
- **Tests:** per-page extraction of each bundled PDF; every canned quote verifies; AE1 pass and fail cases for the quote check.

### U4. Extraction route
- **Files:** `server/features/scheduling-order.ts`, `server/orders/extract.ts` (prompt, tool, derivation table), `tests/scheduling-order.test.ts`.
- `POST /api/features/scheduling-order/extract` (multipart file or JSON text, plus `matterId`) streams SSE events: `pages`, `date` (with `verified`), `derived`, `done` with the updated matter, or `needs_key`/`error`. Writes the order as a matter document, verified court dates as `court-order-date` deadlines with stated provenance and the quote as evidence, timeline events, and derived deadlines using `fromDeadline`/`supersededBy`. Uploading the same order again replaces its earlier entries.
- **Tests:** fake model stream; canned keyless path; unverified date dropped; idempotent re-upload; error text never echoes provider details.

### U5. Scheduling-order tab, date edits, and calendar export
- **Files:** `src/features/scheduling-order/**`, `tests/scheduling-order.spec.ts`.
- Drop zone, file picker, and paste box; streamed date list with "From the order, p. N" or "Unverified quote"; schedule grouped by court date with derived deadlines and superseded defaults; inline date edit (full-matter PUT) for court dates; `.ics` export (RFC 5545 all-day events, escaped text, CRLF).
- **Tests:** browser test with stubbed `/api/events` and a stubbed extract stream; an `.ics` unit test.

### U6. Verify panel and card support
- **Files:** `src/verify/**`, `src/components/DeadlineCard.tsx`, `src/views/Radar.tsx`, `tests/verify.spec.ts`.
- The `order` citation renders the order quote with its page in place of library text; the trigger line resolves `fromDeadline` and labels it "From the order, p. N"; superseded deadlines show the reason and the rule's "unless the court orders otherwise" text; the Radar omits superseded ones.

### U7. Run of show and rehearsal
- **Files:** `docs/rehearsal/runbook.md`.
- 90-minute run of show (scheduling order after Trust but Verify, two `/cook` rounds), pre-talk steps for the order PDFs, and the upload-failure fallback (keyless canned replay).

### Sequencing
U1, U2, and U3 run in parallel. U4 follows U1–U3. U5 and U6 follow U4 and run in parallel. U7 runs anytime.

## Verification Contract

- `npm run typecheck`, `npm test`, and `npm run e2e` pass on the merged branch.
- A live run against the dev server uploads each bundled PDF with the real key and with no key, and a screenshot of the Scheduling order tab and one verify panel is inspected.

## Definition of Done

- R1–R12 hold on `main`, the verification contract passes, and the runbook's 90-minute run of show is merged.
