import { mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { mattersSchema, matterSchema, type Matter, type MatterWithDeadlines } from '../src/data/schema';
import type { DeadlineEngine } from '../src/data/engine-types';
import { computeDeadline, deadlineCatalog } from '../src/engine/index';

export class StoreValidationError extends Error {
  readonly name = 'StoreValidationError';
}

function readableError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.flatMap((issue) => {
      const paths = issue.code === 'unrecognized_keys' ? issue.keys.map((key) => [...issue.path, key]) : [issue.path];
      return paths.map((path) => `${path.join('.') || '$'}: ${issue.message}`);
    }).join('; ');
  }
  return `$: ${error instanceof Error ? error.message : String(error)}`;
}

export type MatterStore = ReturnType<typeof createMatterStore>;
export type StoreOptions = {
  filePath: string;
  engine?: DeadlineEngine;
  logError?: (message: string) => void;
};

export function createMatterStore({ filePath, engine: initialEngine, logError = console.error }: StoreOptions) {
  let engine = initialEngine;
  let matters: Matter[] = [];
  const listeners = new Set<(matters: MatterWithDeadlines[]) => void>();
  mkdirSync(dirname(filePath), { recursive: true });

  function validate(value: unknown): Matter[] {
    const parsed = mattersSchema.parse(value);
    const known = new Set(engine?.deadlineCatalog().map((rule) => rule.id));
    parsed.forEach((matter, index) => matter.deadlines.forEach((deadline, deadlineIndex) => {
      if (deadline.deadlineRuleId !== 'none' && !known.has(deadline.deadlineRuleId)) {
        throw new StoreValidationError(`${index}.deadlines.${deadlineIndex}.deadlineRuleId: unknown catalog rule ${deadline.deadlineRuleId}`);
      }
    }));
    return parsed;
  }

  function withDeadlines(matter: Matter): MatterWithDeadlines {
    return {
      ...matter,
      computedDeadlines: Object.fromEntries(matter.deadlines.map((deadline) => [deadline.id,
        deadline.deadlineRuleId === 'none'
          ? { status: 'uncomputable', reason: 'No deadline rule selected.', steps: [] }
          : engine!.computeDeadline(deadline),
      ])),
    };
  }

  function list(): MatterWithDeadlines[] {
    return structuredClone(matters).map(withDeadlines);
  }

  function broadcast() {
    if (!listeners.size) return;
    const snapshot = list();
    for (const listener of listeners) listener(snapshot);
  }

  function reload() {
    try {
      const next = validate(JSON.parse(readFileSync(filePath, 'utf8')));
      if (JSON.stringify(next) === JSON.stringify(matters)) return;
      matters = next;
      broadcast();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logError(`[matters] ${filePath}: ${readableError(error)}; keeping last good state`);
      }
    }
  }

  function persist(next: unknown) {
    let parsed: Matter[];
    try { parsed = validate(next); }
    catch (error) { throw new StoreValidationError(readableError(error)); }
    // Atomic replacement prevents the watcher or Claude Code from seeing a partial server write.
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(parsed, null, 2)}\n`);
    renameSync(temporary, filePath);
    matters = parsed;
    broadcast();
  }

  reload();
  // Watch the directory so atomic replacements keep being observed.
  const watcher = watch(dirname(filePath), { persistent: false }, (_event, filename) => {
    if (filename === null || resolve(dirname(filePath), filename.toString()) === resolve(filePath)) reload();
  });

  return {
    list,
    get(id: string) {
      const matter = matters.find((existing) => existing.id === id);
      return matter && withDeadlines(structuredClone(matter));
    },
    upsert(value: unknown) {
      let matter: Matter;
      try { matter = matterSchema.parse(value); }
      catch (error) { throw new StoreValidationError(readableError(error)); }
      reload();
      const next = matters.filter((existing) => existing.id !== matter.id);
      const index = matters.findIndex((existing) => existing.id === matter.id);
      next.splice(index < 0 ? next.length : index, 0, matter);
      persist(next);
      return this.get(matter.id)!;
    },
    remove(id: string) {
      reload();
      if (!matters.some((matter) => matter.id === id)) return false;
      persist(matters.filter((matter) => matter.id !== id));
      return true;
    },
    subscribe(listener: (matters: MatterWithDeadlines[]) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setEngine(nextEngine: DeadlineEngine) {
      engine = nextEngine;
      reload();
      broadcast();
    },
    close() { watcher.close(); listeners.clear(); },
  };
}

const STORE_KEY = Symbol.for('matter-cockpit.matter-store');
const globals = globalThis as typeof globalThis & { [STORE_KEY]?: MatterStore };

export function getMatterStore(): MatterStore {
  return globals[STORE_KEY] ??= createMatterStore({ filePath: resolve('data/matters.json'), engine: { computeDeadline, deadlineCatalog } });
}
