# Matter Cockpit — notes for Claude Code

A demo legal-matter app built live on stage. Synthetic matters only.

## Stack

- Client: Vite + React 19 + TypeScript, styled with Tailwind v4 on CSS-variable design tokens.
- Server: a Hono app mounted inside the Vite dev server, so client and API share one port.
- Tests: Vitest (`tests/*.test.ts`) and Playwright (`tests/*.spec.ts`, Chromium).

## Commands

- `npm run dev` starts everything on http://127.0.0.1:8982. Client edits hot-reload in the browser;
  server edits (anything under `server/`) apply on the next request. Never restart the server for a change.
- `npm run typecheck`, `npm test`, `npm run e2e` before calling a change done.
- `npm run smoke:ai` checks the configured key and model; `npm run reset` rebuilds the demo store.

## Where things go

- A new feature is one folder under `src/features/` (client). If it needs the server or the model,
  add `server/features/<slug>.ts` default-exporting a Hono app; it mounts at `/api/features/<slug>`
  automatically. See `server/features/README.md`.
- Call Claude only through `server/ai.ts` (`createClient`, `modelName`, `needsKeyResponse`).
  When no key is configured, return `needsKeyResponse()` and let the UI say so.
- Matter store schema: documented by the store unit (not built yet).
- Theme tweaks are token edits in `src/theme/tokens.css`; do not hard-code colors, fonts, or sizes in components.

## Rules

- Projector legibility: body text at least 7:1 contrast, nothing below 18px, never meaning by color alone.
- The dev server binds 127.0.0.1 only. Never bind 0.0.0.0 and never set `allowedHosts: true`;
  add host names through `MATTER_COCKPIT_ALLOWED_HOSTS`.
- The app key lives in `~/.config/matter-cockpit/api-key` or `MATTER_COCKPIT_API_KEY`. Never read,
  print, or log it, never read `.env*` files, and never use `ANTHROPIC_API_KEY` for the app.
- Environment variable names are listed in `.env.example`.
