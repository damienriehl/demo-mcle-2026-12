import { useEffect, useState } from 'react';
import { registerFeature, type FeatureProps } from '../registry';
import { decideProposal, draftTasks, draftTasksAi, moveTask, prepareUpload, savePrefs, shareTask, uploadFile, useTaskBoard } from './api';
import { Columns } from './Board';
import { DEFAULT_PREFS, type ClientTask, type NotifyPrefs, type OutboxEntry, type Task } from './types';
import './task-board.css';

function Prepared({ task }: { task: Task }) {
  if (!task.prepared) return null;
  return (
    <div className="task-prepared">
      <p className="task-prepared-title">Prepared for you</p>
      <p>{task.prepared.summary}</p>
      {task.prepared.facts.length ? <ul>{task.prepared.facts.map(fact => <li key={fact.quote}>{fact.text} <blockquote className="task-quote">“{fact.quote}”</blockquote></li>)}</ul> : null}
      {task.prepared.nextStep ? <p><strong>Next step:</strong> {task.prepared.nextStep}</p> : null}
    </div>
  );
}

const CHANNEL = { email: 'Email', text: 'Text' } as const;
const resultWords = (entry: OutboxEntry) => (entry.result === 'previewed' ? 'Preview — not sent' : entry.result === 'sent' ? 'Sent' : `Failed — ${entry.reason ?? 'not delivered'}`);

/** Every message the client would get, in full, newest first (R4). */
function Outbox({ entries }: { entries: OutboxEntry[] }) {
  return (
    <section className="task-outbox" aria-label="Outbox">
      <h4>Outbox <span className="task-count">({entries.length})</span></h4>
      {entries.length ? null : <p className="task-meta">No client messages yet. Marking a shared task "Waiting on client" writes one here.</p>}
      <ol>{entries.map(entry => (
        <li key={entry.id} data-outbox={entry.channel} data-result={entry.result}>
          <p className="task-outbox-head"><strong>{CHANNEL[entry.channel]} to {entry.to}</strong> · {new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</p>
          {entry.subject ? <p><strong>Subject:</strong> {entry.subject}</p> : null}
          <p className="task-outbox-body">{entry.body}</p>
          <p className="task-outbox-result">{resultWords(entry)}</p>
        </li>
      ))}</ol>
    </section>
  );
}

/** "Client notified by email (preview)" on the card that triggered the newest notice. */
function notifiedLine(entries: OutboxEntry[], taskId: string) {
  const mine = entries.filter(entry => entry.taskId === taskId);
  if (!mine.length) return null;
  const latest = mine.filter(entry => entry.at === mine[0].at);
  const failed = latest.filter(entry => entry.result === 'failed');
  const channels = latest.filter(entry => entry.result !== 'failed').map(entry => CHANNEL[entry.channel].toLowerCase());
  const preview = latest.some(entry => entry.result === 'previewed');
  return (
    <>
      {channels.length ? <p className="task-notified" role="status">Client notified by {channels.join(' and ')}{preview ? ' (preview)' : ''}</p> : null}
      {failed.map(entry => <p key={entry.id} className="task-error" role="alert">Client {CHANNEL[entry.channel].toLowerCase()} failed: {entry.reason}</p>)}
    </>
  );
}

function CockpitTasks({ activeMatter }: FeatureProps) {
  const matterId = activeMatter?.id;
  const board = useTaskBoard(matterId, 'lawyer');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  if (!matterId) return <section className="task-feature"><p>Select a matter to see its tasks.</p></section>;
  const tasks = board?.tasks ?? [];
  const outbox = board?.outbox ?? [];
  const draft = async () => {
    setBusy(true); setNotice('Drafting deadline tasks…');
    const code = await draftTasks(matterId);
    setNotice(`Added ${Number(code.json.added ?? 0)} deadline and next-step tasks. Drafting from documents and forum rules…`);
    const ai = await draftTasksAi(matterId);
    setNotice(ai.ok
      ? `Added ${Number(code.json.added ?? 0) + Number(ai.json.added ?? 0)} tasks. Document tasks cite verified quotes; others say Verify.`
      : ai.json.error === 'needs_key'
        ? 'Deadline tasks added. Drafting from documents needs a Claude API key.'
        : ai.json.message ?? 'Drafting from documents did not finish.');
    setBusy(false);
  };
  return (
    <section className="task-feature" aria-label="Tasks">
      <div className="task-toolbar">
        <button type="button" className="task-primary" onClick={() => void draft()} disabled={busy}>{busy ? 'Drafting…' : 'Draft tasks'}</button>
        {notice ? <p role="status" className="task-notice">{notice}</p> : null}
      </div>
      {board?.proposals.length ? (
        <section className="task-proposals" aria-label="Proposals awaiting approval">
          <h4>Proposed from client uploads — nothing changes until you approve</h4>
          <ul>{board.proposals.map(proposal => (
            <li key={proposal.id} data-proposal={proposal.id}>
              <p><strong>{proposal.summary}</strong></p>
              <blockquote className="task-quote">“{proposal.quote}”</blockquote>
              <div className="task-actions">
                <button type="button" onClick={() => void decideProposal(matterId, proposal.id, 'approve')}>Approve</button>
                <button type="button" onClick={() => void decideProposal(matterId, proposal.id, 'dismiss')}>Dismiss</button>
              </div>
            </li>
          ))}</ul>
        </section>
      ) : null}
      <div className="task-boards">
        <Columns label="Client tasks" tasks={tasks.filter(task => task.owner === 'client')} canMove={() => true}
          view="lawyer" onMove={(task, status, waitingOn) => void moveTask(matterId, task.id, 'lawyer', status, waitingOn)}
          extra={task => (
            <>
              {task.uploadedDocumentId ? <p className="task-meta">Client uploaded document {task.uploadedDocumentId}</p> : task.needsUpload ? <p className="task-meta">Asks for an upload</p> : null}
              {notifiedLine(outbox, task.id)}
            </>
          )} />
        <Columns label="Lawyer tasks" tasks={tasks.filter(task => task.owner === 'lawyer')} canMove={() => true}
          view="lawyer" onMove={(task, status, waitingOn) => void moveTask(matterId, task.id, 'lawyer', status, waitingOn)}
          extra={task => (
            <>
              <label className="task-share">
                <input type="checkbox" checked={task.sharedWithClient} onChange={event => void shareTask(matterId, task.id, event.target.checked)} />
                Shared with client: {task.sharedWithClient ? 'Yes' : 'No'}
              </label>
              {notifiedLine(outbox, task.id)}
              <Prepared task={task as Task} />
            </>
          )} />
      </div>
      <Outbox entries={outbox} />
    </section>
  );
}

function UploadControl({ matterId, task }: { matterId: string; task: ClientTask }) {
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'done' | 'error'; message?: string }>({ kind: 'idle' });
  if (state.kind === 'done') return <p className="task-uploaded" role="status">Uploaded — thank you. {state.message}</p>;
  return (
    <div className="task-upload">
      <label>Upload a document (.txt, .md, .docx, .pdf)
        <input type="file" accept=".txt,.md,.docx,.pdf,.doc,.rtf,.odt" disabled={state.kind === 'busy'} onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          setState({ kind: 'busy' });
          const result = await uploadFile(matterId, task.id, file);
          if (!result.ok) { setState({ kind: 'error', message: result.json.message ?? 'The upload did not finish.' }); return; }
          setState({ kind: 'done', message: 'Your lawyer can see it now.' });
          void prepareUpload(matterId, String(result.json.documentId));
        }} />
      </label>
      {state.kind === 'busy' ? <p role="status">Uploading…</p> : null}
      {state.kind === 'error' ? <p role="alert" className="task-error">{state.message}</p> : null}
    </div>
  );
}

