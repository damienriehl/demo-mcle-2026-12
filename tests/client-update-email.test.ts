import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import route from '../server/features/client-update-email';
import { createMatterStore } from '../server/store';
import { computeDeadline, deadlineCatalog } from '../src/engine';
import { emailFacts } from '../src/features/client-update-email/facts';
import fixtures from './fixtures/views/matters.json';

function derived(index: number) {
  const store = createMatterStore({ filePath: join(mkdtempSync(join(tmpdir(), 'mc-email-')), 'matters.json'), engine: { computeDeadline, deadlineCatalog } });
  try { store.upsert(fixtures[index]); return store.get(fixtures[index].id)!; } finally { store.close(); }
}

describe('client update email facts', () => {
  it('uses client-facing status, visible next steps, and engine-computed upcoming dates', () => {
    const matter = derived(0);
    expect(matter.computedDeadlines.due).toMatchObject({ status: 'computed', dueDate: '2026-11-05' });
    const facts = emailFacts(matter, '2026-11-01');
    expect(facts).toEqual({
      clientName: 'Northstar Client',
      matterTitle: 'Northstar Studio v. Vale',
      status: 'We are reviewing the next steps with you.',
      nextSteps: ['Send us the signed copy.', 'Call us to discuss your questions.'],
      upcomingDates: [{ label: 'Review and response', date: 'Nov 5, 2026' }],
    });
  });

  it('leaves out dates that have already passed', () => {
    expect(emailFacts(derived(0), '2026-12-31').upcomingDates).toEqual([]);
  });
});

describe('client update email route', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.MATTER_COCKPIT_API_KEY;
    process.env.MATTER_COCKPIT_API_KEY_FILE = join(mkdtempSync(join(tmpdir(), 'mc-email-nokey-')), 'api-key');
  });
  afterEach(() => { process.env = { ...saved }; });

  it('answers needs_key without a configured app key', async () => {
    const res = await route.request('/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts: emailFacts(derived(0), '2026-11-01') }) });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'needs_key' });
  });
});
