// Federal Rules of Civil Procedure from the uscourts.gov pamphlet PDF. The pamphlet layout
// (rule headings at the left margin, indented subdivision markers, running page headers) is
// shared with the Bankruptcy Rules pamphlet, so the parser is exported for that ingester too.
import type { RuleRecord } from '../../data/rules/index';
import { downloadPdfText } from './fetch';

export const FRCP_URL = 'https://www.uscourts.gov/sites/default/files/document/federal-rules-of-civil-procedure.pdf';

export interface PamphletRule {
  number: string;
  heading: string;
  text: string;
  subdivisions: { label: string; text: string }[];
}

const HEADING = /^Rule (\d+(?:\.\d+)?)\. (.+)$/;
const MARKER = /^\((?:[a-z]{1,5}|[A-Z]{1,4}|\d{1,2})\) /;
const HISTORY = /^\((?:As amended|As added|Amended|Added|As adopted)\b/;

function isRunningHeader(line: string, title: string): boolean {
  return line.includes(title) && /\s{3,}/.test(line);
}

/**
 * Whether `next` can follow `prev` as the next rule heading. Body lines that wrap onto a
 * cross-reference ("...except as stated in / Rule 81. They should...") look like headings, so a
 * heading must advance by a lettered rule, a nearby whole rule, or the next thousand-series part.
 */
function follows(prev: string, next: string): boolean {
  const [pi, pf = '0'] = prev.split('.').map(Number);
  const [ni, nf = '0'] = next.split('.').map(Number);
  if (ni === pi) return Number(nf) > Number(pf);
  if (ni > pi && ni - pi <= 3) return true;
  return ni > 1000 && Math.floor(ni / 1000) > Math.floor(pi / 1000) && ni % 1000 === 1;
}

function joinLines(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!out) out = line;
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line;
    else if (/[—–]$/.test(out)) out += line;
    else out += ` ${line}`;
  }
  return out;
}

/** Split body lines into paragraphs: a subdivision marker opens one when the line before ended a clause. */
function paragraphs(lines: { indent: number; text: string }[]) {
  const paras: { indent: number; lines: string[] }[] = [];
  for (const l of lines) {
    const prev = paras.at(-1);
    const prevLine = prev?.lines.at(-1) ?? '';
    const opens =
      HISTORY.test(l.text) ||
      (MARKER.test(l.text) && l.indent > 0 && /([.:;—][)’”]?|\band|\bor)$/.test(prevLine.trim()));
    if (!prev || opens) paras.push({ indent: l.indent, lines: [l.text] });
    else prev.lines.push(l.text);
  }
  return paras.map((p) => ({ indent: p.indent, text: joinLines(p.lines) }));
}

/**
 * Parse pamphlet text between `startAt` (first body heading) and `stopAt` (a line that ends the rules).
 * Amendment history paragraphs and part/title banners are dropped.
 */
export function parsePamphlet(text: string, opts: { title: string; start: RegExp; stop: RegExp }): PamphletRule[] {
  const all = text.replace(/\f/g, '\n').split('\n');
  const begin = all.findIndex((l, i) => opts.start.test(l) && !/\.{4,}/.test(l) && i > 0);
  if (begin < 0) throw new Error('pamphlet: start heading not found');
  const end = all.findIndex((l, i) => i > begin && opts.stop.test(l));
  const lines = all.slice(begin, end < 0 ? undefined : end);

  const rules: { number: string; heading: string[]; body: { indent: number; text: string }[]; inHeading: boolean }[] = [];
  let banner = false;
  for (const line of lines) {
    if (!line.trim() || isRunningHeader(line, opts.title)) continue;
    const indent = line.length - line.trimStart().length;
    const text = line.trim();
    const h = HEADING.exec(line);
    const current = rules.at(-1);
    if (h && (!current || follows(current.number, h[1]))) {
      rules.push({ number: h[1], heading: [h[2]], body: [], inHeading: true });
      banner = false;
      continue;
    }
    if (/^(TITLE|PART) [IVXL]+\b/.test(text)) {
      banner = true;
      continue;
    }
    if (banner && indent >= 8 && text === text.toUpperCase()) continue;
    banner = false;
    if (!current) continue;
    if (current.inHeading && indent >= 3 && !MARKER.test(text) && !/\]$/.test(current.heading.at(-1)!)) {
      current.heading.push(text);
      continue;
    }
    current.inHeading = false;
    current.body.push({ indent, text });
  }

  return rules.map((r) => {
    const heading = joinLines(r.heading);
    const paras = paragraphs(r.body);
    const cut = paras.findIndex((p) => HISTORY.test(p.text));
    const kept = cut < 0 ? paras : paras.slice(0, cut);
    if (/^\[Abrogated/.test(heading) && kept.length === 0) {
      return { number: r.number, heading, text: heading, subdivisions: [] };
    }
    // Top-level subdivisions sit at the shallowest indent and run (a), (b), (c)... in order.
    const subdivisions: { label: string; text: string }[] = [];
    let ok = true;
    for (const p of kept) {
      const m = /^\(([a-z]+)\) /.exec(p.text);
      if (m && p.indent <= 3) {
        const expected = String.fromCharCode(97 + subdivisions.length);
        if (m[1] !== expected) ok = false;
        subdivisions.push({ label: `(${m[1]})`, text: p.text });
      } else if (subdivisions.length) {
        subdivisions[subdivisions.length - 1].text += `\n${p.text}`;
      }
    }
    return {
      number: r.number,
      heading,
      text: kept.map((p) => p.text).join('\n'),
      subdivisions: ok ? subdivisions : [],
    };
  });
}

export function pamphletVersion(text: string): string {
  const m = /(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER) (\d{1,2}), (\d{4})/.exec(
    text.slice(0, 4000),
  );
  if (!m) throw new Error('pamphlet: edition date not found');
  const month = m[1][0] + m[1].slice(1).toLowerCase();
  const short = month.length > 4 ? `${month.slice(0, 3)}.` : month;
  return `${short} ${m[2]}, ${m[3]} pamphlet`;
}

export async function ingestFrcp(): Promise<RuleRecord[]> {
  const { text, retrievedAt } = await downloadPdfText(FRCP_URL);
  const sourceVersion = pamphletVersion(text);
  const rules = parsePamphlet(text, {
    title: 'FEDERAL RULES OF CIVIL PROCEDURE',
    start: /^Rule 1\. Scope and Purpose/,
    stop: /^\s*APPENDIX OF FORMS\s*$/,
  });
  return rules.map((r) => ({
    id: `frcp:${r.number}`,
    set: 'frcp',
    number: r.number,
    citation: `Fed. R. Civ. P. ${r.number}`,
    heading: r.heading,
    text: r.text,
    subdivisions: r.subdivisions,
    sourceUrl: FRCP_URL,
    navigationUrl: `https://www.law.cornell.edu/rules/frcp/rule_${r.number}`,
    retrievedAt,
    sourceVersion,
  }));
}
