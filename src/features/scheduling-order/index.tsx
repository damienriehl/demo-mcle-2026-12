import { useEffect, useRef, useState } from 'react';
import { DeadlineCard } from '../../components/DeadlineCard';
import { toStoredMatter, type Matter, type MatterWithDeadlines } from '../../data/schema';
import { isCourtOrderDate } from '../../engine';
import { readSse } from '../../intake/stream';
import { VerifyDrawer } from '../../verify/VerifyDrawer';
import { dateLabel, type Selection } from '../../views/shared';
import { registerFeature, type FeatureProps } from '../registry';
import { buildCalendar } from './ics';
import { courtDateSource } from './source';
import { appendArrival, updateUpload, useUploadState, type Arrival } from './upload-state';
import { MoveDateInput } from './move-date-input';
import './scheduling-order.css';

type CourtDate = MatterWithDeadlines['deadlines'][number];
type OrderEvent = Arrival | { type: 'pages'; count: number }
  | { type: 'done'; matter: Matter; added: { courtDates: number; derived: number }; message?: string }
  | { type: 'needs_key' | 'error'; message: string };

async function extract(body: FormData | string, onEvent: (event: OrderEvent) => void) {
  const response = await fetch('/api/features/scheduling-order/extract', {
    method: 'POST', headers: { 'X-Matter-Cockpit-Upload': '1', ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) }, body,
  });
  if (!response.ok || !response.body) throw new Error('Scheduling order extraction could not finish.');
  await readSse(response, onEvent);
}

function courtRoot(deadline: CourtDate, byId: Map<string, CourtDate>): string | undefined {
  const seen = new Set<string>();
  let current: CourtDate | undefined = deadline;
  while (current && !seen.has(current.id)) {
    if (isCourtOrderDate(current)) return current.id;
    seen.add(current.id);
    current = 'fromDeadline' in current.trigger ? byId.get(current.trigger.fromDeadline) : undefined;
  }
}

