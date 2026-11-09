---
artifact_contract: "ce-handoff/v1"
created_at: "2026-11-09T15:46:52Z"
title: "Draft Compare: plan and build"
summary: "Requirements-only plan for Draft Compare is written; next is ce-plan then ce-work through PR and merge."
keywords: ["draft-compare", "redline", "folio", "docxodus", "matter-cockpit"]
cwd: "."
resume_focus: "Run compound-engineering:ce-plan on docs/plans/2026-11-09-0816-feat-draft-compare-plan.md, then ce-work through PR and merge."
repository: "damienriehl/demo-mcle-2026-12"
repo_root_sha: "e7d0cc301228b4af30c23e16916279cafa433f81"
branch: "main"
head: "c8c4b7f4540fa436b1b6d4baa4abf2394e89d17a"
---

# Handoff: Draft Compare, plan and build

## Objective and user intent
Damien asked for a universal "Diff Generator" (2026-11-09). A brainstorm with him settled the Product Contract in `docs/plans/2026-11-09-0816-feat-draft-compare-plan.md`. On continuing, he said (his words): proceed with FOLIO on every item, and "Continue". His standing instructions (global Decision Bar) authorize planning, building, PRs, and merges without asking; ask only for taste or judgment.

## Current state
- **Complete:** requirements-only plan (R1-R17, F1-F2, AE1-AE4, Key Decisions marked session-settled). No Planning Contract or units yet.
- **Not started:** technical plan (`ce-plan` enriches the same file in place) and the build.
- **Recently shipped on main** (context only): PR #1 scheduling-order upload; PR #2 public-record matters; PR #3 three bundled real D. Minn. orders in `data/seed/orders/public/`.

## Decisions (Damien's, recorded in the plan's Key Decisions)
- Demo first inside Matter Cockpit on fictional drafts, then a standalone product.
- On-screen Track Changes redline plus a .docx with genuine tracked changes.
- Every format at once: Word, PDF with a text layer, text, Markdown, .doc, .rtf, .odt, HTML.
- Detect parties, lawyer confirms the client; FOLIO classifies every legal concept (not just parties) with source spans kept for later corpus cross-reference.
- Cards beside each change, a summary memo, and Word margin comments.
- Exact counter-language with one-click apply into a counter-draft .docx.

## Research already done (my survey, verify licenses again only if a choice depends on it)
- **Docxodus** (github.com/JSv4/Docxodus, MIT, npm `docxodus`): DOCX compare with native w:ins/w:del/w:moveFrom/w:moveTo/w:pPrChange, DOCX-to-HTML, semantic change list. Single maintainer with a CLA; fallback is Codeuctivity/OpenXmlPowerTools (MIT, NuGet).
- **Conversion:** Gotenberg (MIT wrapper around LibreOffice, MPL-2.0, run as a separate process) for .doc/.rtf/.odt/HTML. unpdf is already a dependency for PDF text. mammoth.js (BSD-2) and Docling (MIT, Python) are options.
- **Excluded (copyleft or commercial):** pandoc, diff-pdf (GPL); PyMuPDF, LexNLP, Mike (AGPL); Aspose, Litera, Draftable.
- **FOLIO:** the folio-resolve, folio-api, folio-enrich, folio-python, and folio-mcp repos sit beside this repo under the cockpit root. The `folio` MCP server failed to connect on 2026-11-09.

## Conventions that bit this session
- Implementation goes to Codex workers via the cockpit worker wrapper, one worktree per unit under `~/worktrees/`. The orchestrator cherry-picks onto a feature branch and verifies. Workers have no network, so the orchestrator installs dependencies first and logs them in `THIRD-PARTY.md`.
- Browser tests stub `/api/events` and never write `data/matters.json`. Give each worktree its own `E2E_PORT`.
- Claude Sonnet 5.5 rejects a forced `tool_choice`; use auto with a prompt instruction.
- A test that creates a temporary feature folder must wait for Vite to drop it (see `tests/views.spec.ts`).
- `pkill -f <pattern>` inside a compound shell command can kill its own shell; stop dev servers in a separate call.
- No CI runs on this repo; the local typecheck, vitest, and full Playwright run are the merge gate.

## Open items for Damien (taste, not blockers)
- Where Draft Compare sits in the 90-minute run of show.
- Ideation picks offered and unanswered: amended-order diff, docket-sheet paste, crunch-week warning.

## Next step
Run `compound-engineering:ce-plan` on the plan above, then `compound-engineering:ce-work` through PR and merge.
