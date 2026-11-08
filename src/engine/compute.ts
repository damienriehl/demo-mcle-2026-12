import { federalHolidays } from './calendars/federal';
import { minnesotaHolidays } from './calendars/minnesota';
import { addDays, addMonths, calendarCovered, dayName, isCalendarDate, weekday } from './dates';
import { rules, type DeadlineRule } from './rules';
import type { DeadlineInput, DeadlineResult, Step } from './types';

function uncomputable(reason: string, steps: Step[]): DeadlineResult {
  return { status: 'uncomputable', reason, steps };
}

function finish(dueDate: string, steps: Step[], citation: Step['citation']): DeadlineResult {
  steps.push({ label: 'Final due date', date: dueDate, citation });
  return { status: 'computed', dueDate, steps };
}

function roll(date: string, rule: DeadlineRule, steps: Step[]): string | undefined {
  const holidays = rule.calendar === 'minnesota' ? minnesotaHolidays : federalHolidays;
  const delta = rule.direction === 'backward' ? -1 : 1;
  const landing = date;
  while (calendarCovered(date)) {
    const holiday = holidays[date];
    if (weekday(date) !== 0 && weekday(date) !== 6 && !holiday) break;
    if (holiday) steps.push({ label: `${date}: ${holiday.name} is a legal holiday.`, citation: holiday.citation });
    date = addDays(date, delta);
  }
  if (!calendarCovered(date)) return undefined;
  if (date !== landing) {
    steps.push({
      label: `Weekend/holiday landing on ${dayName(landing)}: move ${delta === 1 ? 'forward' : 'earlier'} to ${dayName(date)}.`,
      date, citation: rule.counting.roll,
    });
  } else {
    steps.push({ label: 'The landing day is neither a weekend nor a legal holiday; no calendar roll is required.', citation: rule.counting.roll });
  }
  return date;
}

export function computeDeadline(input: DeadlineInput): DeadlineResult {
  const rule = rules.find(candidate => candidate.id === input.deadlineRuleId);
  if (!rule) return uncomputable(`No computed-deadline logic on file for "${input.deadlineRuleId}". Verify independently.`, []);

  const steps: Step[] = [];
  const assumptions: DeadlineInput['assumptions'] = {};
  for (const control of rule.assumptions) {
    const supplied = input.assumptions[control.key] ?? control.default;
    const value = control.key === 'extensionMonths' && typeof supplied === 'number' ? String(supplied) : supplied;
    if (!control.options.some(option => option === value)) {
      return uncomputable(`Choose a supported ${control.label.toLowerCase()} assumption.`, steps);
    }
    assumptions[control.key] = value;
  }

  if (!isCalendarDate(input.trigger.date)) return uncomputable('The trigger must be a valid ISO calendar date (YYYY-MM-DD).', steps);
  let citation = rule.citation;
  let period = typeof rule.period.amount === 'number' ? rule.period.amount : 0;
  let triggerEvent = rule.triggerEvent;
  if (rule.kind === 'federal-answer' && assumptions.service === 'waiver') {
    period = rule.waiver.period;
    citation = rule.waiver.citation;
    triggerEvent = rule.waiver.triggerEvent;
  }
  steps.push({ label: `Trigger: ${triggerEvent}. Matter event: ${input.trigger.event}.`, date: input.trigger.date, citation });

  if (rule.kind === 'notice' || rule.kind === 'contract') {
    const section = input.inputs?.section;
    if (rule.kind === 'contract') {
      if (typeof section !== 'string' || !section.trim()) return uncomputable('The agreement section is required.', steps);
      citation = { ruleId: 'contract', subdivision: section };
      steps[0].citation = citation;
    }
    const date = input.inputs?.[rule.period.amount];
    if (!isCalendarDate(date)) return uncomputable(`Supply ${rule.period.amount} as the actual stated ISO date.`, steps);
    steps.push({ label: rule.kind === 'notice' ? 'Use the notice’s stated close date; no inferred period or calendar roll.' : `Use the deadline stated in the agreement, ${section}; no inferred calendar roll.`, date, citation });
    return finish(date, steps, citation);
  }

  const outsideCalendar = () => uncomputable('The required calendar date is outside the encoded 2026–2028 holiday calendars. Verify independently.', steps);
  if (!calendarCovered(input.trigger.date)) return outsideCalendar();

  if (rule.kind === 'patent') {
    const notified = input.inputs?.notifiedPeriodMonths;
    const maximum = input.inputs?.maximumMonths;
    if (typeof notified !== 'number' || !Number.isInteger(notified) || notified < 1
      || typeof maximum !== 'number' || !Number.isInteger(maximum) || maximum < notified || maximum > 6) {
      return uncomputable('The Office action must supply notifiedPeriodMonths and maximumMonths as whole months (1–6); no period is assumed.', steps);
    }
    const extension = Number(assumptions.extensionMonths);
    if (notified + extension > maximum) return uncomputable('The selected extension exceeds the Office action’s maximum response period.', steps);
    steps.push({ label: `Use the notified ${notified}-month response period from the Office action.`, citation });
    if (extension) steps.push({ label: `Extend by ${extension} month(s), assuming a permitted extension with the required petition and fee; maximum ${maximum} months.`, citation: { ruleId: 'cfr37:1.136', subdivision: '(a)(1)' } });
    period = notified + extension;
  }

  const service = rule.serviceAdjustments.find(adjustment => adjustment.method === assumptions.serviceMethod);
  if (service?.serviceCitation) steps.push({ label: 'Assumption: service by mail under Rule 5(b)(2)(C).', citation: service.serviceCitation });
  if (service?.position === 'before-count') {
    period += service.days;
    steps.push({ label: `Minnesota mail service: add ${service.days} days to the prescribed period before counting (${period} days total), under current Rule 6.01(e), formerly Rule 6.05.`, citation: service.citation });
  }

  steps.push({
    label: rule.kind === 'patent'
      ? 'Count calendar months from the original Office action mailing date; apply the patent weekend/holiday authority.'
      : rule.counting.explanation ?? 'Exclude the trigger day; count every intervening calendar day, including weekends and holidays.',
    citation: rule.counting.count,
  });
  if (rule.direction === 'backward') steps.push({ label: 'Count backward from the hearing; a weekend or holiday landing moves earlier.', citation: rule.counting.direction });
  steps.push({ label: `Use the ${rule.calendar} legal-holiday calendar.`, citation: rule.counting.holidays });

  const signedPeriod = rule.direction === 'backward' ? -period : period;
  let dueDate = rule.period.unit === 'days' ? addDays(input.trigger.date, signedPeriod)
    : addMonths(input.trigger.date, signedPeriod * (rule.period.unit === 'years' ? 12 : 1));
  steps.push({ label: `${rule.direction === 'forward' ? 'Add' : 'Subtract'} ${period} ${rule.period.unit}; landing day is ${dayName(dueDate)}.`, date: dueDate, citation });
  const rolled = roll(dueDate, rule, steps);
  if (!rolled) return outsideCalendar();
  dueDate = rolled;

  if (service?.position === 'after-roll') {
    dueDate = addDays(dueDate, service.days);
    steps.push({ label: `After the initial computation and calendar roll, add ${service.days} mail-service days; landing day is ${dayName(dueDate)}.`, date: dueDate, citation: service.citation });
    const secondRoll = roll(dueDate, rule, steps);
    if (!secondRoll) return outsideCalendar();
    dueDate = secondRoll;
  }
  return finish(dueDate, steps, citation);
}