function storedSnapshot(matter: Matter | MatterWithDeadlines): string {
  const stored = 'computedDeadlines' in matter ? toStoredMatter(matter) : matter;
  return JSON.stringify(stored, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}

function SchedulingOrder({ matter }: { matter: MatterWithDeadlines }) {
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const { running, awaitingSnapshot, message, arrivals } = useUploadState(matter.id);
  const busy = running || !!awaitingSnapshot;
  const setMessage = (message: string) => updateUpload(matter.id, { message });
  useEffect(() => {
    if (awaitingSnapshot && storedSnapshot(matter) === awaitingSnapshot) {
      updateUpload(matter.id, { awaitingSnapshot: undefined });
    }
  }, [matter, awaitingSnapshot]);
  const [selection, setSelection] = useState<Selection>();
  const [moving, setMoving] = useState<{ id: string; date: string }>();
  useEffect(() => {
    if (moving && matter.deadlines.some(deadline => deadline.id === moving.id && deadline.inputs?.date === moving.date)) setMoving(undefined);
  }, [matter.deadlines, moving]);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const previous = useRef(matter.computedDeadlines);
  const changeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(changeTimer.current), []);
  useEffect(() => {
    const moved = Object.entries(matter.computedDeadlines).flatMap(([id, result]) => {
      const before = previous.current[id];
      return before?.status === 'computed' && result.status === 'computed' && before.dueDate !== result.dueDate ? [id] : [];
    });
    previous.current = matter.computedDeadlines;
    if (!moved.length) return;
    setChanged(new Set(moved));
    window.clearTimeout(changeTimer.current);
    changeTimer.current = window.setTimeout(() => setChanged(new Set()), 5000);
  }, [matter.computedDeadlines]);

  async function upload(body: FormData | string) {
    if (busy || moving) return;
    updateUpload(matter.id, { running: true, arrivals: [], message: 'Reading the scheduling order…' });
    try {
      await extract(body, event => {
        if (event.type === 'date') appendArrival(matter.id, event);
        else if (event.type === 'pages') setMessage(`Reading ${event.count} pages — court dates appear as they arrive.`);
        else if (event.type === 'done') {
          updateUpload(matter.id, { awaitingSnapshot: storedSnapshot(event.matter) });
          setMessage(event.message ?? `Added ${event.added.courtDates} court dates and ${event.added.derived} rule-derived deadlines.`);
        }
        else setMessage(event.message);
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Scheduling order extraction could not finish.'); }
    finally { updateUpload(matter.id, { running: false }); }
  }
  function uploadFile(file?: File) {
    if (!file || busy || moving) return;
    const body = new FormData();
    body.set('matterId', matter.id);
    body.set('file', file);
    void upload(body);
  }
  async function move(deadline: CourtDate, date: string) {
    const old = String(deadline.inputs?.date);
    if (!date || date === old || busy || moving) return;
    const stored = toStoredMatter(matter);
    const index = matter.deadlines.indexOf(deadline);
    const original = String(deadline.inputs?.movedFrom ?? old);
    const inputs: NonNullable<CourtDate['inputs']> = { ...deadline.inputs, date };
    if (date === original) delete inputs.movedFrom;
    else inputs.movedFrom = original;
    const provenance = { ...stored.provenance,
      [`deadlines.${index}.inputs.date`]: { source: 'stated' as const, evidence: `Moved on screen from ${old}` },
      [`deadlines.${index}.trigger.date`]: { source: 'stated' as const, evidence: `Moved on screen from ${old}` },
    };
    if (inputs.movedFrom) provenance[`deadlines.${index}.inputs.movedFrom`] = {
      source: 'stated', evidence: `Original order date: ${original}`,
    };
    else delete provenance[`deadlines.${index}.inputs.movedFrom`];
    const timelineIndex = stored.timeline.findIndex(item => item.id === `${deadline.id}-event`);
    if (timelineIndex !== -1) provenance[`timeline.${timelineIndex}.date`] = { source: 'stated', evidence: `Moved on screen from ${old}` };
    const next = {
      ...stored,
      timeline: stored.timeline.map(item => item.id === `${deadline.id}-event` ? { ...item, date } : item),
      deadlines: stored.deadlines.map(item => item.id === deadline.id
        ? { ...item, inputs, trigger: { ...item.trigger, date } } : item),
      provenance,
    };
    setMoving({ id: deadline.id, date });
    try {
      const response = await fetch(`/api/matters/${encodeURIComponent(matter.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error('Could not move the court date.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not move the court date.');
      setMoving(undefined);
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([buildCalendar(matter)], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${matter.id}-schedule.ics`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  const byId = new Map(matter.deadlines.map(deadline => [deadline.id, deadline]));
  const grouped = new Map<string, { deadline: CourtDate; index: number }[]>();
  matter.deadlines.forEach((deadline, index) => {
    const root = courtRoot(deadline, byId);
    if (!root || root === deadline.id) return;
    const group = grouped.get(root) ?? [];
    group.push({ deadline, index });
    grouped.set(root, group);
  });
  const courtDates = matter.deadlines.filter(isCourtOrderDate)
    .sort((a, b) => String(a.inputs?.date).localeCompare(String(b.inputs?.date)));

  return <div className="scheduling-order">
    <section className="order-intake" aria-label="Upload scheduling order">
      <button className="order-drop" disabled={busy || !!moving} onClick={() => picker.current?.click()}
        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); uploadFile(event.dataTransfer.files[0]); }}>
        <strong>Drop a scheduling order</strong><span>PDF · or choose a file</span>
      </button>
      <input ref={picker} type="file" accept="application/pdf,.pdf" hidden aria-label="Scheduling order PDF" onChange={event => { uploadFile(event.target.files?.[0]); event.target.value = ''; }} />
      <details className="order-paste"><summary>Paste order text</summary>
        <form onSubmit={event => { event.preventDefault(); void upload(JSON.stringify({ matterId: matter.id, text })); }}>
          <label htmlFor="scheduling-order-text">Order text</label>
          <textarea id="scheduling-order-text" rows={6} value={text} onChange={event => setText(event.target.value)} />
          <button disabled={busy || !!moving || !text.trim()} type="submit">Extract dates</button>
        </form>
      </details>
      <p role="status">{message}</p>
      <ol className="order-arrivals" aria-label="Dates from extraction" aria-live="polite" aria-relevant="additions">
        {arrivals.map((arrival, index) => <li key={index} data-order-arrival className={`order-arrival${arrival.verified ? '' : ' order-warning'}`}>
          <strong>{arrival.event}</strong><time dateTime={arrival.date}>{dateLabel(arrival.date)}</time>
          <span>From the order, p. {arrival.page}</span>
          <blockquote>{arrival.quote}</blockquote>
          {!arrival.verified && <p><strong>⚠ Unverified quote — not added</strong><br />{arrival.reason}</p>}
        </li>)}
      </ol>
    </section>
    <section className="order-schedule" aria-label="Schedule">
      <header className="order-schedule-heading"><h3>Schedule</h3><button onClick={download} disabled={!courtDates.length}>Export to calendar</button></header>
      {!courtDates.length && <p>Upload an order to see court dates and the deadlines computed from them.</p>}
      {courtDates.map(court => {
        const index = matter.deadlines.indexOf(court);
        const evidence = matter.provenance[`deadlines.${index}.inputs.date`]?.evidence;
        return <section key={court.id} data-court-date={court.id} className="order-group" aria-label={court.label}>
          <header className="order-court-heading"><div><h3>{court.label}</h3><time dateTime={String(court.inputs?.date)}>{dateLabel(String(court.inputs?.date))}</time><p>{courtDateSource(court)}</p></div>
            <MoveDateInput date={String(court.inputs?.date)} disabled={busy || !!moving} onCommit={date => void move(court, date)} />
          </header>
          {evidence?.startsWith('Moved on screen from ') && <p className="order-move-note">{evidence} · original order quote below.</p>}
          <blockquote>{court.inputs?.quote}</blockquote>
          <div className="order-derived">
            {grouped.get(court.id)?.map(({ deadline, index: deadlineIndex }) => {
              const governing = deadline.supersededBy ? byId.get(deadline.supersededBy) : undefined;
              return <div key={deadline.id} className={`${governing ? 'order-superseded' : ''}${changed.has(deadline.id) ? ' order-changed' : ''}`}>
                {governing && <p>{governing.inputs?.movedFrom
                  ? <>Superseded · {courtDateSource(governing)}</>
                  : <>Superseded — the order sets this date (p. {governing.inputs?.page})</>}<br />Governing court date: {governing.label}</p>}
                {changed.has(deadline.id) && <p className="order-change-label">Date changed</p>}
                <DeadlineCard matter={matter} index={deadlineIndex} onVerify={setSelection} />
              </div>;
            })}
          </div>
        </section>;
      })}
    </section>
    {selection && <VerifyDrawer selection={selection} matter={matter} onClose={() => setSelection(undefined)} />}
  </div>;
}

function SchedulingOrderTab({ activeMatter }: FeatureProps) {
  return activeMatter ? <SchedulingOrder key={activeMatter.id} matter={activeMatter} /> : null;
}

registerFeature({ id: 'scheduling-order', title: 'Scheduling order', slot: 'cockpit.tab', component: SchedulingOrderTab });
