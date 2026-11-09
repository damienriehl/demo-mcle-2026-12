import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { NEEDS_KEY_MESSAGE } from '../ai';
import { modelTagPass, tagDrafts, verifyDocumentFacts } from '../folio/tag';
import { modelStream, type ModelStream } from '../intake/client';
import { getMatterStore, type MatterStore } from '../store';
import { buildAdviceRequest, streamAssessments, verifyAssessment } from './advise';
import { cannedKey, findCanned, findCannedAssessments, loadCanned } from './canned';
import { compareDrafts } from './compare';
import { normalizeDraft } from './normalize';
import { buildAdviceDocx, buildCounterDocx, selectedCounters } from './outputs';
import { createComparisonStore } from './store';
import { modelAssessmentSchema, type CompareEvent, type ComparisonRecord } from './types';

type Options = { store?: MatterStore; stream?: ModelStream | null; comparisonsDir?: string; samplesDir?: string; cannedDir?: string };
type Send = (event: CompareEvent) => Promise<void>;
class DraftInputError extends Error {}

function logFailure(error: unknown) {
  console.error(`draft compare failed: ${error instanceof Error ? error.constructor.name : typeof error}${error instanceof Anthropic.APIError ? ` ${error.status ?? 'no-status'}` : ''}`);
}

function sse(c: Context, work: (send: Send, signal: AbortSignal) => Promise<void>) {
  return streamSSE(c, async outgoing => {
    const abort = new AbortController();
    const stop = () => abort.abort();
    c.req.raw.signal.addEventListener('abort', stop, { once: true });
    outgoing.onAbort(stop);
    if (c.req.raw.signal.aborted) stop();
    const send: Send = async event => { if (!abort.signal.aborted) await outgoing.writeSSE({ data: JSON.stringify(event) }); };
    try { await work(send, abort.signal); }
    catch (error) {
      logFailure(error);
      await send({ type: 'error', message: error instanceof DraftInputError ? error.message : 'Draft comparison could not finish.' });
    } finally {
      stop();
      c.req.raw.signal.removeEventListener('abort', stop);
    }
  });
}

async function samples(directory: string) {
  const folders = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const folder of folders.filter(folder => folder.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const files = await readdir(resolve(directory, folder.name));
    const { title, family } = JSON.parse(await readFile(resolve(directory, folder.name, 'pair.json'), 'utf8'));
    result.push({ id: folder.name, title: title as string, family: family as string,
      earlierName: files.includes('earlier.docx') ? 'earlier.docx' : 'earlier.md',
      laterName: files.includes('later.pdf') ? 'later.pdf' : files.includes('later.docx') ? 'later.docx' : 'later.md' });
  }
  return result;
}

const adviseBody = z.object({ matterId: z.string(), party: z.string().optional() });
const counterBody = z.object({ matterId: z.string(), changeIds: z.array(z.string()) });

