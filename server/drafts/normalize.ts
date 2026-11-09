import { extname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createBlankDocx, openDocxSession } from 'docxodus/core';
import { extractTextItems, getDocumentProxy } from 'unpdf';
import { ensureEngine } from './engine';
import { convertDraft } from './convert';
import type { DraftFormat } from './types';

const unsupported = 'This file type is not supported. Upload Word, PDF, text, Markdown, .doc, .rtf, .odt, or HTML.';

function detectFormat(filename: string, bytes: Uint8Array): DraftFormat {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 4).toString() === '%PDF') return 'pdf';
  if (buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return 'doc';
  if (buffer.subarray(0, 5).toString() === '{\\rtf') return 'rtf';
  if (buffer.subarray(0, 2).toString() === 'PK') {
    // Read the ZIP directory, rather than searching compressed bytes or trusting a suffix.
    const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end >= 0 && end + 22 <= buffer.length) {
      const entries = new Map<string, { offset: number; size: number; method: number }>();
      let cursor = buffer.readUInt32LE(end + 16);
      for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
        const nameLength = buffer.readUInt16LE(cursor + 28);
        entries.set(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString(), {
          offset: buffer.readUInt32LE(cursor + 42), size: buffer.readUInt32LE(cursor + 20), method: buffer.readUInt16LE(cursor + 10),
        });
        cursor += 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
      }
      if (entries.has('word/document.xml')) return 'docx';
      const mime = entries.get('mimetype');
      if (entries.has('content.xml') && mime) {
        const start = mime.offset + 30 + buffer.readUInt16LE(mime.offset + 26) + buffer.readUInt16LE(mime.offset + 28);
        const compressed = buffer.subarray(start, start + mime.size);
        const value = mime.method === 8 ? inflateRawSync(compressed) : compressed;
        if (value.toString() === 'application/vnd.oasis.opendocument.text') return 'odt';
      }
    }
    throw new Error(unsupported);
  }
  const extensions: Record<string, DraftFormat> = { '.txt': 'txt', '.md': 'md', '.markdown': 'md', '.html': 'html', '.htm': 'html' };
  const format = extensions[extname(filename).toLowerCase()];
  if (!format) throw new Error(unsupported);
  return format;
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}\[\]<>#!|~])/g, '\\$1').replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2').replace(/^(\s*)([-+])(?=\s)/gm, '$1\\$2');
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
    throw new Error('This PDF has no text layer; upload a text PDF or the Word file.');
  }
  const furnitureKey = (text: string) => text.trim().replace(/^(?:Page\s+)?\d+(?:\s+(?:of|\/)\s*\d+)?$/i, '<page-number>');
  const repeated = new Set<string>();
  if (pages.length > 1) {
    for (const line of pages[0]) {
      const key = furnitureKey(line.text);
      if (key && pages.every(page => page.some(other => furnitureKey(other.text) === key))) repeated.add(key);
    }
  }
  const paragraphs: string[] = [];
  let paragraph = '';
  const flush = () => { if (paragraph) paragraphs.push(paragraph); paragraph = ''; };
  const headingLike = (text: string) => /^[A-Z]/.test(text) && text.length < 100 && !/[.!?;:]$/.test(text);
  for (const page of pages) {
    let previous: (typeof page)[number] | undefined;
    const left = Math.min(...page.filter(line => line.text.trim()).map(line => line.x));
    for (const line of page) {
      if (repeated.has(furnitureKey(line.text))) continue;
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
    const paragraphs = format === 'pdf' ? await pdfParagraphs(bytes) : new TextDecoder().decode(bytes).replace(/\r\n?/g, '\n').split(/\n\s*\n/);
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
    } finally { session.close(); }
  } else docx = await convertDraft(bytes, format);
  const session = openDocxSession(docx);
  try {
    const anchors = Object.entries(session.project().anchorIndex).filter(([, anchor]) => ['p', 'h', 'li'].includes(anchor.kind));
    const infos = session.getAnchorInfos(anchors.map(([id]) => id));
    const text = anchors.map(([id]) => infos[id]?.visibleText ?? '').join('\n');
    return { format, docx, text };
  } finally { session.close(); }
}
