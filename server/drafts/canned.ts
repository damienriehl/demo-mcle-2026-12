import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalize } from '../orders/verify-quote';
import type { DocumentType, FolioTag, ModelAssessment, Party } from './types';

type CannedMeta = {
  key: string;
  parties: Party[];
  documentType?: DocumentType;
  modelTags: FolioTag[];
};
type CannedAnalysis = { party: string; assessments: ModelAssessment[] };

let metadata = new Map<string, CannedMeta>();
let analyses = new Map<string, ModelAssessment[]>();

export function cannedKey(earlierText: string, laterText: string): string {
  return createHash('sha256').update(JSON.stringify([normalize(earlierText), normalize(laterText)])).digest('hex');
}

export function cannedPartyKey(key: string, party: string): string {
  return JSON.stringify([key, party]);
}

/** Load the replay catalog before looking up metadata or party-specific assessments. */
export async function loadCanned(directory = 'data/seed/drafts'): Promise<void> {
  const nextMetadata = new Map<string, CannedMeta>();
  const nextAnalyses = new Map<string, ModelAssessment[]>();
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const folder = resolve(directory, entry.name);
    const files = await readdir(folder);
    if (!files.includes('meta.json')) continue;
    const meta: CannedMeta = JSON.parse(await readFile(resolve(folder, 'meta.json'), 'utf8'));
    nextMetadata.set(meta.key, meta);
    for (const file of files.filter(file => /^analysis\..+\.json$/.test(file)).sort()) {
      const analysis: CannedAnalysis = JSON.parse(await readFile(resolve(folder, file), 'utf8'));
      nextAnalyses.set(cannedPartyKey(meta.key, analysis.party), analysis.assessments);
    }
  }
  metadata = nextMetadata;
  analyses = nextAnalyses;
}

export function findCanned(key: string): CannedMeta | undefined {
  return metadata.get(key);
}

export function findCannedAssessments(key: string, party: string): ModelAssessment[] | undefined {
  return analyses.get(cannedPartyKey(key, party));
}
