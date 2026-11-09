import { describe, expect, it } from 'vitest';
import { checkRatings, verifyQuote } from '../server/prior-art/analyze';
import { detectPatentNumbers, normalizePatentNumber, parsePatentNumbers } from '../server/prior-art/normalize';
import { SAMPLE_NO_KEY_LINE, SAMPLE_DOWN_LINE, runPriorArt } from '../server/prior-art/service';
import { buildTrails } from '../server/prior-art/trail';
import { UsptoUnavailable, createOdpApi, type Citation, type PatentApi } from '../server/prior-art/uspto';
import { inventionSummary, keywordQueries } from '../src/features/prior-art/invention';
import seed from '../data/seed/matters/pocket-aurora.json' with { type: 'json' };

describe('patent number normalization', () => {
  it.each([
    ['10,000,000', '10000000'], ['US10000000B2', '10000000'], ['US 7,654,321 B1', '7654321'],
    ['U.S. Pat. No. 9,876,543', '9876543'], ['D912,345', 'D912345'], ['RE49,123', 'RE49123'],
  ])('%s → %s', (input, expected) => expect(normalizePatentNumber(input)).toBe(expected));
  it('rejects application numbers and junk', () => {
    expect(normalizePatentNumber('18/402,117')).toBeNull();
    expect(normalizePatentNumber('hinge')).toBeNull();
    expect(normalizePatentNumber('123')).toBeNull();
  });
  it('parses lists and detects numbers in matter text', () => {
    expect(parsePatentNumbers('10,000,000; US9876543B2\nUS10000000')).toEqual(['10000000', '9876543']);
    expect(detectPatentNumbers('Rejected over U.S. Patent No. 9,876,543 and US10123456B2. App. No. 18/402,117.')).toEqual(['9876543', '10123456']);
    expect(detectPatentNumbers(seed.documents.map(d => d.body).join(' '))).toEqual([]);
  });
});

function graphApi(edges: Record<string, string[]>): PatentApi & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    async getPatent(id) { lookups.push(id); return { id, title: `T${id}`, text: `abstract ${id}`, sample: true }; },
    async getCitations(id): Promise<Citation[]> { return (edges[id] ?? []).map(c => ({ id: c, category: 'examiner' })); },
    async searchPatents() { return []; },
  };
}

describe('citation trail', () => {
  it('walks breadth-first to the depth cap, dedupes, and survives cycles', async () => {
    const api = graphApi({ A: ['B', 'C'], B: ['C', 'D', 'A'], C: ['E'], D: ['F'], E: ['A'] });
    const { trees, count } = await buildTrails(['A'], api, { depth: 2 });
    expect(trees[0].children.map(n => n.id)).toEqual(['B', 'C']);
    expect(trees[0].children[0].children.map(n => n.id)).toEqual(['D']);
    expect(trees[0].children[1].children.map(n => n.id)).toEqual(['E']);
    expect(trees[0].children[0].children[0].children).toEqual([]);
    expect(count).toBe(5);
    expect(new Set(api.lookups).size).toBe(api.lookups.length);
  });
  it('caps depth at 3 and nodes at the limit', async () => {
    const chain = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`N${i}`, [`N${i + 1}`]]));
    const deep = await buildTrails(['N0'], graphApi(chain), { depth: 9 });
    expect(deep.count).toBe(4);
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`W${i}`, Array.from({ length: 10 }, (_, j) => `W${i * 10 + j + 1}`)]));
    const capped = await buildTrails(['W0'], graphApi(wide), { depth: 3, maxNodes: 40 });
    expect(capped.count).toBe(40);
    expect(capped.truncated).toBe(true);
  });
});

describe('quote verification', () => {
  const refs = [{ id: 'SAMPLE-1', title: 't', text: 'A removable locking pin holds the ribs  in the deployed position.', sample: true }];
  it('accepts literal substrings modulo whitespace and rejects paraphrase', () => {
    expect(verifyQuote('locking pin holds the ribs in', refs[0].text)).toBe(true);
    expect(verifyQuote('a pin locks the ribs', refs[0].text)).toBe(false);
    expect(verifyQuote('', refs[0].text)).toBe(false);
  });
  it('drops unverified quotes and unknown ids from model output', () => {
    const out = checkRatings('Here: [{"id":"SAMPLE-1","rating":"Close","reason":"r","quote":"invented words"},{"id":"X","rating":"Close","reason":"r","quote":"q"}]', refs);
    expect(out).toEqual([{ id: 'SAMPLE-1', rating: 'Close', reason: 'r', quote: undefined, quoteVerified: false }]);
  });
});

describe('fixture fallback', () => {
  const matter = { title: seed.title, documents: seed.documents, timeline: [] };
  it('derives the invention and keyword queries from the matter', () => {
    expect(inventionSummary(matter)).toContain('spiral hinge');
    expect(keywordQueries(matter)).toContain('folding shade canopy');
  });
  it('uses the labeled sample with no key', async () => {
    const run = await runPriorArt({ queries: keywordQueries(matter), numbers: [] }, null);
    expect(run.source).toBe('sample');
    expect(run.sourceLine).toBe(SAMPLE_NO_KEY_LINE);
    expect(run.candidates.length).toBeGreaterThan(0);
    expect(run.candidates.every(r => r.id.startsWith('SAMPLE-') && !r.url)).toBe(true);
    expect(run.trails.length).toBeGreaterThan(0);
  });
  it('falls back to the sample when the live API errors', async () => {
    const failing = createOdpApi('test', async () => new Response('{}', { status: 401 }));
    await expect(failing.searchPatents('canopy')).rejects.toBeInstanceOf(UsptoUnavailable);
    const run = await runPriorArt({ queries: ['canopy hinge'], numbers: ['10000000'] }, failing);
    expect(run.source).toBe('sample');
    expect(run.sourceLine).toBe(SAMPLE_DOWN_LINE);
    expect(run.notices.join(' ')).toMatch(/401/);
    expect(run.notices.join(' ')).toMatch(/10000000 can be looked up only with live USPTO data/);
  });
  it('parses a live ODP response defensively', async () => {
    const api = createOdpApi('test', async () => Response.json({ patentFileWrapperDataBag: [
      { applicationMetaData: { patentNumber: '10000000', inventionTitle: 'Coherent LADAR', grantDate: '2018-06-19' } },
      { applicationMetaData: { inventionTitle: 'no number' } },
    ] }));
    const hits = await api.searchPatents('canopy');
    expect(hits).toEqual([{ id: '10000000', title: 'Coherent LADAR', date: '2018-06-19', sample: false, text: 'Coherent LADAR', url: 'https://patents.google.com/patent/US10000000' }]);
  });
});
