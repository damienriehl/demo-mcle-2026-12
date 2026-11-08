import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mattersSchema } from '../src/data/schema';

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

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function resetDemo({
  seedDirectory = resolve('data/seed/matters'),
  filePath = resolve('data/matters.json'),
  today = localToday(),
}: { seedDirectory?: string; filePath?: string; today?: string } = {}) {
  let files: string[];
  try { files = readdirSync(seedDirectory).filter((file) => file.endsWith('.json')).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    files = [];
  }
  const matters = mattersSchema.parse(files.map((file) =>
    materialize(JSON.parse(readFileSync(join(seedDirectory, file), 'utf8')), today)));
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(`${filePath}.tmp`, `${JSON.stringify(matters, null, 2)}\n`);
  renameSync(`${filePath}.tmp`, filePath);
  return matters;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const matters = resetDemo();
  console.log(`Reset demo: ${matters.length} synthetic matters materialized for today.`);
}
