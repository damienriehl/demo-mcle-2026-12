import type { DeadlineInput, DeadlineRuleSummary } from '../engine';

export function assumptionLabel(value: string | number | boolean) {
  const labels: Record<string, string> = { personal: 'Personal service', waiver: 'Rule 4(d) waiver', electronic: 'Electronic', mail: 'Mail', true: 'Yes', false: 'No' };
  return labels[String(value)] ?? String(value);
}

export function AssumptionToggles({ controls, values, onChange }: {
  controls: DeadlineRuleSummary['assumptions']; values: DeadlineInput['assumptions'];
  onChange: (key: string, value: string | boolean) => void;
}) {
  return <section data-verify-section="assumptions" className="verify-assumptions">
    <div className="verify-section-title"><h3>Assumptions</h3><span>Local preview · changes are not saved</span></div>
    {controls.length ? controls.map(control => <div role="group" aria-label={control.label} className="verify-control" key={control.key}>
      <strong>{control.label}</strong><div className="verify-segments">{control.options.map(option => <button key={String(option)} type="button"
        aria-pressed={String(values[control.key] ?? control.default) === String(option)} onClick={() => onChange(control.key, option)}>{assumptionLabel(option)}</button>)}</div>
    </div>) : <p>No adjustable assumptions for this deadline.</p>}
  </section>;
}
