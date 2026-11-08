import { rules } from './rules';
import type { DeadlineRuleSummary } from './types';

export type { DeadlineInput, DeadlineResult, DeadlineRuleSummary, Step } from './types';
export { computeDeadline } from './compute';

export function deadlineCatalog(): DeadlineRuleSummary[] {
  return rules.map(({ id, label, description, assumptions }) => ({
    id, label, description,
    assumptions: assumptions.map(control => ({ ...control, options: [...control.options] })),
  }));
}
