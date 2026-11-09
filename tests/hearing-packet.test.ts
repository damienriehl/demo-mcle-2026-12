import { describe, expect, it } from 'vitest';
import type { MatterWithDeadlines } from '../src/data/schema';
import { NEEDS_KEY_LINE, chooseEvent, deadlineRows, deterministicNarrative, packetText } from '../src/features/hearing-packet/packet';
import { repairNarrative, verifyQuote } from '../server/hearing-packet/analyze';

function matter(overrides: Partial<MatterWithDeadlines> = {}): MatterWithDeadlines {
  return {
    id: 'm1', title: 'In re Test', forum: 'Hennepin County District Court', practiceArea: 'family', synthetic: true,
    client: { name: 'Aster', contact: 'aster@example.invalid' }, parties: [],
    timeline: [
      { id: 'event-1', event: 'Petition filed', date: '2026-09-08' },
      { id: 'event-2', event: 'Court set a motion hearing', date: '2026-11-02' },
      { id: 'event-5', event: 'Scheduled temporary-custody motion hearing', date: '2026-12-06' },
    ],
    documents: [{ id: 'doc-1', title: 'Hearing notice', kind: 'notice', body: 'Aster seeks an ordinary temporary-custody schedule, not emergency relief.' }],
    deadlines: [
      { id: 'motion-papers', label: 'Serve and file motion papers', deadlineRuleId: 'none', trigger: { event: 'x', date: '2026-12-06' }, assumptions: {} },
      { id: 'agreed-draft', label: 'Agreed delivery of draft', deadlineRuleId: 'none', trigger: { event: 'x', date: '2026-11-06' }, assumptions: {} },
    ],
    computedDeadlines: {
      'motion-papers': { status: 'computed', dueDate: '2026-11-22', steps: [] },
      'agreed-draft': { status: 'computed', dueDate: '2026-11-19', steps: [] },
    },
    clientFacing: { status: 's', nextSteps: [] }, provenance: {},
    ...overrides,
  } as MatterWithDeadlines;
}

describe('choosing the event', () => {
  it('defaults to the next upcoming hearing over earlier motion deadlines and past hearings', () => {
    const choice = chooseEvent(matter(), '2026-11-09');
    expect(choice.event?.key).toBe('timeline:event-5');
    expect(choice.fallback).toBe(false);
  });
  it('honors a lawyer-picked event', () => {
    expect(chooseEvent(matter(), '2026-11-09', 'deadline:agreed-draft').event?.label).toBe('Agreed delivery of draft');
  });
  it('falls back to the next deadline when no court event exists', () => {
    const m = matter({ timeline: [{ id: 'e', event: 'Letter of intent signed', date: '2026-10-01' }] });
    m.deadlines[0].label = 'Closing deliverables';
    const choice = chooseEvent(m, '2026-11-09');
    expect(choice.fallback).toBe(true);
    expect(choice.event?.label).toBe('Agreed delivery of draft');
  });
  it('lists deadlines relative to the event, from computed dates', () => {
    const rows = deadlineRows(matter(), '2026-12-06');
    expect(rows.map(r => [r.dueDate, r.relative])).toEqual([['2026-11-19', '17 days before the event'], ['2026-11-22', '14 days before the event']]);
  });
});

describe('quote verification', () => {
  it('accepts literal substrings modulo whitespace and curly quotes', () => {
    expect(verifyQuote('ordinary  temporary-custody schedule', 'Aster seeks an ordinary temporary-custody schedule.')).toBe(true);
    expect(verifyQuote('client’s motion', "the client's motion")).toBe(true);
  });
  it('rejects paraphrases and empty quotes', () => {
    expect(verifyQuote('Aster wants emergency custody', 'Aster seeks an ordinary temporary-custody schedule.')).toBe(false);
    expect(verifyQuote('', 'anything')).toBe(false);
  });
});

describe('repairing the model response', () => {
  it('keeps good sections, drops bad items, verifies quotes, and dates events from the timeline', () => {
    const raw = 'Here is the packet:\n' + JSON.stringify({
      happened: [{ timelineId: 'event-2', text: 'The court set the hearing.' }, { timelineId: 'event-1', text: 'Petition filed.' }, { nope: 1 }],
      issues: ['Should the court adopt the proposed schedule?', 42],
      ourPosition: 'not an array',
      theirArguments: [{ argument: 'Status quo', response: 'The trial schedule worked' }, { argument: 'missing response' }],
      excerpts: [
        { documentId: 'doc-1', quote: 'not emergency relief', why: 'Frames the relief' },
        { documentId: 'doc-1', quote: 'Aster demands sole custody', why: 'Invented' },
        { documentId: 'doc-9', quote: 'x', why: 'unknown doc' },
      ],
    }) + '\nThanks';
    const n = repairNarrative(raw, matter());
    expect(n.happened).toEqual([{ date: '2026-09-08', text: 'Petition filed.' }, { date: '2026-11-02', text: 'The court set the hearing.' }]);
    expect(n.issues).toEqual(['Should the court adopt the proposed schedule?']);
    expect(n.ourPosition).toBeUndefined();
    expect(n.theirArguments).toHaveLength(1);
    expect(n.excerpts?.map(x => [x.verified, x.quote])).toEqual([[true, 'not emergency relief'], [false, undefined]]);
    expect(n.omitted).toEqual(['ourPosition', 'risks', 'checklist']);
  });
  it('omits every section instead of crashing on non-JSON', () => {
    const n = repairNarrative('I cannot help with that.', matter());
    expect(n.omitted).toContain('issues');
    expect(n.issues).toBeUndefined();
  });
});

describe('no-key deterministic packet', () => {
  it('builds the timeline, deadlines, and checklist from structured data, with the key notice', () => {
    const m = matter();
    const choice = chooseEvent(m, '2026-11-09');
    const narrative = deterministicNarrative(m, choice.event);
    expect(narrative.happened?.map(h => h.date)).toEqual(['2026-09-08', '2026-11-02', '2026-12-06']);
    expect(narrative.issues).toBeUndefined();
    expect(narrative.checklist?.[0]).toContain('2026-12-06');
    const text = packetText({ matter: m, choice, today: '2026-11-09', narrative, live: false });
    expect(text).toContain('Date: 2026-12-06 (in 27 days)');
    expect(text).toContain('2026-11-22 — Serve and file motion papers (14 days before the event)');
    expect(text).toContain('Internal work product — prepared for counsel; verify before relying on it.');
    expect(text).toContain(NEEDS_KEY_LINE);
    expect(text).not.toContain('WHAT THE COURT WILL DECIDE');
  });
});
