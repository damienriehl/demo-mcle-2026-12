import { describe, expect, it } from 'vitest';
import { sharedNames } from '../src/features/conflict-check/conflicts';

type Mini = { id: string; title: string; client: { name: string; contact: string }; parties: { name: string; role: string }[] };
const matter = (id: string, title: string, client: string, parties: [string, string][]): Mini =>
  ({ id, title, client: { name: client, contact: 'c@example.invalid' }, parties: parties.map(([name, role]) => ({ name, role })) });

const a = matter('a', 'Acme v. Birch', 'Acme LLC', [['Acme LLC', 'Client'], ['Birch Co.', 'Defendant'], ['Dana Holt', 'Witness']]);
const b = matter('b', 'Birch lease', 'Birch Co.', [['Birch Co.', 'Client; tenant'], ['Cove Realty', 'Landlord']]);
const c = matter('c', 'Holt custody', 'Erin Holt', [['erin holt', 'Client'], ['  DANA   HOLT ', 'Other parent']]);

describe('conflict check', () => {
  it('flags every name from the active matter that appears in another matter, with roles there', () => {
    expect(sharedNames(a, [a, b, c])).toEqual([
      { name: 'Birch Co.', roleHere: 'Defendant', others: [{ matterId: 'b', title: 'Birch lease', role: 'Client; tenant' }] },
      { name: 'Dana Holt', roleHere: 'Witness', others: [{ matterId: 'c', title: 'Holt custody', role: 'Other parent' }] },
    ]);
  });
  it('counts the client name even when it is not listed as a party', () => {
    const d = matter('d', 'Cove dispute', 'Cove Realty', [['Fenn Ltd.', 'Opposing party']]);
    expect(sharedNames(d, [b, d])).toEqual([
      { name: 'Cove Realty', roleHere: 'Client', others: [{ matterId: 'b', title: 'Birch lease', role: 'Landlord' }] },
    ]);
  });
  it('returns nothing when no name repeats', () => {
    expect(sharedNames(b, [b, matter('z', 'Solo', 'Zed Inc.', [['Zed Inc.', 'Client']])])).toEqual([]);
  });
});
