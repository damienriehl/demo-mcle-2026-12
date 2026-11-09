import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/index';
import { createMatterStore, getMatterStore, type MatterStore } from '../server/store';
import { matterSchema } from '../src/data/schema';
import type { DeadlineEngine, DeadlineInput } from '../src/data/engine-types';
import { computeDeadline, deadlineCatalog } from '../src/engine';
import { resetDemo } from '../scripts/reset-demo';

const engine = {
  deadlineCatalog: () => [{ id: 'test-answer', label: 'Answer', description: 'Test rule', assumptions: [] }],
  computeDeadline: (input: DeadlineInput) => {
    const date = new Date(`${input.trigger.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 19);
    return { status: 'computed' as const, dueDate: date.toISOString().slice(0, 10), steps: [] };
  },
};

function matter(id = 'synthetic-one') {
  return {
    id, title: 'Synthetic dispute', practiceArea: 'litigation', forum: 'Fictional District Court',
    synthetic: true, client: { name: 'Fictional Client', contact: 'client@example.invalid' },
    parties: [{ name: 'Imaginary Supplier', role: 'defendant' }],
    timeline: [{ id: 'service', event: 'Complaint served', date: '2026-11-01' }],
    documents: [{ id: 'complaint', title: 'Synthetic complaint', kind: 'pleading', body: 'Entirely fictional.', shared: true }],
    deadlines: [{ id: 'answer', label: 'Answer', deadlineRuleId: 'test-answer', trigger: { event: 'service', date: '2026-11-01' }, assumptions: {} }],
    clientFacing: { status: 'We are preparing your response.', nextSteps: ['Review the fictional complaint.'] },
    reasoning: 'Internal assessment', provenance: { title: { source: 'invented', evidence: 'Demo scenario' } },
  };
}

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach((cleanup) => cleanup()); });

function setup(deadlineEngine: DeadlineEngine = engine) {
  const dir = mkdtempSync(join(tmpdir(), 'matter-store-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'matters.json');
  writeFileSync(filePath, '[]');
  const logError = vi.fn();
  const store = createMatterStore({ filePath, engine: deadlineEngine, logError });
  cleanups.push(() => store.close());
  return { dir, filePath, store, logError, app: createApp({}, store) };
}

async function connect(app: ReturnType<typeof createApp>) {
  const response = await app.request('/api/events');
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const reader = response.body!.getReader();
  cleanups.push(() => { void reader.cancel(); });
  const next = async () => {
    const chunk = await reader.read();
    return JSON.parse(new TextDecoder().decode(chunk.value).trim().replace(/^data: ?/, ''));
  };
  expect(await next()).toEqual([]);
  return next;
}

describe('shared matter store', () => {
  function chainedMatter() {
    return { ...matter(), deadlines: [
      { id: 'answer', label: 'Answer', deadlineRuleId: 'mn-civ-12-answer',
        trigger: { event: 'New trial motion due', fromDeadline: 'new-trial' }, assumptions: {} },
      { id: 'new-trial', label: 'New trial motion', deadlineRuleId: 'frcp-59-new-trial',
        trigger: { event: 'Judgment entered', date: '2026-01-05' }, assumptions: {} },
      { id: 'independent', label: 'Independent motion', deadlineRuleId: 'frcp-59-new-trial',
        trigger: { event: 'Separate judgment entered', date: '2026-01-05' }, assumptions: {} },
    ] };
  }

  it('counts from an upstream computed date regardless of order and recomputes after upsert', () => {
    const { store, filePath } = setup({ computeDeadline, deadlineCatalog });
    const input = chainedMatter();
    const first = store.upsert(input);
    expect(first.computedDeadlines['new-trial']).toMatchObject({ status: 'computed', dueDate: '2026-02-02' });
    expect(first.computedDeadlines.answer).toMatchObject({ status: 'computed', dueDate: '2026-02-23' });
    expect(first.computedDeadlines.answer.steps[0].date).toBe('2026-02-02');
    input.deadlines[1].trigger = { event: 'Judgment entered', date: '2026-01-12' };
    const changed = store.upsert(input);
    expect(changed.computedDeadlines['new-trial']).toMatchObject({ status: 'computed', dueDate: '2026-02-09' });
    expect(changed.computedDeadlines.answer).toMatchObject({ status: 'computed', dueDate: '2026-03-02' });
    expect(store.get(input.id)?.computedDeadlines.answer.steps[0].date).toBe('2026-02-09');
    expect(store.list()[0].computedDeadlines.independent).toEqual(first.computedDeadlines.independent);
    const persisted = JSON.parse(readFileSync(filePath, 'utf8'))[0];
    expect(persisted.deadlines[0].trigger).toEqual({ event: 'New trial motion due', fromDeadline: 'new-trial' });
    expect(persisted).not.toHaveProperty('computedDeadlines');
    expect(readFileSync(filePath, 'utf8')).not.toContain('dueDate');
  });

  it('names the upstream label when it has no computed date', () => {
    const { store } = setup({ computeDeadline, deadlineCatalog });
    const input = chainedMatter();
    input.deadlines[1].deadlineRuleId = 'none';
    expect(store.upsert(input).computedDeadlines.answer).toEqual({
      status: 'uncomputable', reason: 'Counts from New trial motion, which has no computed date.', steps: [],
    });
  });

  it('accepts circular references but makes both cycle members uncomputable', () => {
    const { store } = setup({ computeDeadline, deadlineCatalog });
    const input = chainedMatter();
    input.deadlines[1].trigger = { event: 'Answer due', fromDeadline: 'answer' };
    const result = store.upsert(input);
    for (const id of ['answer', 'new-trial']) {
      expect(result.computedDeadlines[id]).toMatchObject({ status: 'uncomputable', reason: expect.stringMatching(/circular/i), steps: [] });
    }
    expect(result.computedDeadlines.independent.status).toBe('computed');
  });

  it.each([
    ['trigger.fromDeadline', 'missing'], ['trigger.fromDeadline', 'answer'],
    ['supersededBy', 'missing'], ['supersededBy', 'answer'],
  ])('rejects %s pointing at %s with the failing dot path', async (field, reference) => {
    const { app, store } = setup();
    const deadline = { ...matter().deadlines[0], ...(field === 'supersededBy'
      ? { supersededBy: reference } : { trigger: { event: 'Other deadline due', fromDeadline: reference } }) };
    const response = await app.request('/api/matters', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...matter(), deadlines: [deadline] }),
    });
    expect(response.status).toBe(400);
    const error = await response.text();
    expect(error).toContain(`deadlines.0.${field}`);
    expect(error).toContain(reference === 'answer' ? 'cannot name itself' : 'Unknown deadline id');
    expect(store.list()).toEqual([]);
  });

  it('still computes a deadline that names its superseding deadline', () => {
    const { store } = setup({ computeDeadline, deadlineCatalog });
    const input = chainedMatter();
    input.deadlines = input.deadlines.map(deadline => ({ ...deadline, ...(deadline.id === 'independent' ? { supersededBy: 'new-trial' } : {}) }));
    expect(store.upsert(input).computedDeadlines.independent).toMatchObject({ status: 'computed', dueDate: '2026-02-02' });
  });

  it.each([
    { event: 'Judgment entered', date: '2026-01-05', fromDeadline: 'new-trial' },
    { event: 'Judgment entered', fromDeadline: 'new-trial', extra: true },
  ])('rejects extra fields in a deadline trigger: %j', (trigger) => {
    const { store } = setup({ computeDeadline, deadlineCatalog });
    const input = chainedMatter();
    expect(() => store.upsert({ ...input, deadlines: [{ ...input.deadlines[0], trigger }, ...input.deadlines.slice(1)] })).toThrow();
  });

  it('persists API changes and broadcasts full computed lists to two SSE clients', async () => {
    const { app, store, filePath } = setup();
    const first = await connect(app);
    const second = await connect(app);
    const response = await app.request('/api/matters/synthetic-one', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(matter()) });
    expect(response.status).toBe(200);
    for (const next of [first, second]) {
      const list = await next();
      expect(list[0].computedDeadlines.answer).toEqual({ status: 'computed', dueDate: '2026-11-20', steps: [] });
    }
    expect(JSON.parse(readFileSync(filePath, 'utf8'))[0]).not.toHaveProperty('computedDeadlines');
    expect((await (await app.request('/api/matters')).json())).toEqual(store.list());
    expect((await app.request('/api/matters/synthetic-one')).status).toBe(200);
    expect((await app.request('/api/matters/synthetic-one', { method: 'DELETE' })).status).toBe(204);
    expect(await first()).toEqual([]);
    expect(await second()).toEqual([]);
    expect(store.get('synthetic-one')).toBeUndefined();
  });

  it('publishes external trigger-only edits to both clients in under a second', async () => {
    const { app, filePath } = setup();
    const first = await connect(app);
    const second = await connect(app);
    const started = performance.now();
    writeFileSync(`${filePath}.tmp`, JSON.stringify([matter()]));
    renameSync(`${filePath}.tmp`, filePath);
    const updates = await Promise.all([first(), second()]);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(updates[0][0].computedDeadlines.answer.dueDate).toBe('2026-11-20');
    expect(updates[1]).toEqual(updates[0]);
    const edited = matter();
    edited.deadlines[0].trigger.date = '2026-11-02';
    writeFileSync(filePath, JSON.stringify([edited]));
    const changed = await Promise.all([first(), second()]);
    expect(changed[0][0].computedDeadlines.answer.dueDate).toBe('2026-11-21');
    expect(changed[1]).toEqual(changed[0]);
    expect((await (await app.request('/api/matters')).json())[0].computedDeadlines.answer.dueDate).toBe('2026-11-21');
  });

  it.each([
    ['malformed JSON', '{', '$'],
    ['wrong field type', JSON.stringify([{ ...matter(), title: 42 }]), 'title'],
    ['unknown rule', JSON.stringify([{ ...matter(), deadlines: [{ ...matter().deadlines[0], deadlineRuleId: 'unknown' }] }]), 'deadlines.0.deadlineRuleId'],
    ['stored due date', JSON.stringify([{ ...matter(), deadlines: [{ ...matter().deadlines[0], dueDate: '2026-12-01' }] }]), 'deadlines.0.dueDate'],
    ['duplicate deadline ID', JSON.stringify([{ ...matter(), deadlines: [matter().deadlines[0], matter().deadlines[0]] }]), 'deadlines.1.id'],
  ])('keeps the last good state after an external %s and names the failed field', async (_name, invalid, field) => {
    const { store, filePath, logError } = setup();
    store.upsert(matter());
    const before = store.list();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    cleanups.push(unsubscribe);
    writeFileSync(filePath, invalid);
    await vi.waitFor(() => expect(logError).toHaveBeenCalled(), { timeout: 900, interval: 10 });
    expect(logError.mock.calls.flat().join(' ')).toContain(field);
    expect(store.list()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('validates writes at the API boundary and requires synthetic matters', async () => {
    const { app } = setup();
    for (const change of [{ synthetic: false }, { deadlines: [{ ...matter().deadlines[0], deadlineRuleId: 'unknown' }] }, { deadlines: [{ ...matter().deadlines[0], dueDate: '2026-12-01' }] }, { deadlines: [matter().deadlines[0], matter().deadlines[0]] }]) {
      const response = await app.request('/api/matters', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...matter(), ...change }) });
      expect(response.status).toBe(400);
    }
    expect(matterSchema.parse(matter()).internalOnly).toContain('reasoning');
    expect(matterSchema.parse(matter()).internalOnly).toContain('provenance.*.evidence');
  });

  it('supports the catalog sentinel none without inventing a due date', () => {
    const { store } = setup();
    store.upsert({ ...matter(), deadlines: [{ ...matter().deadlines[0], deadlineRuleId: 'none' }] });
    expect(store.list()[0].computedDeadlines.answer.status).toBe('uncomputable');
  });

  it('preserves a valid external edit when an API write arrives before the watcher runs', () => {
    const { store, filePath } = setup();
    writeFileSync(filePath, JSON.stringify([matter('external')]));
    store.upsert(matter('api'));
    expect(store.list().map((item) => item.id)).toEqual(['external', 'api']);
  });

  it('returns validation errors after the route module reloads around a surviving store', async () => {
    const { store } = setup();
    vi.resetModules();
    const { createApp: reloadedCreateApp } = await import('../server/index');
    const response = await reloadedCreateApp({}, store).request('/api/matters', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...matter(), synthetic: false }),
    });
    expect(response.status).toBe(400);
  });

  it('retains the singleton and its subscribers across module reloads', async () => {
    const store: MatterStore = getMatterStore();
    const listener = vi.fn();
    cleanups.push(store.subscribe(listener));
    vi.resetModules();
    const reloaded = await import('../server/store');
    expect(reloaded.getMatterStore()).toBe(store);
    reloaded.getMatterStore().setEngine(engine);
    expect(listener).toHaveBeenCalledWith(store.list());
  });
});

describe('demo reset', () => {
  it('materializes seed offsets against today, including dates in deadline inputs', () => {
    const { dir, filePath } = setup();
    const seedDirectory = join(dir, 'seeds');
    mkdirSync(seedDirectory);
    const seed = { ...matter(), deadlines: [{ ...matter().deadlines[0], inputs: { closeDate: '+12' } }] };
    seed.timeline[0].date = '-30';
    seed.deadlines[0].trigger.date = '+12';
    writeFileSync(join(seedDirectory, 'seed.json'), JSON.stringify(seed));
    resetDemo({ seedDirectory, filePath: join(dir, 'reset.json'), today: '2026-11-25' });
    const result = JSON.parse(readFileSync(join(dir, 'reset.json'), 'utf8'));
    expect(result[0].deadlines[0].trigger.date).toBe('2026-12-07');
    expect(result[0].timeline[0].date).toBe('2026-10-26');
    expect(result[0].deadlines[0].inputs.closeDate).toBe('2026-12-07');
    // The live file is outside the seed directory in normal use.
    expect(readFileSync(filePath, 'utf8')).toBe('[]');
  });

  it('writes an empty list when no seed files exist yet', () => {
    const { dir } = setup();
    const filePath = join(dir, 'reset.json');
    resetDemo({ seedDirectory: join(dir, 'not-yet-created'), filePath, today: '2026-11-25' });
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual([]);
  });
});
