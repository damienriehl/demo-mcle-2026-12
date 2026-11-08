import { describe, expect, it } from 'vitest';
import { computeDeadline, deadlineCatalog } from '../src/engine/index';
import type { DeadlineInput, DeadlineResult } from '../src/engine/types';

function compute(id: string, date: string, assumptions: DeadlineInput['assumptions'] = {}, inputs?: DeadlineInput['inputs']) {
  return computeDeadline({ deadlineRuleId: id, trigger: { event: 'Matter event', date }, assumptions, inputs });
}

function computed(result: DeadlineResult) {
  expect(result.status).toBe('computed');
  if (result.status !== 'computed') throw new Error(result.reason);
  expect(result.steps.at(-1)?.date).toBe(result.dueDate);
  for (const step of result.steps) expect(step.citation.ruleId).toBeTruthy();
  return result;
}

describe('cited deadline catalog', () => {
  // Periods from the official FRCP, effective Dec. 1, 2025:
  // https://www.uscourts.gov/sites/default/files/document/federal-rules-of-civil-procedure.pdf
  // Minnesota periods: https://www.revisor.mn.gov/court_rules/cp/id/12/
  // https://www.revisor.mn.gov/court_rules/cp/id/34/
  // https://www.revisor.mn.gov/court_rules/cp/id/59/
  // https://www.revisor.mn.gov/court_rules/gp/id/115/
  // https://www.revisor.mn.gov/court_rules/gp/id/303/
  const civilExamples = [
    ['frcp-12a-answer', '2026-09-01', '2026-09-22', 'frcp:12', '(a)(1)(A)(i)'],
    ['mn-civ-12-answer', '2026-09-01', '2026-09-22', 'mn-civ:12', '12.01'],
    ['frcp-33-interrogatories', '2026-09-01', '2026-10-01', 'frcp:33', '(b)(2)'],
    ['mn-civ-34-production', '2026-09-01', '2026-10-01', 'mn-civ:34', '34.02(c)(1)'],
    ['frcp-12a-counterclaim-answer', '2026-09-01', '2026-09-22', 'frcp:12', '(a)(1)(B)'],
    ['frcp-12a-crossclaim-answer', '2026-09-01', '2026-09-22', 'frcp:12', '(a)(1)(B)'],
    ['frcp-12a-post-motion-answer', '2026-09-01', '2026-09-15', 'frcp:12', '(a)(4)(A)'],
    ['frcp-34-production', '2026-09-01', '2026-10-01', 'frcp:34', '(b)(2)(A)'],
    ['frcp-36-admissions', '2026-09-01', '2026-10-01', 'frcp:36', '(a)(3)'],
    ['frcp-59-new-trial', '2026-09-01', '2026-09-29', 'frcp:59', '(b)'],
    ['frcp-59-alter-judgment', '2026-09-01', '2026-09-29', 'frcp:59', '(e)'],
    ['frcp-50-renewed-judgment', '2026-09-01', '2026-09-29', 'frcp:50', '(b)'],
    ['mn-civ-59-new-trial', '2026-09-01', '2026-10-01', 'mn-civ:59', '59.03'],
    ['mn-gp-115-dispositive-motion', '2026-10-05', '2026-09-04', 'mn-gp:115', '115.03(a)'],
    ['mn-gp-115-dispositive-response', '2026-10-05', '2026-09-21', 'mn-gp:115', '115.03(b)'],
    ['mn-gp-115-dispositive-reply', '2026-10-05', '2026-09-28', 'mn-gp:115', '115.03(c)'],
    ['mn-gp-303-family-motion', '2026-10-05', '2026-09-14', 'mn-gp:303', '303.03(a)(1)'],
    ['mn-gp-303-family-new-issues', '2026-10-05', '2026-09-21', 'mn-gp:303', '303.03(a)(2)'],
    ['mn-gp-303-family-response', '2026-10-05', '2026-09-28', 'mn-gp:303', '303.03(a)(3)'],
  ];

  it.each(civilExamples)('%s applies its own period and citation', (id, trigger, due, ruleId, subdivision) => {
    const result = computed(compute(id, trigger));
    expect(result.dueDate).toBe(due);
    expect(result.steps.some(step => step.citation.ruleId === ruleId && step.citation.subdivision === subdivision)).toBe(true);
  });

  it('exposes 25 rules and the actual assumption controls', () => {
    const catalog = deadlineCatalog();
    expect(catalog).toHaveLength(25);
    expect(new Set(catalog.map(rule => rule.id)).size).toBe(25);
    expect(catalog.find(rule => rule.id === 'frcp-12a-answer')?.assumptions).toContainEqual({
      key: 'service', label: 'Service', options: ['personal', 'waiver'], default: 'personal',
    });
    expect(catalog.find(rule => rule.id === 'frcp-33-interrogatories')?.assumptions).toContainEqual({
      key: 'serviceMethod', label: 'Service method', options: ['personal', 'electronic', 'mail'], default: 'personal',
    });
  });
});

