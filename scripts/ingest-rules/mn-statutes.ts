// Short Minnesota statute excerpts from revisor.mn.gov: whole sections, or only the named
// subdivision where the deadline depends on one. History notes are dropped.
import * as cheerio from 'cheerio';
import type { RuleRecord } from '../../data/rules/index';
import { downloadText, squash } from './fetch';

const SECTIONS: { section: string; subdivision?: string }[] = [
  { section: '363A.28', subdivision: '3' },
  { section: '645.15' },
  { section: '645.44', subdivision: '5' },
];

function paragraphs($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string[] {
  return el
    .children('p, div:not(.subd):not(.history)')
    .map((_, p) => squash($(p).text()))
    .get()
    .filter(Boolean);
}

export async function ingestMnStatutes(): Promise<RuleRecord[]> {
  const out: RuleRecord[] = [];
  for (const { section, subdivision } of SECTIONS) {
    const sourceUrl = `https://www.revisor.mn.gov/statutes/cite/${section}`;
    const page = await downloadText(sourceUrl);
    const $ = cheerio.load(page.text);
    const sec = $('div.section').filter((_, el) => $(el).attr('id') === `stat.${section}`).first();
    if (!sec.length) throw new Error(`mn-stat ${section}: section not found`);
    const heading = squash(sec.children('h1.shn').text()).replace(new RegExp(`^${section.replace('.', '\\.')}\\s*`), '').replace(/\.$/, '');
    const year = /(\d{4}) Minnesota Statutes/.exec(page.text)?.[1];
    let text: string;
    const subdivisions: { label: string; text: string }[] = [];
    if (subdivision) {
      const subd = sec.children('div.subd').filter((_, el) => $(el).attr('id') === `stat.${section}.${subdivision}`).first();
      if (!subd.length) throw new Error(`mn-stat ${section}: subdivision ${subdivision} not found`);
      const h2 = subd.children('h2.subd_no').first();
      const subHead = `${squash(h2.clone().children('.headnote').remove().end().text())} ${squash(h2.find('.headnote').text())}`;
      const body = paragraphs($, subd).join('\n');
      text = `${subHead}\n${body}`;
      subdivisions.push({ label: subdivision, text: body });
    } else {
      text = paragraphs($, sec).join('\n');
    }
    out.push({
      id: `mn-stat:${section}`,
      set: 'mn-stat',
      number: section,
      citation: subdivision ? `Minn. Stat. § ${section}, subd. ${subdivision}` : `Minn. Stat. § ${section}`,
      heading,
      text,
      subdivisions,
      sourceUrl: subdivision ? `${sourceUrl}#stat.${section}.${subdivision}` : sourceUrl,
      navigationUrl: null,
      retrievedAt: page.retrievedAt,
      sourceVersion: year ? `${year} Minnesota Statutes (revisor.mn.gov)` : 'Minnesota Statutes (revisor.mn.gov)',
    });
  }
  return out;
}
