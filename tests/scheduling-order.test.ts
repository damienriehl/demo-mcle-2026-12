import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeDeadline, deadlineCatalog } from '../src/engine';
import { createMatterStore, type MatterStore } from '../server/store';
import { leaves, readDraft } from '../server/intake/schema';
import type { ModelStream } from '../server/intake/client';
import { NEEDS_KEY_MESSAGE } from '../server/ai';
import { createSchedulingOrderRoutes } from '../server/orders/extract';
import { pageTexts } from '../server/orders/pdf-text';
import { materialize } from '../server/seed-dates';
import type { Extraction } from '../server/orders/prompt';

const slugs = ['dminn-quillfeather', 'hennepin-lanternfish', 'ramsey-copperleaf'];
const canned = (slug = slugs[0]): Extraction => {
  const { dates, court, caption } = JSON.parse(readFileSync(`data/seed/orders/${slug}.extraction.json`, 'utf8'));
  return { dates, court, caption };
};
const stores: MatterStore[] = [];
function setup(stream: ModelStream | null, slug = slugs[0]) {
  const store = createMatterStore({ filePath: join(mkdtempSync(join(tmpdir(), 'mc-orders-')), 'matters.json'), engine: { computeDeadline, deadlineCatalog } });
  stores.push(store);
  store.upsert(materialize(JSON.parse(readFileSync(`data/seed/matters/${slug}.json`, 'utf8')), '2026-11-08'));
  return { store, app: createSchedulingOrderRoutes({ store, stream }) };
}
afterEach(() => { stores.splice(0).forEach(store => store.close()); vi.restoreAllMocks(); });

