# Cook rehearsal notes

Rehearsed on 2026-11-08 against branch `feat/matter-cockpit` at `bd41b9e`. An agent followed `.claude/skills/cook/SKILL.md` literally with scripted presenter replies; each build landed on its own `fallback/<slug>` branch, never on `main`. Times run from the skill's clock file to the final passing check.

## Run: spoken ripcord

- Idea: `/cook a client update email: one click drafts a short, friendly status email to the client for the active matter, using its status, next steps, and upcoming dates`
- Branch: `fallback/client-update-email`, commit `1fca988`
- Questions: placement (answered "1", Cockpit sidebar, at 7 seconds); tone (answered "answer everything else yourself" at 11 seconds)
- Ripcord: the spoken phrase at 11 seconds; the skill stated its remaining choices in one block and began building with no further question
- Built: `src/features/client-update-email/`, `server/features/client-update-email.ts`, unit and browser tests (both failed first)
- Checks: typecheck clean, 148 unit tests, 35 browser tests; live model drafted the email; a fresh server with no key showed the needs-key message
- Pointer: "Look at Cockpit → the active matter → Client update email; click Draft email."
- Time: 314 seconds
- Result: pass

## Run: late answer triggers the budget

- Idea: `/cook a conflict check that flags every person or company appearing in more than one matter`
- Branch: `fallback/conflict-check`, commit `be510ea`
- Setup: the clock file was backdated 250 seconds to simulate a slow room
- Questions: placement; the presenter's answer "2" arrived with the clock at 260 seconds, past the 240-second budget
- Ripcord: the budget rule fired on that late answer; the skill took the answer, filled the remaining choices in one block, and built with no further question
- Built: `src/features/conflict-check/`, unit and browser tests (unit tests failed first)
- Checks: typecheck clean, 148 unit tests, 34 browser tests
- Pointer: "Look at Cockpit → the active matter → Conflict check in the sidebar under Deadlines; it lists each shared name and the other matters it appears in."
- Time: 224 seconds of real time (the 250-second backdate not counted)
- Result: pass

## Lessons folded back into the skill

- A feature route that calls the model must use automatic tool choice; this model rejects a forced tool choice.
- Browser tests for a new feature stub the `/api/events` stream instead of writing `data/matters.json`, which races the other suites.
