import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { MatterWithDeadlines } from '../../src/data/schema';
import { DEFAULT_PREFS, TASK_STATUSES, type ClientTask, type NotifyPrefs, type Prepared, type Proposal, type Task, type TaskBoard, type TaskOwner, type TaskSource, type TaskStatus } from '../../src/features/task-board/types';
import { verifyQuote } from '../prior-art/analyze';

export { verifyQuote };
const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export function makeTask(fields: Partial<Task> & Pick<Task, 'owner' | 'title' | 'source'>): Task {
  return {
    id: newId('task'), detail: '', status: 'todo', needsUpload: false, createdAt: now(),
    ...fields,
    sharedWithClient: fields.sharedWithClient ?? fields.owner === 'client',
  };
}

const formatCitation = (citation: { ruleId: string; subdivision?: string }) =>
  `${citation.ruleId}${citation.subdivision ? ` (${citation.subdivision})` : ''}`;

/** One lawyer task per pending deadline. The due date comes only from the engine (R4). */
export function deadlineTasks(matter: MatterWithDeadlines): Task[] {
  return matter.deadlines.filter(deadline => !deadline.supersededBy).map(deadline => {
    const result = matter.computedDeadlines[deadline.id];
    const cited = result?.steps.filter(step => step.citation?.ruleId) ?? [];
    const citation = cited.length ? formatCitation(cited[cited.length - 1].citation) : undefined;
    return makeTask({
      owner: 'lawyer', title: deadline.label,
      detail: result?.status === 'computed' ? `Computed from ${deadline.trigger.event}.` : `Date not computable: ${result?.reason ?? 'no result'}.`,
      dueDate: result?.status === 'computed' ? result.dueDate : undefined,
      source: { kind: 'deadline', ref: deadline.id, ...(citation ? { citation } : {}) },
    });
  });
}

const ASKS_FOR_DOCUMENT = /\b(send|upload|provide|gather|bring|share|sign|forward|return)\b/i;
/** Code-only client tasks from the lawyer-authored next steps. Marked verify: no document backs them. */
export function nextStepTasks(matter: MatterWithDeadlines): Task[] {
  return matter.clientFacing.nextSteps.map((step, index) => makeTask({
    owner: 'client', title: step, needsUpload: ASKS_FOR_DOCUMENT.test(step),
    detail: 'From the next steps your lawyer shared with you.',
    source: { kind: 'verify', ref: `clientFacing.nextSteps.${index}` },
  }));
}

export const normalizeTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dedupeKey = (task: Pick<Task, 'owner' | 'title' | 'source'>) => `${task.owner}|${normalizeTitle(task.title)}|${task.source.kind}:${task.source.ref}`;

/** Adds only tasks not already on the board (R5). Returns the merged list and the count added. */
export function mergeTasks(existing: Task[], incoming: Task[]): { tasks: Task[]; added: number } {
  const seen = new Set(existing.map(dedupeKey));
  const titles = new Set(existing.map(task => `${task.owner}|${normalizeTitle(task.title)}`));
  const tasks = [...existing];
  for (const task of incoming) {
    const key = dedupeKey(task), titleKey = `${task.owner}|${normalizeTitle(task.title)}`;
    if (seen.has(key) || titles.has(titleKey)) continue;
    seen.add(key); titles.add(titleKey); tasks.push(task);
  }
  return { tasks, added: tasks.length - existing.length };
}

/** The Portal view: client tasks plus shared lawyer tasks, with no prepared or internal fields (R9, R16). */
/** The Portal's projection. It carries the client's own preferences and never the outbox. */
export function clientView(board: TaskBoard, matter?: Pick<MatterWithDeadlines, 'documents'>): { tasks: ClientTask[]; prefs: NotifyPrefs } {
  const sharedDocs = new Set((matter?.documents ?? []).filter(doc => doc.shared).map(doc => doc.id));
  return {
    prefs: { ...DEFAULT_PREFS, ...board.prefs },
    tasks: board.tasks.filter(task => task.owner === 'client' || task.sharedWithClient).map(task => {
      const base: ClientTask = { id: task.id, owner: task.owner, title: task.title, status: task.status, sharedWithClient: task.owner === 'client' || task.sharedWithClient, needsUpload: task.owner === 'client' && task.needsUpload, ...(task.dueDate ? { dueDate: task.dueDate } : {}), ...(task.status === 'waiting' && task.waitingOn ? { waitingOn: task.waitingOn } : {}), ...(task.owner === 'client' && task.uploadedDocumentId ? { uploadedDocumentId: task.uploadedDocumentId } : {}) };
      if (task.owner === 'lawyer') return base;
      const source: TaskSource | undefined = task.source.kind === 'document'
        ? (sharedDocs.has(task.source.ref) ? task.source : undefined)
        : task.source.kind === 'verify' ? undefined : { kind: task.source.kind, ref: task.source.ref, ...(task.source.citation ? { citation: task.source.citation } : {}) };
      return { ...base, detail: task.detail, ...(source ? { source } : {}) };
    }),
  };
}

