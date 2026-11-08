import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}

it('keeps model keys and request authentication headers out of fixtures and data', () => {
  const offenders = ['tests/fixtures', 'data'].flatMap(files)
    .filter((file) => /sk-ant-|x-api-key/i.test(readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
});
