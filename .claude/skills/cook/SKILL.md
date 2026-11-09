---
name: cook
description: Turn a dictated crowd feature idea into a scoped, built, tested Matter Cockpit feature for a live demo. Use when invoked as /cook with a crowd idea.
---

# Cook a crowd idea

Use the text after `/cook` as the idea. Work in this repository with ordinary
Claude Code file and shell tools; no plugins or other skills are required.
Keep audience commentary to short sentences and short lists readable on a projector.

## Start the clock

Before reading project files or asking anything, run:

```sh
cook_clock_file=$(mktemp /tmp/matter-cook-start.XXXXXX)
date +%s > "$cook_clock_file"
printf '%s\n' "$cook_clock_file"
```

Remember the printed absolute path for this invocation. Shell variables do not
persist across tool calls: use that literal path in subsequent calls. A new
`/cook` starts a new clock; answers never reset it. Preserve the clock path, chosen
answers, and whether building has begun across context compaction.

The configurable **scoping budget is 240 seconds (four minutes)**. Change this
number here before rehearsal to use a different budget. Aim for a finished slice
in about ten minutes from invocation, including scoping, implementation, and checks;
use the remaining time to choose how small the slice must be.

On **every incoming message**, including the initial idea and messages during the
build, first read the clock and calculate elapsed seconds in the shell:

```sh
cook_started=$(cat /tmp/matter-cook-start.REPLACE_WITH_RECORDED_SUFFIX)
cook_now=$(date +%s)
printf '%s\n' "$((cook_now - cook_started))"
```

Replace the example path with the recorded path; do not run it literally.
Claude Code acts on incoming messages: there is no background timer and no promise
to interrupt while waiting for an answer. Never sleep or poll to wait out the budget.

## Scope one question at a time

Before interpreting each message as a scoping answer, apply these rules in order:

1. If elapsed time is **at least the configured scoping budget**, pull the ripcord
   immediately.
   The first message at or after the limit triggers building whatever it says,
   even if it is just an ordinary answer to the last question. Do not ask again.
2. If the message says **"answer everything else yourself"**, pull the ripcord
   immediately. Treat close dictation variants the same way, such as "answer the
   rest yourself", "you decide the rest", "make the remaining choices", or
   "just build it". This also applies when the phrase accompanies the initial idea.
3. Otherwise, record the answer and ask exactly **one scoping question per turn**
   while a meaningful product choice remains. Each question must have a recommended
   answer and **two or three short numbered choices** Damien can read aloud.
   Accept a spoken number or a freeform answer. Do not bundle questions or ask for
   a final confirmation. When the slice is clear, start building without using up
   the rest of the budget.

Choose questions that affect the visible outcome: whose task it helps, the one
thing it should do, or where it appears. Decide routine engineering choices yourself.
For example, a whole scoping turn can be:

```text
Who should use this? I recommend 1 for a clear stage demo.
1. Lawyer on the active matter
2. Client in the Portal
3. Lawyer across all matters
```

If the idea is oversized, shrink it before building and say the shrink aloud in
one sentence: "For our ten minutes, I'll build [finished visible slice];
[larger part] stays out." Choose one complete interaction with the room's current
matters, rather than a scaffold with unfinished buttons. Reduce scope further if
scoping has consumed much of the clock.

On either ripcord, state the remaining choices and your recommendations in **one
short block**, then begin file work in the same turn. For example:

```text
Ripcord — I'll choose: active matter; Cockpit sidebar; three plain-language items.
Building now.
```

Honor settled answers; fill every unresolved choice yourself. Do not turn the list
into more questions, a plan approval, or another conversation. Once building has
begun, stay in build mode; continue checking elapsed time on incoming messages.

## Build into one feature slot

Read `CLAUDE.md`, `src/data/schema.ts`, `src/engine/types.ts`, and the registry and
server helper as needed. Use existing app conventions and dependencies.

- Put production client changes in `src/features/<slug>/`, with `index.tsx`
  importing `registerFeature` from `src/features/registry.ts` and calling
  `registerFeature({ id, title, slot, component })` at module scope. The registry's
  eager `import.meta.glob` discovers the folder automatically; do not edit the
  registry, app shell, views, or shared engine to install a feature.
