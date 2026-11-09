import { Hono } from 'hono';
import { createClient, modelName, needsKeyResponse } from '../ai';
import { getMatterStore } from '../store';
import { filingDate, inventionSummary, keywordQueries } from '../../src/features/prior-art/invention';
import type { RunResult } from '../../src/features/prior-art/types';
import { rateReferences } from '../prior-art/analyze';
import { detectPatentNumbers, parsePatentNumbers } from '../prior-art/normalize';
import { runPriorArt, runReferences } from '../prior-art/service';
import { createOdpApi, readUsptoKey } from '../prior-art/uspto';

const runs = new Map<string, { run: RunResult; invention: string }>();

export default new Hono()
  .post('/run', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { matterId?: string; numbers?: string; depth?: number };
    const matter = body.matterId ? getMatterStore().get(body.matterId) : undefined;
    if (!matter) return c.json({ error: 'not_found', message: 'That matter is not in the workspace.' }, 404);
    if (matter.practiceArea !== 'patent') return c.json({ error: 'not_patent', message: 'Prior art applies to patent matters.' }, 400);
    const typed = String(body.numbers ?? '');
    const sampleIds = [...typed.matchAll(/SAMPLE-\d+/gi)].map(m => m[0].toUpperCase());
    const text = matter.documents.map(doc => doc.body).join('\n');
    const numbers = [...new Set([...parsePatentNumbers(typed.replace(/SAMPLE-\d+/gi, ' ')), ...detectPatentNumbers(text), ...sampleIds])];
    const invention = inventionSummary(matter);
    const key = readUsptoKey();
    const run = await runPriorArt({ queries: keywordQueries(matter), beforeDate: filingDate(matter), numbers, depth: Number(body.depth) || 2 }, key ? createOdpApi(key) : null);
    runs.set(run.runId, { run, invention });
    if (runs.size > 20) runs.delete(runs.keys().next().value!);
    return c.json({ ...run, invention });
  })
  .post('/analyze', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { runId?: string };
    const saved = body.runId ? runs.get(body.runId) : undefined;
    if (!saved) return c.json({ error: 'expired', message: 'Run the search again, then ask for ratings.' }, 404);
    const client = createClient();
    if (!client) return needsKeyResponse();
    try {
      return c.json({ ratings: await rateReferences(client, modelName(), saved.invention, runReferences(saved.run)) });
    } catch {
      return c.json({ error: 'model_failed', message: 'The relevance analysis did not finish. The listing below is still complete.' }, 502);
    }
  });
