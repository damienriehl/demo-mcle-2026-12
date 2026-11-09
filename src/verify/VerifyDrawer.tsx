import { courtDateSource } from '../features/scheduling-order/source';
import { useState } from 'react';
import { Overlay } from '../components/Overlay';
import type { MatterWithDeadlines } from '../data/schema';
import { computeDeadline, deadlineCatalog, isCourtOrderDate, type DeadlineInput, type Step } from '../engine';
import { SourceLabel, sourceFor } from '../intake/SourceLabel';
import { dateLabel, type Selection } from '../views/shared';
import { AssumptionToggles, assumptionLabel } from './AssumptionToggles';
import { factContext, type FactContext } from './context';
import { MathSteps } from './MathSteps';
import { RuleText } from './RuleText';
import './verify.css';

const NO_REASONING = 'No AI reasoning chain on file.';

export type VerifySelection = Selection & { context?: FactContext };

function DeadlineVerification({ selection, matter }: { selection: VerifySelection; matter?: MatterWithDeadlines }) {
  const index = matter?.deadlines.findIndex(deadline => deadline.id === selection.deadlineId) ?? -1;
  const deadline = matter?.deadlines[index];
  const orderDate = deadline && isCourtOrderDate(deadline);
  const upstreamId = deadline && 'fromDeadline' in deadline.trigger ? deadline.trigger.fromDeadline : undefined;
  const upstream = matter?.deadlines.find(candidate => candidate.id === upstreamId);
  const superseding = matter?.deadlines.find(candidate => candidate.id === deadline?.supersededBy);
  const governingResult = superseding ? matter?.computedDeadlines[superseding.id] : undefined;
  const catalog = deadlineCatalog().find(rule => rule.id === deadline?.deadlineRuleId);
  const [assumptions, setAssumptions] = useState<DeadlineInput['assumptions']>(deadline?.assumptions ?? {});
  const [previousSteps, setPreviousSteps] = useState<Step[]>();
  const [chosenCitation, setChosenCitation] = useState<Step['citation']>();
  const storedResult = deadline ? matter?.computedDeadlines[deadline.id] : selection.result;
  const triggerDate = deadline && ('date' in deadline.trigger ? deadline.trigger.date : storedResult?.steps[0]?.date);
  const result = deadline && triggerDate
    ? computeDeadline({ ...deadline, trigger: { event: deadline.trigger.event, date: triggerDate }, assumptions }) : storedResult;
  const citation = chosenCitation ?? result?.steps?.[0]?.citation;
  const exceptionSentence = superseding ? catalog?.orderException : undefined;
  function changeAssumption(key: string, value: string | boolean) {
    setPreviousSteps(result?.steps);
    setAssumptions(current => ({ ...current, [key]: value }));
    setChosenCitation(undefined);
  }
  const ruleContext = matter ? factContext(matter, `deadlines.${index}.deadlineRuleId`) : undefined;
  const triggerContext = matter ? factContext(matter, `deadlines.${index}.trigger.date`) : undefined;
  const inputKey = result?.status === 'computed' ? result.inputKey : undefined;
  const inputSource = matter && inputKey ? sourceFor(matter.provenance, `deadlines.${index}.inputs.${inputKey}`) : undefined;
  const steps = inputKey && !orderDate && inputSource !== 'stated' ? result!.steps.map((step, index) => index === 1
    ? { ...step, label: `Use the date entered for ${deadline?.inputs?.section ?? 'the notice close'}; no inferred calendar roll.` }
    : step) : result?.steps ?? [];
  return <>
    <section data-verify-section="due" className="verify-due" aria-live="polite" aria-atomic="true"><p>{selection.label}</p>
      {result?.status === 'computed' ? <><strong data-due-date>{dateLabel(result.dueDate)}</strong>{orderDate
        ? <span>{courtDateSource(deadline)}</span> : inputKey
        ? <><span>From the matter</span><SourceLabel source={inputSource} /></> : <span>Code computed</span>}</>
        : <><strong data-no-source>No source on file. Verify independently.</strong><p>{result?.reason}</p></>}
    </section>
    <AssumptionToggles controls={catalog?.assumptions ?? []} values={assumptions} onChange={changeAssumption} />
    <MathSteps steps={steps} previousSteps={previousSteps} onCitation={next => {
      setChosenCitation(next);
      requestAnimationFrame(() => document.getElementById('verify-rule')?.focus({ preventScroll: true }));
    }} />
    <section data-verify-section="reasoning" className="verify-reasoning"><h3>Reasoning chain</h3><ol>
      {catalog && <li><span>{catalog.description}</span><SourceLabel source={ruleContext?.provenance?.source} /></li>}
      {upstream ? <li><span>Counts from {upstream.label} · {triggerDate ? dateLabel(triggerDate) : 'No computed date'}</span>
        <span className="source-label">{isCourtOrderDate(upstream) ? courtDateSource(upstream) : 'Code computed'}</span></li>
        : deadline && <li><span>Trigger: {deadline.trigger.event} · {triggerDate ? dateLabel(triggerDate) : 'No computed date'}.</span><SourceLabel source={triggerContext?.provenance?.source} /></li>}
      {superseding && <li><span>{superseding.inputs?.movedFrom ? 'Governing date' : 'The order sets this date'}: {superseding.label}, {governingResult?.status === 'computed' ? dateLabel(governingResult.dueDate) : 'No computed date'}{superseding.inputs?.movedFrom
        ? <> · {courtDateSource(superseding)}</> : <> (p. {superseding.inputs?.page})</>}</span>
        {exceptionSentence && <blockquote>{exceptionSentence}</blockquote>}</li>}
      {catalog?.assumptions.map(control => <li key={control.key}><span>{control.label}: {assumptionLabel(assumptions[control.key] ?? control.default)}.</span><span className="source-label">Local preview</span></li>)}
      <li><span>{matter?.reasoning || NO_REASONING}</span><SourceLabel source={matter ? factContext(matter, 'reasoning').provenance?.source : undefined} /></li>
    </ol></section>
    {citation && <RuleText key={`${citation.ruleId}:${citation.subdivision}`} citation={citation} orderQuote={deadline?.inputs?.quote} />}
  </>;
}

export function VerifyDrawer({ selection, matter, onClose, onOpenMatter }: { selection: VerifySelection; matter?: MatterWithDeadlines; onClose: () => void; onOpenMatter?: () => void }) {
  const context = selection.context ?? (matter ? factContext(matter, selection.label) : undefined);
  return <Overlay title="Trust but Verify" closeLabel="Close verification" onClose={onClose}>
    <div className={`verify-panel${selection.deadlineId ? '' : ' verify-fact'}`}>
      {selection.deadlineId ? <DeadlineVerification key={`${selection.matterId}:${selection.deadlineId}`} selection={selection} matter={matter} />
        : <><section className="verify-fact-source"><p>{selection.label}</p><h3>{selection.value}</h3><SourceLabel source={context?.provenance?.source} /><p>This fact has no computed due date.</p></section>
          <section className="verify-evidence"><h3>Evidence</h3>{context?.provenance?.evidence ? <blockquote>{context.provenance.evidence}</blockquote> : <p>No evidence quote on file.</p>}</section>
          <section data-verify-section="reasoning" className="verify-reasoning"><h3>Reasoning chain</h3><p>{context?.reasoning || NO_REASONING}</p></section></>}
    </div>
    {onOpenMatter && <button className="primary-button verify-open-matter" onClick={onOpenMatter}>Open matter</button>}
  </Overlay>;
}
