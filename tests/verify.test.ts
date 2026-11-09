import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VerifyDrawer } from '../src/verify/VerifyDrawer';
import { factContext } from '../src/verify/context';
import { computeDeadline } from '../src/engine';
import { getRule } from '../data/rules';
import { matterSchema } from '../src/data/schema';
import fixtures from './fixtures/views/matters.json';

describe('verification content', () => {
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
  });
});
