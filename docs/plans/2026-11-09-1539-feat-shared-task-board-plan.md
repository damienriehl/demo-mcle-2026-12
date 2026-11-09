---
title: "Shared matter task board - Plan"
type: feat
date: 2026-11-09
topic: shared-task-board
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Shared matter task board - Plan

## Goal Capsule

- **Objective:** For each matter, the lawyer and the client each have a thorough to-do list. Each side moves its own items from To do to Doing to Done and sees the other side's progress. A client upload arrives already digested, so the lawyer's follow-up work is largely prepared before the lawyer opens it.
- **Product authority:** Damien, live at the 2026-11-09 CLE talk (an audience-driven build). Visibility and auto-ingest scope were settled in-session.
- **Open blockers:** none.

## Product Contract

### Summary

Add a task board to every matter with two lists: the client's and the lawyer's. The system drafts both lists from the matter's documents, its code-computed deadlines, and the procedural rules of the forum the matter sits in. Cards move To do → Doing → Done, and the other side sees each move live. A client "send us a document" task carries an upload control. The upload joins the matter, gets summarized, and pre-fills the lawyer's related tasks, while any proposed matter changes wait for the lawyer's one-click approval.

### Actors

- A1. **Lawyer:** works in the Cockpit. Owns the lawyer list, decides which lawyer tasks the client may see, and approves proposed changes.
- A2. **Client:** works in the Client Portal. Owns the client list, uploads requested documents, and sees only lawyer tasks the lawyer has shared.
- A3. **System:** drafts tasks, ingests uploads, and prepares lawyer work. It never decides on its own.

### Requirements

- R1. Each matter shows two task lists, Client and Lawyer, each with To do, Doing, and Done columns.
- R2. The system drafts tasks from three sources: the matter's documents, its code-computed deadlines, and the procedural rules of its forum (for example FRCP or Minnesota rules for courts, and USPTO rules for patent matters).
- R3. Every drafted task names its source: a verified quote from a matter document, a computed deadline, or a cited rule. A task the system cannot tie to a source is marked "verify".
- R4. A task's due date comes only from a code-computed deadline, never from the model.
- R5. Drafting aims for thoroughness: it covers each pending deadline, each document-stated obligation, and each forum step the rules require before the next event. Repeated drafting does not duplicate existing tasks.
- R6. Each side moves its own cards between columns, by drag and by a keyboard-reachable control.
- R7. The lawyer can also move client cards, for example to mark a document received.
- R8. Lawyer tasks start hidden from the client; the lawyer shares each task individually. (session-settled: Damien chose "Only tasks the lawyer shares" over "all with per-task hide".)
- R9. The Client Portal shows the client list plus shared lawyer tasks, with their live status, read-only.
- R10. The Cockpit shows both lists and marks which lawyer tasks the client can see.
- R11. A status change on either side appears on the other side without a page reload.
- R12. A client task that asks for a document offers an upload control in the Portal.
- R13. An uploaded document joins the matter's documents, and its task moves to Done.
- R14. After an upload, the system summarizes the document and pre-fills the lawyer's related tasks with the summary, quoted facts, and a suggested next step. Every quote is verified against the uploaded text.
- R15. Matter changes the system proposes from an upload (new timeline events or new tasks) wait for the lawyer's one-click approval. Nothing changes the matter's deadlines or timeline without that approval. (session-settled: Damien chose "Prepare, lawyer approves".)
- R16. Internal material (reasoning, evidence, and unshared lawyer tasks) never appears in the Portal.
- R17. Projector legibility holds, and status never reads by color alone (each card names its column in text).

### Key Flows

- F1. **Draft the lists:** the lawyer opens the board for a matter and asks the system to draft tasks. Both lists fill, each task showing its source; the lawyer edits, deletes, or shares lawyer tasks.
- F2. **Move work:** the lawyer drags "Draft answer" to Doing. Any shared task updates in the client's Portal at once. The client moves "Gather lease" to Doing, and the lawyer's Cockpit shows it.
- F3. **Upload and prepare:** the client opens "Send the signed lease", uploads it, and sees the task Done. The lawyer then sees the lease in the matter's documents, a summary, pre-filled related tasks with quoted facts, and any proposed timeline events awaiting approval.

### Acceptance Examples

- AE1. On the family custody matter, drafting yields client tasks (for example, gather school and schedule records) and lawyer tasks tied to the motion-papers deadline with its computed due date and rule citation.
- AE2. With the Cockpit and Portal open side by side, moving a shared lawyer task to Done updates the Portal card within a few seconds, and an unshared lawyer task never appears in the Portal.
- AE3. A client uploads a text or Word document for a document task. The task moves to Done, the document appears in the Cockpit, and a lawyer task shows a summary whose quotes all appear verbatim in the upload.
- AE4. With no Claude key, the board still lists deadline-derived tasks, and moves and uploads still work; drafting from documents and summaries say they need a key.

### Scope Boundaries

- No accounts or authentication. The Portal remains the demo's client view.
- No email or notification sending.
- No automatic changes to deadlines, deadline triggers, or the timeline (R15).
- Prior art, hearing packets, and other feature tabs stay as they are.

### Dependencies / Assumptions

- Uploads reuse the app's existing document conversion (Word, PDF, text, and others).
- Live updates reuse the app's existing live channel.
- Rule coverage relies on the rules and citations the deadline engine already carries. Rule-based tasks outside that coverage carry the "verify" mark (R3).

### Outstanding Questions

- Deferred to Planning: where tasks are stored (inside each matter, or alongside it) while keeping R11 and R16.
- Deferred to Planning: which upload formats ship first if conversion is slow on stage.

### Sources / Research

- `CLAUDE.md` (matter store, Portal filtering, projector rules).
- `src/views/Portal.tsx` (shared and internal-only filtering).
- `src/engine/` (computed deadlines and rule citations).
- `server/drafts/convert.ts` (document conversion).
