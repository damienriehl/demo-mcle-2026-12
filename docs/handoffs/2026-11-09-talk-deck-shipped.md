---
artifact_contract: "ce-handoff/v1"
created_at: "2026-11-09T20:34:00Z"
title: "CLE talk deck shipped; open presenter questions"
summary: "The HTML talk deck went live as a private claude.ai artifact; its source lives at docs/talk/deck.html. Four presenter questions remain open for Damien."
keywords: ["cle-talk", "html-deck", "artifact", "presenter-setup"]
cwd: "."
resume_focus: "Answer Damien's presenter questions and polish the deck on request."
---

# Handoff: talk deck shipped

Supersedes the build step of `docs/handoffs/2026-11-09-talk-deck.md` (retire both after the talk).

## Done

- **Deck:** 17 slides, source at `docs/talk/deck.html` (PR #7, merged). It also runs as a private claude.ai artifact; republish edits from that file to the same artifact URL (the private copy names it).
- **Content:** premise and counts, the build loop, seven features, guardrails, live-demo beats (Draft Compare marked "if time"), the `/cook` primer, the open-source ecosystem, and a take-home slide with a repo QR code. The primer, ecosystem, and take-home slides fold in an earlier session's three stage slides.
- **Keys:** arrows, Space, and PgUp/PgDn move slides; A opens the app; C opens Claude Code; F goes full screen; S opens setup, which stores both URLs in the browser.
- **Checks:** a local Playwright pass at 1920x1080 found 17 slides, no text under 24 canvas px, and no console errors.

## Open

- **Sandbox key test:** nobody has yet checked inside the claude.ai sandbox that A and C open tabs. The setup panel documents a fallback: pinned tabs plus Ctrl+1/2/3.
- **Damien's calls:** the Draft Compare slot, the Claude Code URL, the copy-doc waiver, and any copy edits.
- **Code freeze:** app code stays frozen until after the talk.
