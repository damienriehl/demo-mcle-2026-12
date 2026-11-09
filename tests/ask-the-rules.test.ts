import { describe, expect, it } from 'vitest';
import { getRule } from '../data/rules/index';
import { askTheRules, pinpoint } from '../src/features/ask-the-rules/search';

const question = 'How many days do I have to answer the complaint?';

describe('Ask the Rules', () => {
  it('ranks the federal answer rule first for a federal matter and quotes it verbatim', () => {
    const hits = askTheRules(question, 'U.S. District Court, District of Minnesota');
    expect(hits).toHaveLength(3);
    expect(hits[0]).toMatchObject({ ruleId: 'frcp:12', citation: 'Fed. R. Civ. P. 12', label: '(a)' });
    const source = getRule('frcp:12')?.subdivisions.find(part => part.label === '(a)');
    expect(hits[0].quote).toBe(source?.text);
  });

  it('ranks Minnesota rules first for a Minnesota state matter, each quoted verbatim', () => {
    const hits = askTheRules(question, 'Hennepin County District Court (contract suit)');
    expect(hits.map(hit => hit.ruleId.split(':')[0])).toEqual(['mn-gp', 'mn-gp', 'mn-civ']);
    for (const hit of hits) expect(hit.quote).toBe(getRule(hit.ruleId)?.subdivisions.find(part => part.label === hit.label)?.text);
    expect(hits[0].quote).toMatch(/Within 21 days from service of the summons and complaint/);
  });

  it('writes a pinpoint citation for each hit', () => {
    expect(pinpoint({ citation: 'Fed. R. Civ. P. 12', label: '(a)' })).toBe('Fed. R. Civ. P. 12(a)');
    expect(pinpoint({ citation: 'Minn. Gen. R. Prac. 370', label: '370.05' })).toBe('Minn. Gen. R. Prac. 370.05');
    expect(pinpoint({ citation: 'Minn. Stat. § 363A.28, subd. 3', label: '3' })).toBe('Minn. Stat. § 363A.28, subd. 3');
    expect(pinpoint({ citation: 'Fed. R. Civ. P. 84', label: null })).toBe('Fed. R. Civ. P. 84');
  });

  it('returns nothing for a question with no searchable words', () => {
    expect(askTheRules('what is the?', undefined)).toEqual([]);
  });
});