function fake(extraction: Extraction, pause?: () => Promise<void>) {
  const requests: Parameters<ModelStream>[0][] = [];
  const stream: ModelStream = async function* (request) {
    requests.push(request);
    yield { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'order', name: 'record_order_dates', input: {} } } as BetaRawMessageStreamEvent;
    for (let i = 0; i < extraction.dates.length; i++) {
      const partial_json = `${i === 0 ? '{"dates":[' : ','}${JSON.stringify(extraction.dates[i])}`;
      // Split inside JSON strings, as real model streams do.
      for (let j = 0; j < partial_json.length; j += 17) {
        yield { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: partial_json.slice(j, j + 17) } };
      }
      if (pause) await pause();
    }
    yield { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: `],"court":${JSON.stringify(extraction.court)},"caption":${JSON.stringify(extraction.caption)}}` } };
    yield { type: 'content_block_stop', index: 0 };
  };
  return { stream, requests };
}
function upload(app: ReturnType<typeof createSchedulingOrderRoutes>, slug = slugs[0], name = `${slug}.pdf`) {
  const form = new FormData();
  form.set('matterId', slug);
  form.set('file', new File([readFileSync(`data/seed/orders/${slug}.pdf`)], name, { type: 'application/pdf' }));
  return app.request('/extract', { method: 'POST', headers: { 'X-Matter-Cockpit-Upload': '1' }, body: form });
}
function paste(app: ReturnType<typeof createSchedulingOrderRoutes>, text: string, matterId = slugs[0]) {
  return app.request('/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Matter-Cockpit-Upload': '1' }, body: JSON.stringify({ matterId, text, name: 'Ignored.pdf' }) });
}
async function events(response: Response) {
  expect(response.headers.get('Content-Type')).toContain('text/event-stream');
  return (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
}

describe('scheduling order extraction', () => {
  it('streams each completed date before the model finishes, then writes federal deadlines and supersession', async () => {
    const releases: (() => void)[] = [];
    const pauses = canned().dates.map(() => new Promise<void>(resolve => { releases.push(resolve); }));
    let index = 0;
    const replay = fake(canned(), () => pauses[index++]);
    const { app, store } = setup(replay.stream);
    const response = await upload(app);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const received = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const event = JSON.parse(buffer.slice(0, end).replace(/^data: /, ''));
        buffer = buffer.slice(end + 2);
        received.push(event);
        if (event.type === 'date') { expect(store.get(slugs[0])!.deadlines).toHaveLength(1); releases.shift()!(); }
      }
    }
    expect(received[0]).toEqual({ type: 'pages', count: 2 });
    expect(received.filter(e => e.type === 'date')).toEqual(canned().dates.map(date => ({ type: 'date', ...date, verified: true })));
    expect(received.at(-1)).toMatchObject({ type: 'done', added: { courtDates: 8, derived: 3 }, unverified: [] });
    const matter = store.get(slugs[0])!;
    const expert = matter.deadlines.find(d => d.deadlineRuleId === 'frcp-26a2d-expert-disclosure')!;
    const expertOrder = matter.deadlines.find(d => d.inputs?.date === '2027-02-01')!;
    expect(expert.supersededBy).toBe(expertOrder.id);
    const pretrial = matter.deadlines.find(d => d.deadlineRuleId === 'frcp-26a3-pretrial-disclosure')!;
    const objections = matter.deadlines.find(d => d.deadlineRuleId === 'frcp-26a3-objections')!;
    expect(matter.computedDeadlines[pretrial.id]).toMatchObject({ dueDate: '2027-05-14' });
    expect(matter.computedDeadlines[objections.id]).toMatchObject({ dueDate: '2027-05-28' });
    expect(matter.provenance[`deadlines.${matter.deadlines.indexOf(objections)}.trigger.fromDeadline`]).toMatchObject({
      source: 'inferred', evidence: expect.stringContaining('Trial ready date (2027-06-14'),
    });
    expect(matter.deadlines.some(d => d.deadlineRuleId.startsWith('mn-gp'))).toBe(false);
    expect(readDraft(received.at(-1).matter).errors).toEqual([]);
    const request = replay.requests[0];
    expect(replay.requests).toHaveLength(1);
    expect(request.tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
    expect(request.tools?.[0]).toMatchObject({ name: 'record_order_dates' });
    expect(request.messages[0].content).toMatch(/^Today is \d{4}-\d{2}-\d{2}\.\n/);
    expect(request.messages[0].content).toContain('=== Page 2 ===');
  });

  it('streams a wrong-page quote as unverified without writing it', async () => {
    const extraction = canned();
    extraction.dates = [{ ...extraction.dates.at(-1)!, page: 1 }];
    const { app, store } = setup(fake(extraction).stream);
    const result = await events(await upload(app));
    expect(result[1]).toMatchObject({ type: 'date', verified: false, reason: 'Quote does not appear on the cited page.' });
    expect(result.at(-1)).toMatchObject({ type: 'done', added: { courtDates: 0, derived: 0 }, unverified: [expect.objectContaining({ verified: false })] });
    expect(store.get(slugs[0])!.deadlines.map(d => d.id)).toEqual(['interrogatory-response']);
  });

  it.each(slugs)('replays %s keylessly by text hash and reuploads idempotently', async slug => {
    const { app, store } = setup(null, slug);
    const before = store.get(slug)!;
    const result = await events(await upload(app, slug, 'Renamed Order.PDF'));
    expect(result.at(-1)).toMatchObject({ type: 'done', added: { courtDates: canned(slug).dates.length, derived: slug === slugs[0] ? 3 : 6 } });
    const first = store.get(slug)!;
    expect(first.documents.at(-1)).toMatchObject({ id: 'order-renamed-order', kind: 'order', title: canned(slug).caption, shared: false });
    expect(first.timeline.length - before.timeline.length).toBe(canned(slug).dates.length);
    for (const deadline of first.deadlines) for (const leaf of leaves(deadline)) {
      expect(first.provenance[`deadlines.${first.deadlines.indexOf(deadline)}.${leaf.path}`]).toBeDefined();
    }
    await events(await upload(app, slug, 'Renamed Order.PDF'));
    expect(store.get(slug)).toEqual(first);
  });

  it('uses an order-set pretrial date for objections and keeps other orders and their provenance on replacement', async () => {
    const quote = 'Pretrial disclosures: May 3, 2027';
    const extraction = canned();
    extraction.dates.push({ kind: 'pretrial-disclosure', event: 'Pretrial disclosures', date: '2027-05-03', page: 1, quote });
    const { app, store } = setup(fake(extraction).stream);
    const pages = await pageTexts(new Uint8Array(readFileSync(`data/seed/orders/${slugs[0]}.pdf`)));
    const text = `${pages.join('\n')}\n${quote}`;
    const pastedPrefix = `order-pasted-${createHash('sha256').update(text).digest('hex').slice(0, 8)}-`;
    // Pasted text is one page, including former PDF page two.
    extraction.dates.forEach(date => { date.page = 1; });
    await events(await paste(app, text));
    let matter = store.get(slugs[0])!;
    const pretrial = matter.deadlines.find(d => d.deadlineRuleId === 'frcp-26a3-pretrial-disclosure')!;
    const orderDate = matter.deadlines.find(d => d.inputs?.date === '2027-05-03')!;
    const objections = matter.deadlines.find(d => d.deadlineRuleId === 'frcp-26a3-objections')!;
    expect(pretrial.supersededBy).toBe(orderDate.id);
    expect(objections.trigger).toMatchObject({ fromDeadline: orderDate.id });
    expect(matter.computedDeadlines[objections.id]).toMatchObject({ dueDate: '2027-05-17' });
    const other = createSchedulingOrderRoutes({ store, stream: null });
    await events(await upload(other));
    const { computedDeadlines: _before, ...withInternal } = store.get(slugs[0])!;
    const ownIndex = withInternal.deadlines.findIndex(d => d.id.startsWith(pastedPrefix));
    const otherIndex = withInternal.deadlines.findIndex(d => d.id.startsWith(`order-${slugs[0]}-`));
    withInternal.internalOnly.push(`deadlines.${ownIndex}.inputs.quote`, `deadlines.${otherIndex}.inputs.quote`);
    const retainedProvenance = { source: 'stated' as const, evidence: 'Synthetic annotation on the other uploaded order.' };
    withInternal.provenance[`internalOnly.${withInternal.internalOnly.length - 2}`] = { source: 'inferred', evidence: 'Replaced order annotation.' };
    withInternal.provenance[`internalOnly.${withInternal.internalOnly.length - 1}`] = retainedProvenance;
    store.upsert(withInternal);
    extraction.dates = [extraction.dates[0]];
    await events(await paste(app, text));
    matter = store.get(slugs[0])!;
    expect(matter.deadlines.filter(d => d.id.startsWith(pastedPrefix))).toHaveLength(1);
    expect(matter.deadlines.filter(d => d.id.startsWith(`order-${slugs[0]}-`))).toHaveLength(11);
    expect(matter.internalOnly).toEqual(['reasoning', 'provenance.*.evidence', 'deadlines.1.inputs.quote']);
    expect(matter.provenance['internalOnly.2']).toEqual(retainedProvenance);
    const { computedDeadlines: _computed, ...stored } = matter;
    expect(readDraft(stored).errors).toEqual([]);
    expect(Object.keys(matter.provenance).filter(p => p.startsWith('deadlines.')).every(p => Number(p.split('.')[1]) < matter.deadlines.length)).toBe(true);
  });

  it('preserves a verified upload when the same slug is reuploaded with no verified dates', async () => {
    const extraction = canned();
    const { app, store } = setup(fake(extraction).stream);
    await events(await upload(app));
    const before = store.get(slugs[0])!;
    const upsert = vi.spyOn(store, 'upsert');
    extraction.dates = [{ ...extraction.dates[0], quote: 'Not in the order: November 20, 2026.' }];
    const result = await events(await upload(app));
    expect(store.get(slugs[0])).toEqual(before);
    expect(upsert).not.toHaveBeenCalled();
    expect(result.at(-1)).toMatchObject({
      type: 'done', added: { courtDates: 0, derived: 0 },
      message: 'No dates could be verified; the matter was not changed.',
      unverified: [expect.objectContaining({ verified: false })],
    });
    expect(result.at(-1).matter.deadlines).toEqual(before.deadlines);
  });

  it('gives different pasted texts distinct hash slugs and preserves both schedules', async () => {
    const extraction = canned();
    extraction.dates = [{ ...extraction.dates[0], page: 1 }];
    const { app, store } = setup(fake(extraction).stream);
    const text = extraction.dates[0].quote;
    await events(await paste(app, text));
    const first = store.get(slugs[0])!.deadlines.filter(d => d.id.startsWith('order-'));
    expect(first[0].id).toMatch(/^order-pasted-[a-f0-9]{8}-date-1$/);
    await events(await paste(app, text + '\nAnother order.'));
    const second = store.get(slugs[0])!.deadlines.filter(d => d.id.startsWith('order-'));
    expect(second).toHaveLength(2);
    expect(second).toContainEqual(first[0]);
    await events(await paste(app, text));
    expect(store.get(slugs[0])!.deadlines.filter(d => d.id.startsWith('order-'))).toHaveLength(2);
  });

  it('answers needs_key for an unknown PDF', async () => {
    const { app, store } = setup(null);
    const before = store.list();
    const form = new FormData();
    form.set('matterId', slugs[0]);
    form.set('file', new File([readFileSync('tests/fixtures/orders/unknown.pdf')], 'unknown.pdf', { type: 'application/pdf' }));
    const result = await events(await app.request('/extract', { method: 'POST', headers: { 'X-Matter-Cockpit-Upload': '1' }, body: form }));
    expect(result.at(-1)).toEqual({ type: 'needs_key', message: NEEDS_KEY_MESSAGE });
    expect(store.list()).toEqual(before);
  });

  it.each<Record<string, string>>([
    { 'Content-Type': 'application/json' },
    { 'Content-Type': 'text/plain', 'X-Matter-Cockpit-Upload': '1' },
  ])('rejects unsafe upload headers %j without changing the store', async headers => {
    const replay = fake(canned());
    const { app, store } = setup(replay.stream);
    const before = store.list();
    const result = await events(await app.request('/extract', { method: 'POST', headers, body: JSON.stringify({ matterId: slugs[0], text: 'order' }) }));
    expect(result).toEqual([{ type: 'error', message: expect.any(String) }]);
    expect(store.list()).toEqual(before);
    expect(replay.requests).toEqual([]);
  });

  it('reports an unknown matter as an error before using the model', async () => {
    const replay = fake(canned());
    const { app } = setup(replay.stream);
    expect(await events(await paste(app, 'order', 'missing'))).toEqual([{ type: 'error', message: expect.stringContaining('matter') }]);
    expect(replay.requests).toEqual([]);
  });

  it('never exposes provider error text in events or logs', async () => {
    const sentinel = 'SENTINEL-PRIVATE-PROVIDER-TEXT';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, store } = setup(async function* () {
      throw new Anthropic.APIError(401, { message: sentinel }, sentinel, new Headers());
    });
    const before = store.list();
    const result = await events(await paste(app, 'Trial: June 14, 2027'));
    expect(result.at(-1)).toMatchObject({ type: 'error' });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('401'));
    expect(store.list()).toEqual(before);
  });
});
