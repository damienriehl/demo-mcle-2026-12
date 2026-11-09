# Matter Cockpit

> **A teaching demo, not a legal tool.** This repository exists to show how fast a lawyer can build software with Claude Code ("vibe coding"). It accompanies a live Minnesota CLE session in December 2026. Every matter, party, and document in it is fictional. The deadline calculations are illustrations; they are not docketing, legal advice, or a substitute for reading the rules yourself. Do not rely on this app for any real matter, and never enter real client information.

## Why this repo exists

On stage, the presenter points Claude Code at this repo, asks the room for a feature idea, and builds it live in about ten minutes. The app is deliberately small, so Claude Code can read it quickly and add a feature without getting lost. After the session, you can clone it and do the same thing yourself.

## What the app does

Matter Cockpit gives a lawyer three views over one shared set of matters:

- **Cockpit** shows one matter in depth: parties, forum, timeline, documents, and deadlines.
- **Deadline Radar** puts every deadline from every matter on one wall, grouped by urgency (overdue, this week, this month, later) with countdowns.
- **Client Portal** shows what a client would see: status, next steps, and upcoming dates in plain language, with internal notes hidden.

It ships with seven fictional seed matters, one for each practice area in a typical CLE room: litigation, transactional, patent prosecution, bankruptcy, family, employment, and regulatory.

### Ramble intake

Type or dictate a matter the way you would describe it in a hallway, rambling included. Claude pulls out the client, the opposing party, the practice area, the key dates, and the facts a deadline depends on. Then:

- It asks up to three follow-up questions about missing facts, such as when the complaint was served.
- **Embellish** fills in everything else with invented details that stay consistent with what you said.
- **Surprise Me** builds a complete fictional matter from nothing, optionally limited to one practice area.

Every field carries a source label. A fact you stated looks plain; a fact the AI inferred or invented carries a visible marker. **Show what I said** highlights only your own facts, so the room can see exactly what the AI made up.

### Trust but Verify

Select any deadline, and a drawer shows its work:

- **The rule's own words,** quoted verbatim from a bundled copy of the official text, with a link to the source.
- **The date math, step by step:** the trigger date, the period added, any weekend or holiday roll-forward, and the result, each step citing its rule.
- **Assumption toggles:** switch personal service of a complaint to a Rule 4(d) waiver, or personal service of interrogatories to mail, and watch the date and the math redraw.
- **The reasoning chain,** labeled the same way as the intake fields.

When no bundled rule fits, the drawer says so in amber: "No source on file. Verify independently."

### How the dates work

The AI may choose which rule applies and pull the trigger date from what you said. It never computes a date. Plain, tested code does all the arithmetic, using encoded federal and Minnesota holiday calendars for 2024 through 2030. The engine covers about 25 common deadlines, including federal and Minnesota answers, interrogatories, bankruptcy proofs of claim, USPTO Office action responses, EEOC and Minnesota Human Rights Act charges, rulemaking comment periods, and contract deadlines.

These rules are a teaching sample. They do not cover every exception, local rule, court order, or tolling event, and nobody has reviewed them for use on real matters.

### The rules library

`data/rules/` bundles the verbatim text of the Federal Rules of Civil Procedure, the Minnesota Rules of Civil Procedure, the Minnesota General Rules of Practice, and selected bankruptcy rules, USPTO regulations, federal statutes, and Minnesota statutes. Each record names its official source and retrieval date. The text was retrieved on November 8, 2026, and will go stale as rules change.

### Building your own feature with `/cook`

The repo includes a Claude Code skill, `/cook`, that runs the same process used on stage:

1. Type `/cook` followed by your idea, for example `/cook a client update email for the active matter`.
2. Claude asks one scoping question at a time, each with a recommended answer.
3. Answer as many as you like. Say "answer everything else yourself" whenever you want it to stop asking and start building. After four minutes, your next message starts the build no matter what it says.
4. Claude builds the feature into the app, runs the tests, and tells you where to look.

New features plug into named slots (a Cockpit tab, the Cockpit sidebar, the Radar, the Portal, or the toolbar), so a build touches only a few files. `CLAUDE.md` explains the conventions to Claude Code.

## Quickstart

You need Node.js 22.12 or newer, [Claude Code](https://claude.com/claude-code), and a Claude API key.

```sh
git clone https://github.com/damienriehl/demo-mcle-2026-12.git
cd demo-mcle-2026-12
npm ci
npm run reset   # loads the seven fictional seed matters, dated relative to today
npm run dev
```

Open http://127.0.0.1:8982.

### Add your API key

The app reads its key from a file outside the repo, so it never lands in git or on a projector:

```sh
mkdir -p ~/.config/matter-cockpit && chmod 700 ~/.config/matter-cockpit
read -rsp 'Paste your Claude API key: ' K; echo; printf '%s' "$K" > ~/.config/matter-cockpit/api-key; chmod 600 ~/.config/matter-cockpit/api-key; unset K
```

You can instead set `MATTER_COCKPIT_API_KEY` in a `.env.local` file, which git ignores. The app never reads `ANTHROPIC_API_KEY`.

### Without a key

Everything except live intake still works: the seed matters, all three views, Trust but Verify, and Surprise Me, which draws from a pool of ready-made fictional matters. Ramble and Embellish explain that they need a key.

## Privacy

- Intake text goes to Anthropic's API under your own key. Use fictional facts only.
- The app listens only on `127.0.0.1`, so other machines on your network cannot reach it or spend your key.
- Matters live in `data/matters.json` on your machine, which git ignores. `npm run reset` rebuilds it from the seeds.

## For developers

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app and API with hot reload on port 8982 |
| `npm run reset` | Rebuilds `data/matters.json` from the seed matters |
| `npm test` | Runs the unit tests (engine, store, intake, rules library, seeds) |
| `npm run e2e` | Runs the browser tests; set `E2E_PORT` to use another port |
| `npm run typecheck` | Checks types |
| `npm run ingest:rules` | Re-downloads and rebuilds the rules library |

The stack is Vite, React, TypeScript, Tailwind on CSS-variable themes, and a small Hono API inside the dev server. Three themes ship: Law Review, Mission Control, and Boutique Firm.

## Related open-source legal projects

If you want a fuller platform to point Claude Code at, try these:

- [Mike](https://github.com/open-legal-products/mike): document review, drafting, and research
- [BigLaw](https://github.com/discover-legal/BigLaw): self-hosted memos with quote-verified citations
- [LQ.AI](https://github.com/LegalQuants/lq-ai): matter-scoped AI workspace with skills and playbooks

## License

MIT. See `LICENSE`, and `THIRD-PARTY.md` for dependency licenses. Federal rules, statutes, and regulations are public domain; Minnesota court rules and statutes come from the Minnesota Revisor of Statutes.