describe('ordered counting and service steps', () => {
  // FRCP 12(a)(1)(A)(i)-(ii), 6(a)(1)(C): Tuesday service versus domestic waiver request.
  it('switches from 21 days after service to 60 days after sending the waiver request', () => {
    const personal = computed(compute('frcp-12a-answer', '2026-09-01', { service: 'personal' }));
    const waiver = computed(compute('frcp-12a-answer', '2026-09-01', { service: 'waiver' }));
    expect(personal.dueDate).toBe('2026-09-22');
    expect(waiver.dueDate).toBe('2026-11-02');
    expect(waiver.steps[0].label).toMatch(/waiver request.*sent/i);
    expect(waiver.steps).toContainEqual(expect.objectContaining({ date: '2026-10-31', citation: { ruleId: 'frcp:12', subdivision: '(a)(1)(A)(ii)' } }));
    expect(waiver.steps).toContainEqual(expect.objectContaining({ date: '2026-11-02', citation: { ruleId: 'frcp:6', subdivision: '(a)(1)(C)' } }));
  });

  // FRCP 33(b)(2), 5(b)(2)(C), 6(a), 6(d): 30 days -> Saturday -> Monday -> Thursday.
  it('adds federal mail days AFTER the first weekend roll', () => {
    const result = computed(compute('frcp-33-interrogatories', '2026-10-01', { serviceMethod: 'mail' }));
    expect(result.dueDate).toBe('2026-11-05');
    expect(result.steps.filter(step => step.date).map(step => step.date)).toEqual([
      '2026-10-01', '2026-10-31', '2026-11-02', '2026-11-05', '2026-11-05',
    ]);
    const mail = result.steps.findIndex(step => step.citation.ruleId === 'frcp:6' && step.citation.subdivision === '(d)');
    expect(result.steps.slice(0, mail).some(step => step.date === '2026-11-02')).toBe(true);
    expect(result.steps.some(step => step.citation.ruleId === 'frcp:5' && step.citation.subdivision === '(b)(2)(C)')).toBe(true);
  });

  it('rolls again when the federal three-day addition lands on Saturday', () => {
    expect(computed(compute('frcp-33-interrogatories', '2026-10-05', { serviceMethod: 'mail' })).dueDate).toBe('2026-11-09');
  });

  it('does not add mail days for electronic service', () => {
    expect(computed(compute('frcp-33-interrogatories', '2026-10-01', { serviceMethod: 'electronic' })).dueDate).toBe('2026-11-02');
  });

  // Minn. R. Civ. P. 6.01(e), formerly 6.05, adds to the prescribed period before 6.01(a).
  it('extends the Minnesota prescribed period BEFORE counting', () => {
    const result = computed(compute('mn-civ-34-production', '2026-10-01', { serviceMethod: 'mail' }));
    expect(result.dueDate).toBe('2026-11-03');
    const adjustment = result.steps.findIndex(step => step.citation.subdivision === '6.01(e)');
    const count = result.steps.findIndex(step => step.citation.subdivision === '6.01(a)(1)');
    expect(adjustment).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(adjustment);
    expect(result.steps[adjustment].label).toMatch(/33 days/);
  });

  // Minn. Gen. R. Prac. 115.03(a); Minn. R. Civ. P. 6.01(c).
  it('moves a Saturday backward landing to the preceding Friday', () => {
    const result = computed(compute('mn-gp-115-dispositive-motion', '2026-10-03'));
    expect(result.dueDate).toBe('2026-09-04');
    expect(result.steps).toContainEqual(expect.objectContaining({ date: '2026-09-05', citation: { ruleId: 'mn-gp:115', subdivision: '115.03(a)' } }));
    expect(result.steps.some(step => step.citation.subdivision === '6.01(c)')).toBe(true);
  });
});

