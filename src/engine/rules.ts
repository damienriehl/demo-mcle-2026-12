import type { DeadlineRuleSummary, Step } from './types';

type Citation = Step['citation'];
type Counting = { count: Citation; roll: Citation; direction: Citation; holidays: Citation; explanation?: string };
type ServiceAdjustment = { method: string; days: number; position: 'before-count' | 'after-roll'; citation: Citation; serviceCitation?: Citation };

export type DeadlineRule = DeadlineRuleSummary & {
  citation: Citation;
  triggerEvent: string;
  period: { amount: number | string; unit: 'days' | 'months' | 'years' | 'date' };
  counting: Counting;
  direction: 'forward' | 'backward';
  calendar: 'federal' | 'minnesota' | 'none';
  serviceAdjustments: ServiceAdjustment[];
} & (
  | { kind: 'federal-answer'; waiver: { period: number; citation: Citation; triggerEvent: string } }
  | { kind: 'period' | 'patent' | 'notice' | 'contract' | 'court-order' }
);

const cite = (ruleId: string, subdivision?: string): Citation => ({ ruleId, ...(subdivision ? { subdivision } : {}) });
const federalCounting: Counting = {
  count: cite('frcp:6', '(a)(1)'), roll: cite('frcp:6', '(a)(1)(C)'),
  direction: cite('frcp:6', '(a)(5)'), holidays: cite('frcp:6', '(a)(6)'),
};
const minnesotaCounting: Counting = {
  count: cite('mn-civ:6', '6.01(a)(1)'), roll: cite('mn-civ:6', '6.01(a)(1)(C)'),
  direction: cite('mn-civ:6', '6.01(c)'), holidays: cite('mn-civ:6', '6.01(d)'),
};
const serviceMethod: DeadlineRuleSummary['assumptions'] = [{
  key: 'serviceMethod', label: 'Service method', options: ['personal', 'electronic', 'mail'], default: 'personal',
}];
const federalMail: ServiceAdjustment[] = [{
  method: 'mail', days: 3, position: 'after-roll', citation: cite('frcp:6', '(d)'), serviceCitation: cite('frcp:5', '(b)(2)(C)'),
}];
// Current Minnesota text relocated former Rule 6.05 to Rule 6.01(e) in 2020.
const minnesotaMail: ServiceAdjustment[] = [{
  method: 'mail', days: 3, position: 'before-count', citation: cite('mn-civ:6', '6.01(e)'),
}];

function civil(
  id: string, label: string, ruleId: string, subdivision: string, days: number,
  triggerEvent: string, calendar: 'federal' | 'minnesota',
  direction: 'forward' | 'backward' = 'forward', afterService = false,
): DeadlineRule {
  return {
    id, label, description: `${days} days ${direction === 'forward' ? 'after' : 'before'} ${triggerEvent}; the rule’s ordinary period.`,
    citation: cite(ruleId, subdivision), triggerEvent, period: { amount: days, unit: 'days' },
    counting: calendar === 'federal' ? federalCounting : minnesotaCounting, calendar, direction,
    serviceAdjustments: afterService ? (calendar === 'federal' ? federalMail : minnesotaMail) : [],
    assumptions: afterService ? serviceMethod : [], kind: 'period',
  };
}

