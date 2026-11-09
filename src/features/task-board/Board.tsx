import { useState, type DragEvent } from 'react';
import { STATUS_LABEL, type ClientTask, type Task, type TaskSource, type TaskStatus } from './types';

const ORDER: TaskStatus[] = ['todo', 'doing', 'done'];
type AnyTask = Task | ClientTask;

export function sourceLine(source?: TaskSource): string {
  if (!source) return 'Source: your lawyer';
  if (source.kind === 'deadline') return `Source: computed deadline${source.citation ? ` · rule ${source.citation}` : ''}`;
  if (source.kind === 'rule') return `Source: rule ${source.ref}`;
  if (source.kind === 'document') return `Source: document ${source.ref}`;
  return 'Source: verify — not tied to a document or rule';
}

export function Card({ task, canMove, onMove, extra }: { task: AnyTask; canMove: boolean; onMove: (status: TaskStatus) => void; extra?: React.ReactNode }) {
  const others = ORDER.filter(status => status !== task.status);
  return (
    <li className="task-card" data-task={task.id} data-status={task.status} draggable={canMove}
      onDragStart={(event: DragEvent) => event.dataTransfer.setData('text/task-id', task.id)}>
      <p className="task-status-label">{STATUS_LABEL[task.status]}{task.source?.kind === 'verify' ? ' · Verify' : ''}</p>
      <h5>{task.title}</h5>
      {task.detail ? <p className="task-detail">{task.detail}</p> : null}
      <p className="task-meta">{task.dueDate ? `Due ${task.dueDate}` : 'No computed due date'}</p>
      <p className="task-meta">{sourceLine(task.source)}</p>
      {task.source?.quote ? <blockquote className="task-quote">“{task.source.quote}”</blockquote> : null}
      {extra}
      {canMove ? (
        <div className="task-actions">
          {others.map(status => <button key={status} type="button" onClick={() => onMove(status)}>Move to {STATUS_LABEL[status]}</button>)}
        </div>
      ) : <p className="task-meta">Read-only: your lawyer updates this.</p>}
    </li>
  );
}

export function Columns({ label, tasks, canMove, onMove, extra }: {
  label: string; tasks: AnyTask[]; canMove: (task: AnyTask) => boolean; onMove: (task: AnyTask, status: TaskStatus) => void; extra?: (task: AnyTask) => React.ReactNode;
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
              <ul>{inColumn.map(task => <Card key={task.id} task={task} canMove={canMove(task)} onMove={next => onMove(task, next)} extra={extra?.(task)} />)}</ul>
              {inColumn.length ? null : <p className="task-empty">Nothing here.</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
