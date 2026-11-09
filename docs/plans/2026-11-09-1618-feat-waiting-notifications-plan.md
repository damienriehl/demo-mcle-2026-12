---
title: "Waiting-on client notifications - Plan"
type: feat
date: 2026-11-09
topic: waiting-notifications
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Waiting-on client notifications - Plan

## Goal Capsule

- **Objective:** When the lawyer marks a task "Waiting on client", the client hears about it at once, by email or text as the client prefers. The client learns what is needed and by when, so the item comes back quickly.
- **Product authority:** Damien, live at the 2026-11-09 CLE talk. The message content was settled in session. Choosing a paid provider and sending to real clients remain his decision (both are R12 hard blocks).
- **Open blockers:** Damien must choose a paid email and text provider, and supply its credentials, before any message reaches a real person. Until then the feature runs in preview mode.

## Product Contract

### Summary

Marking a task "Waiting on client" immediately sends the client a short message: what the lawyer is waiting on, the due date, and a link to the Portal. Each client chooses email, text, both, or neither, and texting requires the client's opt-in. Every message is logged in an outbox on the matter, which the lawyer can see. Until Damien chooses providers and supplies credentials, the system writes each message to the outbox as a preview and delivers nothing.

### Actors

- A1. **Lawyer:** marks tasks "Waiting on client" and sees what was sent.
- A2. **Client:** chooses how to be notified, opts in to text, and receives the messages.
- A3. **Notifier:** turns a waiting event into email or text messages through a delivery channel.

### Requirements

- R1. Marking any client-visible task "Waiting on client" triggers a notification at once, with no extra click.
- R2. The message names the task, its due date when one exists, and a Portal link, and nothing else about the matter. (session-settled: Damien chose "Task + due date + link" over full detail or a bare nudge.)
- R3. Each client chooses email, text, both, or neither in the Portal. Texting requires an explicit opt-in, and every text tells the client how to stop (STOP).
- R4. An outbox on the matter lists each message: channel, recipient, text, time, and result (previewed, sent, or failed). The lawyer sees it in the Cockpit.
- R5. Delivery happens through a swappable channel: a preview channel by default, plus one real email channel and one real text channel, each activated only by configuration.
- R6. With no provider configured, every message goes to the outbox marked "Preview — not sent". No message leaves the system.
- R7. Re-marking the same task as waiting within a short window does not send a duplicate.
- R8. A failed delivery shows in the outbox and on the lawyer's card. It never blocks the move to Waiting on.
- R9. Synthetic demo contacts (`example.invalid`) never trigger a real send, even when a provider is configured.

### Key Flows

- F1. **Notify:** the lawyer clicks "Waiting on client" on a shared task. The card moves, and within seconds the outbox shows "Email to client: Your lawyer is waiting on: Send corrections… Due Nov 13. Open your portal: <link>", marked Preview or Sent.
- F2. **Choose:** in the Portal, the client picks "Text me" and ticks the consent box. The next waiting event produces a text that ends with "Reply STOP to opt out."

### Acceptance Examples

- AE1. With no providers configured, marking a task waiting adds one previewed email to the outbox, and nothing is delivered.
- AE2. A client who has not opted in to texting never receives a text, even when text is chosen.
- AE3. Marking the same task waiting twice within a minute adds one message, not two.

### Scope Boundaries

- No paid account, provider signup, or real delivery to a real client without Damien's explicit go-ahead (R12 spend and sending hard blocks).
- No inbound replies, except honoring STOP once a real text channel exists.
- No reminder schedule before deadlines yet (a deferred option).
- No messages about lawyer-side waiting in this pass.

### Dependencies / Assumptions

- Real email needs a sending domain with SPF, DKIM, and DMARC records. Real text needs US carrier registration (10DLC) or an alternative.
- Provider choice and cost come from the pricing research presented to Damien on 2026-11-09.

### Outstanding Questions

- Resolve Before Planning: none for the preview build.
- Deferred to Planning: which real email and text channels to wire first, after Damien picks from the pricing options.

### Sources / Research

- `docs/plans/2026-11-09-1539-feat-shared-task-board-plan.md` (task board, Waiting on stage).
- `server/tasks/` and `src/features/task-board/` (current board).
