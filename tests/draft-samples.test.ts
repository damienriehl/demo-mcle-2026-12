import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages';
import { openDocxSession } from 'docxodus/core';
import { describe, expect, it } from 'vitest';
import { verifyAssessment } from '../server/drafts/advise';
import { cannedKey, findCanned, findCannedAssessments, loadCanned } from '../server/drafts/canned';
import { compareDrafts } from '../server/drafts/compare';
import { normalizeDraft } from '../server/drafts/normalize';
import { modelAssessmentSchema, type ModelAssessment, type Party } from '../server/drafts/types';
import { lookup } from '../server/folio/index';
import type { ModelStream } from '../server/intake/client';

const root = resolve('data/seed/drafts');
const pairs = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const draft = async (folder: string, filename: string) => normalizeDraft({ filename, bytes: new Uint8Array(await readFile(join(folder, filename))) });
async function sample(folder: string) {
  const earlier = await draft(folder, 'earlier.docx');
  const later = await draft(folder, existsSync(join(folder, 'later.pdf')) ? 'later.pdf' : 'later.docx');
  return { earlier, later, ...await compareDrafts(earlier, later) };
}

describe('bundled draft samples', () => {
  it.each(pairs)('%s compares the built files with a linked move and substantive changes', async id => {
    const result = await sample(join(root, id));
    const moves = result.changes.filter(change => change.kind === 'move');
    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves.every(change => change.moveFromAnchorId && change.earlierText === change.laterText)).toBe(true);
    expect(result.changes.length).toBeGreaterThanOrEqual(3);
    if (id === 'bankruptcy-plan-support') {
      expect(moves).toHaveLength(1);
      expect(moves[0].laterText).toContain('restructuring forecasts and negotiation communications confidential');
    }
  });

  it('compares the litigation Word/PDF pair without formatting or extra changes', async () => {
    const folder = join(root, 'litigation-settlement');
    const built = await sample(folder);
    expect(built.later.format).toBe('pdf');
    const markdown = await compareDrafts(await draft(folder, 'earlier.md'), await draft(folder, 'later.md'));
    expect(built.formattingCompared).toBe(false);
    expect(built.changes.length).toBeLessThanOrEqual(markdown.changes.length);
  });

  for (const id of pairs) {
    const folder = join(root, id);
    it.skipIf(!existsSync(join(folder, 'meta.json')))(`${id} replays verified facts and advice for every detected party`, async () => {
      const result = await sample(folder);
      const key = cannedKey(result.earlier.text, result.later.text);
      await loadCanned(root);
      const meta = findCanned(key)!;
      expect(meta).toBeDefined();
      const pair: { parties: Pick<Party, 'name' | 'role'>[] } = JSON.parse(await readFile(join(folder, 'pair.json'), 'utf8'));
      expect(meta.parties.map(party => party.name)).toEqual(expect.arrayContaining(pair.parties.map(party => party.name)));
      expect(lookup(meta.documentType!.iri)).toBeDefined();
      for (const party of meta.parties) expect(lookup(party.actorIri!)).toBeDefined();
      for (const tag of meta.modelTags) {
        expect(lookup(tag.iri)).toBeDefined();
        expect((tag.draft === 'earlier' ? result.earlier.text : result.later.text).slice(tag.start, tag.end)).toBe(tag.text);
      }
      let counters = 0;
      for (const party of meta.parties) {
        const namedParty = pair.parties.find(named => named.name === party.name);
        const assessments = findCannedAssessments(key, party.name)!;
        expect(assessments).toBeDefined();
        expect(assessments.length).toBeGreaterThan(0);
        if (namedParty) expect(assessments.some(assessment => assessment.verdict === 'harms')).toBe(true);
        for (const value of assessments) {
          const assessment = modelAssessmentSchema.parse(value);
          const change = result.changes.find(change => change.changeId === assessment.changeId);
          expect(change).toBeDefined();
          const verified = await verifyAssessment(assessment, { change: change!, laterDocx: result.later.docx });
          expect(verified.verified).toBe(true);
          if (assessment.counter) {
            expect(verified.counter?.span).toBeDefined();
            counters++;
          }
        }
        if (id === 'transactional-asset-purchase' && namedParty) {
          const cap = result.changes.find(change => change.laterText.includes('10%'))!;
          const assessment = assessments.find(assessment => assessment.changeId === cap.changeId)!;
          expect(assessment.verdict).toBe(namedParty.role === 'buyer' ? 'harms' : 'helps');
          if (namedParty.role === 'buyer') expect(assessment.quote).toContain('10%');
        }
      }
      expect(counters).toBeGreaterThan(0);
    });
  }
});

