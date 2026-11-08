import { hasKey } from '../server/ai';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matterSchema } from '../src/data/schema';
import { computeDeadline, deadlineCatalog } from '../src/engine';
import { createIntakeRoutes } from '../server/intake/routes';
import { createMatterStore } from '../server/store';

if (!hasKey()) {
  console.log('smoke:ai skipped: no key');
  process.exit(0);
}

const store = createMatterStore({
  filePath: join(mkdtempSync(join(tmpdir(), 'mc-smoke-ai-')), 'matters.json'),
  engine: { computeDeadline, deadlineCatalog },
});
const started = performance.now();
try {
  const response = await createIntakeRoutes({ store }).request('/ramble', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ text: 'Create a complete synthetic employment matter for fictional Mira Example, mira@example.invalid. Juniper Example Works fired her on January 5, 2026 for reporting discrimination. Forum: EEOC in Minnesota. State proceedings qualify for the 300-day charge window; no earlier termination notice or tolling. Invent the remaining narrative details and documents. No real persons are involved.' }),
  });
  const events = (await response.text()).split('\n').filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; matter?: unknown });
  const done = events.find((event) => event.type === 'done');
  matterSchema.parse(done?.matter);
  const elapsed = Math.round(performance.now() - started);
  if (elapsed >= 60_000) throw new Error('Intake exceeded 60 seconds');
  console.log(`smoke:ai passed: schema-valid synthetic matter saved in ${elapsed}ms`);
} catch {
  // Do not print raw SDK errors, request metadata, or model output on a projector.
  console.error('smoke:ai failed: intake did not save a valid matter within 60 seconds');
  process.exitCode = 1;
} finally { store.close(); }
