import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeadlineCard } from '../src/components/DeadlineCard';
import { VerifyDrawer } from '../src/verify/VerifyDrawer';
import { describe, expect, it } from 'vitest';
import * as orderRules from '../server/orders/apply';
import { computeDeadline, deadlineCatalog } from '../src/engine';
import { buildCalendar } from '../src/features/scheduling-order/ics';
import fixture from './fixtures/views/scheduling-order.json';
import type { MatterWithDeadlines } from '../src/data/schema';

describe('court date source after a move', () => {
  it.each([undefined, '2027-06-14'])('explains the date with movedFrom=%s', movedFrom => {
    const deadline = structuredClone(fixture.deadlines[0]);
    const quote = deadline.inputs!.quote;
    Object.assign(deadline.inputs!, movedFrom ? { date: '2027-06-21', movedFrom } : {});
    const result = computeDeadline({ ...deadline, trigger: { event: deadline.trigger.event, date: '2027-06-14' } });
    expect(result.status).toBe('computed');
    expect(result.steps[1].label).toBe(movedFrom
      ? `Moved on screen from 2027-06-14. The order, p. 2, states: “${quote}”`
      : `Use the date stated in the order, p. 2: “${quote}” No calendar roll applies.`);
  });
  it('exports the original order date as context for a moved date', () => {
    const matter = structuredClone(fixture) as MatterWithDeadlines;
    Object.assign(matter.deadlines[0].inputs!, { date: '2027-06-21', movedFrom: '2027-06-14' });
    const result = matter.computedDeadlines[matter.deadlines[0].id];
    if (result.status === 'computed') result.dueDate = '2027-06-21';
    const text = buildCalendar(matter).replace(/\r\n /g, '');
    expect(text).toContain('DESCRIPTION:Moved on screen · order p. 2 said Jun 14\\, 2027');
    expect(text).toContain(String(matter.deadlines[0].inputs!.quote).replace(/,/g, '\\,'));
    expect(text).toContain('DTSTART;VALUE=DATE:20270621');
  });
});

it('maps extraction courts and kinds explicitly to existing catalog IDs', () => {
  const map = orderRules.derivationRules;
  expect(map).toBeDefined();
  const catalogIds = deadlineCatalog().map(rule => rule.id);
  for (const court of Object.values(map)) {
    for (const rules of Object.values(court)) {
      for (const id of Object.values(rules)) expect(catalogIds).toContain(id);
    }
  }
  expect(map.minnesota['dispositive-hearing']).toEqual({
    motion: 'mn-gp-115-dispositive-motion', response: 'mn-gp-115-dispositive-response', reply: 'mn-gp-115-dispositive-reply',
  });
  expect(map.minnesota['nondispositive-hearing']).toEqual({
    motion: 'mn-gp-115-nondispositive-motion', response: 'mn-gp-115-nondispositive-response', reply: 'mn-gp-115-nondispositive-reply',
  });
});

it('labels a moved date in the card, its drawer and the downstream drawer', () => {
  const matter = structuredClone(fixture) as MatterWithDeadlines;
  const deadline = matter.deadlines[0];
  Object.assign(deadline.inputs!, { date: '2027-06-21', movedFrom: '2027-06-14' });
  const label = 'Moved on screen · order p. 2 said Jun 14, 2027';
  expect(renderToStaticMarkup(createElement(DeadlineCard, { matter, index: 0, onVerify() {} }))).toContain(label);
  for (const index of [0, 3]) {
    const selected = matter.deadlines[index];
    expect(renderToStaticMarkup(createElement(VerifyDrawer, { matter, selection: {
      matterId: matter.id, deadlineId: selected.id, label: selected.label,
    }, onClose() {} }))).toContain(label);
  }
});

it('labels the moved governing date when a default is superseded', () => {
  const matter = structuredClone(fixture) as MatterWithDeadlines;
  const governing = matter.deadlines[1];
  Object.assign(governing.inputs!, { date: '2027-02-08', movedFrom: '2027-02-01' });
  const result = matter.computedDeadlines[governing.id];
  if (result.status === 'computed') result.dueDate = '2027-02-08';
  const index = 2;
  const deadline = matter.deadlines[index];
  const label = 'Moved on screen · order p. 1 said Feb 1, 2027';
  const card = renderToStaticMarkup(createElement(DeadlineCard, { matter, index, onVerify() {} }));
  const drawer = renderToStaticMarkup(createElement(VerifyDrawer, { matter, selection: {
    matterId: matter.id, deadlineId: deadline.id, label: deadline.label,
  }, onClose() {} }));
  for (const html of [card, drawer]) {
    expect(html).toContain(label);
    expect(html).toContain('Feb 8, 2027');
    expect(html).not.toMatch(/the order sets this date/i);
  }
});
