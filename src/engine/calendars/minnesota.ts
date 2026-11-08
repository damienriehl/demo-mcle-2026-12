import { federalHolidays, type Holiday } from './federal';

// Minn. Stat. 645.44 subd. 5(a): the eleven national holiday dates and fixed-date
// weekend observances coincide in 2026–2028. Saturday is observed on Friday.
// https://www.revisor.mn.gov/statutes/cite/645.44#stat.645.44.5
//
// Friday after Thanksgiving: adopted as a Minnesota legal holiday. Although
// 645.44 subd. 5(a) makes it an executive-branch holiday and optional for other
// branches, Minn. R. Civ. P. 6.01(d) expressly includes holidays for ANY statewide
// branch. It therefore applies to civil computation, not merely office closures.
// It also applies to the executive-branch human-rights charge calendar.
// https://www.revisor.mn.gov/court_rules/cp/id/6/
// The judicial branch confirms its observance: https://mncourts.gov/about-the-courts/holidays
// Indigenous Peoples Day remains a legal holiday even when courts are open.
const citation = { ruleId: 'mn-stat:645.44', subdivision: 'subd. 5' };

export const minnesotaHolidays: Readonly<Record<string, Holiday>> = {
  ...Object.fromEntries(Object.entries(federalHolidays).map(([date, holiday]) => [date, {
    name: holiday.name.replace('Columbus Day', 'Indigenous Peoples Day')
      .replace("Washington's Birthday", "Washington's and Lincoln's Birthday"),
    citation,
  }])),
  '2026-11-27': { name: 'Friday after Thanksgiving', citation },
  '2027-11-26': { name: 'Friday after Thanksgiving', citation },
  '2028-11-24': { name: 'Friday after Thanksgiving', citation },
};
