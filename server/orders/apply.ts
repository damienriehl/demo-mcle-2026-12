import type { Matter } from '../../src/data/schema';
import { COURT_ORDER_RULE_ID, deadlineCatalog } from '../../src/engine';
import { leaves } from '../intake/schema';
import { orderIds } from './ids';
import type { Extraction, VerifiedDate, VerifiedExtraction } from './prompt';

export const derivationRules = {
  federal: {
    trial: { expert: 'frcp-26a2d-expert-disclosure', pretrial: 'frcp-26a3-pretrial-disclosure', objections: 'frcp-26a3-objections' },
    'dispositive-hearing': {},
    'nondispositive-hearing': {},
  },
  minnesota: {
    trial: { expert: 'mn-civ-26-expert-disclosure', pretrial: 'mn-civ-26-pretrial-disclosure', objections: 'mn-civ-26-objections' },
    'dispositive-hearing': {
      motion: 'mn-gp-115-dispositive-motion', response: 'mn-gp-115-dispositive-response', reply: 'mn-gp-115-dispositive-reply',
    },
    'nondispositive-hearing': {
      motion: 'mn-gp-115-nondispositive-motion', response: 'mn-gp-115-nondispositive-response', reply: 'mn-gp-115-nondispositive-reply',
    },
  },
} as const satisfies Record<Extraction['court'], Partial<Record<VerifiedDate['kind'], Record<string, string>>>>;

type Anchor = { id: string; event: string };
type InternalPath = { path: string; provenance: Matter['provenance'][string] | undefined };

function keepIndices<T>(items: readonly T[], indices: Map<number, number>): T[] {
  return items.filter((_, index) => indices.has(index));
}

function reindexInternalOnly(matter: Matter, paths: InternalPath[]) {
  matter.internalOnly = paths.map(entry => entry.path);
  for (const path of Object.keys(matter.provenance)) if (path.startsWith('internalOnly.')) delete matter.provenance[path];
  paths.forEach((entry, index) => {
    matter.provenance[`internalOnly.${index}`] = entry.provenance
      ?? { source: 'inferred', evidence: 'Internal field path retained after scheduling order replacement.' };
  });
}

export function applySchedulingOrder(matter: Matter, extraction: VerifiedExtraction, orderSlug: string): Matter {
  const next = structuredClone(matter);
  const { prefix, documentId } = orderIds(orderSlug);
  let internalPaths = matter.internalOnly.map((path, index) => ({ path, provenance: matter.provenance[`internalOnly.${index}`] }));
  for (const collection of ['deadlines', 'timeline', 'documents'] as const) {
    const indices = new Map<number, number>();
    let kept = 0;
    next[collection].forEach((entry, index) => {
      if (!entry.id.startsWith(prefix) && entry.id !== documentId) indices.set(index, kept++);
    });
    const remap = (path: string): string | undefined => {
      const match = /^(deadlines|timeline|documents)\.(\d+)(\..*)?$/.exec(path);
      if (!match || match[1] !== collection) return path;
      const index = indices.get(Number(match[2]));
      return index === undefined ? undefined : `${collection}.${index}${match[3] ?? ''}`;
    };
    next.provenance = Object.fromEntries(Object.entries(next.provenance).flatMap(([path, provenance]) => {
      const mapped = remap(path);
      return mapped === undefined ? [] : [[mapped, provenance]];
    }));
    internalPaths = internalPaths.flatMap(entry => {
      const mapped = remap(entry.path);
      return mapped === undefined ? [] : [{ ...entry, path: mapped }];
    });
    Object.assign(next, { [collection]: keepIndices<Matter[typeof collection][number]>(next[collection], indices) });
  }
  reindexInternalOnly(next, internalPaths);

  const mark = (value: unknown, path: string, source: 'stated' | 'inferred', evidence: string) => {
    for (const leaf of leaves(value, path)) next.provenance[leaf.path] = { source, evidence };
  };
  const verified = extraction.dates.filter(date => date.verified);
  const document = { id: documentId, title: extraction.caption, kind: 'order', body: verified.map(date => date.quote).join('\n').slice(0, 500) || extraction.caption, shared: false };
  mark(document, `documents.${next.documents.length}`, 'stated', extraction.caption);
  next.documents.push(document);

  const dates = verified.map((date, index) => ({ date, id: `${prefix}date-${index + 1}`, event: date.event }));
  for (const { date, id } of dates) {
    const deadline: Matter['deadlines'][number] = {
      id, label: date.event, deadlineRuleId: COURT_ORDER_RULE_ID,
      trigger: { event: `Scheduling order, p. ${date.page}`, date: date.date },
      inputs: { date: date.date, page: date.page, quote: date.quote }, assumptions: {},
    };
    mark(deadline, `deadlines.${next.deadlines.length}`, 'stated', date.quote);
    next.deadlines.push(deadline);
    const timeline = { id: `${id}-event`, event: date.event, date: date.date };
    mark(timeline, `timeline.${next.timeline.length}`, 'stated', date.quote);
    next.timeline.push(timeline);
  }

  const catalog = deadlineCatalog();
  const findKind = (kind: VerifiedDate['kind']) => dates.find(entry => entry.date.kind === kind);
  const derive = (ruleId: string, from: Anchor, courtDate: VerifiedDate, id: string, supersededBy?: string): Anchor => {
    const rule = catalog.find(rule => rule.id === ruleId);
    if (!rule) throw new Error(`Scheduling rule missing from catalog: ${ruleId}`);
    const deadline: Matter['deadlines'][number] = {
      id, label: rule.label, deadlineRuleId: ruleId,
      trigger: { event: from.event, fromDeadline: from.id }, assumptions: {},
      ...(supersededBy ? { supersededBy } : {}),
    };
    mark(deadline, `deadlines.${next.deadlines.length}`, 'inferred', `Counts from ${from.event}; court date: ${courtDate.event} (${courtDate.date}, scheduling order p. ${courtDate.page}); ${rule.label} (${ruleId}).`);
    next.deadlines.push(deadline);
    return { id, event: rule.label };
  };
  for (const entry of dates) {
    if (entry.date.kind === 'trial') {
      const rules = derivationRules[extraction.court].trial;
      const expert = findKind('expert-disclosure');
      const pretrial = findKind('pretrial-disclosure');
      derive(rules.expert, entry, entry.date, `${entry.id}-expert`, expert?.id);
      const defaultPretrial = derive(rules.pretrial, entry, entry.date, `${entry.id}-pretrial`, pretrial?.id);
      derive(rules.objections, pretrial ?? defaultPretrial, pretrial?.date ?? entry.date, `${entry.id}-objections`);
    } else if (extraction.court === 'minnesota' && (entry.date.kind === 'dispositive-hearing' || entry.date.kind === 'nondispositive-hearing')) {
      for (const [paper, ruleId] of Object.entries(derivationRules[extraction.court][entry.date.kind])) {
        derive(ruleId, entry, entry.date, `${entry.id}-${paper}`);
      }
    }
  }
  return next;
}
