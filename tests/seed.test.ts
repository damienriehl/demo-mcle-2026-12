import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { resetDemo } from '../scripts/reset-demo';
import { mattersSchema } from '../src/data/schema';
import { computeDeadline, deadlineCatalog } from '../src/engine/index';

const areas = ['bankruptcy', 'employment', 'family', 'litigation', 'patent', 'regulatory', 'transactional'];
const scratch = mkdtempSync(join(tmpdir(), 'matter-seeds-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function files(pool: 'matters' | 'canned') {
  const directory = resolve('data/seed', pool);
  try {
    return readdirSync(directory).filter(name => name.endsWith('.json')).sort()
      .map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function reset(pool: 'matters' | 'canned', today: string) {
  return resetDemo({ seedDirectory: resolve('data/seed', pool), filePath: join(scratch, `${pool}.json`), today });
}

function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leaves(item, path ? `${path}.${key}` : key));
  }
  return [[path, value]];
}

describe('synthetic matter collections', () => {
  it('ships exactly one seed per practice area and ten complete canned matters', () => {
    expect(files('matters').map(matter => matter.practiceArea).sort()).toEqual(areas);
    expect(files('canned')).toHaveLength(10);
    expect([...new Set(files('canned').map(matter => matter.practiceArea))].sort()).toEqual(areas);
  });

  it.each(['matters', 'canned'] as const)('%s validates after reset and states its synthetic provenance', pool => {
    const authored = files(pool);
    expect(authored.length).toBeGreaterThan(0);
    const materialized = reset(pool, '2027-06-15');
    expect(mattersSchema.safeParse(materialized).success).toBe(true);
    const catalog = new Set([...deadlineCatalog().map(rule => rule.id), 'none']);
    for (const matter of authored) {
      expect(matter.synthetic).toBe(true);
      expect(matter.title).toMatch(/synthetic/i);
      expect(matter.client.contact).toMatch(/@[^\s]+\.example\.invalid$/);
      expect(matter.timeline.length).toBeGreaterThanOrEqual(4);
      expect(matter.timeline.length).toBeLessThanOrEqual(7);
      expect(matter.documents.length).toBeGreaterThanOrEqual(2);
      expect(matter.documents.length).toBeLessThanOrEqual(3);
      expect(matter.clientFacing.status.length).toBeGreaterThan(0);
      expect(matter.clientFacing.nextSteps.length).toBeGreaterThan(0);
      for (const document of matter.documents) expect(document.body).toMatch(/synthetic/i);
      expect(matter).not.toHaveProperty('dueDate');
      expect(matter).not.toHaveProperty('computedDeadlines');
      const { provenance, ...fields } = matter;
      for (const [path, value] of leaves(fields)) {
        expect(provenance[path]?.source, `${matter.id}: ${path}`).toBe('stated');
        if (path.endsWith('.date') || /^deadlines\.\d+\.inputs\.(dueDate|noticeCloseDate)$/.test(path)) {
          expect(value, `${matter.id}: ${path}`).toMatch(/^[+-]\d+$/);
        }
      }
      expect(Object.values(provenance).every(entry => (entry as { source: string }).source === 'stated')).toBe(true);
      for (const deadline of matter.deadlines) expect(catalog.has(deadline.deadlineRuleId)).toBe(true);
    }
    for (const matter of materialized) {
      for (const deadline of matter.deadlines) {
        expect(computeDeadline(deadline).status, `${matter.id}: ${deadline.label}`)
          .toBe(deadline.deadlineRuleId === 'none' ? 'uncomputable' : 'computed');
      }
    }
  });

  it('includes the requested forum-specific examples and a deliberately unsupported regulatory deadline', () => {
    const matters = reset('matters', '2027-06-15');
    expect(matters).toHaveLength(7);
    const litigation = matters.find(matter => matter.practiceArea === 'litigation')!;
    expect(litigation.forum).toMatch(/Hennepin County/);
    expect(litigation.forum).toMatch(/District of Minnesota/);
    expect(litigation.deadlines).toEqual(expect.arrayContaining([
      expect.objectContaining({ deadlineRuleId: 'mn-civ-12-answer' }),
      expect.objectContaining({ deadlineRuleId: 'frcp-33-interrogatories', assumptions: { serviceMethod: 'mail' } }),
    ]));
    const expectedRules = {
      bankruptcy: ['frbp-3002-proof-of-claim'],
      employment: ['eeoc-charge', 'mhra-charge'],
      family: ['mn-gp-303-family-motion', 'mn-gp-303-family-new-issues', 'mn-gp-303-family-response'],
      patent: ['patent-office-action-response'],
      regulatory: ['apa-comment-close', 'none'],
      transactional: ['contract-deadline'],
    };
    for (const [area, rules] of Object.entries(expectedRules)) {
      expect(matters.find(matter => matter.practiceArea === area)?.deadlines.map(deadline => deadline.deadlineRuleId))
        .toEqual(expect.arrayContaining(rules));
    }
    const patent = matters.find(matter => matter.practiceArea === 'patent')!;
    expect(patent.deadlines.find(deadline => deadline.deadlineRuleId === 'patent-office-action-response')?.inputs)
      .toEqual({ notifiedPeriodMonths: 3, maximumMonths: 6 });
    const regulatory = matters.find(matter => matter.practiceArea === 'regulatory')!;
    expect(regulatory.deadlines.find(deadline => deadline.deadlineRuleId === 'none')?.label).toMatch(/verification/i);
    const transaction = matters.find(matter => matter.practiceArea === 'transactional')!;
    const closing = transaction.deadlines[0];
    expect(computeDeadline(closing).steps.some(step => step.citation.ruleId === 'contract'
      && step.citation.subdivision === closing.inputs?.section)).toBe(true);
  });

  it('keeps every seed upcoming after reset on every calendar day in 2026 through 2028', () => {
    for (let day = Date.UTC(2026, 0, 1); day < Date.UTC(2029, 0, 1); day += 86_400_000) {
      const today = new Date(day).toISOString().slice(0, 10);
      const matters = reset('matters', today);
      expect(matters).toHaveLength(7);
      for (const matter of matters) {
        const upcoming = matter.deadlines.map(computeDeadline).some(result => {
          if (result.status !== 'computed') return false;
          const distance = (Date.parse(`${result.dueDate}T00:00:00Z`) - day) / 86_400_000;
          return distance >= 3 && distance <= 40;
        });
        expect(upcoming, `${matter.id} reset on ${today}`).toBe(true);
      }
    }
  }, 60_000);
});
