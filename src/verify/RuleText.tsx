import { useState } from 'react';
import { getRule } from '../../data/rules';
import type { Step } from '../engine';
import { getRuleExcerpts } from './ruleExcerpts';

export function RuleText({ citation, orderQuote }: { citation: Step['citation']; orderQuote?: string | number }) {
  const [full, setFull] = useState(false);
  if (citation.ruleId === 'order') return <section data-verify-section="rule" id="verify-rule" tabIndex={-1} className="verify-rule">
    <h3>Scheduling order, {citation.subdivision}</h3>
    <blockquote>{orderQuote}</blockquote>
    <p className="verify-rule-caption">Quoted from the uploaded order; the server checked this text against page {citation.subdivision?.replace(/^p\. /, '')}</p>
  </section>;
  const rule = getRule(citation.ruleId);
  if (!rule) return <section data-verify-section="rule" id="verify-rule" tabIndex={-1} className="verify-rule"><h3>Source text</h3><p data-no-source>No source on file. Verify independently.</p><p>{citation.ruleId}{citation.subdivision}</p></section>;
  const subdivisions = getRuleExcerpts(rule, citation.subdivision);
  const excerpt = subdivisions.length > 0;
  return <section data-verify-section="rule" id="verify-rule" tabIndex={-1} className="verify-rule">
    <div className="verify-section-title"><h3>{rule.citation} — {rule.heading}</h3>{excerpt && <button type="button" onClick={() => setFull(value => !value)}>{full ? 'Show cited subdivision' : 'Show full rule'}</button>}</div>
    <p className="verify-rule-caption">Verbatim library text{!full && excerpt ? ` · ${subdivisions.map(part => part.label).join(', ')}` : ' · full rule'}</p>
    <div data-rule-scroll tabIndex={0} role="region" aria-label="Verbatim rule text" className="verify-rule-scroll">
      {full || !excerpt ? <div data-rule-text>{rule.text}</div> : subdivisions.map(part => <div key={part.label} data-rule-excerpt>{part.text}</div>)}
    </div>
    <footer><div><a tabIndex={0} href={rule.sourceUrl} target="_blank" rel="noreferrer">Official source</a>{rule.navigationUrl && <a tabIndex={0} href={rule.navigationUrl} target="_blank" rel="noreferrer">Navigation page</a>}</div><p>Source version: {rule.sourceVersion} · Retrieved {rule.retrievedAt}</p></footer>
  </section>;
}
