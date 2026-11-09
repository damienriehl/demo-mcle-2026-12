import { computeDeadline, type DeadlineResult } from '../../../src/engine';
import { matterSchema, type MatterWithDeadlines } from '../../../src/data/schema';

export function schedulingMatter(): MatterWithDeadlines {
  const matter = matterSchema.parse({
    id: 'scheduling-order', title: 'Aster Workshop v. Birch Studio', practiceArea: 'litigation',
    forum: 'D. Minn.', synthetic: true,
    client: { name: 'Aster Workshop', contact: 'aster@example.invalid' },
    parties: [], timeline: [], documents: [], provenance: {},
    clientFacing: { status: 'The court has set the schedule.', nextSteps: [] },
    deadlines: [
      { id: 'trial', label: 'Trial ready date', deadlineRuleId: 'court-order-date',
        trigger: { event: 'Scheduling order entered', date: '2026-11-02' }, assumptions: {},
        inputs: { date: '2027-06-14', page: 2, quote: 'Trial ready date: June 14, 2027.' } },
      { id: 'pretrial', label: 'Pretrial disclosures', deadlineRuleId: 'frcp-26a3-pretrial-disclosure',
        trigger: { event: 'Trial', fromDeadline: 'trial' }, assumptions: {} },
      { id: 'objections', label: 'Objections to pretrial disclosures', deadlineRuleId: 'frcp-26a3-objections',
        trigger: { event: 'Pretrial disclosures', fromDeadline: 'pretrial' }, assumptions: {} },
      { id: 'expert-order', label: 'Court-set expert disclosures', deadlineRuleId: 'court-order-date',
        trigger: { event: 'Scheduling order entered', date: '2026-11-02' }, assumptions: {},
        inputs: { date: '2027-02-01', page: 3, quote: 'Expert disclosures are due February 1, 2027.' } },
      { id: 'expert-default', label: 'Default expert disclosures', deadlineRuleId: 'frcp-26a2d-expert-disclosure',
        trigger: { event: 'Trial', fromDeadline: 'trial' }, assumptions: {}, supersededBy: 'expert-order' },
    ],
  });
  const computedDeadlines: Record<string, DeadlineResult> = {};
  for (const deadline of matter.deadlines) {
    const upstream = 'fromDeadline' in deadline.trigger ? computedDeadlines[deadline.trigger.fromDeadline] : undefined;
    const date = 'date' in deadline.trigger ? deadline.trigger.date : upstream?.status === 'computed' ? upstream.dueDate : '';
    computedDeadlines[deadline.id] = computeDeadline({ ...deadline, trigger: { event: deadline.trigger.event, date } });
  }
  return { ...matter, computedDeadlines };
}
