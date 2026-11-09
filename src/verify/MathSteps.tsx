import type { Step } from '../engine';
import { getRule } from '../../data/rules';
import { dateLabel } from '../views/shared';

function citationLabel(citation: Step['citation']) {
  const rule = getRule(citation.ruleId);
  return `${rule?.citation ?? citation.ruleId}${citation.subdivision ?? ''}`;
}

export function MathSteps({ steps, previousSteps, onCitation }: { steps: Step[]; previousSteps?: Step[]; onCitation: (citation: Step['citation']) => void }) {
  return <section data-verify-section="math" className="verify-math"><h3>Date math</h3>
    <ol aria-label="Date math">{steps.map((step, index) => {
      const changed = !!previousSteps && JSON.stringify(step) !== JSON.stringify(previousSteps[index]);
      return <li key={JSON.stringify(step)} data-changed={changed}>
        <span>{step.label}</span>{step.date && <time dateTime={step.date}>{dateLabel(step.date)}</time>}
        <a tabIndex={0} href="#verify-rule" onClick={event => { event.preventDefault(); onCitation(step.citation); }}>{citationLabel(step.citation)}</a>
      </li>;
    })}</ol>
  </section>;
}
