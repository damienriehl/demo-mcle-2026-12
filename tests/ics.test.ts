import { describe, expect, it } from 'vitest';
import fixture from './fixtures/views/scheduling-order.json';
import type { MatterWithDeadlines } from '../src/data/schema';
import { buildCalendar } from '../src/features/scheduling-order/ics';

describe('scheduling calendar', () => {
  it('exports computed, governing dates as stable all-day events with escaped, folded CRLF text', () => {
    const matter = structuredClone(fixture) as MatterWithDeadlines;
    matter.deadlines[0].label = 'Trial, ready; bring \\ exhibits\nand witnesses';
    matter.deadlines[0].inputs!.quote = 'Long café court quotation — '.repeat(12);
    matter.deadlines.push({ id: 'unknown', label: 'Unknown date', deadlineRuleId: 'none', trigger: { event: 'Unknown', date: '2027-01-01' }, assumptions: {} });
    matter.computedDeadlines.unknown = { status: 'uncomputable', reason: 'No date', steps: [] };
    const calendar = buildCalendar(matter, new Date('2026-11-08T18:00:00Z'));
    const unfolded = calendar.replace(/\r\n /g, '');
    expect(unfolded.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20270614\r\n');
    expect(unfolded).toContain('SUMMARY:Trial\\, ready\\; bring \\\\ exhibits\\nand witnesses\r\n');
    expect(unfolded).toContain('DESCRIPTION:From the order\\, p. 2: Long café');
    expect(unfolded).toContain('DESCRIPTION:Code computed under Fed. R. Civ. P. 26(a)(3)(B)');
    expect(unfolded).not.toContain('SUMMARY:Federal expert disclosures');
    expect(unfolded).not.toContain('SUMMARY:Unknown date');
    expect(unfolded).toContain('DTSTAMP:20261108T180000Z');
    expect(unfolded).toContain('UID:scheduling-demo/order-demo-date-1@matter-cockpit');
    expect(buildCalendar(matter, new Date('2026-11-09T18:00:00Z')).match(/UID:[^\r]+/g)).toEqual(calendar.match(/UID:[^\r]+/g));
    expect(calendar).toContain('\r\n ');
    expect(calendar.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of calendar.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfolded).toContain(matter.deadlines[0].inputs!.quote);
    expect(calendar.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('formats Minnesota subdivisions without repeating the rule number', () => {
    const matter = structuredClone(fixture) as MatterWithDeadlines;
    matter.computedDeadlines['order-demo-date-1-pretrial'] = {
      status: 'computed', dueDate: '2027-05-14',
      steps: [{ label: 'Count before trial', citation: { ruleId: 'mn-civ:26', subdivision: '26.01(c)(2)' } }],
    };
    expect(buildCalendar(matter).replace(/\r\n /g, '')).toContain('DESCRIPTION:Code computed under Minn. R. Civ. P. 26.01(c)(2)');
  });

});
