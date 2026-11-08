// Minnesota Rules of Civil Procedure and General Rules of Practice from revisor.mn.gov per-rule
// pages. Each page holds the rule (sub_rule blocks such as id="6.01"), then advisory committee
// comments; amendment-history paragraphs close each subrule. Only the rule text is kept.
import * as cheerio from 'cheerio';
import type { RuleRecord, RuleSet } from '../../data/rules/index';
import { downloadText, squash } from './fetch';

const BASE = 'https://www.revisor.mn.gov/court_rules';
const HISTORY = /^\((?:Amended|Added|Adopted|Effective|Renumbered|Abrogated|Former)\b[^)]*\)?/i;

interface Family {
  set: Extract<RuleSet, 'mn-civ' | 'mn-gp'>;
  code: 'cp' | 'gp';
  citation: string;
}

const FAMILIES: Family[] = [
  { set: 'mn-civ', code: 'cp', citation: 'Minn. R. Civ. P.' },
  { set: 'mn-gp', code: 'gp', citation: 'Minn. Gen. R. Prac.' },
];

/** Rule numbers listed in the table of headnotes (forms and appendices excluded). */
function ruleNumbers(toc: string, code: string): string[] {
  const seen = new Set<string>();
  for (const m of toc.matchAll(new RegExp(`href="/court_rules/${code}/id/([^"/#]+)/`, 'g'))) {
    if (/^\d+[A-Z]?$/.test(m[1])) seen.add(m[1]);
  }
  return [...seen].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
}

function blockText($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string[] {
  const out: string[] = [];
  el.children().each((_, child) => {
    const c = $(child);
    const tag = (child as { tagName?: string }).tagName;
    if (tag === 'h4' || c.hasClass('comment')) return;
    if (tag === 'table') {
      c.find('tr').each((__, tr) => {
        const row = $(tr).find('th,td').map((___, td) => squash($(td).text())).get().filter(Boolean).join(' | ');
        if (row) out.push(row);
      });
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      c.children('li').each((__, li) => {
        out.push(squash($(li).text()));
      });
      return;
    }
    if (tag === 'div' && !c.is('p')) {
      out.push(...blockText($, c));
      return;
    }
    const t = squash(c.text());
    if (t && !HISTORY.test(t)) out.push(t);
  });
  return out;
}

function parseRulePage(html: string, family: Family, number: string) {
  const $ = cheerio.load(html);
  const id = `courtr.${family.code}-${number}`.toLowerCase();
  const rule = $("div.court_rule").filter((_, el) => ($(el).attr("id") ?? "").toLowerCase() === id).first();
  if (!rule.length) throw new Error(`${family.set} ${number}: rule block not found`);
  const heading = squash(rule.children('h3.courtr_no').first().find('.headnote').text());
  const subdivisions: { label: string; text: string }[] = [];
  const lines: string[] = [];
  rule.children().each((_, child) => {
    const c = $(child);
    if (c.is('h3') || c.hasClass('comment')) return;
    if (c.hasClass('sub_rule')) {
      const label = (c.attr('id') ?? '').replace(/^Rule_/, '');
      const subheading = squash(c.children('h4').first().find('.headnote').text());
      const body = blockText($, c);
      subdivisions.push({ label, text: body.join('\n') || subheading });
      lines.push(`${label} ${subheading}`.trim(), ...body);
      return;
    }
    if (c.is('p, table, ul, ol, div')) {
      const wrapper = $('<div></div>').append(c.clone());
      lines.push(...blockText($, wrapper));
    }
  });
  // Renumbered, repealed, and reserved rules print only a bracketed heading; keep it as the text.
  return { heading, text: lines.join('\n') || heading, subdivisions };
}

export async function ingestMnCourtRules(): Promise<Record<Family['set'], RuleRecord[]>> {
  const result = { 'mn-civ': [] as RuleRecord[], 'mn-gp': [] as RuleRecord[] };
  for (const family of FAMILIES) {
    const toc = await downloadText(`${BASE}/rule/${family.code}-toh/`);
    const through = /amendments effective through ([A-Z][a-z]+ \d{1,2}, \d{4})/.exec(toc.text);
    if (!through) throw new Error(`${family.set}: version stamp not found in table of headnotes`);
    const sourceVersion = `revisor.mn.gov, amendments effective through ${through[1]}`;
    for (const number of ruleNumbers(toc.text, family.code)) {
      const sourceUrl = `${BASE}/${family.code}/id/${number}/`;
      const page = await downloadText(sourceUrl);
      const parsed = parseRulePage(page.text, family, number);
      result[family.set].push({
        id: `${family.set}:${number}`,
        set: family.set,
        number,
        citation: `${family.citation} ${number}`,
        heading: parsed.heading,
        text: parsed.text,
        subdivisions: parsed.subdivisions,
        sourceUrl,
        navigationUrl: null,
        retrievedAt: page.retrievedAt,
        sourceVersion,
      });
    }
  }
  return result;
}
