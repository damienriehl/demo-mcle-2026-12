---
artifact_contract: "ce-handoff/v1"
created_at: "2026-11-09T15:53:37Z"
title: "Draft Compare: technical plan written, build next"
summary: "Planning Contract and units U1-U8 are in the draft-compare plan; doc review was running; next is ce-work through PR and merge."
keywords: ["draft-compare", "docxodus", "folio", "redline", "ce-work"]
cwd: "."
resume_focus: "Run compound-engineering:ce-work on docs/plans/2026-11-09-0816-feat-draft-compare-plan.md through PR and merge."
repository: "damienriehl/demo-mcle-2026-12"
repo_root_sha: "e7d0cc301228b4af30c23e16916279cafa433f81"
branch: "main"
head: "9404dfa5b4294b88c3e91afe6e98fca2ddeb5574"
---

# Handoff: Draft Compare, build

## State
- **Complete:** the plan `docs/plans/2026-11-09-0816-feat-draft-compare-plan.md` now has a Planning Contract (KTD1-KTD9), a sequence diagram, an output structure, units U1-U8, a Verification Contract, and a Definition of Done. Product Contract unchanged. Plan edits may still be uncommitted on main.
- **In progress at writing:** ce-doc-review in non-interactive mode, with coherence, feasibility, scope-guardian, and design-lens reviewers.
- **Not started:** the build (ce-work), the dependency installs (docxodus@15.1.0), the LibreOffice container, and the FOLIO index build.

## Spike evidence (my own runs, 2026-11-09, in a scratch dir outside the repo)
- Docxodus 15.1.0 `docxodus/core` in Node 22: compare took 169 ms, and a moved clause came back as one `move` revision. `addCommentToRevision` works. The HTML uses `rev-ins`, `rev-del`, and `rev-move-from`/`rev-move-to` with `data-move-id`.
- `setTrackedChanges` takes a numeric enum. Neither mode 1 nor mode 2 recorded a tracked `replaceTextRange` edit, which is why KTD7 builds the counter-draft through a second compare.
- Markdown paragraphs that start with "1." become Word list items, and their numbering produces spurious format and move revisions. Write sample drafts with "Section 1." headings instead.
- The Gotenberg LibreOffice route outputs only PDF, so KTD2 calls soffice directly instead.

## Conventions (carried from the prior handoff)
- Codex workers go through the cockpit worker wrapper, one worktree per unit under `~/worktrees/`. The orchestrator installs dependencies first and cherry-picks results.
- Browser tests stub `/api/events`; give each worktree its own E2E_PORT. The merge gate is the local typecheck, vitest, and full Playwright run.

## Open for Damien (taste, not blockers)
- Where Draft Compare sits in the run of show.
