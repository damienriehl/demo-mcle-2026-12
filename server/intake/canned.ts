import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matterSchema, type Matter } from '../../src/data/schema';

// The seed format uses signed calendar-day offsets, including dates in deadline inputs.
function materialize(value: unknown, today: string): unknown {
  if (typeof value === 'string' && /^[+-]\d+$/.test(value)) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(value));
    return date.toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) return value.map((item) => materialize(item, today));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, today)]));
  }
  return value;
}

export function cannedMatter(directory: string, practiceArea?: string): Matter {
  const pool: Matter[] = [];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const value: unknown = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    const parsed = matterSchema.safeParse(materialize(value, today));
    if (parsed.success && (!practiceArea || parsed.data.practiceArea === practiceArea)) pool.push(parsed.data);
  }
  if (!pool.length) throw new Error(`No complete canned synthetic matters available${practiceArea ? ` for ${practiceArea}` : ''}.`);
  return structuredClone(pool[Math.floor(Math.random() * pool.length)]);
}
