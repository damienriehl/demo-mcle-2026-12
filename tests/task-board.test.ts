import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Matter, MatterWithDeadlines } from '../src/data/schema';
import { applyAnalysis, checkDraftedTasks, checkUploadAnalysis, clientView, deadlineTasks, makeTask, mergeTasks, nextStepTasks, verifyQuote } from '../server/tasks/logic';
import { approveProposal, ingestUpload } from '../server/tasks/service';
import { createTaskStore } from '../server/tasks/store';

const matter = (): MatterWithDeadlines => ({
  id: 'm1', title: 'Custody', practiceArea: 'family', forum: 'Hennepin County District Court', synthetic: true,
  client: { name: 'A', contact: 'a@example.invalid' }, parties: [], timeline: [],
  documents: [
    { id: 'doc-1', title: 'Notice', kind: 'notice', body: 'The hearing is set for the temporary parenting schedule.', shared: true },
    { id: 'doc-2', title: 'Plan', kind: 'family-plan', body: 'Private strategy: emphasize school nights.', shared: false },
  ],
  deadlines: [
    { id: 'motion-papers', label: 'Serve motion papers', deadlineRuleId: 'mn-gp-303-family-motion', trigger: { event: 'Hearing', date: '2026-12-01' }, assumptions: {} },
    { id: 'old', label: 'Old deadline', deadlineRuleId: 'none', trigger: { event: 'x', date: '2026-12-01' }, assumptions: {}, supersededBy: 'motion-papers' },
  ],
  clientFacing: { status: 's', nextSteps: ['Review the schedule.', 'Send corrections to your statement.'] },
  internalOnly: ['reasoning'], provenance: {},
  computedDeadlines: {
    'motion-papers': { status: 'computed', dueDate: '2026-11-17', steps: [{ label: 'Hearing', date: '2026-12-01', citation: { ruleId: 'mn-gen-prac:303.03', subdivision: 'a' } }] },
    old: { status: 'uncomputable', reason: 'none', steps: [] },
  },
});

const dirs: string[] = [];
const tempStore = () => { const dir = mkdtempSync(join(tmpdir(), 'tasks-')); dirs.push(dir); return createTaskStore(dir); };
afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

function fakeMatters(initial: MatterWithDeadlines) {
  let current = initial;
  return {
    get: (id: string) => (id === current.id ? current : undefined),
    upsert: (value: unknown) => { current = { ...(value as Matter), computedDeadlines: initial.computedDeadlines }; return current; },
    current: () => current,
  };
}

describe('task board drafting', () => {
  it('drafts one lawyer task per pending deadline with the engine due date and rule citation', () => {
    const tasks = deadlineTasks(matter());
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ owner: 'lawyer', title: 'Serve motion papers', dueDate: '2026-11-17', sharedWithClient: false, source: { kind: 'deadline', ref: 'motion-papers', citation: 'mn-gen-prac:303.03 (a)' } });
  });

  it('drafts client tasks from next steps, flagged verify, and asks for an upload when a step says send', () => {
    const tasks = nextStepTasks(matter());
    expect(tasks.map(task => [task.owner, task.needsUpload, task.source.kind])).toEqual([['client', false, 'verify'], ['client', true, 'verify']]);
  });

  it('dedupes repeated drafting by normalized title and source', () => {
    const first = mergeTasks([], deadlineTasks(matter()));
    const second = mergeTasks(first.tasks, [...deadlineTasks(matter()), makeTask({ owner: 'lawyer', title: 'SERVE motion papers!', source: { kind: 'deadline', ref: 'motion-papers' } })]);
    expect(first.added).toBe(1);
    expect(second.added).toBe(0);
    expect(second.tasks).toHaveLength(1);
  });

  it('keeps only literal document quotes; anything else is marked verify and never gets a model due date', () => {
    const raw = JSON.stringify({ tasks: [
      { owner: 'lawyer', title: 'Prepare hearing exhibits', documentId: 'doc-1', quote: 'The hearing is set for the temporary parenting schedule', dueDate: '2030-01-01' },
      { owner: 'client', title: 'Gather school records', documentId: 'doc-1', quote: 'a sentence the document never says', needsUpload: true },
      { owner: 'lawyer', title: 'File affidavit of service', ruleId: 'mn-gen-prac:303.03' },
      { owner: 'nobody', title: 'dropped' },
    ] });
    const tasks = checkDraftedTasks(`Here you go: ${raw}`, matter());
    expect(tasks.map(task => task.source.kind)).toEqual(['document', 'verify', 'rule']);
    expect(tasks[1].source.quote).toBeUndefined();
    expect(tasks[1].needsUpload).toBe(true);
    expect(tasks.every(task => task.dueDate === undefined)).toBe(true);
  });

  it('verifies quotes modulo whitespace and curly quotes only', () => {
    expect(verifyQuote('hearing  is set', 'The hearing is set.')).toBe(true);
    expect(verifyQuote('hearing was set', 'The hearing is set.')).toBe(false);
    expect(verifyQuote('', 'anything')).toBe(false);
  });
});

