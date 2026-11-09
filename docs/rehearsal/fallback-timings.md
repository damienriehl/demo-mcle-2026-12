# Fallback branch timings

Each primer idea was built once by following `/cook` with scripted answers, on 2026-11-08, starting from `feat/matter-cockpit` at `bd41b9e`. Seconds run from the skill's clock start to the final passing check. Every branch passed typecheck, the full unit suite, and the full browser suite. Tips below are after rebasing onto final `main` (`c9ce38e`, with Draft Compare) on 2026-11-09; each passed typecheck, the full unit suite, and the full browser suite. The rebased branches are local only: their remote copies still hold the old tips, so switch to the local branch on stage.

| Branch | Idea | Ripcord | Seconds | Tip |
|---|---|---|---|---|
| `fallback/budget-burn-down` | Fees billed against the client's budget (Cockpit tab) | "you decide the rest" | 110 | `7ea8024` |
| `fallback/conflict-check` | Names appearing in more than one matter (Cockpit sidebar) | late answer after the budget | 224 | `482aea6` |
| `fallback/risk-heat-map` | Hottest matters first (Radar overlay) | spoken phrase | 242 | `26f5c3e` |
| `fallback/client-update-email` | Drafted status email (Cockpit sidebar, model call) | spoken phrase | 314 | `16c9d93` |
| `fallback/what-happens-next` | Plain-English next step (Client Portal, model call) | spoken phrase | 324 | `249d43b` |
| `fallback/ask-the-rules` | Rule search quoting the bundled text (Cockpit tab) | spoken phrase | 405 | `f4bc66b` |

Notes:

- Budget burn-down keeps the budget and fees in the browser tab, because the matter schema has no fee fields.
- Conflict check reads "Clear" on the seed matters, because no name repeats across them; it flags names on a crowd-added matter that reuses a party.
- Ask the Rules ranks by word match, so a broad question can surface a General Rule of Practice above the Civil Rule; the tab tells users to confirm each rule applies.
