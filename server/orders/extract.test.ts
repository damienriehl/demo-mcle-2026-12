import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { computeDeadline, deadlineCatalog } from '../../src/engine';
import { createMatterStore } from '../store';
import { materialize } from '../seed-dates';
import { createSchedulingOrderRoutes } from './extract';

test('a later upload retries a bundled order after its extraction file becomes readable', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'mc-order-retry-'));
  const slug = 'dminn-quillfeather';
  const pdf = readFileSync(`data/seed/orders/${slug}.pdf`);
  copyFileSync(`data/seed/orders/${slug}.pdf`, join(directory, `${slug}.pdf`));
  const store = createMatterStore({ filePath: join(directory, 'matters.json'), engine: { computeDeadline, deadlineCatalog } });
  t.after(() => store.close());
  t.mock.method(console, 'error', () => {});
  store.upsert(materialize(JSON.parse(readFileSync(`data/seed/matters/${slug}.json`, 'utf8')), '2026-11-08'));
  const app = createSchedulingOrderRoutes({ store, stream: null, ordersDirectory: directory });
  const upload = async () => {
    const body = new FormData();
    body.set('matterId', slug);
    body.set('file', new File([pdf], `${slug}.pdf`, { type: 'application/pdf' }));
    const response = await app.request('/extract', { method: 'POST', headers: { 'X-Matter-Cockpit-Upload': '1' }, body });
    return (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
  };
  const before = store.list();
  assert.deepEqual((await upload()).at(-1), { type: 'error', message: 'Scheduling order extraction could not finish.' });
  assert.deepEqual(store.list(), before);
  copyFileSync(`data/seed/orders/${slug}.extraction.json`, join(directory, `${slug}.extraction.json`));
  const completed = (await upload()).at(-1);
  assert.equal(completed.type, 'done');
  assert.deepEqual(completed.added, { courtDates: 8, derived: 3 });
  assert.equal(store.get(slug)!.deadlines.length, before[0].deadlines.length + 11);
});
