import { useState, type DragEvent } from 'react';
import { STATUS_LABEL, TASK_STATUSES, type ClientTask, type Task, type TaskOwner, type TaskSource, type TaskStatus } from './types';

const ORDER = TASK_STATUSES;
type AnyTask = Task | ClientTask;
type View = 'client' | 'lawyer';
type Move = (status: TaskStatus, waitingOn?: TaskOwner) => void;
const otherSide = (who: TaskOwner): TaskOwner => (who === 'lawyer' ? 'client' : 'lawyer');

/** The waiting line in words: the Portal speaks to the client as "you". */
export function waitingLine(view: View, waitingOn: TaskOwner): string {
  if (view === 'client') return waitingOn === 'client' ? 'Waiting on you' : 'Waiting on your lawyer';
  return waitingOn === 'client' ? 'Waiting on client' : 'Waiting on lawyer';
}
const waitButton = (view: View, who: TaskOwner) => (view === 'client' && who === 'client' ? 'Waiting on me' : `Waiting on ${who}`);

function Actions({ task, view, onMove }: { task: AnyTask; view: View; onMove: Move }) {
  if (task.status === 'waiting') {
    return (
      <div className="task-actions">
        <button type="button" onClick={() => onMove('doing')}>Back to Doing</button>
        <button type="button" onClick={() => onMove('done')}>Move to Done</button>
      </div>
    );
  }
  const others = ORDER.filter(status => status !== task.status && status !== 'waiting');
  const primary = otherSide(task.owner);
  return (
    <div className="task-actions">
      {task.status !== 'done' ? (
        <>
          <button type="button" className="task-wait" onClick={() => onMove('waiting', primary)}>{waitButton(view, primary)}</button>
          <button type="button" className="task-secondary" onClick={() => onMove('waiting', task.owner)}>{waitButton(view, task.owner)}</button>
        </>
      ) : null}
      {others.map(status => <button key={status} type="button" onClick={() => onMove(status)}>Move to {STATUS_LABEL[status]}</button>)}
    </div>
  );
}

export function sourceLine(source?: TaskSource): string {
  if (!source) return 'Source: your lawyer';
  if (source.kind === 'deadline') return `Source: computed deadline${source.citation ? ` · rule ${source.citation}` : ''}`;
  if (source.kind === 'rule') return `Source: rule ${source.ref}`;
  if (source.kind === 'document') return `Source: document ${source.ref}`;
  return 'Source: verify — not tied to a document or rule';
}

export function Card({ task, view, canMove, onMove, extra }: { task: AnyTask; view: View; canMove: boolean; onMove: Move; extra?: React.ReactNode }) {
  return (
    <li className="task-card" data-task={task.id} data-status={task.status} draggable={canMove}
      onDragStart={(event: DragEvent) => event.dataTransfer.setData('text/task-id', task.id)}>
      <p className="task-status-label">{STATUS_LABEL[task.status]}{task.source?.kind === 'verify' ? ' · Verify' : ''}</p>
      <h5>{task.title}</h5>
      {task.status === 'waiting' && task.waitingOn ? <p className="task-waiting" data-waiting-on={task.waitingOn}>{waitingLine(view, task.waitingOn)}</p> : null}
      {task.detail ? <p className="task-detail">{task.detail}</p> : null}
      <p className="task-meta">{task.dueDate ? `Due ${task.dueDate}` : 'No computed due date'}</p>
      <p className="task-meta">{sourceLine(task.source)}</p>
      {task.source?.quote ? <blockquote className="task-quote">“{task.source.quote}”</blockquote> : null}
      {extra}
      {canMove ? <Actions task={task} view={view} onMove={onMove} /> : <p className="task-meta">Read-only: your lawyer updates this.</p>}
    </li>
  );
}

export function Columns({ label, view, tasks, canMove, onMove, extra }: {
  label: string; view: View; tasks: AnyTask[]; canMove: (task: AnyTask) => boolean; onMove: (task: AnyTask, status: TaskStatus, waitingOn?: TaskOwner) => void; extra?: (task: AnyTask) => React.ReactNode;
}) {
  const [over, setOver] = useState<TaskStatus>();
  return (
    <section className="task-board" aria-label={label}>
      <h4>{label} <span className="task-count">({tasks.length})</span></h4>
      <div className="task-columns">
        {ORDER.map(status => {
          const inColumn = tasks.filter(task => task.status === status);
          return (
            <div key={status} className="task-column" data-column={status} data-over={over === status || undefined}
              onDragOver={event => { event.preventDefault(); setOver(status); }} onDragLeave={() => setOver(undefined)}
              onDrop={event => {
                event.preventDefault(); setOver(undefined);
                const task = tasks.find(item => item.id === event.dataTransfer.getData('text/task-id'));
                if (task && task.status !== status && canMove(task)) onMove(task, status);
              }}>
              <h5 className="task-column-title">{STATUS_LABEL[status]} ({inColumn.length})</h5>
              <ul>{inColumn.map(task => <Card key={task.id} task={task} view={view} canMove={canMove(task)} onMove={(next, waitingOn) => onMove(task, next, waitingOn)} extra={extra?.(task)} />)}</ul>
              {inColumn.length ? null : <p className="task-empty">Nothing here.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
