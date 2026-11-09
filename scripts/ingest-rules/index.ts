// Offline rule ingestion, a maintenance tool: downloads official rule sources (cached under
// .cache/rules/) and writes the committed library under data/rules/. The app never fetches rules.
// Rerunning with the cache in place reproduces the same files; delete .cache/rules/ to refresh.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuleRecord } from '../../data/rules/index';
import { ingestFederalSections } from './federal-sections';
import { ingestFrcp } from './frcp';
import { ingestMnCourtRules } from './mn-court-rules';
import { ingestMnStatutes } from './mn-statutes';

const OUT = join(import.meta.dirname, '..', '..', 'data', 'rules');

function write(file: string, records: RuleRecord[]) {
  writeFileSync(join(OUT, file), `${JSON.stringify(records, null, 2)}\n`);
  console.log(`${file}: ${records.length} records`);
}

const frcp = await ingestFrcp();
const mn = await ingestMnCourtRules();
const targeted = [...(await ingestFederalSections()), ...(await ingestMnStatutes())];

write('frcp.json', frcp);
write('mn-civ.json', mn['mn-civ']);
write('mn-gp.json', mn['mn-gp']);
write('targeted.json', targeted);
