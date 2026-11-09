import { useEffect, useState } from 'react';
import { registerFeature, type FeatureProps } from '../registry';
import { dateLabel } from '../../views/shared';
import './style.css';

type Explanation = { step: string; why: string; deadline: { label: string; dueDate: string } | null };
type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; explanation: Explanation } | { kind: 'needs_key' | 'error'; message: string };

function WhatHappensNext({ activeMatter }: FeatureProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  useEffect(() => setState({ kind: 'idle' }), [activeMatter?.id]);
  if (!activeMatter) return null;

  async function explain() {
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/features/what-happens-next/explain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matter: activeMatter }),
      });
      const body = await res.json();
      if (res.ok) setState({ kind: 'done', explanation: body });
      else setState({ kind: body.error === 'needs_key' ? 'needs_key' : 'error', message: body.message ?? 'Something went wrong.' });
    } catch {
      setState({ kind: 'error', message: 'We could not get an explanation right now. Please try again.' });
    }
  }

  return <div className="workspace-section what-happens-next">
    <h3>What happens next</h3>
    {state.kind === 'done' ? <dl>
      <dt>Next step</dt><dd>{state.explanation.step}</dd>
      <dt>When</dt><dd>{state.explanation.deadline ? `${state.explanation.deadline.label}: ${dateLabel(state.explanation.deadline.dueDate)}` : 'No date set yet'}</dd>
      <dt>Why it matters</dt><dd>{state.explanation.why}</dd>
    </dl> : <p>Get a plain-English explanation of your next step and why it matters.</p>}
    {state.kind === 'needs_key' && <p role="status">{state.message} A configured app key unlocks this explanation.</p>}
    {state.kind === 'error' && <p role="status">{state.message}</p>}
    <button className="primary-button" disabled={state.kind === 'loading'} onClick={explain}>
      {state.kind === 'loading' ? 'Explaining…' : state.kind === 'done' ? 'Explain again' : 'Explain my next step'}
    </button>
  </div>;
}

registerFeature({ id: 'what-happens-next', title: 'What happens next', slot: 'portal.section', component: WhatHappensNext });