describe('forum holiday calendars, 2026–2028', () => {
  // 5 USC 6103; FRCP 6(a)(6); Minn. Stat. 645.44 subd. 5; Minn. R. Civ. P. 6.01(d).
  it('rolls federal Thanksgiving to Friday and Minnesota Thanksgiving past its Friday holiday', () => {
    expect(computed(compute('frcp-12a-answer', '2026-11-05')).dueDate).toBe('2026-11-27');
    const mn = computed(compute('mn-civ-12-answer', '2026-11-05'));
    expect(mn.dueDate).toBe('2026-11-30');
    expect(mn.steps.some(step => step.label.includes('Friday after Thanksgiving') && step.citation.ruleId === 'mn-stat:645.44')).toBe(true);
  });

  it.each(['frcp-12a-answer', 'mn-civ-12-answer'])('%s observes a Saturday holiday on Friday', id => {
    expect(computed(compute(id, '2026-06-12')).dueDate).toBe('2026-07-06');
  });

  it.each(['frcp-12a-answer', 'mn-civ-12-answer'])('%s includes Juneteenth 2027 and its Friday observance', id => {
    expect(computed(compute(id, '2027-05-28')).dueDate).toBe('2027-06-21');
    const saturday = computed(compute(id, '2027-05-29'));
    expect(saturday.dueDate).toBe('2027-06-21');
    expect(saturday.steps.some(step => step.label.includes('Juneteenth'))).toBe(true);
  });

  it.each(['frcp-12a-answer', 'mn-civ-12-answer'])('%s includes 2028 leap days and observed New Year across the year boundary', id => {
    expect(computed(compute(id, '2028-02-08')).dueDate).toBe('2028-02-29');
    expect(computed(compute(id, '2027-12-10')).dueDate).toBe('2028-01-03');
    expect(computed(compute(id, '2028-05-29')).dueDate).toBe('2028-06-20');
  });
});

