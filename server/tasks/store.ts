import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TaskBoard } from '../../src/features/task-board/types';

export const DEFAULT_TASKS_DIRECTORY = 'data/tasks';
type Listener = (board: TaskBoard) => void;

const safeId = (matterId: string) => {
  if (!/^[A-Za-z0-9._-]+$/.test(matterId) || matterId.startsWith('.')) throw new Error('Invalid matter id');
  return matterId;
};

/** One JSON file per matter, written atomically through a temp file and rename. */
export function createTaskStore(directory: string) {
  const listeners = new Map<string, Set<Listener>>();
  const file = (matterId: string) => join(directory, `${safeId(matterId)}.json`);
  function read(matterId: string): TaskBoard {
    try {
      const parsed = JSON.parse(readFileSync(file(matterId), 'utf8')) as Partial<TaskBoard>;
      return { tasks: parsed.tasks ?? [], proposals: parsed.proposals ?? [], ...(parsed.outbox ? { outbox: parsed.outbox } : {}), ...(parsed.prefs ? { prefs: parsed.prefs } : {}) };
    } catch { return { tasks: [], proposals: [] }; }
  }
  function write(matterId: string, board: TaskBoard) {
    mkdirSync(directory, { recursive: true });
    const target = file(matterId);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(board, null, 2)}\n`);
    renameSync(temp, target);
    listeners.get(matterId)?.forEach(listener => listener(board));
    return board;
  }
  /** Merges the change over the current board, so outbox and preferences survive task-only updates. */
  function update(matterId: string, change: (board: TaskBoard) => TaskBoard) {
    const current = read(matterId);
    return write(matterId, { ...current, ...change(current) });
  }
  function subscribe(matterId: string, listener: Listener) {
    const set = listeners.get(matterId) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(matterId, set);
    return () => { set.delete(listener); };
  }
  return { read, write, update, subscribe };
}
export type TaskStore = ReturnType<typeof createTaskStore>;

const KEY = Symbol.for('matter-cockpit.task-store');
const globals = globalThis as typeof globalThis & { [KEY]?: TaskStore };
export function getTaskStore(): TaskStore {
  return globals[KEY] ??= createTaskStore(resolve(process.env.MATTER_COCKPIT_TASKS_DIR ?? DEFAULT_TASKS_DIRECTORY));
}
