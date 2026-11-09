import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Matter } from '../src/data/schema';
import { createClient, NEEDS_KEY_MESSAGE } from '../server/ai';
import { buildAdviceRequest, streamAssessments } from '../server/drafts/advise';
import { cannedKey, sampleFileNames } from '../server/drafts/canned';
import { compareDrafts } from '../server/drafts/compare';
import { normalizeDraft } from '../server/drafts/normalize';
import type { DocumentType, ModelAssessment, Party } from '../server/drafts/types';
import { modelTagPass } from '../server/folio/tag';
import type { ModelStream } from '../server/intake/client';

class IncompleteAdviceError extends Error {}

export async function generateCannedPair({ directory, stream }: { directory: string; stream: ModelStream }) {
  const pair: { title: string; family: DocumentType['family']; parties: Pick<Party, 'name' | 'role'>[]; matterHint: Matter['practiceArea'] | 'none' } = JSON.parse(await readFile(join(directory, 'pair.json'), 'utf8'));
  const files = await readdir(directory);
  const { earlierName, laterName } = sampleFileNames(files);
  const readDraft = async (filename: string) => normalizeDraft({ filename, bytes: new Uint8Array(await readFile(join(directory, filename))) });
  const earlier = await readDraft(earlierName);
  const later = await readDraft(laterName);
  const compared = await compareDrafts(earlier, later);
  const texts = { earlierText: earlier.text, laterText: later.text };
  const matter: Matter = {
    id: basename(directory), title: pair.title, synthetic: true,
    practiceArea: pair.matterHint === 'none' ? 'regulatory' : pair.matterHint,
    forum: 'Fictional demonstration', client: { name: 'No client selected', contact: 'demo@example.invalid' },
    parties: pair.parties, timeline: [], documents: [], deadlines: [],
    clientFacing: { status: 'Fictional sample', nextSteps: [] }, internalOnly: [], provenance: {},
  };
  const signal = new AbortController().signal;
  const facts = await modelTagPass({ stream, ...texts, matter, signal });
  const summary = { pair: basename(directory), changes: compared.changes.length, verified: 0, unverified: 0, countersKept: 0 };
  const analyses: { filename: string; party: string; assessments: ModelAssessment[] }[] = [];
  for (const party of facts.parties) {
    let assessments: ModelAssessment[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const run = new Map<string, ModelAssessment>();
      await streamAssessments({ stream, signal, changes: compared.changes, laterDocx: later.docx,
        request: buildAdviceRequest({ party: party.name, documentType: facts.documentType, changes: compared.changes, ...texts }),
        onAssessment: ({ verified, counter, ...assessment }) => {
          if (!verified) { summary.unverified++; return; }
          if (run.has(assessment.changeId)) return;
          if (counter?.span) {
            const { span: _span, ...modelCounter } = counter;
            run.set(assessment.changeId, { ...assessment, counter: modelCounter });
          } else run.set(assessment.changeId, assessment);
        },
      });
      const missing = compared.changes.filter(change => !run.has(change.changeId)).map(change => change.changeId);
      if (!missing.length) { assessments = [...run.values()]; break; }
      if (attempt === 2) throw new IncompleteAdviceError(
        `Incomplete canned advice for pair "${summary.pair}", party "${party.name}": missing change ids ${missing.join(', ')} after 3 attempts.`,
      );
    }
    summary.verified += assessments.length;
    summary.countersKept += assessments.filter(assessment => assessment.counter).length;
    const slug = party.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    analyses.push({ filename: `analysis.${slug}.json`, party: party.name, assessments });
  }
  for (const { filename, ...analysis } of analyses) await writeFile(join(directory, filename), `${JSON.stringify(analysis, null, 2)}\n`);
  await writeFile(join(directory, 'meta.json'), `${JSON.stringify({ key: cannedKey(earlier.text, later.text), parties: facts.parties, documentType: facts.documentType, modelTags: facts.tags }, null, 2)}\n`);
  return summary;
}

async function main() {
  const client = createClient();
  if (!client) { console.error(NEEDS_KEY_MESSAGE); process.exitCode = 1; return; }
  const stream: ModelStream = async function* (request, signal) {
    const response = client.beta.messages.stream(request, { signal, maxRetries: 0 });
    try { for await (const event of response) yield event; }
    finally { response.abort(); }
  };
  const directory = resolve('data/seed/drafts');
  const named = process.argv[2];
  const pairs = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory() && (!named || entry.name === named)).sort((a, b) => a.name.localeCompare(b.name));
  if (named && pairs.length === 0) throw new Error('Unknown sample pair.');
  for (const pair of pairs) {
    const result = await generateCannedPair({ directory: join(directory, pair.name), stream });
    console.log(`${result.pair}: ${result.changes} changes; ${result.verified} verified, ${result.unverified} unverified; ${result.countersKept} counters kept.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Only the locally constructed completeness error is safe to print in full.
    console.error(error instanceof IncompleteAdviceError ? error.message
      : `Canned generation failed: ${error instanceof Error ? error.constructor.name : 'unknown error'}`);
    process.exitCode = 1;
  });
}
