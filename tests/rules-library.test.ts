import { describe, expect, it } from 'vitest';
import { getRule, listRules, type RuleSet } from '../data/rules/index';

const text = (id: string) => getRule(id)?.text ?? '';

describe('rules library', () => {
  it('holds every Federal Rule of Civil Procedure from 1 through 87, lettered rules included', () => {
    const numbers = new Set(listRules('frcp').map((r) => r.number));
    for (let n = 1; n <= 87; n++) expect(numbers, `Rule ${n}`).toContain(String(n));
    for (const n of ['4.1', '5.1', '5.2', '7.1', '16.1', '23.1', '23.2', '44.1', '62.1', '65.1', '71.1']) {
      expect(numbers, `Rule ${n}`).toContain(n);
    }
    expect(numbers.size).toBe(listRules('frcp').length);
  });

  it('marks abrogated federal rules as the pamphlet prints them', () => {
    for (const n of ['74', '75', '76', '84']) expect(text(`frcp:${n}`)).toMatch(/^\[Abrogated/);
  });

  it('names Juneteenth in Fed. R. Civ. P. 6(a)(6)', () => {
    expect(text('frcp:6')).toContain('Juneteenth National Independence Day');
    expect(getRule('frcp:6')?.citation).toBe('Fed. R. Civ. P. 6');
    expect(getRule('frcp:6')?.subdivisions.map((s) => s.label)).toEqual(['(a)', '(b)', '(c)', '(d)']);
  });

  it('gives Minn. R. Civ. P. 6.01 and 12.01 subdivision text', () => {
    const six = getRule('mn-civ:6')?.subdivisions.find((s) => s.label === '6.01');
    expect(six?.text).toMatch(/Computing Time/);
    const twelve = getRule('mn-civ:12')?.subdivisions.find((s) => s.label === '12.01');
    expect(twelve?.text.length).toBeGreaterThan(50);
  });

  it('holds Minn. Gen. R. Prac. 115', () => {
    expect(getRule('mn-gp:115')?.heading).toBe('Motion Practice');
    expect(getRule('mn-gp:115')?.subdivisions.some((s) => s.label === '115.03')).toBe(true);
  });

  it('holds the targeted federal and Minnesota sections', () => {
    const ids = [
      'frbp:3002', 'frbp:9006', 'cfr37:1.7', 'cfr37:1.134', 'cfr37:1.136',
      'usc:5-553', 'usc:5-6103', 'usc:35-21', 'usc:42-2000e-5',
      'mn-stat:363A.28', 'mn-stat:645.15', 'mn-stat:645.44',
    ];
    for (const id of ids) expect(text(id).length, id).toBeGreaterThan(100);
    expect(text('cfr37:1.136')).toMatch(/extension of time/i);
    expect(text('frbp:3002')).toMatch(/proof of claim/i);
    expect(text('usc:42-2000e-5')).toMatch(/one hundred and eighty days/);
    expect(text('mn-stat:645.44')).toMatch(/Juneteenth/);
  });

  it('bundles only the named Minnesota statute subdivisions', () => {
    expect(getRule('mn-stat:363A.28')?.subdivisions.map((s) => s.label)).toEqual(['3']);
    expect(getRule('mn-stat:645.44')?.subdivisions.map((s) => s.label)).toEqual(['5']);
  });

  it('attributes every record and keeps out commentary and LII text', () => {
    const sets: RuleSet[] = ['frcp', 'mn-civ', 'mn-gp', 'frbp', 'cfr37', 'usc', 'mn-stat'];
    for (const set of sets) expect(listRules(set).length, set).toBeGreaterThan(0);
    for (const r of listRules()) {
      expect(r.id).toBe(`${r.set}:${r.number}`);
      expect(r.sourceUrl, r.id).toMatch(/^https:\/\//);
      expect(r.sourceUrl, r.id).not.toMatch(/cornell/);
      expect(r.retrievedAt, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.sourceVersion, r.id).not.toBe('');
      expect(r.text.trim(), r.id).not.toBe('');
      expect(r.text, r.id).not.toMatch(/Legal Information Institute|Cornell|\bLII\b/);
      expect(r.text, r.id).not.toMatch(/Advisory Committee|Committee Comment|Notes of Advisory|Task Force Comment/i);
      expect(r.text, r.id).not.toMatch(/^\((As amended|As added|Amended effective|Added effective|Adopted effective)/m);
    }
  });
});
