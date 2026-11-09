import { useState, type FormEvent } from 'react';
import { registerFeature, type FeatureProps } from '../registry';
import { askTheRules, pinpoint, type RuleHit } from './search';
import './ask-the-rules.css';

function AskTheRules({ activeMatter }: FeatureProps) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<{ question: string; hits: RuleHit[] } | undefined>();
  const forum = activeMatter?.forum;
  const ask = (event: FormEvent) => {
    event.preventDefault();
    setAsked({ question, hits: askTheRules(question, forum) });
  };
  return <section className="ask-rules" aria-label="Ask the Rules">
    <h2>Ask the Rules</h2>
    <p>Ask a procedure question. The three closest rules from the bundled library come back in their own words. Rules from this matter’s court system rank first.</p>
    <form onSubmit={ask}>
      <label>Your procedure question
        <input value={question} onChange={event => setQuestion(event.target.value)} placeholder="How many days do I have to answer the complaint?" />
      </label>
      <button type="submit" disabled={!question.trim()}>Ask</button>
    </form>
    {asked && <p role="status">{asked.hits.length > 0
      ? `${asked.hits.length} rules for “${asked.question}”. Word-match search: confirm each rule applies before relying on it.`
      : `No rule in the library matches “${asked.question}”. Try other words.`}</p>}
    {asked && asked.hits.length > 0 && <ol aria-label="Matching rules">
      {asked.hits.map(hit => <li key={`${hit.ruleId}${hit.label}`}>
        <h3>{pinpoint(hit)} — {hit.heading}</h3>
        <p className="ask-rules-caption">Verbatim library text</p>
        <blockquote tabIndex={0}>{hit.quote}</blockquote>
        <a href={hit.sourceUrl} target="_blank" rel="noreferrer">Official source for {pinpoint(hit)}</a>
      </li>)}
    </ol>}
  </section>;
}

registerFeature({ id: 'ask-the-rules', title: 'Ask the Rules', slot: 'cockpit.tab', component: AskTheRules });
