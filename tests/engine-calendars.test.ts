import { describe, expect, it } from 'vitest';
import { federalHolidays } from '../src/engine/calendars/federal';
import { minnesotaHolidays } from '../src/engine/calendars/minnesota';

// Frozen from the original calendars before replacing their hard-coded lists.
const originalFederalDates = [
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
];

function originalRange(calendar: typeof federalHolidays) {
  return Object.fromEntries(Object.entries(calendar).filter(([date]) => date >= '2026-01-01' && date <= '2028-12-31'));
}

describe('holiday calendar compatibility', () => {
  it('preserves every federal date, name and citation from 2026 through 2028', () => {
    const expected = Object.fromEntries(originalFederalDates.map(([date, name]) => [date, {
      name, citation: { ruleId: 'usc:5-6103', subdivision: '(a), (b)' },
    }]));
    expect(originalRange(federalHolidays)).toEqual(expected);
  });

  it('preserves every Minnesota date, name and citation from 2026 through 2028', () => {
    const citation = { ruleId: 'mn-stat:645.44', subdivision: 'subd. 5' };
    const expected = {
      ...Object.fromEntries(originalFederalDates.map(([date, name]) => [date, {
        name: name.replace('Columbus Day', 'Indigenous Peoples Day')
          .replace("Washington's Birthday", "Washington's and Lincoln's Birthday"),
        citation,
      }])),
      '2026-11-27': { name: 'Friday after Thanksgiving', citation },
      '2027-11-26': { name: 'Friday after Thanksgiving', citation },
      '2028-11-24': { name: 'Friday after Thanksgiving', citation },
    };
    expect(originalRange(minnesotaHolidays)).toEqual(expected);
  });
});

describe('generated holiday calendars', () => {
  it.each([
    [2024, '01-01 01-15 02-19 05-27 06-19 07-04 09-02 10-14 11-11 11-28 12-25', '11-29'],
    [2025, '01-01 01-20 02-17 05-26 06-19 07-04 09-01 10-13 11-11 11-27 12-25', '11-28'],
    [2029, '01-01 01-15 02-19 05-28 06-19 07-04 09-03 10-08 11-11 11-12 11-22 12-25', '11-23'],
    [2030, '01-01 01-21 02-18 05-27 06-19 07-04 09-02 10-14 11-11 11-28 12-25', '11-29'],
  ])('includes the statutory dates and weekend observances for %i', (year, federalDates, friday) => {
    const dates = federalDates.split(' ').map(date => `${year}-${date}`);
    const inYear = (calendar: typeof federalHolidays) => Object.keys(calendar).filter(date => date.startsWith(`${year}-`)).sort();
    expect(inYear(federalHolidays)).toEqual(dates);
    expect(inYear(minnesotaHolidays)).toEqual([...dates, `${year}-${friday}`].sort());
    expect(minnesotaHolidays[`${year}-${friday}`]).toEqual({
      name: 'Friday after Thanksgiving', citation: { ruleId: 'mn-stat:645.44', subdivision: 'subd. 5' },
    });
  });

  it('retains Saturday Juneteenth 2027 and its Friday June 18 federal observance', () => {
    expect(federalHolidays['2027-06-18'].name).toBe('Juneteenth (observed)');
    expect(federalHolidays['2027-06-19'].name).toBe('Juneteenth');
  });
});
