import schedule from './views/scheduling-order.json' with { type: 'json' };
import type { MatterWithDeadlines } from '../../src/data/schema';

export const publicOrder: MatterWithDeadlines = {
  ...structuredClone(schedule) as MatterWithDeadlines,
  id: 'fictional-public-order',
  title: 'Fictional Alder Lantern v. Fictional Juniper Works',
  synthetic: false,
  forum: 'Fictional District Court',
  publicRecord: { court: 'Fictional District Court', caseNumber: 'FAKE-27-cv-0042' },
  client: { name: 'Public court record (no client)', contact: 'public-record@example.invalid' },
  parties: [],
  clientFacing: { status: 'Public court record uploaded for demonstration.', nextSteps: [] },
};
