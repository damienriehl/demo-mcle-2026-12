import type { Step } from '../types';

export type Holiday = { name: string; citation: Step['citation'] };

// National calendar only: 5 USC 6103(a), (b)(1)-(2); FRCP 6(a)(6)(A).
// https://www.govinfo.gov/content/pkg/USCODE-2024-title5/html/USCODE-2024-title5-partIII-subpartE-chap61-subchapI-sec6103.htm
// https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
// Fixed holidays retain their actual dates and their statutory observances:
// Saturday -> preceding Friday; Sunday -> following Monday. Includes Juneteenth.
// Movable holidays: third Monday Jan/Feb, last Monday May, first Monday Sep,
// second Monday Oct, fourth Thursday Nov. No ad hoc proclamations or local closures.
// The 2028 New Year's Saturday observance is deliberately in calendar year 2027.
export const federalHolidays: Readonly<Record<string, Holiday>> = Object.fromEntries([
  ['2026-01-01', "New Year's Day"],
  ['2026-01-19', 'Martin Luther King Jr. Day'],
  ['2026-02-16', "Washington's Birthday"],
  ['2026-05-25', 'Memorial Day'],
  ['2026-06-19', 'Juneteenth'],
  ['2026-07-03', 'Independence Day (observed)'],
  ['2026-07-04', 'Independence Day'],
  ['2026-09-07', 'Labor Day'],
  ['2026-10-12', 'Columbus Day'],
  ['2026-11-11', 'Veterans Day'],
  ['2026-11-26', 'Thanksgiving Day'],
  ['2026-12-25', 'Christmas Day'],
  ['2027-01-01', "New Year's Day"],
  ['2027-01-18', 'Martin Luther King Jr. Day'],
  ['2027-02-15', "Washington's Birthday"],
  ['2027-05-31', 'Memorial Day'],
  ['2027-06-18', 'Juneteenth (observed)'],
  ['2027-06-19', 'Juneteenth'],
  ['2027-07-04', 'Independence Day'],
  ['2027-07-05', 'Independence Day (observed)'],
  ['2027-09-06', 'Labor Day'],
  ['2027-10-11', 'Columbus Day'],
  ['2027-11-11', 'Veterans Day'],
  ['2027-11-25', 'Thanksgiving Day'],
  ['2027-12-24', 'Christmas Day (observed)'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-31', "New Year's Day 2028 (observed)"],
  ['2028-01-01', "New Year's Day"],
  ['2028-01-17', 'Martin Luther King Jr. Day'],
  ['2028-02-21', "Washington's Birthday"],
  ['2028-05-29', 'Memorial Day'],
  ['2028-06-19', 'Juneteenth'],
  ['2028-07-04', 'Independence Day'],
  ['2028-09-04', 'Labor Day'],
  ['2028-10-09', 'Columbus Day'],
  ['2028-11-10', 'Veterans Day (observed)'],
  ['2028-11-11', 'Veterans Day'],
  ['2028-11-23', 'Thanksgiving Day'],
  ['2028-12-25', 'Christmas Day'],
].map(([date, name]) => [date, { name, citation: { ruleId: 'usc:5-6103', subdivision: '(a), (b)' } }]));
