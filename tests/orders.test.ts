import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pageTexts, textPages } from '../server/orders/pdf-text';
import { verifyQuote } from '../server/orders/verify-quote';
import { extractionSchema } from '../server/orders/prompt';

const expected = {
  'hennepin-lanternfish': {
    court: 'minnesota',
    caption: 'Lanternfish Fabrication, LLC v. Brightwater Exhibits, Inc.',
    dates: [
      ['other', '2026-12-01', 1], ['other', '2027-02-01', 1], ['other', '2027-06-01', 1],
      ['dispositive-hearing', '2027-07-12', 2], ['trial', '2027-09-13', 2],
    ],
  },
  'ramsey-copperleaf': {
    court: 'minnesota',
    caption: 'Copperleaf Bakery Cooperative v. Northstar Oven Works, Inc.',
    dates: [
      ['other', '2026-11-30', 1], ['nondispositive-hearing', '2027-01-25', 1],
      ['other', '2027-07-01', 2], ['trial', '2027-11-01', 2],
    ],
  },
  'dminn-quillfeather': {
    court: 'federal',
    caption: 'Quillfeather Outdoor Gear, Inc. v. Pinecone Canopy Company',
    dates: [
      ['other', '2026-11-20', 1], ['other', '2027-01-15', 1],
      ['expert-disclosure', '2027-02-01', 1], ['other', '2027-03-01', 1],
      ['other', '2027-03-31', 2], ['dispositive-hearing', '2027-04-30', 2],
      ['other', '2027-05-24', 2], ['trial', '2027-06-14', 2],
    ],
  },
};

describe('bundled scheduling orders', () => {
  it.each(Object.entries(expected))('%s has two pages and verified canned dates', async (slug, order) => {
    const pages = await pageTexts(new Uint8Array(readFileSync(`data/seed/orders/${slug}.pdf`)));
    const extraction = JSON.parse(readFileSync(`data/seed/orders/${slug}.extraction.json`, 'utf8')) as {
      order: string; court: string; caption: string;
      dates: { kind: string; event: string; date: string; page: number; quote: string }[];
    };
    expect(pages).toHaveLength(2);
    for (const page of pages) expect(page).toContain('SYNTHETIC — FOR DEMONSTRATION');
    expect(extraction.order).toBe(slug);
    expect(extraction.court).toBe(order.court);
    expect(extraction.caption).toBe(order.caption);
    expect(extraction.dates.map(({ kind, date, page }) => [kind, date, page])).toEqual(order.dates);
    for (const entry of extraction.dates) {
      expect(entry.event.length).toBeGreaterThan(0);
      expect(pages[entry.page - 1].replace(/\s+/g, ' ')).toContain(entry.quote);
      expect(verifyQuote(entry, pages), entry.quote).toEqual({ ok: true });
    }
    const matter = JSON.parse(readFileSync(`data/seed/matters/${slug}.json`, 'utf8'));
    expect(matter.id).toBe(slug);
    expect(matter.practiceArea).toBe('litigation');
    expect(matter.synthetic).toBe(true);
    expect(matter.timeline.at(-1).event).toBe('Scheduling order entered');
    expect(matter.deadlines.every((entry: { deadlineRuleId: string }) => entry.deadlineRuleId !== 'court-order-date')).toBe(true);
  });

  it.each(readdirSync('data/seed/orders/public').filter(name => name.endsWith('.extraction.json')))(
    'public/%s has court metadata and every canned quote verifies against its PDF', async name => {
      const { order, ...value } = JSON.parse(readFileSync(`data/seed/orders/public/${name}`, 'utf8'));
      const extraction = extractionSchema.parse(value);
      expect(extraction.court).toBe('federal');
      expect(extraction.courtName).toEqual(expect.stringMatching(/district.*minnesota/i));
      expect(extraction.caseNumber).toEqual(expect.any(String));
      expect(extraction.shortCaption).toEqual(expect.any(String));
      expect(order).toBe(name.replace('.extraction.json', ''));
      const pages = await pageTexts(new Uint8Array(readFileSync(`data/seed/orders/public/${order}.pdf`)));
      for (const entry of extraction.dates) expect(verifyQuote(entry, pages), entry.quote).toEqual({ ok: true });
    },
  );
});

describe('quote verification', () => {
  it('treats pasted text, including page-like breaks, as one page', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\fStill pasted text.';
    expect(textPages(text)).toEqual([text]);
  });

  it('rejects a quote that exists only on a different page', () => {
    const quote = 'Trial ready date: June 14, 2027';
    expect(verifyQuote({ quote, page: 1, date: '2027-06-14' }, ['Scheduling order', quote]))
      .toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects an existing quote that names a different date', () => {
    const quote = 'Trial ready date: June 15, 2027';
    expect(verifyQuote({ quote, page: 1, date: '2027-06-14' }, [quote]))
      .toEqual({ ok: false, reason: expect.any(String) });
  });

  it.each([
    ['Trial: February 31, 2027', '2027-02-31'],
    ['Trial: June 14, 2027', '2027-06-14-extra'],
  ])('requires an actual claimed calendar date for %s', (quote, date) => {
    expect(verifyQuote({ quote, page: 1, date }, [quote]))
      .toEqual({ ok: false, reason: expect.any(String) });
  });

  it.each(['June 14, 2027', 'Jun. 14, 2027', '6/14/2027', '06/14/2027', '2027-06-14'])(
    'recognizes the calendar date in %s', date => {
      const quote = `Trial ready date: ${date}`;
      expect(verifyQuote({ quote, page: 1, date: '2027-06-14' }, [quote])).toEqual({ ok: true });
    },
  );

  it('normalizes curly quotes, line breaks, nonbreaking spaces, dashes, and case', () => {
    const quote = '“Plaintiff’s trial” —\nJune\u00a014, 2027 – ready';
    const pages = ['"PLAINTIFF\'S TRIAL" - June 14, 2027 - READY'];
    expect(verifyQuote({ quote, page: 1, date: '2027-06-14' }, pages)).toEqual({ ok: true });
  });
});
