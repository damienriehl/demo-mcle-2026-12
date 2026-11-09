import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { load } from 'cheerio';
import { getRevisions, openDocxSession } from 'docxodus/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureEngine } from '../server/drafts/engine';
import { normalizeDraft } from '../server/drafts/normalize';
import { compareDrafts } from '../server/drafts/compare';
import { converterAvailable } from '../server/drafts/convert';
import { sanitizeHtml } from '../server/drafts/html';

const scratch: string[] = [];
const utf8 = (text: string) => new TextEncoder().encode(text);
const draft = (text: string, filename = 'draft.txt') => normalizeDraft({ filename, bytes: utf8(text) });
async function word(text: string, filename = 'draft.txt') {
  return normalizeDraft({ filename: 'draft.docx', bytes: (await draft(text, filename)).docx });
}

// A small real PDF with positioned lines, including blank lines and page furniture.
function pdf(pages: string[][]): Uint8Array {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids: string[] = [];
  for (const lines of pages) {
    const pageId = objects.length + 1;
    kids.push(`${pageId} 0 R`);
    const content = lines.map((line, i) => {
      const indent = line.length - line.trimStart().length;
      const escaped = line.trimStart().replace(/([\\()])/g, '\\$1');
      return `BT /F1 12 Tf 1 0 0 1 ${40 + indent * 6} ${740 - i * 18} Tm (${escaped}) Tj ET`;
    }).join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  return utf8(`${body}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
}

// Stored ZIP entries suffice for format sniffing; the converter owns ODT parsing.
function odt(): Uint8Array {
  const entries = [['mimetype', 'application/vnd.oasis.opendocument.text'], ['content.xml', '<document/>']];
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt32LE(content.length, 20);
    directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, Buffer.from(name), Buffer.from(content));
    central.push(directory, Buffer.from(name));
    offset += header.length + name.length + content.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

afterEach(() => {
  vi.unstubAllEnvs();
  scratch.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
});

describe('draft engine', () => {
  it('shares initialization across concurrent callers and module reloads', async () => {
    const first = ensureEngine();
    expect(ensureEngine()).toBe(first);
    await first;
    vi.resetModules();
    const reloaded = await import('../server/drafts/engine');
    expect(reloaded.ensureEngine()).toBe(first);
  });

  it('groups an edited sentence into one replace with full paragraph text and a later-draft anchor', async () => {
    const earlier = await word('The buyer shall pay within thirty days.');
    const later = await word('The buyer shall pay within sixty days.');
    const result = await compareDrafts(earlier, later);
    expect(result.formattingCompared).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ changeId: 'c1', kind: 'replace', earlierText: earlier.text, laterText: later.text });
    const session = openDocxSession(later.docx);
    try { expect(session.getAnchorInfo(result.changes[0].anchorId)?.visibleText).toBe(later.text); } finally { session.close(); }
    const $ = load(result.html);
    expect($('p[data-change-id="c1"]').length).toBe(1);
    expect((await getRevisions(result.redline)).length).toBeGreaterThan(0);
    expect((await getRevisions(result.redline)).every(rev => rev.author === 'Other side')).toBe(true);
  });

  it('pairs a clause moved from Section 7 to Section 3 and links both HTML ends', async () => {
    const clause = 'The recipient shall keep all confidential information secure and shall disclose it only to authorized employees.';
    const sections = Array.from({ length: 7 }, (_, i) => `Section ${i + 1}.\n\nThe parties agree to the obligations of section ${i + 1}.`);
    const before = sections.map((section, i) => section + (i === 6 ? `\n\n${clause}` : '')).join('\n\n');
    const after = sections.map((section, i) => section + (i === 2 ? `\n\n${clause}` : '')).join('\n\n');
    const later = await word(after);
    const result = await compareDrafts(await word(before), later);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ changeId: 'c1', kind: 'move', earlierText: clause, laterText: clause });
    expect(result.changes[0].moveFromAnchorId).toBeTruthy();
    const $ = load(result.html);
    for (const selector of ['.rev-move-from', '.rev-move-to']) {
      expect($(selector).length).toBeGreaterThan(0);
      expect($(selector).attr('data-change-id')).toBe('c1');
      expect($(selector).closest('[data-anchor]').attr('data-change-id')).toBe('c1');
    }
    const session = openDocxSession(later.docx);
    try { expect(session.getAnchorInfo(result.changes[0].anchorId)?.visibleText).toBe(clause); } finally { session.close(); }
  });

  it('renders the deleted deposit before its replacement insertion', async () => {
    const result = await compareDrafts(await word('deposit $240,000'), await word('deposit $360,000'));
    const $ = load(result.html);
    expect($('del.rev-del').text()).toBe('$240,000');
    expect($('ins.rev-ins').text()).toBe('$360,000');
    expect($('del.rev-del').next().is('ins.rev-ins')).toBe(true);
  });

  it('groups paragraph insertions and deletions in first-appearance order', async () => {
    const earlier = await word('Agreement.\n\nThe buyer shall provide a quarterly forecast.\n\nAll invoices are payable on receipt.');
    const later = await word('Agreement.\n\nAll invoices are payable on receipt.\n\nThe supplier shall provide an annual compliance certificate.');
    const result = await compareDrafts(earlier, later);
    expect(result.changes.map(({ changeId, kind, earlierText, laterText }) => ({ changeId, kind, earlierText, laterText }))).toEqual([
      { changeId: 'c1', kind: 'delete', earlierText: 'The buyer shall provide a quarterly forecast.', laterText: '' },
      { changeId: 'c2', kind: 'insert', earlierText: '', laterText: 'The supplier shall provide an annual compliance certificate.' },
    ]);
    const $ = load(result.html);
    expect($('[data-change-id="c1"]').length).toBeGreaterThan(0);
    expect($('[data-change-id="c2"]').length).toBeGreaterThan(0);
  });

  it('compares Word formatting and removes format-only changes for Markdown input', async () => {
    const source = 'The buyer shall pay on delivery.\n\nThe supplier shall keep records.';
    const formatted = '**The buyer shall pay on delivery.**\n\n*The supplier shall keep records.*';
    const earlier = await word(source);
    const later = await word(formatted, 'draft.md');
    const compared = await compareDrafts(earlier, later);
    expect(compared.formattingCompared).toBe(true);
    expect(compared.changes.map(change => change.kind)).toEqual(['format', 'format']);
    for (const change of compared.changes) expect(change.earlierText).toBe(change.laterText);
    const plain = await compareDrafts(earlier, await draft(formatted, 'draft.md'));
    expect(plain.formattingCompared).toBe(false);
    expect(plain.changes).toEqual([]);
    expect((await getRevisions(plain.redline)).filter(revision => revision.type === 'format')).toEqual([]);
  });

  it('rebuilds wrapped PDF paragraphs, removes repeated headers and page numbers, and compares only authored edits', async () => {
    const earlier = await word('Section 1. Payment\n\nThe buyer shall pay within thirty days after delivery of the goods.\n\nSection 2. Confidentiality\n\nThe recipient shall keep ______ and [___] * literal.');
    const later = await normalizeDraft({ filename: 'renamed.txt', bytes: pdf([
      ['DRAFT AGREEMENT', 'Section 1. Payment', '', 'The buyer shall pay within sixty days', 'after delivery of the goods.', 'Page 1'],
      ['DRAFT AGREEMENT', '  Section 2. Confidentiality', '', 'The recipient shall keep ______', 'and [___] * literal.', 'Page 2'],
    ]) });
    expect(later.format).toBe('pdf');
    expect(later.text).toBe(earlier.text.replace('thirty', 'sixty'));
    const result = await compareDrafts(earlier, later);
    expect(result.formattingCompared).toBe(false);
    expect(result.formattingNote).toBe('Formatting was not compared because one draft was not a Word file.');
    expect(result.changes.map(change => change.kind)).toEqual(['replace']);
    expect(result.changes[0].earlierText).toBe('The buyer shall pay within thirty days after delivery of the goods.');
    expect(result.changes[0].laterText).toBe('The buyer shall pay within sixty days after delivery of the goods.');
  });

  it('preserves plain text Markdown punctuation and leading numbering literally', async () => {
    const text = '______ [___] * literal\n\n1. A numbered clause.\n\n# A literal heading';
    const result = await draft(text);
    expect(result.text).toBe(text.replaceAll('\n\n', '\n'));
    expect((await normalizeDraft({ filename: 'misnamed.bin', bytes: result.docx })).text).toBe(result.text);
    const session = openDocxSession(result.docx);
    try { expect(session.project().markdown).not.toContain('li:body:'); } finally { session.close(); }
  });

  it('keeps Markdown headings as headings and uses one paragraph per block', async () => {
    const headings = ['Title', 'Section 1. Heading', 'Third level', 'Fourth level', 'Fifth level', 'Sixth level'];
    const markdown = headings.map((text, index) => `${'#'.repeat(index + 1)} ${text}`).join('\n\n');
    const result = await draft(`${markdown}\n\nThe buyer **shall** pay\non delivery.`, 'draft.markdown');
    expect(result.text).toBe([...headings, 'The buyer shall pay on delivery.'].join('\n'));
    const session = openDocxSession(result.docx);
    try {
      const anchors = Object.entries(session.project().anchorIndex).filter(([, anchor]) => ['p', 'h', 'li'].includes(anchor.kind));
      expect(anchors.slice(0, 6).map(([id]) => session.getBlockMetadata(id)?.styleId)).toEqual([
        'Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6',
      ]);
      expect(session.getBlockMetadata(anchors[6][0])?.styleId ?? 'Normal').toBe('Normal');
    } finally { session.close(); }
    const later = await draft(`${markdown}\n\nThe buyer **shall** pay\nwithin thirty days.`, 'draft.md');
    const $ = load((await compareDrafts(result, later)).html);
    headings.forEach((text, index) => expect($(`.docx-Heading${index + 1}`).text()).toBe(text));
  });

  it('refuses PDFs with no text layer', async () => {
    await expect(normalizeDraft({ filename: 'scan.pdf', bytes: pdf([[]]) })).rejects.toThrow('This PDF has no text layer; upload a text PDF or the Word file.');
  });

  it('refuses unsupported formats', async () => {
    await expect(draft('unknown', 'draft.bin')).rejects.toThrow('This file type is not supported. Upload Word, PDF, text, Markdown, .doc, .rtf, .odt, or HTML.');
  });

  it('refuses legacy formats without a converter while text and Markdown still compare', async () => {
    vi.stubEnv('MATTER_COCKPIT_SOFFICE', '/missing/draft-converter');
    expect(await converterAvailable()).toBe(false);
    await expect(draft('{\\rtf1 text}', 'misnamed.txt')).rejects.toThrow('This server has no converter for .doc, .rtf, .odt, or HTML files. Upload Word, PDF, text, or Markdown instead.');
    const result = await compareDrafts(await draft('Payment is due.'), await draft('Payment is overdue.', 'draft.md'));
    expect(result.changes.map(change => change.kind)).toEqual(['replace']);
    expect(result.formattingCompared).toBe(false);
  });

  it.each([
    { format: 'odt', bytes: odt() },
    { format: 'html', bytes: utf8('<html><body><p>Converted agreement.</p></body></html>') },
  ])('converts detected $format input with the configured executable and filters', async ({ format, bytes }) => {
    const dir = mkdtempSync(join(tmpdir(), 'draft-converter-test-'));
    scratch.push(dir);
    const prepared = (await word('Converted agreement.')).docx;
    writeFileSync(join(dir, 'prepared.docx'), prepared);
    const exe = join(dir, 'soffice');
    writeFileSync(exe, `#!/bin/sh\nprintf '%s\\n' "$@" > '${dir}/args'\nwhile [ "$1" != '--outdir' ]; do shift; done\nshift\ncp '${dir}/prepared.docx' "$1/draft.docx"\n`);
    chmodSync(exe, 0o755);
    vi.stubEnv('MATTER_COCKPIT_SOFFICE', exe);
    expect(await converterAvailable()).toBe(true);
    const result = await normalizeDraft({ filename: format === 'html' ? 'draft.html' : 'misnamed.txt', bytes });
    expect(result.format).toBe(format);
    expect(result.docx).toEqual(prepared);
    expect(result.text).toBe('Converted agreement.');
    const args = readFileSync(join(dir, 'args'), 'utf8');
    if (format === 'html') expect(args).toContain('--infilter=HTML (StarWriter)\n');
    else expect(args).not.toContain('--infilter');
    expect(args).toContain('--convert-to\ndocx:MS Word 2007 XML\n');
  });

  it.each([
    { securityOptions: '[name=seccomp,profile=builtin name=rootless]', user: '0:0' },
    { securityOptions: '[name=seccomp,profile=builtin]', user: `${process.getuid!()}:${process.getgid!()}` },
  ])('runs the container as $user for Docker security options $securityOptions', async ({ securityOptions, user }) => {
    const dir = mkdtempSync(join(tmpdir(), 'draft-docker-test-'));
    scratch.push(dir);
    const docker = join(dir, 'docker');
    writeFileSync(docker, `#!/bin/sh\nif [ "$1" = info ]; then\n  printf '%s\\n' "$@" > '${dir}/info-args'\n  printf '%s\\n' '${securityOptions}'\nelse\n  printf '%s\\n' "$@" > '${dir}/run-args'\nfi\n`);
    chmodSync(docker, 0o755);
    await promisify(execFile)(resolve('scripts/soffice-container.sh'), ['--version'], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
    expect(readFileSync(join(dir, 'run-args'), 'utf8')).toContain(`--user\n${user}\n`);
    expect(readFileSync(join(dir, 'run-args'), 'utf8')).toContain('--network\nnone\n');
    expect(readFileSync(join(dir, 'info-args'), 'utf8')).toBe('info\n--format\n{{.SecurityOptions}}\n');
  });

  it('sanitizes active HTML and external URLs while retaining revision links and image data', () => {
    const $ = load(sanitizeHtml('<style>p{color:red}</style><script>alert(1)</script><iframe></iframe><object></object><embed><p data-change-id="c1" onclick="bad()"><a href="javascript:bad()">bad</a><a href="https://example.invalid">external</a><a href="#c1">jump</a><img src="data:image/png;base64,AA==" onerror="bad()"><img src="https://example.invalid/a.png"></p>'));
    expect($('script,style,iframe,object,embed').length).toBe(0);
    expect($('[onclick],[onerror]').length).toBe(0);
    expect($('a').map((_, el) => $(el).attr('href')).get()).toEqual(['#c1']);
    expect($('img').map((_, el) => $(el).attr('src')).get()).toEqual(['data:image/png;base64,AA==']);
    expect($('p').attr('data-change-id')).toBe('c1');
  });

  it('orders adjacent replacement markup across whitespace without changing moves or intervening text', () => {
    const $ = load(sanitizeHtml('<p id="replacement"><ins class="rev-ins">new</ins> \n <del class="rev-del">old</del></p><p id="separate"><ins class="rev-ins">new</ins> unchanged <del class="rev-del">old</del></p><p id="move"><ins class="rev-move-to" data-move-id="m1">moved</ins> <del class="rev-move-from" data-move-id="m1">moved</del></p>'));
    expect($('#replacement').text()).toBe('old \n new');
    expect($('#replacement').children().map((_, el) => el.tagName).get()).toEqual(['del', 'ins']);
    expect($('#separate').text()).toBe('new unchanged old');
    expect($('#move').html()).toBe('<ins class="rev-move-to" data-move-id="m1">moved</ins> <del class="rev-move-from" data-move-id="m1">moved</del>');
  });
});
