import { compareDocuments, openDocxSession } from 'docxodus/core';
import { ensureEngine } from './engine';
import type { ComparisonRecord } from './types';

const labels = { harms: 'Harms', neutral: 'Neutral', helps: 'Helps' };
const markdownLiteral = (text: string) => text.replace(/([\\`*_{}\[\]<>#!|~])/g, '\\$1');

export async function buildAdviceDocx(record: ComparisonRecord, redline: Uint8Array): Promise<Uint8Array> {
  await ensureEngine();
  const session = openDocxSession(redline);
  try {
    for (const assessment of record.assessments) {
      const revision = record.changes.find(change => change.changeId === assessment.changeId)?.revisionIds[0];
      if (!revision) throw new Error('The assessment has no revision to comment on.');
      const result = session.addCommentToRevision(revision, 'Matter Cockpit', markdownLiteral(`${labels[assessment.verdict]} — ${assessment.reason}`));
      if (!result.success) throw new Error('Could not add an advice comment.');
    }
    return session.save();
  } finally { session.close(); }
}

export function selectedCounters(record: ComparisonRecord, changeIds: string[]) {
  if (!changeIds.length) throw new Error('Apply at least one suggestion first.');
  return [...new Set(changeIds)].map(id => {
    const assessment = record.assessments.find(assessment => assessment.changeId === id);
    if (!record.changes.some(change => change.changeId === id) || !assessment?.verified || !assessment.counter?.span) {
      throw new Error('Choose only suggestions with verified counter-language.');
    }
    return assessment.counter as typeof assessment.counter & { span: NonNullable<typeof assessment.counter.span> };
  });
}

export async function buildCounterDocx(record: ComparisonRecord, later: Uint8Array, changeIds: string[]): Promise<Uint8Array> {
  const counters = selectedCounters(record, changeIds);
  await ensureEngine();
  const session = openDocxSession(later);
  let edited: Uint8Array;
  try {
    // Apply from the end of each paragraph so earlier stored offsets remain valid.
    for (const counter of counters.sort((a, b) => b.span.start - a.span.start)) {
      const { anchorId, start, length, literal } = counter.span;
      if (session.getAnchorInfo(anchorId)?.visibleText.slice(start, start + length) !== literal) throw new Error('The verified counter-language no longer matches the draft.');
      const results = session.replaceTextRange(anchorId, literal, counter.replace, { expectedMatchCount: 1 });
      if (!results.length || results.some(result => !result.success)) throw new Error('Could not apply the verified counter-language.');
    }
    edited = session.save();
  } finally { session.close(); }
  return compareDocuments(later, edited, { authorName: `${record.party} counsel` });
}
