import { useState } from 'react';
import { isPublicRecord } from '../data/schema';
import { DeadlineCard } from '../components/DeadlineCard';
import { FeatureSlot } from '../components/FeatureSlot';
import { useFeatures } from '../features/registry';
import { SourceField } from '../intake/SourceLabel';
import { dateLabel, type ViewProps } from './shared';

export function Cockpit({ matters, activeMatter: matter, onVerify, focusedDeadline }: ViewProps & { focusedDeadline?: string }) {
  const [tab, setTab] = useState('overview');
  const features = useFeatures('cockpit.tab');
  if (!matter) return <div className="empty-state"><h2>Your next matter starts here.</h2><p>Use Ramble or Surprise Me to bring a synthetic matter into the workspace.</p></div>;
  const field = (path: string, value: string) => <SourceField path={path} provenance={matter.provenance} onVerify={() => onVerify({ matterId: matter.id, label: path, value })}>{value}</SourceField>;
  const selected = features.find(feature => feature.id === tab);
  return <div className="cockpit-view">
    <header className="matter-heading"><p className={`practice-mark area-${matter.practiceArea}`}>{field('practiceArea', matter.practiceArea)}</p><h2 aria-label={matter.title}>{field('title', matter.title)}</h2>{isPublicRecord(matter) && <p className="public-record-label">Public record · {matter.publicRecord.caseNumber} · {matter.publicRecord.court}</p>}<div className="matter-meta">{field('client.name', matter.client.name)}{field('forum', matter.forum)}</div></header>
    <div role="tablist" aria-label="Matter sections" className="matter-tabs">
      <button role="tab" aria-selected={!selected} onClick={() => setTab('overview')}>Overview</button>
      {features.map(feature => <button role="tab" key={feature.id} aria-selected={tab === feature.id} onClick={() => setTab(feature.id)}>{feature.title}</button>)}
    </div>
    {selected ? <section role="tabpanel" aria-label={selected.title}><selected.component matters={matters} activeMatter={matter} /></section>
      : <div role="tabpanel" aria-label="Overview" className="cockpit-columns">
        <div>
          <section className="workspace-section"><h3>Parties</h3><div className="party-list">{matter.parties.map((party, i) => <div className="party" key={i}>{field(`parties.${i}.name`, party.name)}{field(`parties.${i}.role`, party.role)}</div>)}</div></section>
          <section className="workspace-section"><h3>Timeline</h3><ol className="timeline">{matter.timeline.map((event, i) => <li key={event.id}><div>{field(`timeline.${i}.date`, dateLabel(event.date))}</div>{field(`timeline.${i}.event`, event.event)}</li>)}</ol></section>
          <section className="workspace-section"><h3>Documents</h3>{matter.documents.map((document, i) => <details className="document" key={document.id}><summary>{field(`documents.${i}.title`, document.title)}</summary>{field(`documents.${i}.kind`, document.kind)}{field(`documents.${i}.body`, document.body)}<p>{document.shared ? 'Shared with client' : 'Internal document'}</p></details>)}</section>
        </div>
        <aside className="deadline-column"><section className="workspace-section"><h3>Deadlines</h3>{matter.deadlines.map((deadline, index) => <DeadlineCard key={deadline.id} matter={matter} index={index} onVerify={onVerify} focused={focusedDeadline === deadline.id} />)}{!matter.deadlines.length && <p>No deadlines recorded.</p>}</section><FeatureSlot slot="cockpit.sidebar" matters={matters} activeMatter={matter} /></aside>
      </div>}
  </div>;
}
