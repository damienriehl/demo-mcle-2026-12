import { addDays } from '../dates';
import { federalHolidays, type Holiday } from './federal';

// Minn. Stat. 645.44 subd. 5(a): the eleven national holiday dates share the
// same rules as the federal calendar throughout 2024–2030. Retain actual dates;
// observe Saturday on the preceding Friday and Sunday on the following Monday.
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
  ...Object.fromEntries(Object.entries(federalHolidays)
    .filter(([, holiday]) => holiday.name === 'Thanksgiving Day')
    .map(([date]) => [addDays(date, 1), { name: 'Friday after Thanksgiving', citation }])),
};
