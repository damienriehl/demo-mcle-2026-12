import { rules } from './rules';
import type { DeadlineInput, DeadlineRuleSummary } from './types';

export type { DeadlineInput, DeadlineResult, DeadlineRuleSummary, Step } from './types';
export { computeDeadline } from './compute';

export const COURT_ORDER_RULE_ID = 'court-order-date';

export function isCourtOrderDate(deadline: Pick<DeadlineInput, 'deadlineRuleId'>): boolean {
  return deadline.deadlineRuleId === COURT_ORDER_RULE_ID;
}

export function deadlineCatalog(): DeadlineRuleSummary[] {
  return rules.map(({ id, label, description, orderException, assumptions }) => ({
    id, label, description, orderException,
    assumptions: assumptions.map(control => ({ ...control, options: [...control.options] })),
  }));
}