/** The client's own choice of channel (R3). A text needs consent and a phone number. */
function ReachControl({ matterId, saved }: { matterId: string; saved?: NotifyPrefs }) {
  const [prefs, setPrefs] = useState<NotifyPrefs>(saved ?? DEFAULT_PREFS);
  const [status, setStatus] = useState<string>();
  const savedKey = JSON.stringify(saved ?? null);
  useEffect(() => { if (saved) setPrefs(saved); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (change: Partial<NotifyPrefs>) => { setPrefs(current => ({ ...current, ...change })); setStatus(undefined); };
  const save = async () => {
    const result = await savePrefs(matterId, prefs);
    setStatus(result.ok ? (prefs.text && !(prefs.textConsent && prefs.phone) ? 'Saved. Texts start once you agree and add a phone number.' : 'Saved.') : result.json.message ?? 'That did not save.');
  };
  return (
    <fieldset className="task-reach">
      <legend>How should we reach you?</legend>
      <label><input type="checkbox" checked={prefs.email} onChange={event => set({ email: event.target.checked })} /> Email me</label>
      <label><input type="checkbox" checked={prefs.text} onChange={event => set({ text: event.target.checked })} /> Text me</label>
      <label><input type="checkbox" checked={prefs.textConsent} onChange={event => set({ textConsent: event.target.checked })} /> I agree to receive texts about my matter. Reply STOP to opt out.</label>
      <label className="task-reach-phone">Mobile phone
        <input type="tel" value={prefs.phone ?? ''} placeholder="555-0100" onChange={event => set({ phone: event.target.value })} />
      </label>
      <div className="task-actions"><button type="button" onClick={() => void save()}>Save how we reach you</button></div>
      {status ? <p role="status" className="task-notice">{status}</p> : null}
    </fieldset>
  );
}

function PortalTasks({ activeMatter }: FeatureProps) {
  const matterId = activeMatter?.id;
  const board = useTaskBoard(matterId, 'client');
  if (!matterId) return null;
  const tasks = board?.tasks ?? [];
  return (
    <div className="task-feature task-portal">
      <h3>Your tasks</h3>
      {board ? <ReachControl matterId={matterId} saved={board.prefs} /> : null}
      {tasks.length ? null : <p>No tasks yet. Your lawyer will add them here.</p>}
      <Columns label="Your to-do list" tasks={tasks.filter(task => task.owner === 'client')} canMove={() => true}
        view="client" onMove={(task, status, waitingOn) => void moveTask(matterId, task.id, 'client', status, waitingOn)}
        extra={task => (task.uploadedDocumentId ? <p className="task-uploaded" role="status">Uploaded — thank you. Your lawyer can see it now.</p>
          : task.needsUpload && task.status !== 'done' ? <UploadControl matterId={matterId} task={task as ClientTask} /> : null)} />
      <Columns label="What your lawyer is doing" tasks={tasks.filter(task => task.owner === 'lawyer')} view="client" canMove={() => false} onMove={() => {}} />
    </div>
  );
}

registerFeature({ id: 'task-board', title: 'Tasks', slot: 'cockpit.tab', component: CockpitTasks });
registerFeature({ id: 'task-board-portal', title: 'Your tasks', slot: 'portal.section', component: PortalTasks });
