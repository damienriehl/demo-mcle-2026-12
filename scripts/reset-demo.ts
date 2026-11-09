import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mattersSchema } from '../src/data/schema';
import { localToday, materialize } from '../server/seed-dates';

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
  rmSync(join(dirname(filePath), 'comparisons'), { recursive: true, force: true });
  return matters;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const matters = resetDemo();
  console.log(`Reset demo: ${matters.length} synthetic matters materialized for today.`);
}
