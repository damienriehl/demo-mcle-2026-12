# Matter Cockpit

A small legal-matter app for a live "build it with Claude Code" CLE demo. Point
Claude Code at this repo and add your own feature.

**Synthetic matters only.** Text you type into intake goes to the model provider
(Anthropic); do not enter real client information.

## Quickstart

Prerequisites: Node.js 22.12 or newer, [Claude Code](https://claude.com/claude-code),
and a Claude API key.

```sh
npm ci
mkdir -p ~/.config/matter-cockpit && chmod 700 ~/.config/matter-cockpit
# put your key in ~/.config/matter-cockpit/api-key (chmod 600),
# or in .env.local as MATTER_COCKPIT_API_KEY=...
npm run dev
```

Open http://127.0.0.1:8982. The app runs without a key; features that call the
model tell you when one is missing.

## More

- `npm test` and `npm run e2e` run the unit and browser tests.
- Settings live in environment variables; `.env.example` lists them.
- `CLAUDE.md` tells Claude Code how the repo fits together.
- License: MIT. Third-party licenses: `THIRD-PARTY.md`.
