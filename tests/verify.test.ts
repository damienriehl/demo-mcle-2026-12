import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerifyDrawer } from '../src/verify/VerifyDrawer';
import { factContext } from '../src/verify/context';
import { computeDeadline } from '../src/engine';
import { getRule } from '../data/rules';
import { matterSchema } from '../src/data/schema';
import fixtures from './fixtures/views/matters.json';
import { DeadlineCard } from '../src/components/DeadlineCard';
import { RuleText } from '../src/verify/RuleText';
import { schedulingMatter } from './fixtures/views/scheduling-order';

describe('verification content', () => {
  it('quotes the court-order exception verbatim from the cited rule for a superseded default', () => {
    const matter = schedulingMatter();
    const deadline = matter.deadlines.find(deadline => deadline.id === 'expert-default')!;
    const html = renderToStaticMarkup(createElement(VerifyDrawer, { matter,
      selection: { matterId: matter.id, deadlineId: deadline.id, label: deadline.label }, onClose() {} }));
    const reasoning = html.split('data-verify-section="reasoning"')[1].split('</section>')[0];
    const sentence = 'Absent a stipulation or a court order, the disclosures must be made:';
    expect(getRule('frcp:26')!.text).toContain(sentence);
    expect(reasoning).toContain(`<blockquote>${sentence}</blockquote>`);
    expect(reasoning).not.toContain('Unless the court orders otherwise, these disclosures must be made at least 30 days before trial.');
    expect(reasoning).toContain('The order sets this date: Court-set expert disclosures, Feb 1, 2027 (p. 3)');
  });

  it('omits the supersession quotation when the cited rule has no court-order exception sentence', () => {
    const matter = schedulingMatter();
    const deadline = matter.deadlines.find(deadline => deadline.id === 'expert-default')!;
    deadline.deadlineRuleId = 'frcp-12a-answer';
    const html = renderToStaticMarkup(createElement(VerifyDrawer, { matter,
      selection: { matterId: matter.id, deadlineId: deadline.id, label: deadline.label }, onClose() {} }));
    const reasoning = html.split('data-verify-section="reasoning"')[1].split('</section>')[0];
    expect(reasoning).toContain('The order sets this date:');
    expect(reasoning).not.toContain('<blockquote>');
  });

  it.each([
    ['contract-deadline', 'dueDate', 'stated', 'You said'],
    ['contract-deadline', 'dueDate', 'inferred', 'AI inferred'],
    ['contract-deadline', 'dueDate', 'invented', 'AI invented'],
    ['apa-comment-close', 'noticeCloseDate', 'stated', 'You said'],
    ['apa-comment-close', 'noticeCloseDate', 'inferred', 'AI inferred'],
    ['apa-comment-close', 'noticeCloseDate', 'invented', 'AI invented'],
  ] as const)('labels %s input dates as %s with %s provenance', (rule, key, source, label) => {
    const base = matterSchema.parse(fixtures[0]);
    const deadline = { id: 'input-date', label: 'Entered deadline', deadlineRuleId: rule,
      trigger: { event: 'Agreement or notice received', date: '2026-09-01' }, assumptions: {},
      inputs: { [key]: '2026-10-03', ...(rule === 'contract-deadline' ? { section: 'Section 4.2' } : {}) } };
    const result = computeDeadline(deadline);
    const matter = { ...base, deadlines: [deadline], computedDeadlines: { 'input-date': result },
      provenance: { ...base.provenance, [`deadlines.0.inputs.${key}`]: { source } } };
    const card = renderToStaticMarkup(createElement(DeadlineCard, { matter, index: 0, onVerify() {} }));
    const drawer = renderToStaticMarkup(createElement(VerifyDrawer, { matter,
      selection: { matterId: matter.id, deadlineId: deadline.id, label: deadline.label, result }, onClose() {} }));
    const dueSection = drawer.split('data-verify-section="due"')[1].split('</section>')[0];
    for (const html of [card, dueSection]) {
      expect(html).toContain('Oct 3, 2026');
      expect(html).toContain('From the matter');
      expect(html).toContain(label);
      expect(html).not.toContain('Code computed');
    }
    if (source !== 'stated') {
      expect(drawer).toContain(`Use the date entered for ${rule === 'contract-deadline' ? 'Section 4.2' : 'the notice close'}`);
      expect(drawer).not.toContain('Use the deadline stated in the agreement');
      expect(drawer).not.toContain('Use the notice’s stated close date');
    }
  });

  it.each([
    ['usc:5-6103', '(a), (b)', ['(a)', '(b)']],
    ['usc:5-553', '(b)(1), (c)', ['(b)', '(c)']],
  ] as const)('shows every cited subdivision of %s', (ruleId, subdivision, labels) => {
    const rule = getRule(ruleId)!;
    const html = renderToStaticMarkup(createElement(RuleText, { citation: { ruleId, subdivision } }));
    for (const label of labels) {
      const text = rule.subdivisions.find(part => part.label === label)!.text;
      expect(html).toContain(renderToStaticMarkup(createElement('div', { 'data-rule-excerpt': true }, text)));
    }
    expect(html).toContain(`Verbatim library text · ${labels.join(', ')}`);
    expect(html).not.toContain('(contains');
  });

  it('preserves exact, wildcard, and parent provenance evidence for facts', () => {
    const matter = { provenance: {
      parties: { source: 'invented' as const, evidence: 'Added a fictional party.' },
      'parties.*.name': { source: 'inferred' as const, evidence: 'The story names a counterparty.' },
      'parties.0.name': { source: 'stated' as const, evidence: 'Vale Workshop' },
    }, reasoning: 'A party is needed to describe the dispute.' };
    expect(factContext(matter, 'parties.0.name').provenance).toEqual({ source: 'stated', evidence: 'Vale Workshop' });
    expect(factContext(matter, 'parties.1.name').provenance).toEqual({ source: 'inferred', evidence: 'The story names a counterparty.' });
    expect(factContext(matter, 'parties.1.role').provenance).toEqual({ source: 'invented', evidence: 'Added a fictional party.' });
  });

  it('renders engine step labels verbatim and the cited library subdivision', () => {
    const base = matterSchema.parse(fixtures[0]);
    const deadline = { id: 'answer', label: 'Answer', deadlineRuleId: 'frcp-12a-answer', trigger: { event: 'Complaint served', date: '2026-11-03' }, assumptions: { service: 'personal' } };
    const result = computeDeadline(deadline);
    const html = renderToStaticMarkup(createElement(VerifyDrawer, { selection: { matterId: base.id, deadlineId: deadline.id, label: deadline.label, result }, matter: { ...base, deadlines: [deadline], computedDeadlines: { answer: result } }, onClose() {} }));
    for (const step of result.steps) expect(html).toContain(step.label);
    expect(html).toContain(getRule('frcp:12')!.subdivisions[0].text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
    expect(html).toContain('Nov 24, 2026');
    expect(html).toContain('Code computed');
    expect(html).not.toContain('From the matter');
  });
});
