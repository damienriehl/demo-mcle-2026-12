import { DeadlineCard } from '../components/DeadlineCard';
import { FeatureSlot } from '../components/FeatureSlot';
import { daysFromToday, deadlineResult, type ViewProps } from './shared';
import type { DeadlineResult } from '../engine/types';

const bands = [
  { label: 'Overdue', note: 'Past due' },
  { label: 'This week', note: 'Next 7 days' },
  { label: 'This month', note: '8–30 days out' },
  { label: 'Later', note: 'Beyond 30 days' },
  { label: 'Needs verification', note: 'A date needs review' },
] as const;
function bandOf(result: DeadlineResult): number {
  if (result.status === 'uncomputable') return bands.length - 1;
  const days = daysFromToday(result.dueDate);
  if (days < 0) return 0;
  if (days <= 7) return 1;
  if (days <= 30) return 2;
  return 3;
}
export function Radar({ matters, activeMatter, onVerify, arrivals }: ViewProps & { arrivals: Set<string> }) {
  const deadlines = matters.flatMap(matter => matter.deadlines.map((deadline, index) => ({ matter, deadline, index, result: deadlineResult(matter, deadline.id) })))
    .filter(({ deadline }) => !deadline.supersededBy)
    .sort((a, b) => (a.result.status === 'computed' ? a.result.dueDate : '9999').localeCompare(b.result.status === 'computed' ? b.result.dueDate : '9999'));
  return <div className="radar-view"><header className="view-heading"><div><h2>Deadline Radar</h2><p>Every matter. Every next move.</p></div><p>{deadlines.length} deadlines across {matters.length} matters</p></header>
    <div className="radar-bands">{bands.map(({ label: band, note }, bandIndex) => {
      const items = deadlines.filter(({ result }) => bandOf(result) === bandIndex);
      return <section key={band} aria-label={band} data-band={band} className={`radar-band${items.length ? '' : ' radar-band-empty'}`}><header><h3>{band} <span className="band-count">{items.length}</span></h3><p>{note}</p></header>{items.map(({ matter, deadline, index }) => <DeadlineCard key={`${matter.id}-${deadline.id}`} matter={matter} index={index} onVerify={onVerify} arrived={arrivals.has(matter.id)} showMatter />)}{!items.length && <p className="empty-band">Nothing due.</p>}</section>;
    })}</div><FeatureSlot slot="radar.overlay" matters={matters} activeMatter={activeMatter} />
  </div>;
}
