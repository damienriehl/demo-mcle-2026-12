import { DeadlineCard } from '../components/DeadlineCard';
import { FeatureSlot } from '../components/FeatureSlot';
import { daysFromToday, deadlineResult, type ViewProps } from './shared';

const bands = ['Overdue', 'This week', 'This month', 'Later', 'Needs verification'] as const;
const descriptions = ['Past due', 'Next 7 days', '8–30 days out', 'Beyond 30 days', 'A date needs review'];
export function Radar({ matters, activeMatter, onVerify, arrivals }: ViewProps & { arrivals: Set<string> }) {
  const deadlines = matters.flatMap(matter => matter.deadlines.map((deadline, index) => ({ matter, deadline, index, result: deadlineResult(matter, deadline.id) })))
    .sort((a, b) => (a.result.status === 'computed' ? a.result.dueDate : '9999').localeCompare(b.result.status === 'computed' ? b.result.dueDate : '9999'));
  return <div className="radar-view"><header className="view-heading"><div><h2>Deadline Radar</h2><p>Every matter. Every next move.</p></div><p>{deadlines.length} deadlines across {matters.length} matters</p></header>
    <div className="radar-bands">{bands.map((band, bandIndex) => {
      const items = deadlines.filter(({ result }) => {
        if (result.status === 'uncomputable') return bandIndex === 4;
        const days = daysFromToday(result.dueDate);
        return (days < 0 ? 0 : days <= 7 ? 1 : days <= 30 ? 2 : 3) === bandIndex;
      });
      return <section key={band} aria-label={band} data-band={band} className={`radar-band${items.length ? '' : ' radar-band-empty'}`}><header><h3>{band} <span className="band-count">{items.length}</span></h3><p>{descriptions[bandIndex]}</p></header>{items.map(({ matter, deadline, index }) => <DeadlineCard key={`${matter.id}-${deadline.id}`} matter={matter} index={index} onVerify={onVerify} arrived={arrivals.has(matter.id)} showMatter />)}{!items.length && <p className="empty-band">Nothing due.</p>}</section>;
    })}</div><FeatureSlot slot="radar.overlay" matters={matters} activeMatter={activeMatter} />
  </div>;
}
