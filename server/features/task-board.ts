import { Hono } from 'hono';
import { createClient, modelName, NEEDS_KEY_MESSAGE, needsKeyResponse } from '../ai';
import { getMatterStore } from '../store';
import type { TaskBoard, TaskStatus } from '../../src/features/task-board/types';
import { analyzeUpload, applyAnalysis, clientView, deadlineTasks, draftWithModel, makeTask, mergeTasks, nextStepTasks } from '../tasks/logic';
import { approveProposal, ingestUpload, UploadError } from '../tasks/service';
import { getTaskStore } from '../tasks/store';

type View = 'client' | 'lawyer';
const viewOf = (value: string | undefined): View => (value === 'lawyer' ? 'lawyer' : 'client');
const STATUSES = new Set<TaskStatus>(['todo', 'doing', 'done']);

function project(matterId: string, board: TaskBoard, view: View) {
  return view === 'lawyer' ? board : clientView(board, getMatterStore().get(matterId));
}
const matterOr404 = (matterId: string | undefined) => (matterId ? getMatterStore().get(matterId) : undefined);
const notFound = { error: 'not_found', message: 'That matter is not in the workspace.' };

export default new Hono()
  .get('/tasks', (c) => {
    const matterId = c.req.query('matterId');
    if (!matterOr404(matterId)) return c.json(notFound, 404);
    return c.json(project(matterId!, getTaskStore().read(matterId!), viewOf(c.req.query('view'))));
  })
  .get('/events', (c) => {
    const matterId = c.req.query('matterId');
    if (!matterOr404(matterId)) return c.json(notFound, 404);
    const view = viewOf(c.req.query('view'));
    const encoder = new TextEncoder();
    const signal = c.req.raw.signal;
    let detach = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (board: TaskBoard) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(project(matterId!, board, view))}\n\n`)); } catch { detach(); }
        };
        detach = getTaskStore().subscribe(matterId!, send);
        signal.addEventListener('abort', () => { detach(); try { controller.close(); } catch { /* closed */ } }, { once: true });
        send(getTaskStore().read(matterId!));
      },
      cancel() { detach(); },
    });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
  })
  // Code-only drafting: deadline tasks (R4) and the lawyer's stated next steps. Always works, key or not.
  .post('/draft', async (c) => {
    const { matterId } = await c.req.json().catch(() => ({})) as { matterId?: string };
    const matter = matterOr404(matterId);
    if (!matter) return c.json(notFound, 404);
    let added = 0;
    const board = getTaskStore().update(matter.id, current => {
      const merged = mergeTasks(current.tasks, [...deadlineTasks(matter), ...nextStepTasks(matter)]);
      added = merged.added;
      return { ...current, tasks: merged.tasks };
    });
    return c.json({ added, total: board.tasks.length });
  })
  // Model drafting from documents and forum procedure, with server-side quote checks (R2, R3, R5).
  .post('/draft-ai', async (c) => {
    const { matterId } = await c.req.json().catch(() => ({})) as { matterId?: string };
    const matter = matterOr404(matterId);
    if (!matter) return c.json(notFound, 404);
    const client = createClient();
    if (!client) return needsKeyResponse();
    try {
      const drafted = await draftWithModel(client, modelName(), matter);
      let added = 0;
      getTaskStore().update(matter.id, current => {
        const merged = mergeTasks(current.tasks, drafted);
        added = merged.added;
        return { ...current, tasks: merged.tasks };
      });
      return c.json({ added, proposed: drafted.length });
    } catch {
      return c.json({ error: 'model_failed', message: 'Drafting from documents did not finish. The deadline tasks above still stand.' }, 502);
    }
  })
  .patch('/tasks/:id', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { matterId?: string; status?: TaskStatus; sharedWithClient?: boolean; view?: string };
    const matter = matterOr404(body.matterId);
    if (!matter) return c.json(notFound, 404);
    const view = viewOf(body.view);
    const task = getTaskStore().read(matter.id).tasks.find(item => item.id === c.req.param('id'));
    if (!task) return c.json({ error: 'not_found', message: 'That task is no longer on the board.' }, 404);
    if (view === 'client' && (task.owner !== 'client' || body.sharedWithClient !== undefined)) {
      return c.json({ error: 'forbidden', message: 'Only your lawyer can change that task.' }, 403);
    }
    if (body.status !== undefined && !STATUSES.has(body.status)) return c.json({ error: 'invalid', message: 'Unknown status.' }, 400);
    const board = getTaskStore().update(matter.id, current => ({ ...current, tasks: current.tasks.map(item => (item.id === task.id ? {
      ...item,
      ...(body.status ? { status: body.status } : {}),
      ...(typeof body.sharedWithClient === 'boolean' && item.owner === 'lawyer' ? { sharedWithClient: body.sharedWithClient } : {}),
    } : item)) }));
    return c.json(project(matter.id, board, view));
  })
  .delete('/tasks/:id', (c) => {
    const matterId = c.req.query('matterId');
    if (!matterOr404(matterId)) return c.json(notFound, 404);
    getTaskStore().update(matterId!, current => ({ ...current, tasks: current.tasks.filter(item => item.id !== c.req.param('id')) }));
    return c.body(null, 204);
  })
  .post('/upload', async (c) => {
    const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const file = form.file;
    if (!(file instanceof File)) return c.json({ error: 'invalid', message: 'Choose a file to upload.' }, 400);
    if (file.size > 10 * 1024 * 1024) return c.json({ error: 'too_large', message: 'That file is over 10 MB.' }, 400);
    try {
      const result = await ingestUpload({ matterId: String(form.matterId ?? ''), taskId: String(form.taskId ?? ''), filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()), matters: getMatterStore(), tasks: getTaskStore() });
      return c.json({ ok: true, documentId: result.documentId });
    } catch (error) {
      if (error instanceof UploadError) return c.json({ error: 'upload_failed', message: error.message }, 400);
      throw error;
    }
  })
  // Model step after an upload: summary, verified facts, and proposals awaiting approval (R14, R15).
  .post('/prepare', async (c) => {
    const { matterId, documentId } = await c.req.json().catch(() => ({})) as { matterId?: string; documentId?: string };
    const matter = matterOr404(matterId);
    const document = matter?.documents.find(doc => doc.id === documentId);
    if (!matter || !document) return c.json(notFound, 404);
    const client = createClient();
    if (!client) return c.json({ error: 'needs_key', message: `Uploaded. The summary needs a key. ${NEEDS_KEY_MESSAGE}` }, 503);
    try {
      const board = getTaskStore().read(matter.id);
      const analysis = await analyzeUpload(client, modelName(), matter, document.body, document.id, board.tasks.filter(task => task.owner === 'lawyer'));
      if (!analysis) throw new Error('unparseable');
      getTaskStore().update(matter.id, current => applyAnalysis(current, analysis));
      return c.json({ ok: true, facts: analysis.prepared.facts.length, proposals: analysis.proposals.length });
    } catch {
      return c.json({ error: 'model_failed', message: 'The summary did not finish. The upload itself is saved.' }, 502);
    }
  })
  .post('/proposals/:id/approve', async (c) => {
    const { matterId } = await c.req.json().catch(() => ({})) as { matterId?: string };
    if (!matterOr404(matterId)) return c.json(notFound, 404);
    try {
      return c.json(approveProposal({ matterId: matterId!, proposalId: c.req.param('id'), matters: getMatterStore(), tasks: getTaskStore(), makeTask }));
    } catch (error) {
      if (error instanceof UploadError) return c.json({ error: 'not_found', message: error.message }, 404);
      throw error;
    }
  })
  .post('/proposals/:id/dismiss', async (c) => {
    const { matterId } = await c.req.json().catch(() => ({})) as { matterId?: string };
    if (!matterOr404(matterId)) return c.json(notFound, 404);
    return c.json(getTaskStore().update(matterId!, current => ({ ...current, proposals: current.proposals.filter(item => item.id !== c.req.param('id')) })));
  });