describe('bankruptcy, patents, employment, notice and agreement dates', () => {
  // FRBP 3002(c), 9006(a), official text:
  // https://www.uscourts.gov/sites/default/files/document/federal-rules-of-bankruptcy-procedure.pdf
  it('counts a voluntary-case proof of claim for 70 days under bankruptcy counting rules', () => {
    const result = computed(compute('frbp-3002-proof-of-claim', '2026-09-01'));
    expect(result.dueDate).toBe('2026-11-10');
    expect(result.steps.some(step => step.citation.ruleId === 'frbp:9006')).toBe(true);
    expect(result.steps.some(step => step.citation.ruleId === 'frcp:6')).toBe(false);
    expect(computed(compute('frbp-3002-proof-of-claim', '2026-09-17')).dueDate).toBe('2026-11-27');
  });

  // 37 CFR 1.134, 1.136(a), 1.7(a); 35 USC 21(b):
  // https://www.uspto.gov/web/offices/pac/mpep/s710.html
  it.each([
    ['0', '2027-02-01'], ['1', '2027-03-01'], ['2', '2027-03-31'], ['3', '2027-04-30'],
  ])('extends the notified three-month patent period by %s months from the original mailing date', (extensionMonths, dueDate) => {
    const result = computed(compute('patent-office-action-response', '2026-10-31', { extensionMonths }, { notifiedPeriodMonths: 3, maximumMonths: 6 }));
    expect(result.dueDate).toBe(dueDate);
    expect(result.steps.some(step => step.citation.ruleId === 'usc:35-21')).toBe(true);
    expect(result.steps.some(step => step.citation.ruleId === 'cfr37:1.7')).toBe(true);
    expect(result.steps.some(step => step.citation.ruleId === 'frcp:6')).toBe(false);
    if (extensionMonths !== '0') expect(result.steps.some(step => step.citation.ruleId === 'cfr37:1.136')).toBe(true);
  });

  it('uses the supplied patent period rather than assuming three months', () => {
    expect(computed(compute('patent-office-action-response', '2026-09-01', {}, { notifiedPeriodMonths: 2, maximumMonths: 6 })).dueDate).toBe('2026-11-02');
  });

  // 42 USC 2000e-5(e)(1); EEOC next-business-day interpretation:
  // https://www.eeoc.gov/time-limits-filing-charge
  it('counts the 300-day EEOC window from the act', () => {
    expect(computed(compute('eeoc-charge', '2026-01-01')).dueDate).toBe('2026-10-28');
    expect(computed(compute('eeoc-charge', '2026-01-03')).dueDate).toBe('2026-10-30');
  });

  // https://www.revisor.mn.gov/statutes/cite/363A.28#stat.363A.28.3
  // https://www.revisor.mn.gov/statutes/cite/645.15
  it('counts one calendar year for the Minnesota human-rights charge using statutory counting', () => {
    const result = computed(compute('mhra-charge', '2027-03-01'));
    expect(result.dueDate).toBe('2028-03-01');
    expect(result.steps.some(step => step.citation.ruleId === 'mn-stat:645.15')).toBe(true);
    expect(result.steps.some(step => step.citation.ruleId === 'mn-civ:6')).toBe(false);
  });

  // 5 USC 553(b)(1), (c): notice controls, rather than a made-up universal comment period.
  it('uses the stated notice close date exactly, even on a Saturday', () => {
    const result = computed(compute('apa-comment-close', '2026-09-01', {}, { noticeCloseDate: '2026-10-03' }));
    expect(result.dueDate).toBe('2026-10-03');
    expect(result.steps.every(step => step.citation.ruleId === 'usc:5-553')).toBe(true);
  });

  it('uses the agreement date and section exactly without adding court counting rules', () => {
    const result = computed(compute('contract-deadline', '2026-09-01', {}, { dueDate: '2026-10-03', section: 'Section 4.2' }));
    expect(result.dueDate).toBe('2026-10-03');
    expect(result.steps.every(step => step.citation.ruleId === 'contract' && step.citation.subdivision === 'Section 4.2')).toBe(true);
  });
});

describe('uncomputable results carry reasons and no due date', () => {
  it.each(['none', 'usc:5-553', 'unknown-deadline'])('does not invent deadline logic for %s', id => {
    const result = compute(id, '2026-09-01');
    expect(result.status).toBe('uncomputable');
    expect(result).not.toHaveProperty('dueDate');
    if (result.status === 'uncomputable') expect(result.reason.length).toBeGreaterThan(0);
  });

  it.each([
    ['patent-office-action-response', {}, {}],
    ['patent-office-action-response', {}, { notifiedPeriodMonths: 3 }],
    ['patent-office-action-response', { extensionMonths: '4' }, { notifiedPeriodMonths: 3, maximumMonths: 6 }],
    ['apa-comment-close', {}, {}],
    ['contract-deadline', {}, { dueDate: '2026-10-03' }],
  ] satisfies [string, DeadlineInput['assumptions'], DeadlineInput['inputs']][])('requires the actual matter inputs and permitted extension for %s', (id, assumptions, inputs) => {
    expect(compute(id, '2026-09-01', assumptions, inputs).status).toBe('uncomputable');
  });

  it('does not manufacture a calendar date from an invalid trigger or an uncovered calendar year', () => {
    expect(compute('frcp-12a-answer', '2026-02-30').status).toBe('uncomputable');
    expect(compute('frcp-12a-answer', '2028-12-20').status).toBe('uncomputable');
  });
});
