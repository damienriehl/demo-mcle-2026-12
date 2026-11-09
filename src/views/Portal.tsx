import { isPublicRecord, type MatterWithDeadlines } from '../data/schema';
import { FeatureSlot } from '../components/FeatureSlot';
import { sourceFor } from '../intake/SourceLabel';
import { factContext } from '../verify/context';
import { dateLabel, daysFromToday, deadlineResult, type ViewProps } from './shared';

function hidden(path: string[], patterns: string[]) {
  return patterns.some(pattern => {
    const parts = pattern.split('.');
    return parts.length <= path.length && parts.every((part, i) => part === '*' || part === path[i]);
  });
}
/** Portal extensions receive only client fields, without calculation details or evidence. */
export function portalProjection(matter: MatterWithDeadlines): MatterWithDeadlines {
  const allowed = {
    id: matter.id,
    title: matter.title,
    client: { name: matter.client.name },
    clientFacing: matter.clientFacing,
    deadlines: matter.deadlines.map(({ id, label }) => ({ id, label })),
    computedDeadlines: Object.fromEntries(Object.entries(matter.computedDeadlines).map(([id, result]) => [id,
      result.status === 'computed' ? { status: result.status, dueDate: result.dueDate }
        : { status: result.status, reason: 'The date is being confirmed.' },
    ])),
    documents: matter.documents.map(document => document.shared ? document : undefined),
    provenance: Object.fromEntries(Object.entries(matter.provenance).map(([path, entry]) => [path, { source: entry.source }])),
  };
  function redact(value: unknown, path: string[]): unknown {
    if (hidden(path, matter.internalOnly)) return undefined;
    if (Array.isArray(value)) return value.map((entry, i) => redact(entry, [...path, String(i)]));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
      const next = redact(entry, [...path, key]);
      return next === undefined ? [] : [[key, next]];
    }));
    return value;
  }
  const projected = redact(allowed, []) as MatterWithDeadlines;
  if (projected.provenance) {
    projected.provenance = Object.fromEntries(Object.entries(projected.provenance).filter(([path]) => {
      const value = path.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' && Object.hasOwn(current, part)
        ? (current as Record<string, unknown>)[part] : undefined, projected);
      return value !== undefined;
    }));
  }
  return projected;
}
export function Portal({ matters, activeMatter, onVerify }: ViewProps) {
  const safeMatters = matters.filter(matter => !isPublicRecord(matter)).map(portalProjection);
  const matter = safeMatters.find(item => item.id === activeMatter?.id);
  if (!matter) return <div className="empty-state"><h2>A clear view for your client.</h2><p>Select a matter to see its next steps and shared documents.</p></div>;
  const field = (path: string, value?: string) => {
    if (!value) return null;
    const source = sourceFor(matter.provenance ?? {}, path);
    return source === 'inferred' || source === 'invented'
      ? <button className="portal-field" onClick={() => { const selection = { matterId: matter.id, label: 'Client update', value, context: factContext({ provenance: matter.provenance ?? {} }, path) }; onVerify(selection); }}>{value}</button>
      : <span className="portal-field">{value}</span>;
  };
  return <div className="portal-view"><header className="view-heading"><div><p>Client Portal</p><h2>{field('client.name', matter.client?.name)}</h2>{field('title', matter.title)}</div><span className="portal-badge">Shared with you</span></header>
    <section className="client-status"><h3>Where things stand</h3>{field('clientFacing.status', matter.clientFacing?.status)}</section>
    <div className="portal-columns"><section className="workspace-section"><h3>Your next steps</h3><ol className="next-steps">{matter.clientFacing?.nextSteps?.map((step, i) => step && <li key={i}>{field(`clientFacing.nextSteps.${i}`, step)}</li>)}</ol></section>
    <section className="workspace-section"><h3>Upcoming dates</h3>{matter.deadlines?.map(deadline => {
      if (!deadline) return null;
      const result = deadlineResult(matter, deadline.id);
      if (result.status === 'computed' && daysFromToday(result.dueDate) < 0) return null;
      return <button className="portal-date" key={deadline.id} onClick={() => onVerify({ matterId: matter.id, deadlineId: deadline.id, label: deadline.label, result })}><span>{deadline.label}</span><span>{result.status === 'computed' ? dateLabel(result.dueDate) : 'Date being confirmed'}</span></button>;
    })}</section></div>
    <section className="workspace-section"><h3>Shared documents</h3>{matter.documents?.map((document, i) => document && <details className="document" key={document.id}><summary>{field(`documents.${i}.title`, document.title)}</summary>{field(`documents.${i}.body`, document.body)}</details>)}</section>
    <FeatureSlot slot="portal.section" matters={safeMatters} activeMatter={matter} />
  </div>;
}