export function createDraftCompareRoutes(options: Options = {}): Hono {
  const app = new Hono();
  const comparisons = createComparisonStore(options.comparisonsDir);
  const samplesDir = resolve(options.samplesDir ?? 'data/seed/drafts');
  const matterStore = () => options.store ?? getMatterStore();
  const source = () => options.stream === undefined ? modelStream() : options.stream;
  async function replay(record: Pick<ComparisonRecord, 'earlier' | 'later'>, party?: string) {
    try { await loadCanned(resolve(options.cannedDir ?? 'data/seed/drafts')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const key = cannedKey(record.earlier.text, record.later.text);
    return { meta: findCanned(key), assessments: party ? findCannedAssessments(key, party) : undefined };
  }
  app.onError((error, c) => { logFailure(error); return c.json({ error: 'Draft comparison could not finish.' }, 500); });

  app.get('/samples', async c => c.json({ samples: await samples(samplesDir) }));

  app.post('/compare', c => sse(c, async (send, signal) => {
    if (c.req.header('X-Matter-Cockpit-Upload') !== '1') throw new DraftInputError('Draft uploads require X-Matter-Cockpit-Upload: 1.');
    if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'multipart/form-data') throw new DraftInputError('Draft uploads require multipart/form-data.');
    const body = await c.req.formData();
    const matterId = z.string().parse(body.get('matterId'));
    const matter = matterStore().get(matterId);
    if (!matter) { await send({ type: 'error', message: 'Unknown matter.' }); return; }
    let inputs: { filename: string; bytes: Uint8Array }[];
    const sampleId = body.get('sample');
    if (typeof sampleId === 'string') {
      const sample = (await samples(samplesDir)).find(sample => sample.id === sampleId);
      if (!sample) throw new DraftInputError('Choose a bundled draft pair.');
      inputs = [];
      for (const filename of [sample.earlierName, sample.laterName]) inputs.push({ filename, bytes: new Uint8Array(await readFile(resolve(samplesDir, sample.id, filename))) });
    } else {
      inputs = [];
      for (const side of ['earlier', 'later']) {
        const file = body.get(side);
        if (!(file instanceof File) || file.size > 10 * 1024 * 1024) throw new DraftInputError('Upload two drafts no larger than 10 MB each.');
        inputs.push({ filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
    }
    const normalized = [];
    for (const input of inputs) {
      try { normalized.push(await normalizeDraft(input)); }
      catch (error) {
        if (error instanceof Error && /^(This file type is not supported\.|This PDF has no text layer;|This server has no converter for )/.test(error.message)) throw new DraftInputError(error.message);
        throw error;
      }
    }
    const [earlier, later] = normalized;
    const compared = await compareDrafts(earlier, later);
    if (signal.aborted) return;
    let record: ComparisonRecord = {
      schemaVersion: 1, comparisonId: randomUUID(), matterId, createdAt: new Date().toISOString(),
      earlier: { filename: inputs[0].filename, format: earlier.format, text: earlier.text },
      later: { filename: inputs[1].filename, format: later.format, text: later.text },
      formattingCompared: compared.formattingCompared, ...(compared.formattingNote ? { formattingNote: compared.formattingNote } : {}),
      changes: compared.changes, tags: [], parties: [], assessments: [],
    };
    await comparisons.create(record, { earlier: earlier.docx, later: later.docx, redline: compared.redline });
    await send({ type: 'redline', comparisonId: record.comparisonId, html: compared.html, changes: record.changes,
      formattingCompared: record.formattingCompared, ...(record.formattingNote ? { formattingNote: record.formattingNote } : {}) });
    record = await comparisons.update({ ...record, tags: tagDrafts({ earlierText: earlier.text, laterText: later.text }) });
    await send({ type: 'tags', tags: record.tags });
    if (signal.aborted) return;
    const stream = source();
    const texts = { earlierText: earlier.text, laterText: later.text, matter };
    let facts;
    if (stream) facts = await modelTagPass({ stream, ...texts, signal });
    else {
      const canned = (await replay(record))?.meta;
      if (!canned) { await send({ type: 'needs_key', stage: 'parties', message: NEEDS_KEY_MESSAGE }); return; }
      facts = verifyDocumentFacts({ parties: canned.parties, documentType: canned.documentType,
        tags: canned.modelTags.map(tag => ({ label: tag.label, quote: tag.text, draft: tag.draft })) }, texts);
    }
    if (signal.aborted) return;
    record = await comparisons.update({ ...record, tags: [...record.tags, ...facts.tags], ...(facts.documentType ? { documentType: facts.documentType } : {}) });
    await send({ type: 'tags', tags: record.tags, ...(record.documentType ? { documentType: record.documentType } : {}) });
    record = await comparisons.update({ ...record, parties: facts.parties });
    await send({ type: 'parties', parties: record.parties });
    await send({ type: 'done', comparisonId: record.comparisonId });
  }));

  app.post('/:id/advise', async c => {
    const parsed = adviseBody.safeParse(await c.req.json());
    if (!parsed.success || !parsed.data.party) return c.json({ error: 'Choose a party before requesting advice.' }, 400);
    const { matterId, party } = parsed.data;
    let record = await comparisons.get(matterId, c.req.param('id'));
    if (!record) return c.json({ error: 'Unknown comparison.' }, 404);
    if (!record.parties.some(candidate => candidate.name === party)) return c.json({ error: 'Choose a party from this comparison.' }, 400);
    record = await comparisons.update({ ...record, party, assessments: [] });
    const selected = record;
    return sse(c, async (send, signal) => {
      let current = selected;
      const laterDocx = await comparisons.readDocument(matterId, current.comparisonId, 'later');
      const accept = async (assessment: ComparisonRecord['assessments'][number]) => {
        if (signal.aborted) return;
        current = await comparisons.update({ ...current, assessments: [...current.assessments, assessment] });
        await send({ type: 'assessment', assessment });
      };
      const stream = source();
      if (stream) await streamAssessments({ stream, signal, changes: current.changes, laterDocx,
        request: buildAdviceRequest({ party, documentType: current.documentType, changes: current.changes, earlierText: current.earlier.text, laterText: current.later.text }), onAssessment: accept });
      else {
        const assessments = (await replay(current, party))?.assessments;
        if (!assessments) { await send({ type: 'needs_key', stage: 'advice', message: NEEDS_KEY_MESSAGE }); return; }
        for (const value of assessments) {
          const model = modelAssessmentSchema.parse(value);
          const change = current.changes.find(change => change.changeId === model.changeId);
          if (!change) throw new Error('Assessment refers to an unknown change.');
          await accept(await verifyAssessment(model, { change, laterDocx }));
        }
      }
      await send({ type: 'done', comparisonId: current.comparisonId });
    });
  });

  app.get('/:id', async c => {
    const record = await comparisons.get(c.req.query('matterId') ?? '', c.req.param('id'));
    return record ? c.json(record) : c.json({ error: 'Unknown comparison.' }, 404);
  });
  function download(bytes: Uint8Array, filename: string) {
    return new Response(Buffer.from(bytes), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    } });
  }
  app.get('/:id/redline.docx', async c => {
    const record = await comparisons.get(c.req.query('matterId') ?? '', c.req.param('id'));
    if (!record) return c.json({ error: 'Unknown comparison.' }, 404);
    return download(await buildAdviceDocx(record, await comparisons.readDocument(record.matterId, record.comparisonId, 'redline')), `${record.matterId}-redline.docx`);
  });
  app.post('/:id/counter.docx', async c => {
    const body = counterBody.safeParse(await c.req.json());
    if (!body.success) return c.json({ error: 'Choose suggestions from this comparison.' }, 400);
    const record = await comparisons.get(body.data.matterId, c.req.param('id'));
    if (!record) return c.json({ error: 'Unknown comparison.' }, 404);
    try { selectedCounters(record, body.data.changeIds); }
    catch (error) { return c.json({ error: (error as Error).message }, 400); }
    return download(await buildCounterDocx(record, await comparisons.readDocument(record.matterId, record.comparisonId, 'later'), body.data.changeIds), `${record.matterId}-counter-draft.docx`);
  });
  return app;
}