// Period sources (official rule text, not model output):
// https://www.uscourts.gov/sites/default/files/document/federal-rules-of-civil-procedure.pdf
// https://www.revisor.mn.gov/court_rules/cp/id/12/
// https://www.revisor.mn.gov/court_rules/cp/id/34/
// https://www.revisor.mn.gov/court_rules/cp/id/59/
// https://www.revisor.mn.gov/court_rules/gp/id/115/
// https://www.revisor.mn.gov/court_rules/gp/id/303/
export const rules: DeadlineRule[] = [
  {
    ...civil('frcp-12a-answer', 'Federal answer to complaint', 'frcp:12', '(a)(1)(A)(i)', 21, 'service of the summons and complaint', 'federal'),
    kind: 'federal-answer',
    description: '21 days after service, or 60 days after a domestic Rule 4(d) waiver request was sent. The trigger date must describe the selected event; excludes foreign waivers and government defendants.',
    assumptions: [{ key: 'service', label: 'Service', options: ['personal', 'waiver'], default: 'personal' }],
    waiver: { period: 60, citation: cite('frcp:12', '(a)(1)(A)(ii)'), triggerEvent: 'Rule 4(d) waiver request sent (domestic defendant)' },
  },
  civil('mn-civ-12-answer', 'Minnesota answer to complaint', 'mn-civ:12', '12.01', 21, 'service of the summons', 'minnesota'),
  civil('frcp-33-interrogatories', 'Federal interrogatory responses', 'frcp:33', '(b)(2)', 30, 'service of interrogatories', 'federal', 'forward', true),
  civil('mn-civ-34-production', 'Minnesota production responses', 'mn-civ:34', '34.02(c)(1)', 30, 'service (or deemed service) of production requests', 'minnesota', 'forward', true),
  {
    id: 'frbp-3002-proof-of-claim', label: 'Bankruptcy proof of claim',
    description: '70 days after the order for relief in a voluntary Chapter 7, 12 or 13 case; ordinary creditor, no Rule 3002(c) exception or different bar-date notice.',
    triggerEvent: 'order for relief in a voluntary case', citation: cite('frbp:3002', '(c)'),
    period: { amount: 70, unit: 'days' }, direction: 'forward', calendar: 'federal', kind: 'period',
    counting: {
      count: cite('frbp:9006', '(a)(1)'), roll: cite('frbp:9006', '(a)(1)(C)'),
      direction: cite('frbp:9006', '(a)(5)'), holidays: cite('frbp:9006', '(a)(6)'),
    },
    serviceAdjustments: [], assumptions: [],
  },
  {
    id: 'patent-office-action-response', label: 'Non-final Office action response',
    description: 'Inputs notifiedPeriodMonths and maximumMonths come from the Office action. Extension months require an available 1.136(a) extension, petition and fee; never extend past the notified maximum or six months.',
    triggerEvent: 'mailing of the non-final Office action', citation: cite('cfr37:1.134'),
    period: { amount: 'notifiedPeriodMonths', unit: 'months' }, direction: 'forward', calendar: 'federal', kind: 'patent',
    counting: {
      count: cite('usc:35-21', '(b)'), roll: cite('cfr37:1.7', '(a)'),
      direction: cite('usc:35-21', '(b)'), holidays: cite('usc:5-6103', '(a), (b)'),
    },
    serviceAdjustments: [],
    assumptions: [{ key: 'extensionMonths', label: 'Extension months (petition and fee required)', options: ['0', '1', '2', '3', '4', '5'], default: '0' }],
  },
  {
    id: 'eeoc-charge', label: 'EEOC charge — 300-day window',
    description: '300 days after the discriminatory act, assuming state/local proceedings qualify and no earlier termination-notice deadline or tolling applies.',
    triggerEvent: 'discriminatory act', citation: cite('usc:42-2000e-5', '(e)(1)'),
    period: { amount: 300, unit: 'days' }, direction: 'forward', calendar: 'federal', kind: 'period',
    // EEOC interprets this statutory window as calendar days with next-business-day
    // treatment: https://www.eeoc.gov/time-limits-filing-charge
    // Cite the charge statute as administered by EEOC, rather than importing a
    // court-only procedural rule into an administrative charge.
    counting: {
      count: cite('usc:42-2000e-5', '(e)(1)'), roll: cite('usc:42-2000e-5', '(e)(1)'),
      direction: cite('usc:42-2000e-5', '(e)(1)'), holidays: cite('usc:5-6103', '(a), (b)'),
      explanation: 'EEOC published filing-time guidance applies calendar-day counting and next-business-day treatment to this statutory charge window.',
    },
    serviceAdjustments: [], assumptions: [],
  },
  {
    id: 'mhra-charge', label: 'Minnesota human-rights charge',
    description: 'One calendar year after the discriminatory practice, absent statutory tolling. Counts under Minn. Stat. 645.15.',
    triggerEvent: 'discriminatory practice', citation: cite('mn-stat:363A.28', 'subd. 3(a)'),
    period: { amount: 1, unit: 'years' }, direction: 'forward', calendar: 'minnesota', kind: 'period',
    counting: {
      count: cite('mn-stat:645.15'), roll: cite('mn-stat:645.15'),
      direction: cite('mn-stat:645.15'), holidays: cite('mn-stat:645.44', 'subd. 5'),
    },
    serviceAdjustments: [], assumptions: [],
  },
  {
    id: 'apa-comment-close', label: 'Rulemaking comment close',
    description: 'Input noticeCloseDate is the notice’s stated close date. No universal comment period or court-calendar adjustment is inferred.',
    triggerEvent: 'publication of the rulemaking notice', citation: cite('usc:5-553', '(b)(1), (c)'),
    period: { amount: 'noticeCloseDate', unit: 'date' }, direction: 'forward', calendar: 'none', kind: 'notice',
    counting: { count: cite('usc:5-553', '(b)(1), (c)'), roll: cite('usc:5-553'), direction: cite('usc:5-553'), holidays: cite('usc:5-553') },
    serviceAdjustments: [], assumptions: [],
  },
  {
    id: 'contract-deadline', label: 'Agreement deadline',
    description: 'Inputs dueDate (YYYY-MM-DD) and section identify the deadline stated in the matter’s agreement. No court-calendar adjustment is inferred.',
    triggerEvent: 'agreement event', citation: cite('contract'),
    period: { amount: 'dueDate', unit: 'date' }, direction: 'forward', calendar: 'none', kind: 'contract',
    counting: { count: cite('contract'), roll: cite('contract'), direction: cite('contract'), holidays: cite('contract') },
    serviceAdjustments: [], assumptions: [],
  },
  {
    id: 'court-order-date', label: 'Court-ordered date',
    description: 'Use only for a date the court’s order states. Inputs: date (YYYY-MM-DD), page (whole number, at least 1), and quote (the exact quote from that page). No calendar roll applies.',
    triggerEvent: 'date stated in the court’s order', citation: cite('order'),
    period: { amount: 'date', unit: 'date' }, direction: 'forward', calendar: 'none', kind: 'court-order',
    counting: { count: cite('order'), roll: cite('order'), direction: cite('order'), holidays: cite('order') },
    serviceAdjustments: [], assumptions: [],
  },
  {
    ...civil('frcp-26a2d-expert-disclosure', 'Federal expert disclosures', 'frcp:26', '(a)(2)(D)(i)', 90, 'the date set for trial or for the case to be ready for trial', 'federal', 'backward'),
    description: 'At least 90 days before the date set for trial or for the case to be ready for trial, unless the court orders otherwise or the parties stipulate otherwise.',
  },
  {
    ...civil('frcp-26a3-pretrial-disclosure', 'Federal pretrial disclosures', 'frcp:26', '(a)(3)(B)', 30, 'the date set for trial', 'federal', 'backward'),
    description: 'At least 30 days before trial, unless the court orders otherwise.',
  },
  {
    ...civil('frcp-26a3-objections', 'Federal objections to pretrial disclosures', 'frcp:26', '(a)(3)(B)', 14, 'the pretrial disclosures are made', 'federal'),
    description: 'Within 14 days after the pretrial disclosures are made, unless the court orders otherwise; serve and promptly file objections.',
  },
  {
    ...civil('mn-civ-26-expert-disclosure', 'Minnesota expert disclosures', 'mn-civ:26', '26.01(b)(4)(A)', 90, 'the date set for trial or for the case to be ready for trial', 'minnesota', 'backward'),
    description: 'At least 90 days before the date set for trial or for the case to be ready for trial, unless the court orders otherwise or the parties stipulate otherwise.',
  },
  {
    ...civil('mn-civ-26-pretrial-disclosure', 'Minnesota pretrial disclosures', 'mn-civ:26', '26.01(c)(2)', 30, 'the date set for trial', 'minnesota', 'backward'),
    description: 'At least 30 days before trial, unless the court orders otherwise.',
  },
  {
    ...civil('mn-civ-26-objections', 'Minnesota objections to pretrial disclosures', 'mn-civ:26', '26.01(c)(2)', 14, 'the pretrial disclosures are made', 'minnesota'),
    description: 'Within 14 days after the pretrial disclosures are made, unless the court orders otherwise; serve and promptly file objections.',
  },
  {
    ...civil('mn-gp-115-nondispositive-motion', 'Minnesota nondispositive motion service and filing', 'mn-gp:115', '115.04(a)', 21, 'the hearing', 'minnesota', 'backward'),
    description: 'Serve and file at least 21 days before the hearing, unless the court orders otherwise under Rule 115.01(b). Excludes post-trial motions.',
  },
  {
    ...civil('mn-gp-115-nondispositive-response', 'Minnesota nondispositive motion response', 'mn-gp:115', '115.04(b)', 14, 'the hearing', 'minnesota', 'backward'),
    description: 'Serve and file at least 14 days before the hearing, unless the court orders otherwise under Rule 115.01(b). Excludes post-trial motions.',
  },
  {
    ...civil('mn-gp-115-nondispositive-reply', 'Minnesota nondispositive motion reply', 'mn-gp:115', '115.04(c)', 7, 'the hearing', 'minnesota', 'backward'),
    description: 'Serve and file a reply limited to new legal or factual matters raised by the response at least 7 days before the hearing, unless the court orders otherwise under Rule 115.01(b). Excludes post-trial motions.',
  },
  civil('mn-gp-115-dispositive-motion', 'Minnesota dispositive motion service and filing', 'mn-gp:115', '115.03(a)', 28, 'the hearing', 'minnesota', 'backward'),
  civil('frcp-12a-counterclaim-answer', 'Federal answer to counterclaim', 'frcp:12', '(a)(1)(B)', 21, 'service of the counterclaim', 'federal', 'forward', true),
  civil('frcp-12a-crossclaim-answer', 'Federal answer to crossclaim', 'frcp:12', '(a)(1)(B)', 21, 'service of the crossclaim', 'federal', 'forward', true),
  civil('frcp-12a-post-motion-answer', 'Federal answer after motion denied or deferred', 'frcp:12', '(a)(4)(A)', 14, 'notice that the court denied or deferred the motion until trial', 'federal'),
  civil('frcp-34-production', 'Federal production responses', 'frcp:34', '(b)(2)(A)', 30, 'service (or deemed service) of production requests', 'federal', 'forward', true),
  civil('frcp-36-admissions', 'Federal admission responses', 'frcp:36', '(a)(3)', 30, 'service of requests for admission', 'federal', 'forward', true),
  civil('frcp-59-new-trial', 'Federal new-trial motion', 'frcp:59', '(b)', 28, 'entry of judgment', 'federal'),
  civil('frcp-59-alter-judgment', 'Federal motion to alter or amend judgment', 'frcp:59', '(e)', 28, 'entry of judgment', 'federal'),
  civil('frcp-50-renewed-judgment', 'Federal renewed judgment motion after a verdict', 'frcp:50', '(b)', 28, 'entry of judgment after a verdict was returned', 'federal'),
  civil('mn-civ-59-new-trial', 'Minnesota new-trial notice after general verdict', 'mn-civ:59', '59.03', 30, 'the general verdict (service deadline only; the hearing has a separate limit)', 'minnesota'),
  civil('mn-gp-115-dispositive-response', 'Minnesota dispositive motion response', 'mn-gp:115', '115.03(b)', 14, 'the hearing', 'minnesota', 'backward'),
  civil('mn-gp-115-dispositive-reply', 'Minnesota dispositive motion reply', 'mn-gp:115', '115.03(c)', 7, 'the hearing', 'minnesota', 'backward'),
  civil('mn-gp-303-family-motion', 'Minnesota family motion service and filing', 'mn-gp:303', '303.03(a)(1)', 21, 'the family motion hearing (not a post-trial motion)', 'minnesota', 'backward'),
  civil('mn-gp-303-family-new-issues', 'Minnesota family response raising new issues', 'mn-gp:303', '303.03(a)(2)', 14, 'the family motion hearing (not a post-trial motion)', 'minnesota', 'backward'),
  civil('mn-gp-303-family-response', 'Minnesota family motion response', 'mn-gp:303', '303.03(a)(3)', 7, 'the family motion hearing (not a post-trial motion)', 'minnesota', 'backward'),
];

// Bankruptcy: https://www.uscourts.gov/sites/default/files/document/federal-rules-of-bankruptcy-procedure.pdf
// Patent periods, extensions, calendar months and weekend/holiday computation:
// https://www.uspto.gov/web/offices/pac/mpep/s710.html
// https://www.uspto.gov/web/offices/pac/mpep/s710.html#d0e111368
// Employment: https://www.eeoc.gov/statutes/title-vii-civil-rights-act-1964
// https://www.revisor.mn.gov/statutes/cite/363A.28#stat.363A.28.3
// https://www.revisor.mn.gov/statutes/cite/645.15
// Notice: https://www.govinfo.gov/content/pkg/USCODE-2024-title5/html/USCODE-2024-title5-partI-chap5-subchapII-sec553.htm
