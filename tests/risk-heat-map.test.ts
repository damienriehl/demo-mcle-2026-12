import { describe, expect, it } from 'vitest';
import { rankHeat } from '../src/features/risk-heat-map/heat';
import type { MatterWithDeadlines } from '../src/data/schema';

function matter(id: string, title: string, dueDates: (string | null)[]) {
  return {
    id,
    title,
    deadlines: dueDates.map((_, index) => ({ id: `d${index}` })),
    computedDeadlines: Object.fromEntries(dueDates.map((dueDate, index) => [`d${index}`, dueDate
      ? { status: 'computed', dueDate, steps: [] }
      : { status: 'uncomputable', reason: 'No deadline rule selected.', steps: [] }])),
  } as unknown as MatterWithDeadlines;
}

describe('risk heat map', () => {
  it('ranks matters by how soon and how many deadlines fall in the next 30 days', () => {
    const ranked = rankHeat([
      matter('later', 'Later matter', ['2026-12-18']),
      matter('pair', 'Two soon', ['2026-11-22', '2026-11-23']),
      matter('week', 'This week', ['2026-11-10']),
      matter('month', 'This month', ['2026-11-19']),
      matter('unknown', 'Unknown rule', [null]),
      matter('late', 'Overdue', ['2026-11-05']),
    ], '2026-11-08');
    expect(ranked.map(row => [row.matter.id, row.band, row.score])).toEqual([
      ['pair', 'Hot', 33],
      ['late', 'Hot', 31],
      ['week', 'Hot', 29],
      ['month', 'Warm', 20],
      ['later', 'Cool', 0],
      ['unknown', 'Cool', 0],
    ]);
    expect(ranked[0]).toMatchObject({ soonCount: 2, nextDays: 14, verifyCount: 0 });
    expect(ranked[1]).toMatchObject({ soonCount: 1, overdueCount: 1 });
    expect(ranked[5]).toMatchObject({ soonCount: 0, verifyCount: 1, verifyReasons: ['No deadline rule selected.'] });
  });
});
