// Targeted federal sections the seed matters rely on, plus the counting rules their deadlines
// follow: Fed. R. Bankr. P. from the uscourts.gov pamphlet PDF, 37 C.F.R. from the eCFR
// versioner API, and U.S. Code sections from govinfo. Notes and source credits are dropped.
import * as cheerio from 'cheerio';
import type { RuleRecord } from '../../data/rules/index';
import { downloadPdfText, downloadText, squash } from './fetch';
import { pamphletVersion, parsePamphlet } from './frcp';

export const FRBP_URL = 'https://www.uscourts.gov/sites/default/files/document/federal-rules-of-bankruptcy-procedure.pdf';
const FRBP_RULES = ['3002', '9006'];
const CFR_SECTIONS = ['1.7', '1.134', '1.136'];
const USC_SECTIONS: [title: string, section: string][] = [
  ['5', '553'],
  ['5', '6103'],
  ['35', '21'],
  ['42', '2000e-5'],
];

/** Group paragraphs into top-level subdivisions that run (a), (b), (c)... in order. */
export function lettered(paras: string[]): { label: string; text: string }[] {
  const subs: { label: string; text: string }[] = [];
  for (const p of paras) {
    const m = /^\(([a-z])\)/.exec(p);
    if (m && m[1] === String.fromCharCode(97 + subs.length)) subs.push({ label: `(${m[1]})`, text: p });
    else if (subs.length) subs[subs.length - 1].text += `\n${p}`;
  }
  return subs;
}

async function ingestFrbp(): Promise<RuleRecord[]> {
  const { text, retrievedAt } = await downloadPdfText(FRBP_URL);
  const sourceVersion = pamphletVersion(text);
  const rules = parsePamphlet(text, {
    title: 'FEDERAL RULES OF BANKRUPTCY PROCEDURE',
    start: /^Rule 1001\. /,
    stop: /^\s*OFFICIAL BANKRUPTCY FORMS\s*$/,
  });
  return FRBP_RULES.map((number) => {
    const r = rules.find((x) => x.number === number);
    if (!r) throw new Error(`frbp ${number}: not found in pamphlet`);
    return {
      id: `frbp:${number}`,
      set: 'frbp',
      number,
      citation: `Fed. R. Bankr. P. ${number}`,
      heading: r.heading,
      text: r.text,
      subdivisions: r.subdivisions,
      sourceUrl: FRBP_URL,
      navigationUrl: `https://www.law.cornell.edu/rules/frbp/rule_${number}`,
      retrievedAt,
      sourceVersion,
    };
  });
}

async function ingestCfr(): Promise<RuleRecord[]> {
  const titles = await downloadText('https://www.ecfr.gov/api/versioner/v1/titles.json');
  const title37 = (JSON.parse(titles.text) as { titles: { number: number; latest_issue_date: string }[] }).titles.find(
    (t) => t.number === 37,
  );
  if (!title37) throw new Error('eCFR: title 37 missing from titles.json');
  const date = title37.latest_issue_date;
  const out: RuleRecord[] = [];
  for (const section of CFR_SECTIONS) {
    const apiUrl = `https://www.ecfr.gov/api/versioner/v1/full/${date}/title-37.xml?part=1&section=${section}`;
    const xml = await downloadText(apiUrl);
    const $ = cheerio.load(xml.text, { xml: true });
    const head = squash($('HEAD').first().text());
    const heading = head.replace(new RegExp(`^§\\s*${section.replace('.', '\\.')}\\s*`), '').replace(/\.$/, '');
    const paras = $('P')
      .map((_, p) => squash($(p).text()))
      .get()
      .filter(Boolean);
    out.push({
      id: `cfr37:${section}`,
      set: 'cfr37',
      number: section,
      citation: `37 C.F.R. § ${section}`,
      heading,
      text: paras.join('\n'),
      subdivisions: lettered(paras),
      sourceUrl: `https://www.ecfr.gov/on/${date}/title-37/section-${section}`,
      navigationUrl: `https://www.law.cornell.edu/cfr/text/37/${section}`,
      retrievedAt: xml.retrievedAt,
      sourceVersion: `eCFR, issue date ${date}`,
    });
  }
  return out;
}

async function ingestUsc(): Promise<RuleRecord[]> {
  const out: RuleRecord[] = [];
  for (const [title, section] of USC_SECTIONS) {
    const sourceUrl = `https://www.govinfo.gov/link/uscode/${title}/${section}?link-type=html`;
    const page = await downloadText(sourceUrl);
    const $ = cheerio.load(page.text);
    const head = $('h3.section-head').first();
    if (!head.length) throw new Error(`usc ${title}/${section}: section head not found`);
    const heading = squash(head.text()).replace(/^§\s*[\w–-]+\.\s*/, '');
    const paras: string[] = [];
    const subs: { label: string; text: string }[] = [];
    for (let el = head.next(); el.length && !el.hasClass('source-credit'); el = el.next()) {
      if (el.is('h3') || el.hasClass('note-head')) break;
      const t = squash(el.text());
      if (!t) continue;
      if (el.is('h4.subsection-head')) {
        const label = /^\(([a-z])\)/.exec(t)?.[0];
        paras.push(t);
        if (label) subs.push({ label, text: t });
      } else if (el.is('p') && /statutory-body/.test(el.attr('class') ?? '')) {
        paras.push(t);
        if (subs.length) subs[subs.length - 1].text += `\n${t}`;
      }
    }
    const edition = squash($('span').filter((_, s) => /United States Code, \d{4} Edition/.test($(s).text())).first().text());
    out.push({
      id: `usc:${title}-${section}`,
      set: 'usc',
      number: `${title}-${section}`,
      citation: `${title} U.S.C. § ${section}`,
      heading,
      text: paras.join('\n'),
      subdivisions: subs.length ? subs : lettered(paras),
      sourceUrl,
      navigationUrl: `https://www.law.cornell.edu/uscode/text/${title}/${section}`,
      retrievedAt: page.retrievedAt,
      sourceVersion: edition || 'United States Code (govinfo)',
    });
  }
  return out;
}

export async function ingestFederalSections(): Promise<RuleRecord[]> {
  return [...(await ingestFrbp()), ...(await ingestCfr()), ...(await ingestUsc())];
}