export type TaskPatch = { status?: unknown; waitingOn?: unknown; sharedWithClient?: unknown };
export type PatchResult = { ok: true; task: Task } | { ok: false; code: 400 | 403; error: string; message: string };
const otherSide = (who: TaskOwner): TaskOwner => (who === 'lawyer' ? 'client' : 'lawyer');

/** Validates and applies one PATCH. The client view may change only client tasks; waitingOn exists only while waiting. */
export function patchTask(task: Task, patch: TaskPatch, view: 'client' | 'lawyer'): PatchResult {
  if (view === 'client' && (task.owner !== 'client' || patch.sharedWithClient !== undefined)) {
    return { ok: false, code: 403, error: 'forbidden', message: 'Only your lawyer can change that task.' };
  }
  if (patch.status !== undefined && !TASK_STATUSES.includes(patch.status as TaskStatus)) return { ok: false, code: 400, error: 'invalid', message: 'Unknown status.' };
  if (patch.waitingOn !== undefined && patch.waitingOn !== 'client' && patch.waitingOn !== 'lawyer') return { ok: false, code: 400, error: 'invalid', message: 'waitingOn must be client or lawyer.' };
  const status = (patch.status as TaskStatus | undefined) ?? task.status;
  if (patch.waitingOn !== undefined && status !== 'waiting') return { ok: false, code: 400, error: 'invalid', message: 'waitingOn applies only to a waiting task.' };
  const { waitingOn: previous, ...rest } = task;
  const next: Task = { ...rest, status };
  if (status === 'waiting') next.waitingOn = (patch.waitingOn as TaskOwner | undefined) ?? (task.status === 'waiting' && previous ? previous : otherSide(task.owner));
  if (typeof patch.sharedWithClient === 'boolean' && task.owner === 'lawyer') next.sharedWithClient = patch.sharedWithClient;
  return { ok: true, task: next };
}

