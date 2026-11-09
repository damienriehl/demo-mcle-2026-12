import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { registerFeature, type FeatureProps } from '../registry';
import {
  CAUTION_LINE, NEEDS_KEY_LINE, QUOTE_OMITTED, chooseEvent, deadlineRows, deterministicNarrative, glanceLine, localToday, packetText,
  type Narrative,
} from './packet';
import './hearing-packet.css';

type Build = { state: 'loading' | 'live' | 'no-key' | 'error'; narrative?: Narrative; message?: string };

const SECTION_TITLES: Record<string, string> = {
  happened: 'What has happened', issues: 'What the court will decide', ourPosition: 'Our position and best arguments',
  theirArguments: "Other side's likely arguments", excerpts: 'Key documents and excerpts', risks: 'Risks and open questions', checklist: 'Prep checklist',
};

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="hp-section" aria-label={title} data-section={n}>
      <h3><span className="hp-num">{n}.</span> {title}</h3>
      {children}
    </section>
  );
}

function Bullets({ items, empty }: { items?: string[]; empty: string }) {
  return items?.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="hp-muted">{empty}</p>;
}

function HearingPacket({ activeMatter }: FeatureProps) {
  const today = localToday();
  const [eventKey, setEventKey] = useState<string>();
  const [build, setBuild] = useState<Build>({ state: 'loading' });
  const [copyStatus, setCopyStatus] = useState<string>();
  const matterId = activeMatter?.id;
  const choice = useMemo(() => (activeMatter ? chooseEvent(activeMatter, today, eventKey) : undefined), [activeMatter, today, eventKey]);
  const selectedKey = choice?.event?.key;

  useEffect(() => { setEventKey(undefined); setCopyStatus(undefined); }, [matterId]);

  useEffect(() => {
    if (!matterId) return;
    let cancelled = false;
    setBuild({ state: 'loading' });
    (async () => {
      try {
        const response = await fetch('/api/features/hearing-packet/analyze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId, eventKey: selectedKey, today }),
        });
        const json = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && json.narrative) setBuild({ state: 'live', narrative: json.narrative as Narrative });
        else if (json.error === 'needs_key') setBuild({ state: 'no-key' });
        else setBuild({ state: 'error', message: json.message ?? 'The packet could not be built. The dates and deadlines below come from the matter record.' });
      } catch {
        if (!cancelled) setBuild({ state: 'error', message: 'The packet service is not responding. Check that the app server is running, then try again.' });
      }
    })();
    return () => { cancelled = true; };
  }, [matterId, selectedKey, today]);

  if (!activeMatter || !choice) return <section className="hearing-packet"><p>Choose a matter to build its hearing packet.</p></section>;

  const live = build.state === 'live';
  const narrative: Narrative = live && build.narrative ? build.narrative : deterministicNarrative(activeMatter, choice.event);
  const rows = deadlineRows(activeMatter, choice.event?.date);
  const glance = glanceLine(activeMatter, choice, today);

  async function copy() {
    try {
      await navigator.clipboard.writeText(packetText({ matter: activeMatter!, choice: choice!, today, narrative, live }));
      setCopyStatus('Packet copied as text.');
    } catch {
      setCopyStatus('Copy did not work in this browser. Use Print packet instead.');
    }
  }

  return (
    <section className="hearing-packet hearing-packet-print" aria-label="Hearing packet">
      <div className="hp-controls hp-noprint">
        <label>Hearing or event
          <select value={selectedKey ?? ''} onChange={event => setEventKey(event.target.value)}>
            {choice.events.map(item => (
              <option key={item.key} value={item.key}>{item.date} — {item.label}{item.court ? ' (court)' : ''}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => window.print()}>Print packet</button>
        <button type="button" onClick={() => void copy()}>Copy as text</button>
      </div>
      {copyStatus ? <p role="status" className="hp-noprint">{copyStatus}</p> : null}
      <header className="hp-title">
        <h2>Hearing packet</h2>
        <p>{activeMatter.title}</p>
      </header>
      <p className="hp-caution"><strong>Caution:</strong> {CAUTION_LINE}</p>
      {build.state === 'loading' ? <p role="status" className="hp-status">Building packet…</p> : null}
      {build.state === 'no-key' ? <p role="status" className="hp-status"><strong>Note:</strong> {NEEDS_KEY_LINE} Dates, timeline, deadlines, and checklist below come from the matter record.</p> : null}
      {build.state === 'error' ? <p role="alert" className="hp-status"><strong>Problem:</strong> {build.message}</p> : null}
      {live && narrative.omitted.length ? <p className="hp-status">Left out because the draft came back unusable: {narrative.omitted.map(name => SECTION_TITLES[name] ?? name).join(', ')}.</p> : null}

      <Section n={1} title="Hearing at a glance">
        <dl className="hp-glance">
          {glance.map(line => {
            const at = line.indexOf(': ');
            return at > 0 && !line.startsWith('No court') ? <div key={line}><dt>{line.slice(0, at)}</dt><dd>{line.slice(at + 2)}</dd></div> : <p key={line} className="hp-fallback"><strong>Note:</strong> {line}</p>;
          })}
        </dl>
        <p className="hp-muted">Dates and day counts come from the matter record and the deadline engine.</p>
      </Section>

      <Section n={2} title="What has happened">
        {narrative.happened?.length ? (
          <ol className="hp-timeline">{narrative.happened.map((item, i) => <li key={i}>{item.date ? <time>{item.date}</time> : null} <span>{item.text}</span></li>)}</ol>
        ) : <p className="hp-muted">No timeline on file.</p>}
      </Section>

      {live ? (
        <>
          <Section n={3} title="What the court will decide"><Bullets items={narrative.issues} empty="Not available in this draft." /></Section>
          <Section n={4} title="Our position and best arguments"><Bullets items={narrative.ourPosition} empty="Not available in this draft." /></Section>
          <Section n={5} title="Other side's likely arguments, and our responses">
            {narrative.theirArguments?.length ? (
              <ul className="hp-args">{narrative.theirArguments.map((item, i) => <li key={i}><p><strong>They argue:</strong> {item.argument}</p><p><strong>We respond:</strong> {item.response}</p></li>)}</ul>
            ) : <p className="hp-muted">Not available in this draft.</p>}
          </Section>
          <Section n={6} title="Key documents and excerpts">
            {narrative.excerpts?.length ? (
              <ul className="hp-excerpts">{narrative.excerpts.map((item, i) => (
                <li key={i} data-verified={item.verified}>
                  <strong>{item.documentTitle}</strong>
                  {item.quote ? <blockquote>“{item.quote}”<span className="hp-verified"> Verified: quoted word for word from the document.</span></blockquote> : <p className="hp-omitted">{QUOTE_OMITTED}</p>}
                  {item.why ? <p>{item.why}</p> : null}
                </li>
              ))}</ul>
            ) : <p className="hp-muted">No excerpts in this draft.</p>}
          </Section>
        </>
      ) : null}

      <Section n={live ? 7 : 3} title="Deadlines around the hearing">
        {rows.length ? (
          <table className="hp-deadlines">
            <thead><tr><th scope="col">Due</th><th scope="col">Deadline</th><th scope="col">Relative to event</th></tr></thead>
            <tbody>{rows.map(row => (
              <tr key={row.id}><td>{row.dueDate ?? '—'}</td><td>{row.label}{row.note ? <span className="hp-muted"> ({row.note})</span> : null}</td><td>{row.relative ?? '—'}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="hp-muted">No deadlines on file.</p>}
      </Section>

      {live ? <Section n={8} title="Risks and open questions"><Bullets items={narrative.risks} empty="Not available in this draft." /></Section> : null}

      <Section n={live ? 9 : 4} title="Prep checklist">
        <ul className="hp-checklist">{(narrative.checklist?.length ? narrative.checklist : deterministicNarrative(activeMatter, choice.event).checklist!).map((item, i) => (
          <li key={i}><label><input type="checkbox" /> {item}</label></li>
        ))}</ul>
      </Section>
    </section>
  );
}

registerFeature({ id: 'hearing-packet', title: 'Hearing packet', slot: 'cockpit.tab', component: HearingPacket });
