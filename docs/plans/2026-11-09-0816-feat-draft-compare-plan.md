---
title: Draft Compare - Plan
type: feat
date: 2026-11-09
topic: draft-compare
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Draft Compare - Plan

## Goal Capsule

- **Objective:** A lawyer drops in two drafts of a legal document and gets a Word-faithful redline, a verdict for their own client on every change, ready-to-send counter-language, and FOLIO tags for every legal concept in both drafts. The first version runs inside Matter Cockpit, on fictional drafts, for the December 2026 CLE talk.
- **Product authority:** Damien chose the product shape in this brainstorm on 2026-11-09 (Key Decisions below). Technical choices follow the Decision Bar.
- **Open blockers:** None. Placement in the 90-minute run of show is a later taste call.

## Product Contract

### Summary

A "Compare drafts" tool in Matter Cockpit takes any two drafts and renders a Track Changes redline on screen. It exports the same redline as a .docx with genuine tracked changes. A FOLIO pass tags every legal concept in both drafts. After the lawyer confirms which party they represent, every change gets a Harms / Neutral / Helps card, and a memo groups the cards. Word margin comments carry the same advice. Where a small edit would help the client, the card shows exact counter-language that one click applies as the lawyer's own tracked change in a counter-draft.

### Problem Frame

When the other side returns a revised draft, the lawyer must find every change, including clauses that moved, and judge what each one does to their client before responding. Today that takes a commercial compare tool plus hours of close reading, and the judgment step has no tool support at all. The CLE audience spans transactional, litigation, regulatory, legislative, advisory, and bankruptcy practice, and every one of those practices exchanges drafts.

### Key Decisions

