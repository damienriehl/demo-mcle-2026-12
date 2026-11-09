import type { Matter, MatterWithDeadlines } from '../../src/data/schema';
import { toStoredMatter } from '../../src/data/schema';
import type { TaskBoard } from '../../src/features/task-board/types';
import type { MatterStore } from '../store';
import type { TaskStore } from './store';

export class UploadError extends Error {}
export type Converter = (input: { filename: string; bytes: Uint8Array }) => Promise<string>;

const TEXT_EXTENSIONS = /\.(txt|md|markdown)$/i;
export const convertUpload: Converter = async ({ filename, bytes }) => {
  if (TEXT_EXTENSIONS.test(filename)) return new TextDecoder().decode(bytes);
  const { normalizeDraft } = await import('../drafts/normalize');
  return (await normalizeDraft({ filename, bytes })).text;
};

type MatterWriter = Pick<MatterStore, 'get' | 'upsert'>;

/** Appends the upload to the matter's shared documents and marks its task Done (R13). Works with no key (AE4). */
export async function ingestUpload({ matterId, taskId, filename, bytes, matters, tasks, convert = convertUpload }: {
  matterId: string; taskId: string; filename: string; bytes: Uint8Array; matters: MatterWriter; tasks: TaskStore; convert?: Converter;
}): Promise<{ matter: MatterWithDeadlines; documentId: string; text: string; board: TaskBoard }> {
  const matter = matters.get(matterId);
  if (!matter) throw new UploadError('That matter is not in the workspace.');
  const task = tasks.read(matterId).tasks.find(item => item.id === taskId);
  if (!task) throw new UploadError('That task is no longer on the board.');
  let text: string;
  try { text = (await convert({ filename, bytes })).replace(/\r\n?/g, '\n').trim(); }
  catch (error) { throw new UploadError(error instanceof Error ? `Could not read that file: ${error.message}` : 'Could not read that file.'); }
  if (!text) throw new UploadError('That file has no readable text.');
  const documentId = `upload-${Date.now().toString(36)}`;
  const stored: Matter = toStoredMatter(matter);
  const updated = matters.upsert({ ...stored, documents: [...stored.documents, {
    id: documentId, title: `${filename} (uploaded for: ${task.title})`.slice(0, 200), kind: 'client-upload', body: text.slice(0, 40000), shared: true,
  }] } as Matter);
  const board = tasks.update(matterId, current => ({ ...current, tasks: current.tasks.map(item => (item.id === taskId ? { ...item, status: 'done', waitingOn: undefined, uploadedDocumentId: documentId, detail: `${item.detail} Uploaded: ${filename}.`.trim() } : item)) }));
  return { matter: updated as MatterWithDeadlines, documentId, text, board };
}

/** Applies an approved proposal. Only this path changes the matter's timeline (R15). */
export function approveProposal({ matterId, proposalId, matters, tasks, makeTask }: {
  matterId: string; proposalId: string; matters: MatterWriter; tasks: TaskStore; makeTask: typeof import('./logic').makeTask;
}) {
  const board = tasks.read(matterId);
  const proposal = board.proposals.find(item => item.id === proposalId);
  if (!proposal) throw new UploadError('That proposal is gone.');
  if (proposal.kind === 'timeline' && proposal.timelineEvent) {
    const matter = matters.get(matterId);
    if (!matter) throw new UploadError('That matter is not in the workspace.');
    const stored = toStoredMatter(matter);
    matters.upsert({ ...stored, timeline: [...stored.timeline, { id: proposal.id, ...proposal.timelineEvent }] } as Matter);
  }
  return tasks.update(matterId, current => ({
    tasks: proposal.kind === 'task' && proposal.task
      ? [...current.tasks, makeTask({ ...proposal.task, source: { kind: 'document', ref: proposal.documentId, quote: proposal.quote } })]
      : current.tasks,
    proposals: current.proposals.filter(item => item.id !== proposalId),
  }));
}

/** PATCH a task, then notify the client when it enters Waiting on client (R1). Notification never fails the move (R8). */
export async function patchAndNotify({ matter, taskId, patch, view, tasks, adapters }: {
  matter: Pick<Matter, 'id' | 'client'>; taskId: string; patch: import('./logic').TaskPatch; view: 'client' | 'lawyer'; tasks: TaskStore; adapters?: import('../notify/adapters').Adapters;
}) {
  const { patchTask } = await import('./logic');
  const task = tasks.read(matter.id).tasks.find(item => item.id === taskId);
  if (!task) return { ok: false as const, code: 404 as const, error: 'not_found', message: 'That task is no longer on the board.' };
  const result = patchTask(task, patch, view);
  if (!result.ok) return result;
  let board = tasks.update(matter.id, current => ({ ...current, tasks: current.tasks.map(item => (item.id === task.id ? result.task : item)) }));
  const entered = result.task.status === 'waiting' && result.task.waitingOn === 'client' && !(task.status === 'waiting' && task.waitingOn === 'client');
  if (entered) {
    try {
      const { notifyWaiting } = await import('../notify');
      if ((await notifyWaiting({ matter, task: result.task, store: tasks, adapters })).length) board = tasks.read(matter.id);
    } catch { /* the move already stands */ }
  }
  return { ok: true as const, board };
}

/** Validates the client's own notification preferences (R3). */
export function parsePrefs(input: unknown): import('../../src/features/task-board/types').NotifyPrefs | undefined {
  const value = (input ?? {}) as Record<string, unknown>;
  if (typeof value.email !== 'boolean' || typeof value.text !== 'boolean' || typeof value.textConsent !== 'boolean') return undefined;
  const phone = typeof value.phone === 'string' ? value.phone.trim() : '';
  if (phone && !/^\+?[0-9][0-9 ().-]{3,19}$/.test(phone)) return undefined;
  return { email: value.email, text: value.text, textConsent: value.textConsent, ...(phone ? { phone } : {}) };
}
