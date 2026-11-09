export type DeadlineInput = {
  deadlineRuleId: string;
  trigger: { event: string; date: string };
  assumptions: Record<string, string | number | boolean>;
  inputs?: Record<string, string | number>;
};

export type Step = { label: string; date?: string; citation: { ruleId: string; subdivision?: string } };

export type DeadlineResult =
  | { status: 'computed'; dueDate: string; steps: Step[]; inputKey?: string }
  | { status: 'uncomputable'; reason: string; steps: Step[] };

export type DeadlineRuleSummary = {
  id: string;
  label: string;
  description: string;
  orderException?: string;
  assumptions: { key: string; label: string; options: (string | boolean)[]; default: string | boolean }[];
};
