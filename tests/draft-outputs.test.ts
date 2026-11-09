import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getComments, getRevisions } from 'docxodus/core';
import { afterEach, describe, expect, it } from 'vitest';
import { compareDrafts } from '../server/drafts/compare';
import { normalizeDraft } from '../server/drafts/normalize';
import { buildAdviceDocx } from '../server/drafts/outputs';
import { createComparisonStore } from '../server/drafts/store';
import type { ComparisonRecord } from '../server/drafts/types';
import { buyer, events, json, setup, upload } from './fixtures/drafts/api/helpers';

// Comment markup changes paragraph content hashes; native revision identities stay fixed.
const revisions = async (bytes: Uint8Array) => (await getRevisions(bytes)).map(({ anchorId: _anchor, affectedAnchors: _affected, ...revision }) => revision);

const contexts: ReturnType<typeof setup>[] = [];
function context() { const c = setup(); contexts.push(c); return c; }
afterEach(() => contexts.splice(0).forEach(c => { c.store.close(); rmSync(c.directory, { recursive: true, force: true }); }));
async function advised() {
  const c = context();
  const id = (await events(await upload(c)))[0].comparisonId;
  await events(await json(c, `/${id}/advise`, { matterId: c.matterId, party: buyer }));
  return { ...c, id };
}

describe('draft Word downloads', () => {
  it('downloads comments with the verdict, reason, and author while retaining every revision', async () => {
    const c = await advised();
    const response = await c.app.request(`/${c.id}/redline.docx?matterId=${c.matterId}&party=${encodeURIComponent(buyer)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain(`${c.matterId}-redline.docx`);
    expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const original = readFileSync(join(c.comparisonsDir, c.matterId, c.id, 'redline.docx'));
    expect(await revisions(bytes)).toEqual(await revisions(original));
    expect(await getComments(bytes)).toEqual([expect.objectContaining({ author: 'Matter Cockpit', text: 'Harms — The limit to "direct damages" changes liability.' })]);
  });

  it('comments on a move without converting the move to insertions or deletions', async () => {
    const clause = 'The recipient shall keep all confidential information secure and shall disclose it only to authorized employees.';
    const sections = Array.from({ length: 7 }, (_, i) => `Section ${i + 1}.\n\nThe parties agree to the obligations of section ${i + 1}.`);
    const word = (text: string) => normalizeDraft({ filename: 'draft.txt', bytes: new TextEncoder().encode(text) });
    const earlier = await word(sections.map((s, i) => s + (i === 6 ? `\n\n${clause}` : '')).join('\n\n'));
    const later = await word(sections.map((s, i) => s + (i === 2 ? `\n\n${clause}` : '')).join('\n\n'));
    const compared = await compareDrafts(earlier, later);
    expect(compared.changes[0].kind).toBe('move');
    const record: ComparisonRecord = { schemaVersion: 1, comparisonId: 'move', party: buyer, matterId: 'fictional', createdAt: new Date().toISOString(), earlier: { filename: 'earlier.txt', format: 'txt', text: earlier.text }, later: { filename: 'later.txt', format: 'txt', text: later.text }, formattingCompared: false, changes: compared.changes, tags: [], parties: [], assessments: [{ changeId: 'c1', verdict: 'neutral', reason: 'The clause moved.', quote: clause, confidence: 'high', verified: true }] };
    const bytes = await buildAdviceDocx(record, compared.redline, buyer);
    expect(await revisions(bytes)).toEqual(await revisions(compared.redline));
    expect((await getRevisions(bytes)).filter(r => r.type === 'move')).toHaveLength(1);
    expect(await getComments(bytes)).toHaveLength(1);
  });

  it('returns the plain redline when the saved party has no assessments', async () => {
    const c = await advised();
    const record = (await createComparisonStore(c.comparisonsDir).get(c.matterId, c.id))!;
    const redline = new Uint8Array(readFileSync(join(c.comparisonsDir, c.matterId, c.id, 'redline.docx')));
    expect(await buildAdviceDocx({ ...record, assessments: [] }, redline, buyer)).toBe(redline);
  });

  it('compares an applied carve-out against the later draft as one counsel-authored insertion', async () => {
    const c = await advised();
    const response = await json(c, `/${c.id}/counter.docx`, { matterId: c.matterId, changeIds: ['c1'] });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain(`${c.matterId}-counter-draft.docx`);
    const counterRevisions = await getRevisions(new Uint8Array(await response.arrayBuffer()));
    expect(counterRevisions).toHaveLength(1);
    expect(counterRevisions[0]).toMatchObject({ type: 'insert', author: `${buyer} counsel`, text: ', except fraud' });
  });

  it('rejects zero ids, unknown ids, and assessments without verified spans', async () => {
    const c = await advised();
    const empty = await json(c, `/${c.id}/counter.docx`, { matterId: c.matterId, changeIds: [] });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'Apply at least one suggestion first.' });
    expect((await json(c, `/${c.id}/counter.docx`, { matterId: c.matterId, changeIds: ['unknown'] })).status).toBe(400);
    const comparisons = createComparisonStore(c.comparisonsDir);
    const record = (await comparisons.get(c.matterId, c.id))!;
    delete record.assessments[0].counter!.span;
    await comparisons.update(record);
    expect((await json(c, `/${c.id}/counter.docx`, { matterId: c.matterId, changeIds: ['c1'] })).status).toBe(400);
  });
});
