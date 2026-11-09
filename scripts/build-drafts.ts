import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { normalizeDraft } from '../server/drafts/normalize';

const directory = new URL('../data/seed/drafts/', import.meta.url);
const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Blank Markdown documents have three package/style/settings relationships, with random
// IDs and no in-document references. Canonicalize those IDs and rebuild their ZIP records.
function deterministicDocx(bytes: Uint8Array): Buffer {
  const zip = Buffer.from(bytes);
  const endOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let cursor = zip.readUInt32LE(endOffset + 16);
  const localParts: Buffer[] = [];
  const directoryParts: Buffer[] = [];
  let offset = 0;
  for (let index = 0; index < zip.readUInt16LE(endOffset + 10); index++) {
    const nameLength = zip.readUInt16LE(cursor + 28);
    const recordLength = 46 + nameLength + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32);
    const record = Buffer.from(zip.subarray(cursor, cursor + recordLength));
    const name = record.subarray(46, 46 + nameLength).toString();
    const localOffset = record.readUInt32LE(42);
    const headerLength = 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const header = Buffer.from(zip.subarray(localOffset, localOffset + headerLength));
    let compressed = zip.subarray(localOffset + headerLength, localOffset + headerLength + record.readUInt32LE(20));
    if (name.endsWith('.rels')) {
      let relationship = 0;
      const xml = inflateRawSync(compressed).toString('utf8').replace(/Id="[^"]+"/g, () => `Id="rId${++relationship}"`);
      const content = Buffer.from(xml);
      compressed = deflateRawSync(content);
      for (const [target, crcOffset, sizeOffset] of [[header, 14, 18], [record, 16, 20]] as const) {
        target.writeUInt32LE(crc32(content), crcOffset);
        target.writeUInt32LE(compressed.length, sizeOffset);
        target.writeUInt32LE(content.length, sizeOffset + 4);
      }
    }
    record.writeUInt32LE(offset, 42);
    localParts.push(header, compressed);
    directoryParts.push(record);
    offset += header.length + compressed.length;
    cursor += recordLength;
  }
  const directory = Buffer.concat(directoryParts);
  const end = Buffer.from(zip.subarray(endOffset));
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

for (const folder of (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  for (const side of ['earlier', 'later']) {
    const source = new URL(`${folder.name}/${side}.md`, directory);
    const { docx } = await normalizeDraft({ filename: `${side}.md`, bytes: await readFile(source) });
    await writeFile(new URL(`${folder.name}/${side}.docx`, directory), deterministicDocx(docx));
    console.log(`Built ${folder.name}/${side}.docx`);
  }
  if (folder.name !== 'litigation-settlement') continue;
  const markdown = await readFile(new URL(`${folder.name}/later.md`, directory), 'utf8');
  const body = markdown.trim().split(/\n\s*\n/).map(block => {
    const heading = /^(#{1,2})\s+(.+)$/.exec(block);
    return heading ? `<h${heading[1].length}>${escapeHtml(heading[2])}</h${heading[1].length}>` : `<p>${escapeHtml(block.replace(/\n/g, ' '))}</p>`;
  }).join('\n');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Paragraph gaps exceed the PDF normalizer's line-gap threshold, preserving source blocks.
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><title>Fictional settlement</title><style>
      @page { size: Letter; margin: 0.6in; }
      body { font: 11pt/1.25 Arial, sans-serif; }
      h1, h2, p { margin: 0 0 22pt; }
      h1 { font-size: 16pt; } h2 { font-size: 13pt; }
      p { break-inside: avoid; } h1, h2 { break-after: avoid; }
    </style></head><body>${body}</body></html>`);
    const pdf = await page.pdf({ format: 'Letter', printBackground: true });
    // Chromium's clock metadata has fixed width, so canonicalizing it preserves PDF offsets.
    const deterministic = Buffer.from(pdf.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, match => match.replace(/D:[^)]*/, value => 'D:20000101000000Z'.padEnd(value.length, ' '))), 'latin1');
    const output = new URL(`${folder.name}/later.pdf`, directory);
    await writeFile(output, deterministic);
    console.log(`Built ${fileURLToPath(output)}`);
  } finally { await browser.close(); }
}
