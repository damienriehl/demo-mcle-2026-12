import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createBlankDocx, openDocxSession } from 'docxodus/core';
import { extractTextItems, getDocumentProxy } from 'unpdf';
import { ensureEngine, paragraphsOf } from './engine';
import { convertDraft } from './convert';
import { DraftInputError } from './errors';
import { escapeMarkdownCharacters } from './markdown';
import type { DraftFormat } from './types';

const unsupported = 'This file type is not supported. Upload Word, PDF, text, Markdown, .doc, .rtf, .odt, or HTML.';

function detectFormat(filename: string, bytes: Uint8Array): DraftFormat {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 4).toString() === '%PDF') return 'pdf';
  if (buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return 'doc';
  if (buffer.subarray(0, 5).toString() === '{\\rtf') return 'rtf';
  if (buffer.subarray(0, 2).toString() === 'PK') {
    try {
      const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      if (end < 0 || end + 22 > buffer.length) throw new DraftInputError(unsupported);
      const entries = new Map<string, { offset: number; size: number; method: number }>();
      let cursor = buffer.readUInt32LE(end + 16);
      const directoryEnd = cursor + buffer.readUInt32LE(end + 12);
      if (directoryEnd > end) throw new DraftInputError(unsupported);
      for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
        if (cursor + 46 > directoryEnd || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new DraftInputError(unsupported);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const next = cursor + 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
        if (next > directoryEnd) throw new DraftInputError(unsupported);
        entries.set(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString(), {
          offset: buffer.readUInt32LE(cursor + 42), size: buffer.readUInt32LE(cursor + 20), method: buffer.readUInt16LE(cursor + 10),
        });
        cursor = next;
      }
      if (entries.has('word/document.xml')) return 'docx';
      const mime = entries.get('mimetype');
      if (entries.has('content.xml') && mime) {
        if (mime.offset + 30 > buffer.length || buffer.readUInt32LE(mime.offset) !== 0x04034b50) throw new DraftInputError(unsupported);
        const start = mime.offset + 30 + buffer.readUInt16LE(mime.offset + 26) + buffer.readUInt16LE(mime.offset + 28);
        if (start + mime.size > buffer.length) throw new DraftInputError(unsupported);
        const compressed = buffer.subarray(start, start + mime.size);
        const value = mime.method === 8 ? inflateRawSync(compressed, { maxOutputLength: 128 }) : compressed;
        if (value.toString() === 'application/vnd.oasis.opendocument.text') return 'odt';
      }
    } catch {
      throw new DraftInputError(unsupported);
    }
    throw new DraftInputError(unsupported);
  }
  const extensions: Record<string, DraftFormat> = { '.txt': 'txt', '.md': 'md', '.markdown': 'md', '.html': 'html', '.htm': 'html' };
  const format = extensions[extname(filename).toLowerCase()];
  if (!format) throw new DraftInputError(unsupported);
  return format;
}

function escapeMarkdown(text: string): string {
  return escapeMarkdownCharacters(text).replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2').replace(/^(\s*)([-+])(?=\s)/gm, '$1\\$2');
}

async function pdfParagraphs(bytes: Uint8Array): Promise<string[]> {
  const document = await getDocumentProxy(bytes.slice());
  let pages: { text: string; x: number; y: number; height: number }[][];
  try {
    const { items } = await extractTextItems(document);
    pages = items.map(page => {
      const lines: { text: string; x: number; y: number; height: number }[] = [];
      for (const item of page) {
        const previous = lines.at(-1);
        if (previous && Math.abs(previous.y - item.y) < 1) previous.text += item.str;
        else lines.push({ text: item.str, x: item.x, y: item.y, height: item.fontSize });
      }
      return lines;
    });
  } finally { await document.loadingTask.destroy(); }
  if (!pages.some(page => page.some(line => line.text.trim()))) {
    throw new DraftInputError('This PDF has no text layer; upload a text PDF or the Word file.');
  }
  const furnitureKey = (text: string) => text.trim().replace(/^(?:Page\s+)?\d+(?:\s+(?:of|\/)\s*\d+)?$/i, '<page-number>');
  const furniture = pages.map(page => {
    const positioned = page.filter(line => line.text.trim()).sort((a, b) => b.y - a.y);
    return new Set([...positioned.slice(0, 2), ...positioned.slice(-2)]);
  });
  const repeated = new Set<string>();
  if (pages.length > 1) {
    for (const line of furniture[0]) {
      const key = furnitureKey(line.text);
      if (key && furniture.every(lines => [...lines].some(other => furnitureKey(other.text) === key))) repeated.add(key);
    }
  }
  const paragraphs: string[] = [];
  let paragraph = '';
  const flush = () => { if (paragraph) paragraphs.push(paragraph); paragraph = ''; };
  const headingLike = (text: string) => /^[A-Z]/.test(text) && text.length < 100 && !/[.!?;:]$/.test(text);
  for (const [pageIndex, page] of pages.entries()) {
    let previous: (typeof page)[number] | undefined;
    const left = Math.min(...page.filter(line => line.text.trim()).map(line => line.x));
    for (const line of page) {
      if (furniture[pageIndex].has(line) && repeated.has(furnitureKey(line.text))) continue;
      const text = line.text.trim();
      if (!text) { flush(); continue; }
      const gap = previous && Math.abs(previous.y - line.y) > Math.max(previous.height, line.height) * 2;
      const heading = /[.!?;:]$/.test(paragraph) && (line.x > left + 3 || headingLike(text));
      if (gap || heading) flush();
      paragraph += (paragraph ? ' ' : '') + text;
      previous = line;
    }
  }
  flush();
  return paragraphs;
}

export async function normalizeDraft({ filename, bytes }: { filename: string; bytes: Uint8Array }) {
  const format = detectFormat(filename, bytes);
  await ensureEngine();
  let docx: Uint8Array;
  if (format === 'docx') docx = bytes;
  else if (format === 'txt' || format === 'md' || format === 'pdf') {
    const paragraphs = format === 'pdf' ? await pdfParagraphs(bytes) : new TextDecoder().decode(bytes).replace(/\r\n?/g, '\n').split(/\n\s*\n/).filter(paragraph => paragraph.trim());
    if (!paragraphs.length) throw new DraftInputError('This draft has no text.');
    const session = openDocxSession(createBlankDocx());
    try {
      let anchor = Object.keys(session.project().anchorIndex)[0];
      for (const [index, paragraph] of paragraphs.entries()) {
        const markdown = format === 'md' ? paragraph.replace(/\n/g, ' ') : escapeMarkdown(paragraph);
        const result = index === 0 ? session.replaceText(anchor, markdown) : session.insertParagraph(anchor, 'after', markdown);
        if (!result.success) throw new Error(result.error?.message || 'Could not build the draft document.');
        anchor = (result.created.at(-1) ?? result.modified.at(-1))!.id;
        const heading = format === 'md' && /^(#{1,6})\s/.exec(markdown);
        if (heading) {
          // Materialize the Word style definition so comparison retains the heading.
          const styled = session.setParagraphStyle(anchor, `Heading${heading[1].length}`);
          if (!styled.success) throw new Error(styled.error?.message || 'Could not style the draft heading.');
        }
      }
      docx = session.save();
      return { format, docx, text: paragraphsOf(session).map(paragraph => paragraph.text).join('\n') };
    } finally { session.close(); }
  } else docx = await convertDraft(bytes, format);
  const session = openDocxSession(docx);
  try {
    const text = paragraphsOf(session).map(paragraph => paragraph.text).join('\n');
    return { format, docx, text };
  } finally { session.close(); }
}
