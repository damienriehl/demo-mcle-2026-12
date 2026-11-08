import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/index';
import { createMatterStore, getMatterStore, type MatterStore } from '../server/store';
import { matterSchema } from '../src/data/schema';
import type { DeadlineInput } from '../src/data/engine-types';
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

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'matter-store-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'matters.json');
  writeFileSync(filePath, '[]');
  const logError = vi.fn();
  const store = createMatterStore({ filePath, engine, logError });
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