it('loads available canned pairs while skipping a folder without metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'draft-catalog-'));
  try {
    await mkdir(join(directory, 'a-unbuilt'));
    await mkdir(join(directory, 'z-built'));
    for (const file of ['meta.json', 'analysis.buyer.json']) {
      await copyFile(resolve('tests/fixtures/drafts/advise/payment', file), join(directory, 'z-built', file));
    }
    await loadCanned(directory);
    const meta = JSON.parse(await readFile(join(directory, 'z-built/meta.json'), 'utf8'));
    expect(findCanned(meta.key)).toEqual(meta);
    expect(findCannedAssessments(meta.key, 'Fictional Alder Buyer')).toHaveLength(1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('generates replay files through an injected stream, keeping only verified advice and counters', async () => {
  const { generateCannedPair } = await import('../scripts/generate-canned');
  const directory = await mkdtemp(join(tmpdir(), 'draft-generator-'));
  try {
    const parties = [{ name: 'Fictional Alder Buyer', role: 'buyer' }, { name: 'Fictional Birch Seller', role: 'seller' }];
    const detectedParties = [...parties, { name: 'Fictional Cedar Guarantor', role: 'guarantor' }];
    await writeFile(join(directory, 'pair.json'), JSON.stringify({ title: 'Fictional purchase', family: 'transactional', parties, matterHint: 'transactional' }));
    await writeFile(join(directory, 'earlier.md'), 'Buyer shall pay within 30 days.\n\nSeller delivers in 20 days.\n\nRecords remain confidential.');
    await writeFile(join(directory, 'later.md'), 'Buyer shall pay within 10 days.\n\nSeller delivers in 10 days.\n\nRecords remain confidential.');
    // Word artifacts differ from Markdown to prove the generator uses the route-selected files.
    for (const side of ['earlier', 'later']) {
      const built = await draft(directory, `${side}.md`);
      const session = openDocxSession(built.docx);
      try {
        session.replaceText(session.findByKind('p').at(-1)!.id, 'Records stay confidential.');
        await writeFile(join(directory, `${side}.docx`), session.save());
      } finally { session.close(); }
    }
    const compared = await sample(directory);
    const good: ModelAssessment = { changeId: compared.changes[0].changeId, verdict: 'harms', confidence: 'high', quote: 'within 10 days', reason: 'Payment "within 10 days" is earlier.', counter: { find: 'within 10 days', replace: 'within 30 days', effect: 'Restores time to pay.' } };
    const outputs = [
      { parties: detectedParties.map(party => ({ ...party, actorLabel: 'Buyer' })), documentType: { label: 'Asset Purchase Agreement', family: 'transactional' }, tags: [
        { label: 'Indemnification', quote: 'invented quote', draft: 'later' },
        { label: 'Confidentiality Clause', quote: 'confidential', draft: 'later' },
      ] },
      { assessments: [good, { ...good, changeId: compared.changes[1].changeId, quote: 'invented quote' }] },
      { assessments: [{ ...good, verdict: 'helps', counter: { ...good.counter!, find: 'not in the draft' } }] },
      { assessments: [{ ...good, verdict: 'neutral', counter: undefined }] },
    ];
    const requests: Parameters<ModelStream>[0][] = [];
    const stream: ModelStream = async function* (request) {
      requests.push(request);
      const tool = request.tools![0];
      if (!('name' in tool)) throw new Error('Expected a named tool.');
      yield { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'fake', name: tool.name, input: {} } } as BetaRawMessageStreamEvent;
      const json = JSON.stringify(outputs.shift());
      for (let offset = 0; offset < json.length; offset += 17) yield { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(offset, offset + 17) } };
      yield { type: 'content_block_stop', index: 0 };
    };
    const summary = await generateCannedPair({ directory, stream });
    expect(summary).toMatchObject({ changes: 2, verified: 3, unverified: 1, countersKept: 1 });
    expect(requests).toHaveLength(4);
    expect(requests[1].system).toContain(`You represent ${parties[0].name}`);
    expect(requests[2].system).toContain(`You represent ${parties[1].name}`);
    expect(requests[3].system).toContain(`You represent ${detectedParties[2].name}`);
    const meta = JSON.parse(await readFile(join(directory, 'meta.json'), 'utf8'));
    expect(meta.key).toBe(cannedKey(compared.earlier.text, compared.later.text));
    expect(meta.documentType.label).toBe('Asset Purchase Agreement');
    expect(meta.modelTags).toEqual([expect.objectContaining({ text: 'confidential', source: 'model' })]);
    expect(meta.parties.map((party: Party) => party.name)).toEqual(detectedParties.map(party => party.name));
    expect(readdirSync(directory).filter(filename => filename.startsWith('analysis.'))).toHaveLength(3);
    for (const party of meta.parties as Party[]) {
      const slug = party.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const saved = JSON.parse(await readFile(join(directory, `analysis.${slug}.json`), 'utf8'));
      expect(saved.party).toBe(party.name);
      expect(saved.assessments).toHaveLength(1);
      const assessment = modelAssessmentSchema.parse(saved.assessments[0]);
      expect(assessment.quote).toBe('within 10 days');
      if (party.role === 'buyer') expect(assessment.counter).toEqual(good.counter);
      else expect(assessment.counter).toBeUndefined();
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
