import type { Matter } from '../../src/data/schema';
import { deadlineCatalog } from '../../src/engine';
import { leaves } from '../intake/schema';
import type { VerifiedExtraction } from './prompt';

/** Replace this order's authored entries, remapping dot paths for entries that survive. */
export function applySchedulingOrder(matter: Matter, extraction: VerifiedExtraction, orderSlug: string): Matter {
  const next = structuredClone(matter);
  const prefix = `order-${orderSlug}-`;
  const documentId = `order-${orderSlug}`;
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
    // Each collection retains its own entry type.
    if (collection === 'deadlines') next.deadlines = next.deadlines.filter((_, index) => indices.has(index));
    else if (collection === 'timeline') next.timeline = next.timeline.filter((_, index) => indices.has(index));
    else next.documents = next.documents.filter((_, index) => indices.has(index));
  }
  // internalOnly is itself indexed, so refresh its provenance after path removal.
  next.internalOnly = internalPaths.map(entry => entry.path);
  for (const path of Object.keys(next.provenance)) if (path.startsWith('internalOnly.')) delete next.provenance[path];
  internalPaths.forEach((entry, index) => {
    next.provenance[`internalOnly.${index}`] = entry.provenance
      ?? { source: 'inferred', evidence: 'Internal field path retained after scheduling order replacement.' };
  });

  const mark = (value: unknown, path: string, source: 'stated' | 'inferred', evidence: string) => {
    for (const leaf of leaves(value, path)) next.provenance[leaf.path] = { source, evidence };
  };
  const verified = extraction.dates.filter(date => date.verified);
  const document = { id: documentId, title: extraction.caption, kind: 'order', body: verified.map(date => date.quote).join('\n').slice(0, 500) || extraction.caption, shared: false };
  mark(document, `documents.${next.documents.length}`, 'stated', extraction.caption);
  next.documents.push(document);

  const dates = verified.map((date, index) => ({ date, id: `${prefix}date-${index + 1}` }));
  for (const { date, id } of dates) {
    const deadline: Matter['deadlines'][number] = {
      id, label: date.event, deadlineRuleId: 'court-order-date',
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
  const derive = (ruleId: string, from: typeof dates[number] & { label?: string }, id: string, supersededBy?: string) => {
    const rule = catalog.find(rule => rule.id === ruleId)!;
    const deadline: Matter['deadlines'][number] = {
      id, label: rule.label, deadlineRuleId: ruleId,
      trigger: { event: from.label ?? from.date.event, fromDeadline: from.id }, assumptions: {},
      ...(supersededBy ? { supersededBy } : {}),
    };
    mark(deadline, `deadlines.${next.deadlines.length}`, 'inferred', `Counts from ${from.label ?? from.date.event}; court date: ${from.date.event} (${from.date.date}, scheduling order p. ${from.date.page}); ${rule.label} (${ruleId}).`);
    next.deadlines.push(deadline);
    return { date: from.date, id, label: rule.label };
  };
  for (const entry of dates) {
    if (entry.date.kind === 'trial') {
      const federal = extraction.court === 'federal';
      const expert = dates.find(entry => entry.date.kind === 'expert-disclosure');
      const pretrial = dates.find(entry => entry.date.kind === 'pretrial-disclosure');
      derive(federal ? 'frcp-26a2d-expert-disclosure' : 'mn-civ-26-expert-disclosure', entry, `${entry.id}-expert`, expert?.id);
      const defaultPretrial = derive(federal ? 'frcp-26a3-pretrial-disclosure' : 'mn-civ-26-pretrial-disclosure', entry, `${entry.id}-pretrial`, pretrial?.id);
      derive(federal ? 'frcp-26a3-objections' : 'mn-civ-26-objections', pretrial ?? defaultPretrial, `${entry.id}-objections`);
    } else if (extraction.court === 'minnesota' && (entry.date.kind === 'dispositive-hearing' || entry.date.kind === 'nondispositive-hearing')) {
      const kind = entry.date.kind.replace('-hearing', '');
      for (const paper of ['motion', 'response', 'reply']) derive(`mn-gp-115-${kind}-${paper}`, entry, `${entry.id}-${paper}`);
    }
  }
  return next;
}
