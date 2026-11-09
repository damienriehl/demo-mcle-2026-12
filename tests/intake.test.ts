import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BetaRawMessageStreamEvent as MessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matterSchema, type Matter } from '../src/data/schema';
import { computeDeadline, deadlineCatalog } from '../src/engine';
import { createMatterStore, type MatterStore } from '../server/store';
import { createIntakeRoutes, type ModelStream } from '../server/intake/routes';
import { createApp } from '../server/index';
import { readDraft, validateMatter } from '../server/intake/schema';

const fixtureDirectory = resolve('tests/fixtures/intake');
const fixture = (name: string) => JSON.parse(readFileSync(join(fixtureDirectory, `${name}.json`), 'utf8'));
const stores: MatterStore[] = [];
const storePaths = new Map<MatterStore, string>();
function store() {
  const filePath = join(mkdtempSync(join(tmpdir(), 'mc-intake-')), 'matters.json');
  const result = createMatterStore({
    filePath,
    engine: { computeDeadline, deadlineCatalog },
  });
  stores.push(result);
  storePaths.set(result, filePath);
  return result;
}
afterEach(() => { stores.splice(0).forEach((s) => s.close()); vi.unstubAllEnvs(); vi.useRealTimers(); });

function replay(...names: string[]) {
  const requests: Parameters<ModelStream>[0][] = [];
  const stream: ModelStream = async function* (request) {
    requests.push(request);
    const name = names[requests.length - 1];
    if (!name) throw new Error('Unexpected additional model call');
    for (const event of fixture(name).events) yield event as MessageStreamEvent;
  };
  return { stream, requests };
}
async function post(app: ReturnType<typeof createIntakeRoutes>, mode: string, body: unknown) {
  const response = await app.request(`/${mode}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  expect(response.headers.get('Content-Type')).toContain('text/event-stream');
  return (await response.text()).split('\n').filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}
function draftFrom(events: ReturnType<typeof fixture>[]) {
  const draft: Record<string, any> = { provenance: {} };
  for (const event of events.filter((e) => e.type === 'field')) {
    const parts = event.path.split('.');
    let target = draft;
    parts.slice(0, -1).forEach((key: string, i: number) => {
      target = target[key] ??= /^\d+$/.test(parts[i + 1]) ? [] : {};
    });
    target[parts.at(-1)!] = event.value;
    draft.provenance[event.path] = { source: event.source, ...(event.evidence ? { evidence: event.evidence } : {}) };
  }
  return draft;
}

describe('streamed intake routes', () => {
  it('round-trips an empty internalOnly field before applying schema defaults', async () => {
    const stream: ModelStream = async function* () {
      yield { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'empty-internal', name: 'structure_matter', input: {} } } as MessageStreamEvent;
      yield { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({
        fields: [{ path: 'internalOnly', value: [], source: 'invented' }],
        followups: [{ id: 'forum', field: 'forum', question: 'Which forum?' }],
      }) } };
      yield { type: 'content_block_stop', index: 0 };
    };
    const events = await post(createIntakeRoutes({ store: store(), stream }), 'ramble', {
      text: 'A fictional matter.', draft: fixture('canned-employment'),
    });
    const clientDraft = { ...fixture('canned-employment'), ...draftFrom(events) };
    clientDraft.provenance = { ...fixture('canned-employment').provenance, ...draftFrom(events).provenance };
    const roundTrip = readDraft(clientDraft);
    expect(roundTrip.errors).toEqual([]);
    expect(events).toContainEqual({ type: 'field', path: 'internalOnly', value: [], source: 'invented' });
    const matter = validateMatter(roundTrip.draft);
    expect(matter.internalOnly).toEqual(['reasoning', 'provenance.*.evidence']);
    expect(matter.provenance['internalOnly.0']).toEqual({ source: 'inferred', evidence: 'Matter schema default.' });
    expect(readDraft(matter).errors).toEqual([]);
  });

  it('rejects browser-simple text requests before spending the model key or saving', async () => {
    const fake = replay('unknown-rule');
    const saved = store();
    const response = await createIntakeRoutes({ store: saved, stream: fake.stream }).request('/surprise', {
      method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://unrelated.example.invalid' }, body: '{}',
    });
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    expect(await response.text()).toContain('"type":"error"');
    expect(fake.requests).toHaveLength(0);
    expect(saved.list()).toEqual([]);
  });

  it('retains a stated fictional name and asks for the missing termination date', async () => {
    const fake = replay('ramble');
    const saved = store();
    const events = await post(createIntakeRoutes({ store: saved, stream: fake.stream }), 'ramble', {
      text: 'My fictional client Mira Example was fired for reporting discrimination.',
    });
    expect(events).toContainEqual({ type: 'field', path: 'client.name', value: 'Mira Example',
      source: 'stated', evidence: 'My fictional client Mira Example' });
    expect(events.at(-1)).toEqual({ type: 'followups', questions: [{
      id: 'deadlines.0.trigger.date', question: 'When was the termination?', field: 'deadlines.0.trigger.date',
    }] });
    expect(saved.list()).toEqual([]);
    expect(fake.requests[0].system).toContain('eeoc-charge');
    expect(fake.requests[0].system).toContain(deadlineCatalog().find((r) => r.id === 'eeoc-charge')!.description);
  });

  it('Embellish completes the client-held draft, invents a trigger and lets the engine compute the date', async () => {
    const fake = replay('ramble', 'complete');
    const saved = store();
    const app = createIntakeRoutes({ store: saved, stream: fake.stream });
    const ramble = await post(app, 'ramble', { text: 'My fictional client Mira Example was fired.' });
    const events = await post(app, 'embellish', { draft: draftFrom(ramble) });
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    expect(matterSchema.safeParse(done.matter).success).toBe(true);
    expect(done.matter.client.name).toBe('Mira Example');
    expect(done.matter.provenance['client.name'].source).toBe('stated');
    expect(events).toContainEqual(expect.objectContaining({ type: 'field', path: 'deadlines.0.trigger.date',
      value: '2026-01-05', source: 'invented' }));
    expect(saved.get(done.matter.id)?.computedDeadlines.charge).toMatchObject({ status: 'computed', dueDate: '2026-11-02' });
    expect(readFileSync(storePaths.get(saved)!, 'utf8')).not.toContain('dueDate');
    expect(done.matter).not.toHaveProperty('computedDeadlines');
  });

  it('accepts a stateless follow-up answer and retains its stated evidence', async () => {
    const fake = replay('answer');
    const draft = fixture('canned-employment') as Matter;
    const events = await post(createIntakeRoutes({ store: store(), stream: fake.stream }), 'answer', {
      draft, answers: [{ questionId: 'deadlines.0.trigger.date', answer: 'January 6, 2026' }],
    });
    expect(events.at(-1)).toMatchObject({ type: 'done', matter: {
      deadlines: [{ trigger: { date: '2026-01-06' } }],
      provenance: { 'deadlines.0.trigger.date': { source: 'stated', evidence: 'January 6, 2026' } },
    } });
    expect(JSON.stringify(fake.requests[0].messages)).toContain('January 6, 2026');
  });

  it('maps unknown catalog IDs to none, saves the matter, and exposes an uncomputable deadline', async () => {
    const saved = store();
    const events = await post(createIntakeRoutes({ store: saved, stream: replay('unknown-rule').stream }), 'surprise', {});
    expect(events.at(-1)).toMatchObject({ type: 'done', matter: { deadlines: [{ deadlineRuleId: 'none' }] } });
    expect(saved.list()[0].computedDeadlines.charge.status).toBe('uncomputable');
    expect(events).toContainEqual(expect.objectContaining({ type: 'field', path: 'deadlines.0.deadlineRuleId', value: 'none' }));
  });

  it('keeps an existing matter when a new intake proposes the same ID', async () => {
    const saved = store();
    const existing = fixture('canned-employment');
    existing.title = 'Existing synthetic matter kept';
    saved.upsert(existing);
    const events = await post(createIntakeRoutes({ store: saved, stream: replay('unknown-rule').stream }), 'surprise', {});
    expect(events.at(-1).type).toBe('done');
    expect(events.at(-1).matter.id).not.toBe(existing.id);
    expect(saved.list()).toHaveLength(2);
    expect(saved.get(existing.id)?.title).toBe('Existing synthetic matter kept');
    expect(events).toContainEqual({ type: 'field', path: 'id', value: events.at(-1).matter.id, source: 'invented' });
  });

  it('keeps external matters written before the store watcher observes them', async () => {
    const saved = store();
    const existing = fixture('canned-employment');
    existing.title = 'External synthetic matter kept';
    const stream: ModelStream = async function* () {
      for (const event of fixture('unknown-rule').events) yield event as MessageStreamEvent;
      writeFileSync(storePaths.get(saved)!, JSON.stringify([existing]));
      expect(saved.list()).toEqual([]);
    };
    const events = await post(createIntakeRoutes({ store: saved, stream }), 'surprise', {});
    expect(events.at(-1).type).toBe('done');
    expect(saved.get(existing.id)?.title).toBe('External synthetic matter kept');
    expect(saved.list()).toHaveLength(2);
  });

  it('retries a Surprise Me result outside the requested practice area and never saves it', async () => {
    const fake = replay('unknown-rule', 'unknown-rule');
    const saved = store();
    const events = await post(createIntakeRoutes({ store: saved, stream: fake.stream }), 'surprise', { practiceArea: 'family' });
    expect(fake.requests).toHaveLength(2);
    expect(events.at(-1).type).toBe('error');
    expect(events.some((event) => event.type === 'done')).toBe(false);
    expect(saved.list()).toEqual([]);
  });

  it('caps five proposed follow-ups at three', async () => {
    const events = await post(createIntakeRoutes({ store: store(), stream: replay('five-questions').stream }), 'ramble', { text: 'A fictional firing.' });
    expect(events.at(-1).questions).toHaveLength(3);
  });

  it('retries validation once, keeps valid partial fields, and flags Embellish after another invalid response', async () => {
    const fake = replay('invalid', 'invalid');
    const saved = store();
    const events = await post(createIntakeRoutes({ store: saved, stream: fake.stream }), 'ramble', { text: 'A fictional firing.' });
    expect(fake.requests).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Embellish'), partial: {
      client: { name: 'Mira Example' }, provenance: { 'client.name': { source: 'stated' } },
    } });
    expect(JSON.stringify(events.at(-1).partial)).not.toContain('dueDate');
    expect(JSON.stringify(events.at(-1).partial)).not.toContain('not-a-date');
    expect(saved.list()).toEqual([]);
  });

  it('can repair an invalid result on its one retry', async () => {
    const fake = replay('invalid', 'complete');
    const events = await post(createIntakeRoutes({ store: store(), stream: fake.stream }), 'ramble', { text: 'A fictional firing.' });
    expect(events.at(-1).type).toBe('done');
    expect(fake.requests).toHaveLength(2);
  });

  it('Embellish preserves stated facts even if the model tries to replace them', async () => {
    const fake = replay('contradicting', 'contradicting');
    const saved = store();
    const draft = fixture('canned-employment');
    draft.provenance['client.name'] = { source: 'stated', evidence: 'My fictional client Mira Example' };
    const events = await post(createIntakeRoutes({ store: saved, stream: fake.stream }), 'embellish', { draft });
    expect(events.at(-1)).toMatchObject({ type: 'error', partial: { client: { name: 'Mira Example' },
      provenance: { 'client.name': { source: 'stated' } } } });
    expect(saved.list()).toEqual([]);
    expect(events.filter((event) => event.type === 'field')).toEqual([]);
  });

  it('Embellish preserves collections explicitly stated to be empty', async () => {
    const saved = store();
    const draft = fixture('canned-employment');
    draft.parties = [];
    draft.provenance.parties = { source: 'stated', evidence: 'There are no other parties.' };
    const fake = replay('stated-empty', 'stated-empty');
    const events = await post(createIntakeRoutes({ store: saved, stream: fake.stream }), 'embellish', { draft });
    expect(events.at(-1)).toMatchObject({ type: 'error', partial: { parties: [] } });
    expect(events.filter((event) => event.type === 'field')).toEqual([]);
    expect(saved.list()).toEqual([]);
  });

  it('rejects nonconsecutive array indices without streaming or storing those fields', async () => {
    const saved = store();
    const fake = replay('nonconsecutive', 'nonconsecutive');
    const events = await post(createIntakeRoutes({ store: saved, stream: fake.stream }), 'embellish', { draft: fixture('canned-employment') });
    expect(events.at(-1).type).toBe('error');
    expect(events.at(-1).partial.timeline).toHaveLength(1);
    expect(events.filter((event) => event.type === 'field')).toEqual([]);
    expect(saved.list()).toEqual([]);
  });

  it('retries malformed tool JSON and keeps fields streamed before the invalid suffix', async () => {
    const fake = replay('malformed', 'malformed');
    const events = await post(createIntakeRoutes({ store: store(), stream: fake.stream }), 'ramble', { text: 'A fictional firing.' });
    expect(fake.requests).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: 'error', partial: { client: { name: 'Mira Example' } } });
  });

  it('streams a complete field before the model finishes', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    const recorded = fixture('ramble').events as MessageStreamEvent[];
    const stream: ModelStream = async function* () {
      for (const event of recorded.slice(0, -2)) yield event;
      await waiting;
      for (const event of recorded.slice(-2)) yield event;
    };
    const app = createIntakeRoutes({ store: store(), stream });
    const response = await app.request('/ramble', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'A fictional firing.' }) });
    const reader = response.body!.getReader();
    try {
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain('"type":"field"');
    } finally { finish(); await reader.cancel(); }
  });

  it('reports stream failures with a usable partial draft', async () => {
    const stream: ModelStream = async function* () {
      for (const event of fixture('ramble').events.slice(0, -2)) yield event;
      throw new Error('stream interrupted');
    };
    const events = await post(createIntakeRoutes({ store: store(), stream }), 'ramble', { text: 'A fictional firing.' });
    expect(events.at(-1)).toMatchObject({ type: 'error', partial: { client: { name: 'Mira Example' } } });
  });

  it.each(['provider', 'generic'])('redacts request details and keys from %s stream errors and logs', async kind => {
    const sentinel = 'sk-ant-TESTKEY';
    const details = `Request headers: x-api-key: ${sentinel}`;
    const error = kind === 'provider'
      ? new Anthropic.APIError(401, { error: { type: 'authentication_error', message: details } }, details,
        new Headers({ 'x-api-key': sentinel }), 'authentication_error')
      : new Error(details);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const stream: ModelStream = async function* () { throw error; };
      const events = await post(createIntakeRoutes({ store: store(), stream }), 'ramble', { text: 'A fictional matter.' });
      expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Embellish') });
      expect(JSON.stringify(events)).not.toContain(sentinel);
      expect(JSON.stringify(events)).not.toContain('Request headers');
      expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
      expect(log.mock.calls).toEqual([[kind === 'provider' ? 'intake failed: APIError 401 authentication_error' : 'intake failed: Error']]);
    } finally { log.mockRestore(); }
  });
});

describe('no-key intake', () => {
  it.each(['ramble', 'answer', 'embellish'])('%s sends the standard needs_key event', async (mode) => {
    const app = createIntakeRoutes({ store: store(), stream: null });
    const body = mode === 'ramble' ? { text: 'A fictional matter' }
      : mode === 'answer' ? { draft: {}, answers: [] } : { draft: {} };
    const events = await post(app, mode, body);
    expect(events).toEqual([{ type: 'needs_key', message: expect.stringContaining('MATTER_COCKPIT_API_KEY') }]);
  });

  it('Surprise Me loads a complete canned matter filtered by practice area and saves it', async () => {
    const saved = store();
    const app = createIntakeRoutes({ store: saved, stream: null, cannedDirectory: resolve('data/seed/canned') });
    const events = await post(app, 'surprise', { practiceArea: 'employment' });
    expect(events.at(-1).type).toBe('done');
    expect(matterSchema.safeParse(events.at(-1).matter).success).toBe(true);
    expect(events.at(-1).matter.practiceArea).toBe('employment');
    expect(saved.list()).toHaveLength(1);
    const fields = events.filter(event => event.type === 'field');
    expect(fields.every(field => field.source === 'invented' && field.evidence === undefined)).toBe(true);
    expect(Object.values(events.at(-1).matter.provenance).every((label: any) => label.source === 'invented' && label.evidence === undefined)).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'field', path: 'client.name', source: 'invented' }));
    const second = await post(app, 'surprise', {});
    expect(second.at(-1).matter.id).not.toBe(events.at(-1).matter.id);
    expect(saved.list()).toHaveLength(2);
  });

  it('materializes relative canned seed dates using today before saving', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    const cannedDirectory = mkdtempSync(join(tmpdir(), 'mc-canned-offsets-'));
    writeFileSync(join(cannedDirectory, 'employment.json'), JSON.stringify(fixture('canned-offsets')));
    const saved = store();
    const events = await post(createIntakeRoutes({ store: saved, stream: null, cannedDirectory }), 'surprise', { practiceArea: 'employment' });
    expect(events.at(-1)).toMatchObject({ type: 'done', matter: {
      timeline: [{ date: '2026-11-06' }], deadlines: [{ trigger: { date: '2026-11-06' } }],
    } });
    expect(saved.list()[0].timeline[0].date).toBe('2026-11-06');
  });

  it("opens each model request with today's local date, outside the system prompt", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 2, 9, 12));
    const fake = replay('ramble');
    await post(createIntakeRoutes({ store: store(), stream: fake.stream }), 'ramble', {
      text: 'My fictional client Mira Example was fired around October 3rd.',
    });
    const content = fake.requests[0].messages[0].content as string;
    expect(content.split('\n')[0]).toBe('Today is 2027-03-09.');
    expect(fake.requests[0].system).not.toContain('2027-03-09');
    expect(fake.requests[0].system).toContain('most recent such date on or before today');
  });

  it('mounts the intake routes on the main server', async () => {
    vi.stubEnv('MATTER_COCKPIT_API_KEY', '');
    vi.stubEnv('MATTER_COCKPIT_API_KEY_FILE', join(tmpdir(), 'missing-mc-intake-key'));
    const response = await createApp({}, store()).request('/api/intake/ramble', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'A fictional firing.' }),
    });
    expect(await response.text()).toContain('"type":"needs_key"');
  });
});
