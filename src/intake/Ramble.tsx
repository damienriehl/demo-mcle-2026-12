import { useRef, useState } from 'react';
import { Overlay } from '../components/Overlay';
import { SourceField } from './SourceLabel';
import { applyField, intakeStream, type Draft, type Question } from './stream';
import type { Selection } from '../views/shared';

type Stage = 'idle' | 'streaming' | 'awaiting follow-up' | 'embellishing' | 'partial failure' | 'needs a key' | 'done';
const stageLabels: Record<Stage, string> = { idle: 'Ready for your story', streaming: 'Building your matter', 'awaiting follow-up': 'A question for you', embellishing: 'Embellishing', 'partial failure': 'Partial matter', 'needs a key': 'Needs a key', done: 'Matter added' };
const required = ['title', 'practiceArea', 'forum', 'client.name', 'client.contact', 'parties', 'timeline', 'documents', 'deadlines', 'clientFacing.status', 'clientFacing.nextSteps'];
function fieldLabel(path: string) {
  const roots: Record<string, string> = { title: 'Matter title', practiceArea: 'Practice area', forum: 'Court or forum', client: 'Client', parties: 'Party', timeline: 'Timeline event', documents: 'Document', deadlines: 'Deadline', clientFacing: 'Client update' };
  return path.split('.').map((part, i) => i === 0 ? roots[part] ?? part : /^\d+$/.test(part) ? String(Number(part) + 1) : part.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join(' ');
}
function draftValue(draft: Draft, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, draft);
}
function leaves(value: unknown, path = ''): [string, string][] {
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => key !== 'provenance').flatMap(([key, entry]) => leaves(entry, path ? `${path}.${key}` : key));
  return value === undefined || value === null ? [] : [[path, String(value)]];
}

export function useRamble() {
  const [isOpen, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [draft, setDraft] = useState<Draft>({});
  const draftRef = useRef<Draft>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  const busy = stage === 'streaming' || stage === 'embellishing';
  const updateDraft = (next: Draft) => { draftRef.current = next; setDraft(next); };
  async function run(endpoint: 'ramble' | 'answer' | 'embellish' | 'surprise', body: unknown, remaining: Question[] = []) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setOpen(true);
    setStage(endpoint === 'embellish' ? 'embellishing' : 'streaming');
    setMessage('');
    const pendingQuestions = questions;
    setQuestions(endpoint === 'answer' ? pendingQuestions : remaining);
    let failed = false;
    let nextQuestions = remaining;
    let terminal = false;
    try {
      await intakeStream(endpoint, body, event => {
        switch (event.type) {
          case 'field': updateDraft(applyField(draftRef.current, event)); break;
          case 'followups': nextQuestions = event.questions; setQuestions(nextQuestions); break;
          case 'done': updateDraft(event.matter); setStage('done'); setMessage(`${event.matter.title} is now in the shared workspace.`); terminal = true; break;
          case 'needs_key': failed = true; if (endpoint === 'answer') setQuestions(pendingQuestions); setStage('needs a key'); setMessage(`${event.message} Live Ramble and Embellish need a configured model key. Surprise Me works from canned synthetic matters without one.`); terminal = true; break;
          case 'error':
            failed = true;
            if (endpoint === 'answer') setQuestions(pendingQuestions);
            if (event.partial) updateDraft({ ...draftRef.current, ...event.partial, provenance: { ...draftRef.current.provenance, ...event.partial.provenance } });
            setStage('partial failure'); setMessage(event.message); terminal = true; break;
        }
      });
      if (!terminal) {
        setQuestions(nextQuestions);
        setStage(nextQuestions.length ? 'awaiting follow-up' : 'partial failure');
        if (!nextQuestions.length) setMessage('Your extracted facts are kept. Use Embellish to fill the remaining fields.');
      }
    } catch (error) {
      failed = true;
      if (endpoint === 'answer') setQuestions(pendingQuestions);
      setStage('partial failure');
      setMessage(error instanceof Error && error.message.startsWith('Could not reach intake') ? error.message : 'Could not reach intake. Your facts are kept. Use Embellish when the service is available.');
    } finally { busyRef.current = false; }
    return !failed;
  }
  return { isOpen, stage, draft, questions, message, busy, open: () => setOpen(true), close: () => setOpen(false),
    ramble: (text: string) => run('ramble', { text, draft: draftRef.current }),
    answer: (answer: string) => run('answer', { draft: draftRef.current, answers: [{ questionId: questions[0].id, answer }] }, questions.slice(1)),
    skip: () => { const next = questions.slice(1); setQuestions(next); if (!next.length) { setStage('partial failure'); setMessage('Use Embellish to fill the unanswered fields.'); } },
    embellish: () => run('embellish', { draft: draftRef.current }),
    surprise: (practiceArea?: string) => { if (busyRef.current) return; updateDraft({}); void run('surprise', practiceArea ? { practiceArea } : {}); },
    reset: () => { updateDraft({}); setStage('idle'); setMessage(''); setQuestions([]); },
  };
}

