import { addDays, dateOf, weekday } from '../dates';
import type { Step } from '../types';

export type Holiday = { name: string; citation: Step['citation'] };

// National calendar only: 5 USC 6103(a), (b)(1)-(2); FRCP 6(a)(6)(A).
// https://www.govinfo.gov/content/pkg/USCODE-2024-title5/html/USCODE-2024-title5-partIII-subpartE-chap61-subchapI-sec6103.htm
// https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
// Fixed holidays retain their actual dates and their statutory observances:
// Saturday -> preceding Friday; Sunday -> following Monday. Includes Juneteenth.
// Movable holidays: third Monday Jan/Feb, last Monday May, first Monday Sep,
// second Monday Oct, fourth Thursday Nov. No ad hoc proclamations or local closures.
// A Saturday New Year's observance belongs to the preceding calendar year.
function nthWeekday(year: number, month: number, dayOfWeek: number, occurrence: number): string {
  const first = dateOf(year, month, 1);
  return addDays(first, (dayOfWeek - weekday(first) + 7) % 7 + (occurrence - 1) * 7);
}

function generateFederalHolidays(): Record<string, Holiday> {
  const holidays: Record<string, Holiday> = {};
  const citation = { ruleId: 'usc:5-6103', subdivision: '(a), (b)' };
  for (let year = 2024; year <= 2030; year++) {
    const fixed = [
      [1, 1, "New Year's Day"],
      [6, 19, 'Juneteenth'],
      [7, 4, 'Independence Day'],
      [11, 11, 'Veterans Day'],
      [12, 25, 'Christmas Day'],
    ] as const;
    for (const [month, day, name] of fixed) {
      const date = dateOf(year, month, day);
      holidays[date] = { name, citation };
      const dayOfWeek = weekday(date);
      if (dayOfWeek === 6 || dayOfWeek === 0) {
        const observed = addDays(date, dayOfWeek === 6 ? -1 : 1);
        const observedName = observed.slice(0, 4) === String(year) ? name : `${name} ${year}`;
        holidays[observed] = { name: `${observedName} (observed)`, citation };
      }
    }
    const may31 = dateOf(year, 5, 31);
    const movable = [
      [nthWeekday(year, 1, 1, 3), 'Martin Luther King Jr. Day'],
      [nthWeekday(year, 2, 1, 3), "Washington's Birthday"],
      [addDays(may31, -((weekday(may31) + 6) % 7)), 'Memorial Day'],
      [nthWeekday(year, 9, 1, 1), 'Labor Day'],
      [nthWeekday(year, 10, 1, 2), 'Columbus Day'],
      [nthWeekday(year, 11, 4, 4), 'Thanksgiving Day'],
    ];
    for (const [date, name] of movable) holidays[date] = { name, citation };
  }
  return holidays;
}

export const federalHolidays: Readonly<Record<string, Holiday>> = generateFederalHolidays();
