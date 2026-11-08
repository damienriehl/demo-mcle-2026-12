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
- Matter store schema: see the shared matter store section below and `src/data/schema.ts`.
- Theme tweaks are token edits in `src/theme/tokens.css`; do not hard-code colors, fonts, or sizes in components.

## Rules

- Projector legibility: body text at least 7:1 contrast, nothing below 18px, never meaning by color alone.
- The dev server binds 127.0.0.1 only. Never bind 0.0.0.0 and never set `allowedHosts: true`;
  add host names through `MATTER_COCKPIT_ALLOWED_HOSTS`.
- The app key lives in `~/.config/matter-cockpit/api-key` or `MATTER_COCKPIT_API_KEY`. Never read,
  print, or log it, never read `.env*` files, and never use `ANTHROPIC_API_KEY` for the app.
- Environment variable names are listed in `.env.example`.

## Shared matter store

add a matter by editing data/matters.json; write trigger dates, never due dates

The runtime file is a JSON array of synthetic matters. It is gitignored; `npm run reset`
rebuilds it from `data/seed/matters/*.json`. The server watches it, validates each whole
write, and keeps the last good list if JSON, schema, or deadline catalog validation fails.
Errors name the failed dot path (`$` means the JSON root). Server writes replace the file
atomically. Claude Code can also write a temporary file and rename it over the runtime file.

`src/data/schema.ts` exports `matterSchema`, `mattersSchema`, `Matter`, and
`MatterWithDeadlines`. Objects reject unknown fields. Each matter has:

| Field | Stored value |
| --- | --- |
| `id`, `title`, `forum` | Nonempty strings; matter IDs are unique across the list. |
| `practiceArea` | `litigation`, `transactional`, `patent`, `bankruptcy`, `family`, `employment`, or `regulatory`. |
| `synthetic` | Required literal `true`. Use only fictional names, contacts, stories, and documents. |
| `client` | `{ name, contact }`, both fictional strings. Use an `example.invalid` contact. |
| `parties` | Array of `{ name, role }`. |
| `timeline` | Array of `{ id, event, date }`, with ISO `YYYY-MM-DD` dates. |
| `documents` | Array of `{ id, title, kind, body, shared? }`. Bodies are short synthetic text; `shared` defaults to `false`. The Portal shows only shared documents. |
| `deadlines` | Array of `{ id, label, deadlineRuleId, trigger: { event, date }, assumptions, inputs? }`. Dates are ISO dates; assumptions map names to strings, numbers, or booleans, and inputs map names to strings or numbers. |
| `clientFacing` | `{ status: string, nextSteps: string[] }` in plain language. |
| `provenance` | Map from dot field paths, including array indices (e.g. `client.name`, `timeline.0.date`), to `{ source: "stated" \| "inferred" \| "invented", evidence?: string }`. Supply provenance for each authored field. |
| `reasoning` | Optional internal assessment string. |
| `internalOnly` | Optional array of internal-only dot field paths. Defaults always include `reasoning` and `provenance.*.evidence`; `*` matches one key or array index. The Portal must hide these paths. |

The Portal's filtering is a presentation responsibility: the local demo API includes internal
fields for the Cockpit. Do not render reasoning or provenance evidence in the Portal.

`deadlineRuleId` is a deadline **catalog** ID, such as `frcp-12a-answer`, or `none`.
It is distinct from a rule citation ID such as `frcp:12`. An unknown catalog ID is rejected.
`none` produces an uncomputable result. Deadline IDs must be unique within each matter.
Neither `dueDate` nor `computedDeadlines` may be stored.
Engine steps carry `{ ruleId, subdivision? }` citations; subdivisions stay separate from rule IDs.

`server/store.ts` exports `getMatterStore()` (the process singleton), `createMatterStore()`
(an isolated file store), and `StoreValidationError`. The singleton, watcher, and subscriptions
survive Vite server module reloads. Call
`getMatterStore().setEngine({ computeDeadline, deadlineCatalog })` during engine integration.
Until injection, only `none` is accepted. A factory can take the same `engine` object as an option.
The temporary engine contract lives in `src/data/engine-types.ts`; integration can switch it
to `src/engine/types.ts` without creating a second engine implementation.

Store methods are `list()`, `get(id)`, `upsert(matter)`, `remove(id)`, and `subscribe(listener)`.
Read responses add `computedDeadlines: Record<deadlineId, DeadlineResult>`; a computed result
has `{ status: "computed", dueDate, steps }`, and an uncomputable result has
`{ status: "uncomputable", reason, steps }`. Results are recomputed on read and never persisted.

HTTP: `GET /api/matters`, `GET /api/matters/:id`, `POST /api/matters` (upsert),
`PUT /api/matters/:id` (full replacement, body ID must match), and `DELETE /api/matters/:id`.
Writes return the derived matter, invalid writes return 400 with a field-specific message,
and missing IDs return 404. Delete returns 204. `GET /api/events` sends a default SSE message
containing the full derived list immediately and after each change. `src/data/useMatters.ts`
exports `useMatters(): MatterWithDeadlines[]` for every browser view, sharing one EventSource
per page. EventSource reconnects automatically and receives a fresh full snapshot.
