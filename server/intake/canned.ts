import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matterSchema, type Matter } from '../../src/data/schema';
import { localToday, materialize } from '../seed-dates';

export function cannedMatter(directory: string, practiceArea?: string): Matter {
  const pool: Matter[] = [];
  const today = localToday();
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const value: unknown = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    const parsed = matterSchema.safeParse(materialize(value, today));
    if (parsed.success && (!practiceArea || parsed.data.practiceArea === practiceArea)) pool.push(parsed.data);
  }
  if (!pool.length) throw new Error(`No complete canned synthetic matters available${practiceArea ? ` for ${practiceArea}` : ''}.`);
  return structuredClone(pool[Math.floor(Math.random() * pool.length)]);
}
