import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import feature, { nextStepFacts } from '../server/features/what-happens-next';

const clientMatter = {
  id: 'm1',
  title: 'Northstar Studio v. Vale',
  clientFacing: { status: 'We filed your complaint.', nextSteps: ['Send us the signed copy.'] },
  deadlines: [{ id: 'past', label: 'Initial disclosures' }, { id: 'answer', label: 'Answer due' }, { id: 'reply', label: 'Reply brief' }, { id: 'open', label: 'Hearing' }],
  computedDeadlines: {
    past: { status: 'computed', dueDate: '2026-11-01' },
    answer: { status: 'computed', dueDate: '2026-11-20' },
    reply: { status: 'computed', dueDate: '2026-12-15' },
    open: { status: 'uncomputable', reason: 'The date is being confirmed.' },
  },
};

describe('what happens next', () => {
  it('picks the nearest upcoming engine deadline and keeps its date unchanged', () => {
    expect(nextStepFacts(clientMatter, '2026-11-08')).toEqual({
      title: 'Northstar Studio v. Vale',
      status: 'We filed your complaint.',
      nextSteps: ['Send us the signed copy.'],
      deadline: { label: 'Answer due', dueDate: '2026-11-20' },
    });
  });

  it('falls back to the plain next steps when no upcoming date is computed', () => {
    const facts = nextStepFacts({ ...clientMatter, computedDeadlines: { past: clientMatter.computedDeadlines.past } }, '2026-11-08');
    expect(facts.deadline).toBeNull();
    expect(facts.nextSteps).toEqual(['Send us the signed copy.']);
  });

  describe('without a configured key', () => {
    const saved = { file: process.env.MATTER_COCKPIT_API_KEY_FILE, key: process.env.MATTER_COCKPIT_API_KEY };
    afterEach(() => {
      for (const [name, value] of [['MATTER_COCKPIT_API_KEY_FILE', saved.file], ['MATTER_COCKPIT_API_KEY', saved.key]] as const) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    });

    it('answers with the standard needs_key message', async () => {
      process.env.MATTER_COCKPIT_API_KEY_FILE = join(mkdtempSync(join(tmpdir(), 'mc-whn-')), 'api-key');
      delete process.env.MATTER_COCKPIT_API_KEY;
      const res = await feature.request('/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matter: clientMatter }) });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: 'needs_key' });
    });
  });
});
