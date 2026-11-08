export type { DeadlineInput, Step, DeadlineResult, DeadlineRuleSummary } from '../engine/types';
import type { DeadlineInput, DeadlineResult, DeadlineRuleSummary } from '../engine/types';

export type DeadlineEngine = {
  computeDeadline: (input: DeadlineInput) => DeadlineResult;
  deadlineCatalog: () => DeadlineRuleSummary[];
};
