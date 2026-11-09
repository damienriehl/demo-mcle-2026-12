import { getRule } from '../../../data/rules';
import type { MatterWithDeadlines } from '../../data/schema';

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold by UTF-8 octets, keeping each code point and the continuation space intact. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let width = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (width + bytes > 75) { result += '\r\n '; width = 1; }
    result += character;
    width += bytes;
  }
  return result;
}

export function buildCalendar(matter: MatterWithDeadlines, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matter Cockpit//Schedule//EN', 'CALSCALE:GREGORIAN'];
  for (const deadline of matter.deadlines) {
    const result = matter.computedDeadlines[deadline.id];
    if (deadline.supersededBy || result?.status !== 'computed') continue;
    const citations = [...new Set(result.steps.map(({ citation }) => {
      const rule = getRule(citation.ruleId);
      const subdivision = citation.subdivision ?? '';
      const suffix = rule && subdivision.startsWith(rule.number) ? subdivision.slice(rule.number.length) : subdivision;
      return `${rule?.citation ?? citation.ruleId}${suffix}`;
    }))];
    const description = deadline.deadlineRuleId === 'court-order-date'
      ? `From the order, p. ${deadline.inputs?.page}: ${deadline.inputs?.quote}`
      : `Code computed under ${citations.join('; ')}`;
    lines.push('BEGIN:VEVENT',
      `UID:${encodeURIComponent(matter.id)}/${encodeURIComponent(deadline.id)}@matter-cockpit`,
      `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${result.dueDate.replace(/-/g, '')}`,
      `SUMMARY:${escapeText(deadline.label)}`, `DESCRIPTION:${escapeText(description)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