- **Demo first, product second.** The tool is built inside Matter Cockpit on fictional drafts for the talk, then lifted into a standalone product with its own plan. (session-settled: user-directed — chosen over a standalone-first product and over a demo-only feature.) Governs R1, R17.
- **Real Word redline, not only a picture of one.** The download is a .docx whose changes Word treats as genuine tracked revisions. (session-settled: user-directed — chosen over screen-only and over screen-plus-PDF.) Governs R4, R5.
- **One comparison feeds every view.** A single comparison produces both the on-screen redline and the .docx, so the two can never disagree. A permissive engine that writes genuine tracked revisions, including linked moves (Docxodus, MIT), is the leading candidate.
- **Everything at once on formats.** Word, PDF, text, Markdown, .doc, .rtf, .odt, and HTML are all accepted from the start, converted to Word before comparison. (session-settled: user-directed — chosen over a narrower first set.) Governs R2, R3.
- **Detect parties, lawyer confirms, FOLIO classifies.** (session-settled: user-directed — chosen over automatic use of the matter's client and over typed entry.) Governs R7, R8.
- **FOLIO for every legal concept, not only parties.** This includes actors and roles, document type, clause types, claims, regulatory objectives, and areas of law. (session-settled: user-directed, Damien's 2026-11-09 revision.) Governs R6, R9, R16.
- **Cards plus memo plus Word comments.** (session-settled: user-directed — chosen over cards alone and over a memo alone.) Governs R11, R12, R13.
- **Exact counter-language, one-click apply.** (session-settled: user-approved.) Governs R14, R15.

### Actors

- A1. The lawyer, who uploads drafts, confirms the client, reads the advice, and applies counter-language.
- A2. The model, which assesses each change for the confirmed client and drafts counter-language.
- A3. The FOLIO tagger, which maps text spans to FOLIO concepts.

### Requirements

**Upload and redline**

- R1. Inside a matter, a "Compare drafts" tool accepts two drafts, labeled "earlier" and "later".
- R2. Accepted formats: Word (.docx), PDF with a text layer, plain text, Markdown, .doc, .rtf, .odt, and HTML, in any mix. A PDF without a text layer is refused with a plain message.
- R3. When the legacy-format converter is unavailable, .doc, .rtf, .odt, and HTML are refused with a plain message. The other formats keep working.
- R4. The on-screen redline uses Word's Track Changes conventions: deletions in red strikethrough, insertions in blue underline, moved text in green (double strikethrough at the origin, double underline at the destination), and formatting changes marked. Colors are never the only signal.
- R5. One click downloads a .docx of the later draft whose differences from the earlier draft appear as genuine Word tracked changes, including moves and, for Word-to-Word comparisons, formatting changes.

**FOLIO tagging and client**

- R6. A FOLIO pass tags every legal concept it can resolve in both drafts, keeping each tag's exact source span. Users see the tags as FOLIO Enrich shows them: the tags touching each change, plus a filterable panel of all document tags.
- R7. The system lists the parties it finds, each with its role and FOLIO actor classification, and pre-selects the matter's client when one matches.
- R8. No advice runs until the lawyer confirms which party they represent.
- R9. The document type is detected and shown as a FOLIO tag. The six target families (transactional, litigation, regulatory, legislative, advisory, bankruptcy) each shape the advice.

**Advice**

- R10. Every change gets one assessment for the confirmed client: Harms, Neutral, or Helps. Each assessment carries a one-paragraph reason that quotes the language it relies on, plus a confidence label. The assessment considers only the two drafts.
- R11. Each change shows its assessment as a card beside it on screen, with the change's FOLIO tags.
- R12. A memo at the top groups the changes by assessment, Harms first, and links each item to its change.
- R13. The .docx carries each assessment as a Word margin comment anchored to its change.
- R14. When a small edit would move a change toward Helps, its card shows the exact counter-language and states the effect.
- R15. "Apply" adds the counter-language as the lawyer's own tracked change in a counter-draft .docx built on the later draft. Nothing changes without a click, and applied suggestions can be undone before download.

**Data for later corpus search**

- R16. Each comparison keeps both drafts' FOLIO tags with their source spans in a durable, machine-readable record tied to the matter, so a later corpus index can cross-reference any tag (for example, a clause type or a claim) across the lawyer's documents.

**Demo materials**

- R17. Matter Cockpit bundles one fictional draft pair for each of the six document families. Each pair includes at least one moved clause, one change that harms each side, and one change where counter-language helps.

### Key Flows

- F1. **Compare:** the lawyer opens a matter, chooses "Compare drafts", and drops two files. The redline renders (R4), FOLIO tags appear (R6), the party list asks for confirmation (R7, R8), the cards and memo fill in (R10–R12), and both downloads become available (R5, R13).
- F2. **Counter:** the lawyer opens a Harms card, reads its counter-language (R14), applies it, then downloads the counter-draft .docx (R15).

### Acceptance Examples

- AE1. **Covers R2, R5.** An earlier .docx and a later PDF compare. The redline marks text changes but no formatting changes, and says why.
- AE2. **Covers R8, R10.** In a fictional asset purchase, the later draft caps the seller's indemnity at 10% of price. With the buyer confirmed, the card reads Harms and quotes the cap. With the seller confirmed, it reads Helps.
- AE3. **Covers R4, R5.** A confidentiality clause moved from section 7 to section 3 shows as a move (green) on screen and as a linked move in Word, not as a deletion plus an insertion.
- AE4. **Covers R14, R15.** Applying a suggested carve-out produces a counter-draft where Word shows the carve-out as the lawyer's tracked insertion on top of the later draft.

### Scope Boundaries

- Deferred to the standalone product: real client drafts, along with their privacy, retention, and model-provider terms; accounts; the corpus index and cross-reference query; and comparing more than two drafts.
- Not in scope: OCR for scanned PDFs, side-by-side PDF layout comparison, outside legal research in the advice, and collaboration.

### Outstanding Questions

**Deferred to Planning**

- Which permissive comparison engine (Docxodus is the leading candidate, with an MIT fallback fork), and how it runs beside the Node server.
- How the FOLIO pass runs (folio-resolve's matching engine, the FOLIO API, or folio-enrich), and how FOLIO Enrich's on-screen labeling is reproduced. The FOLIO MCP server failed to connect on 2026-11-09.
- How the legacy-format converter runs (a LibreOffice-based service as a separate process).

**Taste, for Damien later**

- Where the tool sits in the 90-minute run of show: a prepared beat, or the second `/cook` round.

### Sources / Research

- Permissive OSS survey (2026-11-09):
  - **Comparison and redlining:** Docxodus (MIT; DOCX compare with native ins/del/move/formatting revisions, DOCX-to-HTML, npm `docxodus`); Codeuctivity/OpenXmlPowerTools (MIT fallback).
  - **Format reading and conversion:** mammoth.js (BSD-2); pdf.js/unpdf (Apache-2.0/MIT, already a dependency); Docling (MIT, Python); Gotenberg (MIT wrapper around LibreOffice, MPL-2.0, as a separate process).
  - **Text diffing:** jsdiff (BSD-3).
  - **Prompt material:** LQ.AI and BigLaw (Apache-2.0) as platforms only.
  - **Excluded for copyleft or commercial licenses:** pandoc and diff-pdf (GPL); PyMuPDF, LexNLP, and Mike (AGPL); Aspose, Litera, and Draftable (commercial).
- **Local FOLIO repositories:** folio, folio-api, folio-mcp, folio-enrich, folio-resolve, and folio-python under the cockpit root.
- **Existing patterns to reuse:** the scheduling-order upload's streamed, verified-quote flow (`server/orders/`, `src/features/scheduling-order/`) and the Trust but Verify drawer (`src/verify/`).
