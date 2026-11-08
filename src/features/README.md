# Feature slots

Add `src/features/<slug>/index.tsx`. The eager glob in `load.ts` discovers the folder automatically; keep registration in the entry file. No host view edit is required.

```tsx
import { registerFeature } from '../registry';

registerFeature({
  id: 'practice-brief',
  title: 'Practice brief',
  slot: 'cockpit.tab',
  component: ({ matters, activeMatter }) => (
    <p>{activeMatter?.title} — {matters.length} matters in the workspace</p>
  ),
});
```

`registerFeature({ id, title, slot, component })` registers a stable, unique ID. Registering the same ID replaces it during hot reload. `featuresFor(slot)` returns the current registrations. Components receive `{ matters, activeMatter }` from the shared live snapshot. `activeMatter` can be undefined.

| Slot | Placement |
| --- | --- |
| `cockpit.tab` | A selectable tab next to Overview |
| `cockpit.sidebar` | Below the active matter's deadlines |
| `radar.overlay` | On the Radar workspace |
| `portal.section` | Below the client's shared documents |
| `toolbar` | In the persistent utility bar |

Portal components receive a client-facing projection: internal-only paths, reasoning, evidence, calculation steps, deadline inputs, private documents, and other non-client fields are omitted. Arrays retain their original indices, with hidden entries absent. Treat projected fields as optional. Do not fetch the unfiltered matter API from Portal features.

A model-powered feature adds `server/features/<slug>.ts`, default-exporting a Hono app. It mounts automatically at `/api/features/<slug>`. Use `server/ai.ts` for the key, model, and standard needs-key response. Never put a model key in browser code.

Keep source labels and the 18px projector floor. Verification links should open over the current workspace. The executable registration example lives in `tests/fixtures/views/feature.json`; the view test creates and removes its temporary feature folder, so no sample feature ships.