export function Ramble({ intake, onVerify }: { intake: ReturnType<typeof useRamble>; onVerify: (selection: Selection) => void }) {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const question = intake.questions[0];
  if (!intake.isOpen) return null;
  return <Overlay title="Ramble intake" closeLabel="Close intake" onClose={intake.close}>
    <p className="drawer-intro">Tell the story. Watch the matter take shape.</p><p>Live extraction and Embellish need a model key. Surprise Me works without one.</p>
    <p role="status" className="intake-status"><strong>{stageLabels[intake.stage]}</strong>{intake.busy && <span className="working-mark" aria-hidden="true"> …</span>}</p>
    {intake.message && <p className="intake-message">{intake.message}</p>}
    {intake.stage !== 'done' && <form onSubmit={event => { event.preventDefault(); void intake.ramble(text); }}>
      <label htmlFor="ramble-text">Tell us about the matter</label><textarea id="ramble-text" rows={4} value={text} onChange={event => setText(event.target.value)} placeholder="Who is the client? What happened, and when?" />
      <button className="primary-button" disabled={!text.trim() || intake.busy}>Build matter</button>
    </form>}
    {(intake.stage === 'awaiting follow-up' || intake.stage === 'partial failure') && question && <form className="followup" onSubmit={async event => { event.preventDefault(); if (await intake.answer(answer)) setAnswer(''); }}>
      <h3>{question.question}</h3><label htmlFor="intake-answer">Your answer</label><input id="intake-answer" value={answer} onChange={event => setAnswer(event.target.value)} />
      <div className="button-row"><button className="primary-button" disabled={!answer.trim()}>Use answer</button><button type="button" onClick={intake.skip}>Skip</button></div>
    </form>}
    <section className="draft-preview" aria-label="Matter taking shape"><h3>{intake.stage === 'done' ? 'Your matter' : 'Matter taking shape'}</h3>
      {leaves(intake.draft).filter(([path]) => !path.startsWith('internalOnly.') && path !== 'reasoning' && path !== 'synthetic').map(([path, value]) => <div className="draft-field" key={path}><span className="field-path">{fieldLabel(path)}</span><SourceField path={path} provenance={intake.draft.provenance ?? {}} onVerify={() => onVerify({ matterId: String(intake.draft.id ?? ''), label: fieldLabel(path), value })}>{value}</SourceField></div>)}
      {!Object.keys(intake.draft).length && <p>Names, dates, and next steps will appear here as they are extracted.</p>}
      {intake.stage === 'partial failure' && <p className="missing-fields">Missing or unfinished: {required.filter(field => draftValue(intake.draft, field) === undefined).map(fieldLabel).join(', ') || 'Remaining fields need review'}. Use Embellish to complete the matter.</p>}
    </section>
    <footer className="intake-actions">{intake.stage !== 'done' ? <><button onClick={() => void intake.embellish()} disabled={intake.busy}>Embellish</button><p>Fills the gaps. Added facts are labeled AI invented.</p></>
      : <button onClick={() => { intake.reset(); setText(''); }}>Start another matter</button>}</footer>
  </Overlay>;
}