describe('client view filter', () => {
  it('shows client tasks and shared lawyer tasks only, with no prepared fields or private sources', () => {
    const prepared = { summary: 'SECRET SUMMARY', facts: [{ text: 'f', quote: 'q' }], nextStep: 'n' };
    const board = { proposals: [], tasks: [
      makeTask({ owner: 'client', title: 'Gather records', source: { kind: 'document', ref: 'doc-2', quote: 'Private strategy' } }),
      makeTask({ owner: 'lawyer', title: 'Unshared strategy task', source: { kind: 'verify', ref: '' }, prepared }),
      makeTask({ owner: 'lawyer', title: 'Shared filing', sharedWithClient: true, detail: 'INTERNAL DETAIL', source: { kind: 'document', ref: 'doc-2', quote: 'Private strategy' }, prepared }),
    ] };
    const view = clientView(board, matter());
    const json = JSON.stringify(view);
    expect(view.tasks.map(task => task.title)).toEqual(['Gather records', 'Shared filing']);
    for (const leak of ['Unshared strategy task', 'SECRET SUMMARY', 'INTERNAL DETAIL', 'Private strategy', 'prepared', 'proposals']) expect(json).not.toContain(leak);
  });
});

describe('uploads', () => {
  it('appends the upload as a shared client-upload document and marks the task done, with no key needed', async () => {
    const tasks = tempStore();
    const task = makeTask({ owner: 'client', title: 'Send corrections', needsUpload: true, source: { kind: 'verify', ref: '' } });
    tasks.write('m1', { tasks: [task], proposals: [] });
    const matters = fakeMatters(matter());
    const result = await ingestUpload({ matterId: 'm1', taskId: task.id, filename: 'statement.docx', bytes: new Uint8Array([1]), matters, tasks, convert: async () => 'Corrected statement text.' });
    const added = matters.current().documents.at(-1)!;
    expect(added).toMatchObject({ id: result.documentId, kind: 'client-upload', shared: true, body: 'Corrected statement text.' });
    expect(tasks.read('m1').tasks[0]).toMatchObject({ status: 'done', needsUpload: false });
  });

  it('converts a real .txt upload without the converter', async () => {
    const tasks = tempStore();
    const task = makeTask({ owner: 'client', title: 'Send lease', source: { kind: 'verify', ref: '' } });
    tasks.write('m1', { tasks: [task], proposals: [] });
    const matters = fakeMatters(matter());
    await ingestUpload({ matterId: 'm1', taskId: task.id, filename: 'lease.txt', bytes: new TextEncoder().encode('Lease signed March 3.\r\n'), matters, tasks });
    expect(matters.current().documents.at(-1)!.body).toBe('Lease signed March 3.');
  });

  it('pre-fills lawyer work with verified facts only, and proposals do not change the matter until approved', () => {
    const tasks = tempStore();
    const lawyer = makeTask({ owner: 'lawyer', title: 'Draft affidavit', source: { kind: 'verify', ref: '' } });
    tasks.write('m1', { tasks: [lawyer], proposals: [] });
    const upload = 'The parties exchanged the child on 2026-10-04 at the library.';
    const analysis = checkUploadAnalysis(JSON.stringify({
      summary: 'An exchange log.', nextStep: 'Cite it in the affidavit.', relatedTaskIds: [lawyer.id, 'ghost'],
      facts: [{ text: 'Exchange at library', quote: 'exchanged the child on 2026-10-04' }, { text: 'Invented', quote: 'the father was late' }],
      proposals: [
        { kind: 'timeline', event: 'Child exchange at library', date: '2026-10-04', quote: 'at the library' },
        { kind: 'timeline', event: 'Unverified', date: '2026-10-05', quote: 'not in the text' },
      ],
    }), upload, 'upload-1', [lawyer])!;
    expect(analysis.prepared.facts.map(fact => fact.text)).toEqual(['Exchange at library']);
    expect(analysis.relatedTaskIds).toEqual([lawyer.id]);
    expect(analysis.proposals).toHaveLength(1);
    tasks.update('m1', board => applyAnalysis(board, analysis));
    const matters = fakeMatters(matter());
    expect(tasks.read('m1').tasks[0].prepared?.summary).toBe('An exchange log.');
    expect(matters.current().timeline).toHaveLength(0);
    approveProposal({ matterId: 'm1', proposalId: analysis.proposals[0].id, matters, tasks, makeTask });
    expect(matters.current().timeline).toEqual([{ id: analysis.proposals[0].id, event: 'Child exchange at library', date: '2026-10-04' }]);
    expect(tasks.read('m1').proposals).toHaveLength(0);
  });
});

describe('store', () => {
  it('writes atomically per matter and notifies subscribers', () => {
    const tasks = tempStore();
    const seen: number[] = [];
    tasks.subscribe('m1', board => seen.push(board.tasks.length));
    tasks.write('m1', { tasks: deadlineTasks(matter()), proposals: [] });
    expect(seen).toEqual([1]);
    expect(tasks.read('other').tasks).toEqual([]);
    expect(tasks.read('../escape').tasks).toEqual([]);
    expect(() => tasks.write('../escape', { tasks: [], proposals: [] })).toThrow();
  });
});
