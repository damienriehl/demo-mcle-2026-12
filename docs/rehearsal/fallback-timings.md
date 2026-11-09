# Fallback branch timings

Each primer idea was built once by following `/cook` with scripted answers, on 2026-11-08, starting from `feat/matter-cockpit` at `bd41b9e`. Seconds run from the skill's clock start to the final passing check. Every branch passed typecheck, the full unit suite, and the full browser suite. Tips below are after rebasing onto `main` on 2026-11-08 (unit suites pass on each). Rebase again onto final `main` and rerun the tests before the talk.

| Branch | Idea | Ripcord | Seconds | Tip |
|---|---|---|---|---|
| `fallback/budget-burn-down` | Fees billed against the client's budget (Cockpit tab) | "you decide the rest" | 110 | `1ecde16` |
| `fallback/conflict-check` | Names appearing in more than one matter (Cockpit sidebar) | late answer after the budget | 224 | `ccebf94` |
| `fallback/risk-heat-map` | Hottest matters first (Radar overlay) | spoken phrase | 242 | `bf40a49` |
| `fallback/client-update-email` | Drafted status email (Cockpit sidebar, model call) | spoken phrase | 314 | `09e7cbe` |
| `fallback/what-happens-next` | Plain-English next step (Client Portal, model call) | spoken phrase | 324 | `fd6a609` |
| `fallback/ask-the-rules` | Rule search quoting the bundled text (Cockpit tab) | spoken phrase | 405 | `52c40c1` |

Notes:

- Budget burn-down keeps the budget and fees in the browser tab, because the matter schema has no fee fields.
- Conflict check reads "Clear" on the seed matters, because no name repeats across them; it flags names on a crowd-added matter that reuses a party.
- Ask the Rules ranks by word match, so a broad question can surface a General Rule of Practice above the Civil Rule; the tab tells users to confirm each rule applies.
