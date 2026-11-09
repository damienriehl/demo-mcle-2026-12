// Bundled rule library. Text is ingested offline by `npm run ingest:rules` and committed;
// nothing here fetches at runtime.
import frcp from './frcp.json';
import mnCiv from './mn-civ.json';
import mnGp from './mn-gp.json';
import targeted from './targeted.json';

export type RuleSet = 'frcp' | 'mn-civ' | 'mn-gp' | 'frbp' | 'cfr37' | 'usc' | 'mn-stat';

export interface RuleSubdivision {
  /** Label as the source prints it, e.g. "(a)" or "6.01". */
  label: string;
  text: string;
}

export interface RuleRecord {
  /** `<set>:<number>`, e.g. "frcp:6", "mn-civ:6", "usc:42-2000e-5". */
  id: string;
  set: RuleSet;
  number: string;
  /** Human citation, e.g. "Fed. R. Civ. P. 6". */
  citation: string;
  heading: string;
  /** Verbatim rule text only: no committee comments, advisory notes, or amendment history. */
  text: string;
  subdivisions: RuleSubdivision[];
  /** Official source the text came from. */
  sourceUrl: string;
  /** Cornell LII page for navigation only, or null where none exists. */
  navigationUrl: string | null;
  /** ISO date the source was downloaded. */
  retrievedAt: string;
  sourceVersion: string;
}

const all = [frcp, mnCiv, mnGp, targeted].flat() as RuleRecord[];
const byId = new Map(all.map((r) => [r.id, r]));

export function getRule(id: string): RuleRecord | undefined {
  return byId.get(id);
}

export function listRules(set?: RuleSet): RuleRecord[] {
  return set ? all.filter((r) => r.set === set) : [...all];
}
