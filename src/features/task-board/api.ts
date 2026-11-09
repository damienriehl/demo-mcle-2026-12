import { useEffect, useState } from 'react';
import type { ClientTask, NotifyPrefs, OutboxEntry, Proposal, Task, TaskOwner, TaskStatus } from './types';

const BASE = '/api/features/task-board';
export type View = 'client' | 'lawyer';
export type BoardState<V extends View> = V extends 'lawyer' ? { tasks: Task[]; proposals: Proposal[]; outbox?: OutboxEntry[] } : { tasks: ClientTask[]; prefs?: NotifyPrefs };

/** Live board for one matter: full snapshot on connect and after every change (R11). */
export function useTaskBoard<V extends View>(matterId: string | undefined, view: V): BoardState<V> | undefined {
  const [state, setState] = useState<BoardState<V>>();
  useEffect(() => {
    setState(undefined);
    if (!matterId) return;
    const source = new EventSource(`${BASE}/events?matterId=${encodeURIComponent(matterId)}&view=${view}`);
    source.onmessage = event => { try { setState(JSON.parse(event.data)); } catch { /* ignore partial */ } };
    return () => source.close();
  }, [matterId, view]);
  return state;
}

async function call(path: string, init: RequestInit) {
  const response = await fetch(`${BASE}${path}`, init);
  const json = await response.json().catch(() => ({}));
  return { ok: response.ok, json: json as { message?: string; error?: string; [key: string]: unknown } };
}
const post = (path: string, body: unknown) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const moveTask = (matterId: string, id: string, view: View, status: TaskStatus, waitingOn?: TaskOwner) =>
  call(`/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId, view, status, ...(waitingOn ? { waitingOn } : {}) }) });
export const shareTask = (matterId: string, id: string, sharedWithClient: boolean) =>
  call(`/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId, view: 'lawyer', sharedWithClient }) });
export const draftTasks = (matterId: string) => post('/draft', { matterId });
export const draftTasksAi = (matterId: string) => post('/draft-ai', { matterId });
export const prepareUpload = (matterId: string, documentId: string) => post('/prepare', { matterId, documentId });
export const decideProposal = (matterId: string, id: string, decision: 'approve' | 'dismiss') => post(`/proposals/${id}/${decision}`, { matterId });
export function uploadFile(matterId: string, taskId: string, file: File) {
  const form = new FormData();
  form.set('matterId', matterId); form.set('taskId', taskId); form.set('file', file);
  return call('/upload', { method: 'POST', body: form });
}
export const savePrefs = (matterId: string, prefs: NotifyPrefs) =>
  call('/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId, ...prefs }) });
