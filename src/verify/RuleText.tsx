import { useState } from 'react';
import { getRule } from '../../data/rules';
import type { Step } from '../engine';

export function RuleText({ citation }: { citation: Step['citation'] }) {
  const [full, setFull] = useState(false);
  const rule = getRule(citation.ruleId);
  if (!rule) return <section data-verify-section="rule" id="verify-rule" tabIndex={-1} className="verify-rule"><h3>Source text</h3><p data-no-source>No source on file. Verify independently.</p><p>{citation.ruleId}{citation.subdivision}</p></section>;
  const subdivision = rule.subdivisions.filter(part => citation.subdivision?.startsWith(part.label)).sort((a, b) => b.label.length - a.label.length)[0];
  return <section data-verify-section="rule" id="verify-rule" tabIndex={-1} className="verify-rule">
    <div className="verify-section-title"><h3>{rule.citation} — {rule.heading}</h3>{subdivision && <button type="button" onClick={() => setFull(value => !value)}>{full ? 'Show cited subdivision' : 'Show full rule'}</button>}</div>
    <p className="verify-rule-caption">Verbatim library text{!full && subdivision ? ` · ${subdivision.label} (contains ${citation.subdivision})` : ' · full rule'}</p>
    <div data-rule-scroll tabIndex={0} role="region" aria-label="Verbatim rule text" className="verify-rule-scroll">
      {full || !subdivision ? <div data-rule-text>{rule.text}</div> : <div data-rule-excerpt>{subdivision.text}</div>}
    </div>
    <footer><div><a tabIndex={0} href={rule.sourceUrl} target="_blank" rel="noreferrer">Official source</a>{rule.navigationUrl && <a tabIndex={0} href={rule.navigationUrl} target="_blank" rel="noreferrer">Navigation page</a>}</div><p>Source version: {rule.sourceVersion} · Retrieved {rule.retrievedAt}</p></footer>
  </section>;
}