function parseJson(raw: string): unknown {
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return undefined; }
}
const str = (value: unknown, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const owner = (value: unknown): TaskOwner | undefined => (value === 'client' || value === 'lawyer' ? value : undefined);

/** Checks model-proposed tasks: document quotes must be literal substrings, else the task is marked verify (R3). */
export function checkDraftedTasks(raw: string, matter: MatterWithDeadlines): Task[] {
  const parsed = parseJson(raw) as { tasks?: unknown[] } | undefined;
  const docs = new Map(matter.documents.map(doc => [doc.id, doc]));
  const out: Task[] = [];
  for (const item of (parsed?.tasks ?? []) as Record<string, unknown>[]) {
    const who = owner(item?.owner), title = str(item?.title, 160);
    if (!who || !title) continue;
    const doc = docs.get(str(item.documentId));
    const quote = str(item.quote, 600);
    const ruleId = str(item.ruleId, 80);
    let source: TaskSource;
    if (doc && quote && verifyQuote(quote, doc.body)) source = { kind: 'document', ref: doc.id, quote };
    else if (ruleId && !quote) source = { kind: 'rule', ref: ruleId };
    else source = { kind: 'verify', ref: doc?.id ?? ruleId ?? '' };
    out.push(makeTask({ owner: who, title, detail: str(item.detail, 600), source, needsUpload: who === 'client' && item.needsUpload === true }));
  }
  return out;
}

const text = (message: Anthropic.Message) => message.content.map(block => (block.type === 'text' ? block.text : '')).join('');

export async function draftWithModel(client: Anthropic, model: string, matter: MatterWithDeadlines): Promise<Task[]> {
  const documents = matter.documents.map(doc => `Document ID: ${doc.id}\nTitle: ${doc.title}\nBody: ${doc.body}`).join('\n\n');
  const deadlines = matter.deadlines.map(d => `- ${d.label} (${d.deadlineRuleId})`).join('\n');
  const message = await client.messages.create({
    model, max_tokens: 4000,
    messages: [{ role: 'user', content: `You help a lawyer and a client split the work on a legal matter into a shared to-do list.
Matter: ${matter.title}
Practice area: ${matter.practiceArea}
Forum: ${matter.forum}
Deadlines already tracked by code (do not repeat them, and never give dates):
${deadlines || '(none)'}

Documents:
${documents}

Propose a thorough list: 5 to 8 client tasks (plain language, things the client gathers, reviews, signs, or sends) and 5 to 8 lawyer tasks (drafting, filing, service, and the procedural steps this forum's rules require before the next event).
Each task must cite either a document, with a short quote copied exactly, word for word, from that document's Body, or a procedural rule ID such as "minn-gen-prac:303.03" or "frcp:12".
Set needsUpload true for client tasks that ask the client to send a document.
Answer with only JSON: {"tasks":[{"owner":"client"|"lawyer","title","detail","documentId","quote","ruleId","needsUpload"}]}.` }],
  }, { timeout: 90_000 });
  return checkDraftedTasks(text(message), matter);
}

export type UploadAnalysis = { prepared: Prepared; relatedTaskIds: string[]; proposals: Proposal[] };

/** Verifies every fact and proposal quote against the uploaded text; unverified ones are dropped (R14, R15). */
export function checkUploadAnalysis(raw: string, uploadText: string, documentId: string, lawyerTasks: Task[]): UploadAnalysis | undefined {
  const parsed = parseJson(raw) as Record<string, unknown> | undefined;
  if (!parsed) return undefined;
  const facts = ((parsed.facts ?? []) as Record<string, unknown>[])
    .map(fact => ({ text: str(fact?.text), quote: str(fact?.quote, 600) }))
    .filter(fact => fact.text && verifyQuote(fact.quote, uploadText));
  const ids = new Set(lawyerTasks.map(task => task.id));
  const relatedTaskIds = ((parsed.relatedTaskIds ?? []) as unknown[]).map(id => String(id)).filter(id => ids.has(id));
  const proposals: Proposal[] = [];
  for (const item of (parsed.proposals ?? []) as Record<string, unknown>[]) {
    const quote = str(item?.quote, 600);
    if (!verifyQuote(quote, uploadText)) continue;
    if (item.kind === 'timeline' && /^\d{4}-\d{2}-\d{2}$/.test(str(item.date)) && str(item.event)) {
      proposals.push({ id: newId('proposal'), kind: 'timeline', summary: `Add to timeline: ${str(item.event)} (${str(item.date)})`, quote, documentId, timelineEvent: { event: str(item.event), date: str(item.date) }, createdAt: now() });
    } else if (item.kind === 'task' && owner(item.owner) && str(item.title)) {
      proposals.push({ id: newId('proposal'), kind: 'task', summary: `New ${owner(item.owner)} task: ${str(item.title, 160)}`, quote, documentId, task: { owner: owner(item.owner)!, title: str(item.title, 160), detail: str(item.detail, 600) }, createdAt: now() });
    }
  }
  return { prepared: { summary: str(parsed.summary, 1200), facts, nextStep: str(parsed.nextStep), documentId }, relatedTaskIds, proposals };
}

export async function analyzeUpload(client: Anthropic, model: string, matter: MatterWithDeadlines, uploadText: string, documentId: string, lawyerTasks: Task[]): Promise<UploadAnalysis | undefined> {
  const listing = lawyerTasks.map(task => `- ${task.id}: ${task.title}`).join('\n');
  const message = await client.messages.create({
    model, max_tokens: 3000,
    messages: [{ role: 'user', content: `A client uploaded a document to the matter "${matter.title}" (${matter.forum}).
Uploaded text:
${uploadText.slice(0, 30000)}

The lawyer's open tasks:
${listing || '(none)'}

Prepare the lawyer's follow-up. Give a 2-3 sentence summary, 2 to 5 key facts each with a short quote copied exactly, word for word, from the uploaded text, one suggested next step, the IDs of the lawyer tasks this document helps with, and any proposed matter changes: timeline events stated in the text (with an ISO date) or new tasks. Each proposal needs an exact quote from the uploaded text.
Answer with only JSON: {"summary","facts":[{"text","quote"}],"nextStep","relatedTaskIds":[],"proposals":[{"kind":"timeline","event","date","quote"}|{"kind":"task","owner":"lawyer"|"client","title","detail","quote"}]}.` }],
  }, { timeout: 90_000 });
  return checkUploadAnalysis(text(message), uploadText, documentId, lawyerTasks);
}

/** Applies an analysis: pre-fills related lawyer tasks (or the first open one) and queues proposals for approval. */
export function applyAnalysis(board: TaskBoard, analysis: UploadAnalysis): TaskBoard {
  const open = board.tasks.filter(task => task.owner === 'lawyer' && task.status !== 'done');
  const targets = new Set(analysis.relatedTaskIds.length ? analysis.relatedTaskIds : open.slice(0, 1).map(task => task.id));
  return {
    tasks: board.tasks.map(task => (targets.has(task.id) ? { ...task, prepared: analysis.prepared } : task)),
    proposals: [...board.proposals, ...analysis.proposals],
  };
}
