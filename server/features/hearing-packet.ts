import { Hono } from 'hono';
import { createClient, modelName, needsKeyResponse } from '../ai';
import { getMatterStore } from '../store';
import { chooseEvent, localToday } from '../../src/features/hearing-packet/packet';
import { buildNarrative } from '../hearing-packet/analyze';

export default new Hono().post('/analyze', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { matterId?: string; eventKey?: string; today?: string };
  const matter = body.matterId ? getMatterStore().get(body.matterId) : undefined;
  if (!matter) return c.json({ error: 'not_found', message: 'That matter is not in the workspace.' }, 404);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '') ? body.today! : localToday();
  const { event } = chooseEvent(matter, today, body.eventKey);
  const client = createClient();
  if (!client) return needsKeyResponse();
  try {
    return c.json({ narrative: await buildNarrative(client, modelName(), matter, event, today) });
  } catch {
    return c.json({ error: 'model_failed', message: 'The narrative sections did not finish. The dates and deadlines below come from the matter record.' }, 502);
  }
});
