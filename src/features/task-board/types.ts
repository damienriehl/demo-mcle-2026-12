export type TaskOwner = 'client' | 'lawyer';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskSource = {
  kind: 'document' | 'deadline' | 'rule' | 'verify';
  /** Document ID, deadline ID, rule ID, or a matter field path. */
  ref: string;
  /** Verified literal quote from the referenced document. */
  quote?: string;
  /** Rule citation from the deadline engine's steps. */
  citation?: string;
};
export type PreparedFact = { text: string; quote: string };
export type Prepared = { summary: string; facts: PreparedFact[]; nextStep: string; documentId?: string };
export type Task = {
  id: string;
  owner: TaskOwner;
  title: string;
  detail: string;
  status: TaskStatus;
  sharedWithClient: boolean;
  dueDate?: string;
  source: TaskSource;
  needsUpload: boolean;
  prepared?: Prepared;
  createdAt: string;
};
export type Proposal = {
  id: string;
  kind: 'timeline' | 'task';
  summary: string;
  quote: string;
  documentId: string;
  timelineEvent?: { event: string; date: string };
  task?: { owner: TaskOwner; title: string; detail: string };
  createdAt: string;
};
export type TaskBoard = { tasks: Task[]; proposals: Proposal[] };
export type ClientTask = Pick<Task, 'id' | 'owner' | 'title' | 'status' | 'sharedWithClient' | 'dueDate' | 'needsUpload'> & { detail?: string; source?: TaskSource };

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'Doing', done: 'Done' };
