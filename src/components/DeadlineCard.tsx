import type { MatterWithDeadlines } from '../data/schema';
import { SourceField } from '../intake/SourceLabel';
import { countdown, dateLabel, daysFromToday, deadlineResult, type Selection } from '../views/shared';

export function DeadlineCard({ matter, index, onVerify, focused = false, showMatter = false, arrived = false }: { matter: MatterWithDeadlines; index: number; onVerify: (selection: Selection) => void; focused?: boolean; showMatter?: boolean; arrived?: boolean }) {
  const deadline = matter.deadlines[index];
  const result = deadlineResult(matter, deadline.id);
  return <button className={`deadline-card${focused ? ' focused-deadline' : ''}${arrived ? ' matter-arrival' : ''}`} data-deadline-card data-deadline-id={deadline.id}
    ref={element => { if (focused && element && document.activeElement !== element) element.focus(); }}
    onClick={() => onVerify({ matterId: matter.id, deadlineId: deadline.id, label: deadline.label, result })}>
    {showMatter && <span className="deadline-matter"><SourceField path="title" provenance={matter.provenance}>{matter.title}</SourceField></span>}
    <span className={`practice-mark area-${matter.practiceArea}`}>{matter.practiceArea}</span>
    <SourceField path={`deadlines.${index}.label`} provenance={matter.provenance}><strong>{deadline.label}</strong></SourceField>
    {result.status === 'computed' ? <><span className="due-date">{dateLabel(result.dueDate)}</span><span className="countdown">{countdown(daysFromToday(result.dueDate))}<span className="source-label">Code computed</span></span></>
      : <><span className="verification-marker" data-verification-marker>△ Needs verification</span><span>{result.reason}</span></>}
    <span className="verify-link">Trust but Verify</span>
  </button>;
}
