import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../src/data/schema';
import { computeDeadline, deadlineCatalog } from '../src/engine';
import { createMatterStore, type MatterStore } from '../server/store';
import { createSchedulingOrderRoutes } from '../server/orders/extract';
import { extractionSchema, orderSystemPrompt, orderTool, type Extraction } from '../server/orders/prompt';
import { verifyQuote } from '../server/orders/verify-quote';
import { applyField, leaves, validateMatter } from '../server/intake/schema';
import { systemPrompt } from '../server/intake/prompts';
import type { ModelStream } from '../server/intake/client';

const quote = 'ready for Trial on March 15, 2028';
const page = `${quote}8`;
const extraction = {
  court: 'federal' as const,
  courtName: 'United States District Court, District of Minnesota',
  caseNumber: '28-cv-1234 (ABC/DEF)',
  caption: 'Fictional Acorn Industries, Inc. and Fictional Alder LLC v. Jordan Birch and Casey Cedar',
  dates: [{ kind: 'trial' as const, event: 'Trial ready', date: '2028-03-15', page: 1, quote }],
};
const shortCaption = 'Fictional Acorn Industries, Inc. et al. v. Birch et al.';
const scratch: string[] = [];
const stores: MatterStore[] = [];
function directory() {
  const path = mkdtempSync(join(tmpdir(), 'mc-public-orders-'));
  scratch.push(path);
  return path;
}
function setup(stream: ModelStream | null) {
  const store = createMatterStore({ filePath: join(directory(), 'matters.json'), engine: { computeDeadline, deadlineCatalog } });
  stores.push(store);
  return { store, app: createSchedulingOrderRoutes({ store, stream }) };
}
function fake(value: Extraction = extraction): ModelStream {
  return async function* () {
    yield { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'order', name: 'record_order_dates', input: {} } } as BetaRawMessageStreamEvent;
    yield { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(value) } };
    yield { type: 'content_block_stop', index: 0 };
  };
}
async function events(response: Response) {
  return (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
}
function paste(app: ReturnType<typeof setup>['app']) {
  return app.request('/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Matter-Cockpit-Upload': '1' }, body: JSON.stringify({ matterId: 'new', text: page }) });
}
// A minimal one-page PDF containing only fictional test text, generated outside git.
function pdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = body.length;
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(`${body}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}
afterEach(() => {
  stores.splice(0).forEach(store => store.close());
  scratch.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('public court order matters', () => {
  it.each(readdirSync('data/seed/orders/public').filter(name => name.endsWith('.pdf')))(
    'keylessly opens bundled public/%s as a new public-record matter with every date verified', async name => {
      vi.stubEnv('MATTER_COCKPIT_EXTRA_ORDERS_DIR', '');
      const { order: _order, ...value } = JSON.parse(readFileSync(`data/seed/orders/public/${name.replace('.pdf', '.extraction.json')}`, 'utf8'));
      const { app, store } = setup(null);
      expect(store.list()).toEqual([]);
      const form = new FormData();
      form.set('matterId', 'new');
      form.set('file', new File([readFileSync(`data/seed/orders/public/${name}`)], 'renamed.pdf', { type: 'application/pdf' }));
      const result = await events(await app.request('/extract', { method: 'POST', headers: { 'X-Matter-Cockpit-Upload': '1' }, body: form }));
      expect(result.filter(event => event.type === 'date')).toEqual(value.dates.map((date: Extraction['dates'][number]) => ({ type: 'date', ...date, verified: true })));
      const done = result.at(-1);
      expect(done).toMatchObject({ type: 'done', created: true, unverified: [], added: { courtDates: value.dates.length }, matter: {
        synthetic: false, title: value.shortCaption, publicRecord: { court: value.courtName, caseNumber: value.caseNumber },
      } });
      expect(value.shortCaption).toEqual(expect.any(String));
      expect(store.list()).toHaveLength(1);
      const matter = store.get(done.matter.id)!;
      expect(matter.title).toBe(value.shortCaption);
      expect(schema.isPublicRecord(matter)).toBe(true);
      const courtDates = matter.deadlines.filter(deadline => deadline.deadlineRuleId === 'court-order-date');
      expect(courtDates.map(deadline => deadline.inputs)).toEqual(value.dates.map((date: Extraction['dates'][number]) => ({ date: date.date, page: date.page, quote: date.quote })));
      for (const deadline of courtDates) expect(matter.computedDeadlines[deadline.id]).toMatchObject({ status: 'computed', dueDate: deadline.inputs!.date });
    },
  );

  it.each([
    { shortCaption, title: shortCaption },
    { shortCaption: undefined, title: extraction.caption },
  ])('creates a public-record matter titled "$title" from a verified upload and computes its deadlines', async ({ shortCaption, title }) => {
    const value = { ...extraction, ...(shortCaption === undefined ? {} : { shortCaption }) };
    const { app, store } = setup(fake(value));
    const result = await events(await paste(app));
    const done = result.at(-1);
    expect(done).toMatchObject({ type: 'done', created: true, added: { courtDates: 1, derived: 3 }, matter: {
      synthetic: false, publicRecord: { court: extraction.courtName, caseNumber: extraction.caseNumber },
      title, forum: extraction.courtName, practiceArea: 'litigation',
      client: { name: 'Public court record (no client)', contact: 'public-record@example.invalid' }, parties: [],
      clientFacing: { status: 'Public court record uploaded for demonstration.', nextSteps: [] },
    } });
    expect(done.matter.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const matter = store.get(done.matter.id)!;
    expect(schema.isPublicRecord(matter)).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(schema.matterSchema.safeParse(done.matter).success).toBe(true);
    expect(matter.timeline).toEqual([expect.objectContaining({ date: '2028-03-15' })]);
    expect(matter.documents).toEqual([expect.objectContaining({ kind: 'order', title: extraction.caption })]);
    const pretrial = matter.deadlines.find(deadline => deadline.deadlineRuleId === 'frcp-26a3-pretrial-disclosure')!;
    expect(matter.computedDeadlines[pretrial.id]).toMatchObject({ dueDate: '2028-02-14' });
    for (const leaf of leaves(done.matter)) expect(matter.provenance[leaf.path], leaf.path).toBeDefined();
    expect(matter.provenance.title).toEqual({ source: 'stated', evidence: extraction.caption });
    expect(matter.provenance['publicRecord.caseNumber']).toEqual({ source: 'stated', evidence: extraction.caseNumber });
    expect(matter.provenance['client.name'].source).toBe('invented');
    expect(matter.provenance['client.contact'].source).toBe('invented');
    expect(schema.matterSchema.safeParse({ ...done.matter, publicRecord: undefined }).success).toBe(false);
    expect(schema.matterSchema.safeParse({ ...done.matter, synthetic: true }).success).toBe(false);
    expect(schema.matterSchema.safeParse({ ...done.matter, publicRecord: { ...done.matter.publicRecord, extra: true } }).success).toBe(false);
    expect(schema.isPublicRecord({ ...done.matter, synthetic: true, publicRecord: undefined })).toBe(false);
  });

  it.each(['federal', 'minnesota'] as const)('uses the %s court and case-number defaults when absent from the extraction', async court => {
    const { courtName: _courtName, caseNumber: _caseNumber, ...minimal } = extraction;
    const { app, store } = setup(fake({ ...minimal, court }));
    const done = (await events(await paste(app))).at(-1);
    const courtText = court === 'federal' ? 'United States District Court' : 'Minnesota District Court';
    expect(done).toMatchObject({ type: 'done', created: true, matter: { forum: courtText, publicRecord: { court: courtText, caseNumber: 'Not stated' } } });
    expect(store.list()).toHaveLength(1);
  });

  it('creates nothing when no dates verify', async () => {
    const { app, store } = setup(fake({ ...extraction, dates: [{ ...extraction.dates[0], quote: 'Absent from page: March 15, 2028' }] }));
    const done = (await events(await paste(app))).at(-1);
    expect(done).toMatchObject({ type: 'done', added: { courtDates: 0, derived: 0 }, message: 'No dates could be verified; the matter was not changed.' });
    expect(done.created).toBeUndefined();
    expect(done.matter).toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  it('instructs the model to omit glued footnote numerals while the unchanged checker requires the exact substring and date', () => {
    expect(verifyQuote({ ...extraction.dates[0], quote }, [page])).toEqual({ ok: true });
    expect(verifyQuote({ ...extraction.dates[0], quote: page }, [page])).toEqual({ ok: false, reason: 'Quote does not name the claimed calendar date.' });
    expect(orderSystemPrompt).toContain('March 15, 20288');
    expect(orderSystemPrompt).toContain('March 15, 2028');
    expect(orderSystemPrompt).toMatch(/footnote/i);
    expect(extractionSchema.safeParse(extraction).success).toBe(true);
    expect(orderTool.input_schema.properties).toHaveProperty('courtName');
    expect(orderTool.input_schema.properties).toHaveProperty('caseNumber');
  });

  it.each([
    { shortCaption, title: shortCaption },
    { shortCaption: undefined, title: extraction.caption },
  ])('replays a new-matter PDF titled "$title" by text hash from comma-separated external directories', async ({ shortCaption, title }) => {
    const empty = directory();
    const extra = directory();
    const bytes = pdf(page);
    writeFileSync(join(extra, 'fictional.pdf'), bytes);
    writeFileSync(join(extra, 'fictional.extraction.json'), JSON.stringify({ order: 'fictional', ...extraction, shortCaption }));
    vi.stubEnv('MATTER_COCKPIT_EXTRA_ORDERS_DIR', `${empty}, ${extra}`);
    const { app, store } = setup(null);
    const form = new FormData();
    form.set('matterId', 'new');
    form.set('file', new File([new Uint8Array(bytes)], 'renamed.pdf', { type: 'application/pdf' }));
    const done = (await events(await app.request('/extract', { method: 'POST', headers: { 'X-Matter-Cockpit-Upload': '1' }, body: form }))).at(-1);
    expect(done).toMatchObject({ type: 'done', created: true, matter: { title, publicRecord: { court: extraction.courtName, caseNumber: extraction.caseNumber } } });
    expect(store.get(done.matter.id)?.deadlines).toHaveLength(4);
  });

  it('skips an unavailable extra directory with one warning naming only the directory', async () => {
    const missing = join(directory(), 'missing');
    vi.stubEnv('MATTER_COCKPIT_EXTRA_ORDERS_DIR', missing);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app, store } = setup(null);
    for (let i = 0; i < 2; i++) expect((await events(await paste(app))).at(-1)).toMatchObject({ type: 'needs_key' });
    expect(warn.mock.calls).toEqual([[`Skipping unavailable orders directory: ${missing}`]]);
    expect(store.list()).toEqual([]);
  });

  it('keeps intake field validation, completion, and its prompted schema synthetic-only', () => {
    const draft = { provenance: {} };
    expect(applyField(draft, { path: 'synthetic', value: false, source: 'stated' }).errors.length).toBeGreaterThan(0);
    expect(applyField(draft, { path: 'publicRecord.court', value: extraction.courtName, source: 'stated' }).errors.length).toBeGreaterThan(0);
    const publicMatter = {
      id: 'fictional-test', title: extraction.caption, forum: extraction.courtName, practiceArea: 'litigation', synthetic: false,
      publicRecord: { court: extraction.courtName, caseNumber: extraction.caseNumber },
      client: { name: 'Fictional client', contact: 'fictional@example.invalid' }, parties: [], timeline: [], documents: [], deadlines: [],
      clientFacing: { status: 'Fictional test', nextSteps: [] }, provenance: {}, internalOnly: [],
    };
    for (const leaf of leaves(publicMatter)) (publicMatter.provenance as Record<string, unknown>)[leaf.path] = { source: 'stated' };
    expect(() => validateMatter(publicMatter as unknown as Parameters<typeof validateMatter>[0])).toThrow();
    const promptedSchema = JSON.parse(systemPrompt().split('Full matter storage schema (the server builds provenance from field labels; do not emit it as a field):\n')[1]);
    expect(promptedSchema.properties.synthetic).toMatchObject({ const: true });
    expect(promptedSchema.properties.publicRecord).toBeUndefined();
  });
});
