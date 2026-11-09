import { randomUUID } from 'node:crypto';
import type { Matter } from '../../src/data/schema';
import { DEFAULT_PREFS, type NotifyPrefs, type OutboxEntry, type Task } from '../../src/features/task-board/types';
import type { TaskStore } from '../tasks/store';
import { defaultAdapters, isFictional, type Adapters, type OutgoingMessage } from './adapters';

export const DEDUPE_MS = 60_000;
export const PREVIEW_REASON = 'Preview — not sent';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-13" -> "Nov 13". */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return month && day ? `${MONTHS[month - 1]} ${day}` : iso;
}
export const portalLink = (matterId: string) => `/#portal/${encodeURIComponent(matterId)}`;
export const isClientVisible = (task: Task) => task.owner === 'client' || task.sharedWithClient;

/** One message per channel the client chose (R2, R3). Texts need text, consent, and a phone. */
export function buildMessages(task: Pick<Task, 'title' | 'dueDate'>, matter: Pick<Matter, 'id' | 'client'>, prefs: NotifyPrefs): OutgoingMessage[] {
  const title = task.title.replace(/[.\s]+$/, '');
  const body = `Your lawyer is waiting on: ${title}.${task.dueDate ? ` Due ${shortDate(task.dueDate)}.` : ''} Open your portal: ${portalLink(matter.id)}`;
  const messages: OutgoingMessage[] = [];
  if (prefs.email && matter.client.contact) messages.push({ channel: 'email', to: matter.client.contact, subject: `Action needed: ${title}`, body });
  if (prefs.text && prefs.textConsent && prefs.phone) messages.push({ channel: 'text', to: prefs.phone, body: `${body} Reply STOP to opt out.` });
  return messages;
}

/**
 * Called after a PATCH moves a client-visible task to Waiting on client (R1). Never throws:
 * every outcome, including failure, lands in the matter's outbox (R4, R8). Synthetic
 * recipients (example.invalid, 555-01xx) and unconfigured channels only preview (R6, R9).
 */
export async function notifyWaiting({ matter, task, store, adapters = defaultAdapters, now = () => new Date() }: {
  matter: Pick<Matter, 'id' | 'client'>; task: Task; store: TaskStore; adapters?: Adapters; now?: () => Date;
}): Promise<OutboxEntry[]> {
  try {
    if (task.status !== 'waiting' || task.waitingOn !== 'client' || !isClientVisible(task)) return [];
    const board = store.read(matter.id);
    const at = now();
    const recent = (board.outbox ?? []).some(entry => entry.taskId === task.id && at.getTime() - Date.parse(entry.at) < DEDUPE_MS);
    if (recent) return [];
    const entries: OutboxEntry[] = [];
    for (const message of buildMessages(task, matter, { ...DEFAULT_PREFS, ...board.prefs })) {
      const adapter = adapters[message.channel];
      const base = { id: randomUUID(), taskId: task.id, ...message, at: at.toISOString() };
      if (isFictional(message.to) || !adapter.configured()) {
        entries.push({ ...base, result: 'previewed', reason: PREVIEW_REASON });
        continue;
      }
      try { await adapter.send(message); entries.push({ ...base, result: 'sent' }); }
      catch (error) { entries.push({ ...base, result: 'failed', reason: error instanceof Error ? error.message : 'Delivery failed.' }); }
    }
    if (entries.length) store.update(matter.id, current => ({ ...current, outbox: [...entries, ...(current.outbox ?? [])].slice(0, 200) }));
    return entries;
  } catch {
    return [];
  }
}
