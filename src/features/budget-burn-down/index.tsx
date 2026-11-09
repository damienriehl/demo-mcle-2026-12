import { useState, type CSSProperties } from 'react';
import { registerFeature, type FeatureProps } from '../registry';
import { burnDown } from './burnDown';

const dollars = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const label: CSSProperties = { display: 'grid', gap: '.35rem', fontSize: 'var(--mc-text-min)', fontWeight: 'var(--mc-weight-label)' as CSSProperties['fontWeight'] };
const input: CSSProperties = { fontSize: 'var(--mc-text-body)', fontFamily: 'inherit', color: 'var(--mc-ink)', background: 'var(--mc-surface)', border: 'var(--mc-border-width) solid var(--mc-border)', borderRadius: 'var(--mc-radius)', padding: '.4rem .6rem', width: '14rem' };

function BudgetBurnDown({ activeMatter }: FeatureProps) {
  const [figures, setFigures] = useState<Record<string, { budget: string; billed: string }>>({});
  if (!activeMatter) return <p>Select a matter to track its budget.</p>;
  const current = figures[activeMatter.id] ?? { budget: '', billed: '' };
  const update = (field: 'budget' | 'billed', value: string) => setFigures({ ...figures, [activeMatter.id]: { ...current, [field]: value } });
  const budget = Number(current.budget);
  const billed = Number(current.billed);
  const ready = current.budget !== '' && current.billed !== '' && budget > 0 && billed >= 0;
  const result = ready ? burnDown(budget, billed) : undefined;
  const summary = result && (result.overBy
    ? `Over budget by ${dollars(result.overBy)}: ${dollars(result.billed)} billed against ${dollars(result.budget)} (${result.percentUsed}% used).`
    : `${dollars(result.billed)} billed of ${dollars(result.budget)}: ${result.percentUsed}% used, ${dollars(result.remaining)} remaining.`);

  return (
    <div className="workspace-section" style={{ display: 'grid', gap: 'var(--mc-section-space)', maxWidth: '60rem' }}>
      <h3>Budget burn-down: {activeMatter.title}</h3>
      <p style={{ color: 'var(--mc-ink-muted)', fontSize: 'var(--mc-text-min)' }}>Enter {activeMatter.client.name}'s budget and the fees billed so far. Figures stay in this browser tab; the matter record has no billing fields.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mc-space)' }}>
        <label style={label}>Client budget (USD)<input style={input} type="number" min="0" inputMode="numeric" value={current.budget} onChange={event => update('budget', event.target.value)} /></label>
        <label style={label}>Fees billed so far (USD)<input style={input} type="number" min="0" inputMode="numeric" value={current.billed} onChange={event => update('billed', event.target.value)} /></label>
      </div>
      {result ? (
        <figure style={{ margin: 0, display: 'grid', gap: '.5rem' }}>
          <div role="img" aria-label={summary} style={{ position: 'relative', height: '3rem', background: 'var(--mc-chip)', border: 'var(--mc-border-width) solid var(--mc-ink)', borderRadius: 'var(--mc-radius)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(result.percentUsed, 100)}%`, height: '100%', background: result.overBy ? 'var(--mc-warning)' : 'var(--mc-accent)', backgroundImage: result.overBy ? 'repeating-linear-gradient(45deg, transparent 0 10px, var(--mc-bg) 10px 14px)' : undefined }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--mc-text-min)', color: 'var(--mc-ink-muted)' }}><span>$0</span><span>Budget {dollars(result.budget)}</span></div>
          <figcaption role="status" style={{ fontSize: 'var(--mc-text-lg)', fontWeight: 'var(--mc-weight-label)' as CSSProperties['fontWeight'], color: result.overBy ? 'var(--mc-warning)' : 'var(--mc-ink)' }}>{result.overBy ? 'OVER BUDGET. ' : ''}{summary}</figcaption>
        </figure>
      ) : <p role="status">Enter both figures to draw the chart.</p>}
    </div>
  );
}

registerFeature({ id: 'budget-burn-down', title: 'Budget Burn-Down', slot: 'cockpit.tab', component: BudgetBurnDown });
