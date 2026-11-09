# Server feature routes

Drop a file here named `<slug>.ts` (lowercase letters, digits, dashes) that
default-exports a Hono app. It mounts at `/api/features/<slug>` on the next
request; no restart, no registration file.

```ts
import { Hono } from 'hono';
import { createClient, modelName, needsKeyResponse } from '../ai';

export default new Hono().post('/summarize', async (c) => {
  const client = createClient();
  if (!client) return needsKeyResponse();
  // client.messages.create({ model: modelName(), ... })
  return c.json({ ok: true });
});
```

Call the model only through `server/ai.ts`: it applies the app key, the model
choice, and the standard `needs_key` (HTTP 503) answer when no key is set.