- Pick one slot: `"cockpit.tab"`, `"cockpit.sidebar"`, `"radar.overlay"`,
  `"portal.section"`, or `"toolbar"`. Components receive `{ matters, activeMatter }`.
  Use those live props so the feature works on the room's matters. The registry
  exposes `featuresFor(slot)` for hosts; the feature registers itself.
- If a server or model call is needed, add only `server/features/<slug>.ts`,
  default-exporting a Hono app. It mounts automatically at `/api/features/<slug>`.
  Use `createClient`, `modelName`, and `needsKeyResponse` from `server/ai.ts`.
  If `createClient()` returns no client, return `needsKeyResponse()` and show its
  plain-language message in the feature. Explain that a configured app key unlocks
  the model action; keep seed matters, Trust but Verify, and canned Surprise Me
  usable without a key. Never read or print keys or `.env*`, request a pasted key,
  use a browser-side key, or substitute `ANTHROPIC_API_KEY`.
- Never compute legal deadline dates outside the existing engine, including with
  model arithmetic. Use derived `computedDeadlines` and engine results, preserving
  `uncomputable` reasons and rule citations. Store trigger dates and assumptions,
  never `dueDate` or `computedDeadlines`. Use the schema; all demo data is synthetic,
  authored fields carry provenance, and invented fields are marked `invented`.
  Portal content excludes internal reasoning and provenance evidence.
- If the idea uses intake, reuse the stateless POST SSE API; the client holds the
  partial schema-shaped `Draft` plus provenance and resends it each call:
  `/api/intake/ramble` takes `{ text, draft? }`, `/api/intake/answer` takes
  `{ draft, answers: [{ questionId, answer }] }`, `/api/intake/embellish` takes
  `{ draft }`, and `/api/intake/surprise` takes `{ practiceArea? }` and works from
  canned matters without a key. Each `data:` line is one JSON event: `field`
  (`path`, `value`, `source`, optional `evidence`), `followups` (`questions`, at most
  three, with `id`, `question`, `field`), `done` (`matter`, validated and saved),
  `needs_key` (`message`), or `error` (`message`, optional `partial`). Keep valid
  partial fields for Embellish; do not implement a competing intake API.
- Reuse theme tokens; keep body contrast at least 7:1, text at least 18px, and
  labels understandable without color. Client hot reload and server reload on
  the next request show changes in the running presentation browser. Do not
  restart the server or change host/network settings.

Build what was asked. Do not add dependencies or change `package.json` or the
lockfile. Keep shared infrastructure and stored formats unchanged. Add no extra
guards, retries, fallbacks, modes, abstractions, or interfaces unless an existing
contract requires them, harm could land before detection, or deferring them would
be expensive for stored data, a shared/public interface, money, or security.
Briefly report any considered additions you left out. Keep plan identifiers out
of all written files. Do not cherry-pick, merge, or copy a prepared fallback
feature: the crowd's feature is built live, and this skill ships no primer features.

## Test and point to the result

For behavior-bearing code, first add a focused test using the repository's existing
`tests/` discovery and observe it fail for the intended behavior; then implement.
These focused test files are the only additions outside the feature paths above.
Browser tests stub the `/api/events` stream with test matters instead of writing
`data/matters.json`, which other suites share. A server route that calls the model
uses automatic tool choice; this model rejects a forced tool choice.
Test the promised interaction, with concrete inputs and expected output; do not
invent extra failure paths or edge-case handling. Run `npm run typecheck`,
`npm test`, and `npm run e2e` (use relevant test-file filters where appropriate).
Exercise the new interaction in the running app, including its no-key message if
it uses the model. Fix failures in the slice and rerun the affected checks.

Keep time by reducing optional scope, never by skipping checks or claiming success
on a failing result. If a check is blocked, state exactly what remains unverified.
Give a short check result and any scope omissions before the final audience pointer.
End with one line naming the actual view, feature title, and action, for example:
"Look at Cockpit → the active matter → Next Steps; click Generate."
If unfinished, make that pointer truthful about what is visible and incomplete.
