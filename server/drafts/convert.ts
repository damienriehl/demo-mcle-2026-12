import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { DraftFormat } from './types';
import { DraftInputError } from './errors';

const run = promisify(execFile);
const unavailable = 'This server has no converter for .doc, .rtf, .odt, or HTML files. Upload Word, PDF, text, or Markdown instead.';

async function executable(): Promise<string | undefined> {
  const command = process.env.MATTER_COCKPIT_SOFFICE || 'soffice';
  const candidates = command.includes('/') ? [resolve(command)] : (process.env.PATH || '').split(delimiter).map(dir => join(dir, command));
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch {}
  }
}

export async function converterAvailable(): Promise<boolean> {
  return Boolean(await executable());
}

export async function convertDraft(bytes: Uint8Array, format: DraftFormat): Promise<Uint8Array> {
  const exe = await executable();
  if (!exe) throw new DraftInputError(unavailable);
  const dir = await mkdtemp(join(tmpdir(), 'matter-draft-'));
  try {
    const input = join(dir, `draft.${format}`);
    await writeFile(input, bytes);
    const inputFilter = format === 'html' ? ['--infilter=HTML (StarWriter)'] : [];
    await run(exe, ['--headless', ...inputFilter, '--convert-to', 'docx:MS Word 2007 XML', '--outdir', dir, input], { timeout: 60_000 });
    return new Uint8Array(await readFile(join(dir, 'draft.docx')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
