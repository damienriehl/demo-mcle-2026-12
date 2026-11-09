import type { Assessment, Change, FolioTag } from '../../../server/drafts/types';

export const verdicts = { harms: 'Harms ▼', neutral: 'Neutral ●', helps: 'Helps ▲' };
export function TagChip({ tag, onSelect }: { tag: FolioTag; onSelect: () => void }) {
  return <button type="button" className="dc-chip" onClick={onSelect}>{tag.label} · {tag.branch} · {tag.draft}</button>;
}
export function AdviceMemo({ assessments, changes, onSelect }: { assessments: Assessment[]; changes: Change[]; onSelect: (id: string) => void }) {
  if (!assessments.length) return null;
  return <section role="region" aria-label="Advice memo" className="dc-memo"><details>
    <summary>Advice memo · {Object.entries(verdicts).map(([verdict, label]) => `${label}: ${assessments.filter(item => item.verdict === verdict).length}`).join(' · ')}</summary>
    {Object.entries(verdicts).map(([verdict, label]) => <div key={verdict}><h3>{label}</h3><ul>
      {assessments.filter(item => item.verdict === verdict).map(item => <li key={item.changeId}><a href={`#${changes.find(change => change.changeId === item.changeId)?.anchorId}`} onClick={event => { event.preventDefault(); onSelect(item.changeId); }}>{item.reason}</a>{!item.verified && ' · Unverified quote — not applicable'}</li>)}
    </ul></div>)}
  </details></section>;
}
export function AdviceCard({ change, assessment, tags, selected, applied, onSelect, onToggle, onTag }: {
  change: Change; assessment?: Assessment; tags: FolioTag[]; selected: boolean; applied: boolean; onSelect: () => void; onToggle: () => void; onTag: (tag: FolioTag) => void;
}) {
  return <article data-assessment={change.changeId} className={`dc-card${selected ? ' dc-selected' : ''}`}>
    <button type="button" className="dc-card-heading" aria-expanded={selected} onClick={onSelect}>
      <strong>{assessment ? verdicts[assessment.verdict] : 'Pending assessment'}</strong>
      <span className={selected ? '' : 'dc-one-line'}>{assessment?.reason ?? `${change.kind} · Waiting for advice.`}</span>
    </button>
    {assessment && !assessment.verified && <p className="dc-unverified">Unverified quote — not applicable</p>}
    {selected && <div className="dc-card-body">
      <p>Change: {change.kind}</p>
      {assessment && <><blockquote>{assessment.quote}</blockquote><p>Confidence: {assessment.confidence}</p></>}
      <div className="dc-chips">{tags.map((tag, index) => <TagChip key={index} tag={tag} onSelect={() => onTag(tag)} />)}</div>
      {assessment?.counter && <><h3>Counter-language</h3><p>Find: <q>{assessment.counter.find}</q></p><p>Replace with: <q>{assessment.counter.replace}</q></p><p>{assessment.counter.effect}</p>
        {assessment.verified && assessment.counter.span && <div className="dc-controls">{applied && <strong>Applied</strong>}<button type="button" onClick={onToggle}>{applied ? 'Undo' : 'Apply'}</button></div>}
      </>}
    </div>}
  </article>;
}
