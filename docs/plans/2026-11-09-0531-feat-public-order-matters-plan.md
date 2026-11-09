---
title: Public Order Matters - Plan
type: feat
date: 2026-11-09
topic: public-order-matters
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Public Order Matters - Plan

## Goal Capsule

- **Objective:** In the 90-minute CLE session, Damien uploads two real, public D. Minn. scheduling orders live. Each opens as its own clearly marked matter, and the room sees every court-set date quoted from the order and every rule deadline computed from it. Nothing real is ever committed to the public repository.
- **Product authority:** On 2026-11-09, Damien answered the `scheduling-order-taste` sheet: "two real orders" (real-orders) and "two `/cook` rounds" (run-of-show). He also chose "Explore ideas", and the generated idea was a session-only preview for public orders.
- **Open blockers:** None.

## Product Contract

### Summary

A real court order uploads as a new **public-record matter**. That matter is marked "Public record", carries its case number, lives only in the runtime store, and disappears on `npm run reset`. The upload flow, the derived deadlines, Trust but Verify, date moves, and calendar export all work on it unchanged. The real PDFs and their checked extractions stay outside git, so a keyless replay works on stage.

### Problem Frame

The store accepts only synthetic matters, and every committed seed must stay fictional, because the repository is public. A real order names real parties. Attaching one to a fictional matter would mix real and invented facts under a `synthetic: true` label. A live run against the two real orders also showed a real-world text-layer hazard: one order's footnote marker sits glued to the trial year ("March 15, 20288"). The quote check rightly rejected that date, which dropped every trial-based deadline for that order.

### Key Decisions

- **Runtime-only public-record matters, not a preview-only screen.** Every existing view, the verify drawer, moves, and export then work without a second rendering path. The synthetic-only rule continues to hold for everything committed. Governs R1, R2, R5.
- **Real orders live outside the repository.** The PDFs and their checked extractions sit in a local folder named by an environment variable, never in git. Governs R6.
- **Fix the footnote hazard at the prompt, not the checker.** The checker stays strict; the model quotes the date without an attached footnote numeral, and the shortened quote is still an exact substring. Governs R4.

### Requirements

**Public-record matters**

- R1. The matter schema accepts either a synthetic matter (as today) or a public-record matter: `synthetic: false` with `publicRecord: { court, caseNumber, sourceUrl? }`. Seeds, canned intake matters, and test fixtures stay synthetic, and their tests keep enforcing it.
- R2. Uploading an order with "new matter" selected creates a public-record matter from the order: the order's caption becomes the title, the court name the forum, and the case number the record's case number, with practice area litigation. The client reads "Public court record (no client)" with an `example.invalid` contact, and parties, timeline, and documents start empty. Then the order applies exactly as it does to an existing matter.
- R3. After creation, the app switches to the new matter. The matter list and the Cockpit header mark it "Public record" with its case number.
- R4. The extraction prompt tells the model to quote a date without an attached footnote reference numeral (for example, quote "March 15, 2028" from "March 15, 20288"). It also asks for the court's name and the case number.
- R5. The Client Portal omits public-record matters.

**Stage resilience**

- R6. `MATTER_COCKPIT_EXTRA_ORDERS_DIR` names additional local directories whose `<slug>.pdf` + `<slug>.extraction.json` pairs join the keyless replay. The pairs are matched by page-text hash as today.
- R7. The runbook adds a "now a real one" beat to the scheduling-order segment, pre-talk steps for the real-orders folder and the environment variable, and a note on the parties named in each order.

### Scope Boundaries

- Not in scope: fetching orders from CourtListener inside the app, persisting public-record matters across `npm run reset`, or committing real orders or real names.

### Sources / Research

- **Real orders (local only):**
  - *Pulling Guard Productions, LLC v. Lambert*, No. 26-cv-2305 (PJS/LIB), ECF 52 (Oct. 28, 2026).
  - *Old National Bank v. Adams*, No. 25-cv-4636 (PJS/LIB), ECF 86 (Mar. 30, 2026).
  - Both are free RECAP PDFs on CourtListener.
- **Live run, 2026-11-09:**
  - *Old National Bank v. Adams:* 8 of 8 dates verified.
  - *Pulling Guard Productions v. Lambert:* 7 of 8 verified; the trial date was rejected because "20288" carries a footnote marker.
- **Prior plan:** `docs/plans/2026-11-08-1937-feat-scheduling-order-upload-plan.md`.

## Implementation Units

### U1. Server: public-record schema, new-matter upload, prompt, extra orders directory
- **Files:** `src/data/schema.ts`, `server/orders/**`, `server/store.ts` (only if needed), tests.
- R1, R2, R4, R6. The `done` event carries `created: true` when a matter was created.

### U2. Client: new-matter upload, auto-select, Public record marking, Portal filter
- **Files:** `src/features/scheduling-order/**`, `src/App.tsx`, `src/views/Cockpit.tsx`, `src/views/Portal.tsx`, tests.
- R2 (UI), R3, R5. The feature asks the app to select a matter through a `matter-cockpit:select-matter` window event.

### U3. Runbook and local fixtures
- **Files:** `docs/rehearsal/runbook.md`. The checked extraction JSON for each real order is written to the local real-orders folder, not to git.
- R6, R7.

## Verification Contract

- `npm run typecheck`, `npm test`, `npm run e2e` pass.
- A live run creates public-record matters from both real orders, with every date verified, including the Pulling Guard trial date. A keyless run replays both from the extra directory. A browser screenshot is inspected. `npm run reset` removes both matters.
