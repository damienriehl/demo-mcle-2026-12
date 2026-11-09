import { useEffect, useState } from 'react';
import type { FolioTag } from '../../../server/drafts/types';
import type { MatterWithDeadlines } from '../../data/schema';
import { registerFeature, type FeatureProps } from '../registry';
import { AdviceMemo } from './advice';
import { chooseParty, downloadDraft, runAdvice, toggleApplied, useCompareState } from './compare-state';
import { DraftInputs } from './draft-inputs';
import { RedlineReview } from './redline';
import { TagPanel } from './tag-panel';
import './draft-compare.css';

function CompareDrafts({ matter }: { matter: MatterWithDeadlines }) {
  const state = useCompareState(matter.id);
  const [selected, setSelected] = useState<string>();
  const [selectedTag, setSelectedTag] = useState<FolioTag>();
  useEffect(() => { setSelected(undefined); setSelectedTag(undefined); }, [state.redline]);
  function selectChange(id: string) {
    setSelected(id);
    const anchor = document.getElementById(state.redline!.changes.find(change => change.changeId === id)!.anchorId);
    anchor?.focus({ preventScroll: true });
    anchor?.scrollIntoView({ block: 'nearest' });
  }
  const busy = state.stage !== 'idle';
  const progress = { idle: '', compare: 'Comparing drafts…', tagging: 'Tagging legal concepts…', parties: 'Detecting parties…', advice: `Assessing changes… ${state.assessments.length} of ${state.redline?.changes.length ?? 0}` };
  return <div className="draft-compare">
    <DraftInputs matter={matter} />
    {busy && <p role="status">{progress[state.stage]}</p>}
    {state.message && <p role="alert" className="dc-message">{state.message}</p>}
    {state.redline && <>
      <div className="dc-confirm">
        <fieldset><legend>Who do you represent?</legend><div className="dc-controls">{state.parties.map(party => <label key={party.name} className="dc-party">
          <input type="radio" name={`party-${matter.id}`} checked={state.party === party.name} onChange={() => chooseParty(matter.id, party.name)} />
          <span><strong>{party.name}</strong> · {party.role}{party.actorLabel && <> · FOLIO: {party.actorLabel}</>}</span>
        </label>)}</div></fieldset>
        <button type="button" className="primary-button" disabled={!state.party || busy || !state.redline.changes.length} onClick={() => void runAdvice(matter.id)}>Run advice</button>
      </div>
      {state.notice && <p className="dc-message">{state.notice}</p>}
      {state.redline.formattingNote && <p>{state.redline.formattingNote}</p>}
      <AdviceMemo assessments={state.assessments} changes={state.redline.changes} onSelect={selectChange} />
      <div className="dc-controls dc-downloads"><button type="button" onClick={() => void downloadDraft(matter.id, false)}>Download redline</button>
        <button type="button" disabled={!state.applied.length} aria-describedby={!state.applied.length ? 'dc-counter-reason' : undefined} onClick={() => void downloadDraft(matter.id, true)}>Download counter-draft</button>
        {!state.applied.length && <span id="dc-counter-reason">Apply at least one suggestion first.</span>}
      </div>
      {!state.redline.changes.length && <p>No differences found.</p>}
      <RedlineReview redline={state.redline} tags={state.tags?.tags ?? []} assessments={state.assessments} applied={state.applied} selected={selected} selectedTag={selectedTag} onSelect={selectChange} onToggle={id => toggleApplied(matter.id, id)} onTag={setSelectedTag} />
      {state.tags && <TagPanel event={state.tags} onSelect={setSelectedTag} />}
    </>}
  </div>;
}
function CompareDraftsTab({ activeMatter }: FeatureProps) {
  return activeMatter ? <CompareDrafts key={activeMatter.id} matter={activeMatter} /> : null;
}
registerFeature({ id: 'draft-compare', title: 'Compare drafts', slot: 'cockpit.tab', component: CompareDraftsTab });
