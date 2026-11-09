import { randomUUID } from 'node:crypto';
import type { Reference, RunResult } from '../../src/features/prior-art/types';
import { sampleApi } from './fixture';
import { buildTrails } from './trail';
import { UsptoUnavailable, type PatentApi } from './uspto';

export const LIVE_LINE = 'Source: USPTO Open Data Portal (live)';
export const SAMPLE_NO_KEY_LINE = 'Illustrative sample (no USPTO key configured)';
export const SAMPLE_DOWN_LINE = 'Illustrative sample (live USPTO lookup unavailable)';
export const SAMPLE_LABEL = 'Illustrative sample — not real USPTO data';

export type RunInput = { queries: string[]; beforeDate?: string; numbers: string[]; depth?: number };

async function runWith(api: PatentApi, input: RunInput) {
  const candidates = new Map<string, Reference>();
  for (const query of input.queries) {
    for (const hit of await api.searchPatents(query, input.beforeDate)) {
      if (candidates.size >= 15) break;
      if (!candidates.has(hit.id)) candidates.set(hit.id, hit);
    }
  }
  const listed = [...candidates.values()];
  const roots = input.numbers.length ? input.numbers : listed.slice(0, 2).map(r => r.id);
  const trail = await buildTrails(roots, api, { depth: input.depth ?? 2, maxNodes: 40 });
  return { listed, trail };
}

export async function runPriorArt(input: RunInput, live: PatentApi | null): Promise<RunResult> {
  const notices: string[] = [];
  let source: RunResult['source'] = 'sample';
  let sourceLine = SAMPLE_NO_KEY_LINE;
  let result: Awaited<ReturnType<typeof runWith>> | undefined;
  if (live) {
    try {
      result = await runWith(live, input);
      source = 'live';
      sourceLine = LIVE_LINE;
      notices.push('Live records carry titles and classification only; the Open Data Portal offers no abstracts, and its citation trail is not yet wired in.');
    } catch (error) {
      sourceLine = SAMPLE_DOWN_LINE;
      notices.push(`Live USPTO data unavailable: ${error instanceof UsptoUnavailable ? error.message : 'the lookup failed.'}`);
    }
  }
  if (!result) {
    const sampleNumbers = input.numbers.filter(n => n.startsWith('SAMPLE-'));
    const skipped = input.numbers.filter(n => !n.startsWith('SAMPLE-'));
    if (skipped.length) notices.push(`US ${skipped.join(', ')} can be looked up only with live USPTO data.`);
    result = await runWith(sampleApi, { ...input, numbers: sampleNumbers });
  }
  const { listed, trail } = result;
  if (trail.missing.length) notices.push(`No record found for ${trail.missing.join(', ')}.`);
  if (trail.truncated) notices.push('Citation trail stopped at 40 references.');
  return {
    runId: randomUUID(), source, sourceLine, notices, queries: input.queries,
    candidates: listed, trails: trail.trees, trailNodeCount: trail.count, numbers: input.numbers,
  };
}

/** Every reference in a run, de-duplicated, for the relevance analysis. */
export function runReferences(run: RunResult): Reference[] {
  const all = new Map<string, Reference>();
  const walk = (nodes: RunResult['trails']) => nodes.forEach(node => { if (!all.has(node.id) && node.text) all.set(node.id, node); walk(node.children); });
  run.candidates.forEach(ref => all.set(ref.id, ref));
  walk(run.trails);
  return [...all.values()].slice(0, 25);
}
