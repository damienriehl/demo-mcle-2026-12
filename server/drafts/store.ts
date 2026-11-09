import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { comparisonRecordSchema, type ComparisonRecord } from './types';

type DocumentName = 'earlier' | 'later' | 'redline';

export const DEFAULT_COMPARISONS_DIRECTORY = 'data/comparisons';

/** Each record is published after its documents; readers never see a partial JSON write. */
export function createComparisonStore(directory = resolve(DEFAULT_COMPARISONS_DIRECTORY)) {
  function folder(matterId: string, id: string) {
    if (![matterId, id].every(value => /^[\w-]+$/.test(value))) throw new Error('Invalid comparison location.');
    return join(directory, matterId, id);
  }
  async function atomic(path: string, bytes: string | Uint8Array) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  }
  async function update(value: ComparisonRecord): Promise<ComparisonRecord> {
    const record = comparisonRecordSchema.parse(value);
    await atomic(join(folder(record.matterId, record.comparisonId), 'record.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  }
  return {
    async create(record: ComparisonRecord, documents: Record<DocumentName, Uint8Array>) {
      comparisonRecordSchema.parse(record);
      const path = folder(record.matterId, record.comparisonId);
      await mkdir(path, { recursive: true });
      for (const name of ['earlier', 'later', 'redline'] as const) await atomic(join(path, `${name}.docx`), documents[name]);
      return update(record);
    },
    async get(matterId: string, id: string): Promise<ComparisonRecord | undefined> {
      try {
        return comparisonRecordSchema.parse(JSON.parse(await readFile(join(folder(matterId, id), 'record.json'), 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    update,
    async readDocument(matterId: string, id: string, name: DocumentName): Promise<Uint8Array> {
      return new Uint8Array(await readFile(join(folder(matterId, id), `${name}.docx`)));
    },
  };
}
