import type { MatterWithDeadlines } from '../../data/schema';

/** Shared, pure packet logic: event choice, code-computed dates, the no-key packet, and plain text. */

export const CAUTION_LINE = 'Internal work product — prepared for counsel; verify before relying on it.';
export const NEEDS_KEY_LINE = 'Narrative sections need a Claude API key.';
export const QUOTE_OMITTED = 'Quote not verified — omitted';

const COURT_WORDS = /\b(hearing|motion|trial|conference|court)\b/i;
const STRONG_COURT_WORDS = /\b(hearing|trial|conference)\b/i;

export type PacketEvent = {
  /** `deadline:<id>` or `timeline:<id>`. */
  key: string;
  label: string;
  date: string;
  source: 'deadline' | 'timeline';
  court: boolean;
};

export type EventChoice = { event?: PacketEvent; events: PacketEvent[]; fallback: boolean };

export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function daysAwayText(days: number): string {
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} ${days === 1 ? 'day' : 'days'}`;
  return `${-days} ${days === -1 ? 'day' : 'days'} ago`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Every dated event on the matter: code-computed deadlines and timeline entries, sorted by date. */
export function packetEvents(matter: MatterWithDeadlines): PacketEvent[] {
  const events: PacketEvent[] = [];
  for (const deadline of matter.deadlines ?? []) {
    const result = matter.computedDeadlines?.[deadline.id];
    if (result?.status !== 'computed') continue;
    events.push({ key: `deadline:${deadline.id}`, label: deadline.label, date: result.dueDate, source: 'deadline', court: COURT_WORDS.test(deadline.label) });
  }
  for (const item of matter.timeline ?? []) {
    if (!ISO.test(item.date)) continue;
    events.push({ key: `timeline:${item.id}`, label: item.event, date: item.date, source: 'timeline', court: COURT_WORDS.test(item.event) });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

/**
 * The default event: the next upcoming hearing, trial, or conference; else the next upcoming
 * court-related event; else the next deadline (flagged as a fallback).
 */
export function chooseEvent(matter: MatterWithDeadlines, today: string, requestedKey?: string): EventChoice {
  const events = packetEvents(matter);
  const requested = requestedKey ? events.find(e => e.key === requestedKey) : undefined;
  if (requested) return { event: requested, events, fallback: !requested.court };
  const upcoming = events.filter(e => e.date >= today);
  const court = upcoming.filter(e => e.court);
  const strong = court.find(e => STRONG_COURT_WORDS.test(e.label));
  if (strong ?? court[0]) return { event: strong ?? court[0], events, fallback: false };
  const nextDeadline = upcoming.find(e => e.source === 'deadline') ?? upcoming[0];
  const event = nextDeadline ?? events.filter(e => e.source === 'deadline').at(-1) ?? events.at(-1);
  return { event, events, fallback: true };
}

export type Excerpt = { documentId: string; documentTitle: string; why: string; quote?: string; verified: boolean };
export type HappenedItem = { date?: string; text: string };
export type Argument = { argument: string; response: string };

export type Narrative = {
  happened?: HappenedItem[];
  issues?: string[];
  ourPosition?: string[];
  theirArguments?: Argument[];
  excerpts?: Excerpt[];
  risks?: string[];
  checklist?: string[];
  /** Sections the model returned in a shape the server could not use. */
  omitted: string[];
};

export type DeadlineRow = { id: string; label: string; dueDate?: string; relative?: string; note?: string };

/** Code-computed deadlines, with their distance from the packet's event. */
export function deadlineRows(matter: MatterWithDeadlines, eventDate?: string): DeadlineRow[] {
  const rows = (matter.deadlines ?? []).map(deadline => {
    const result = matter.computedDeadlines?.[deadline.id];
    if (result?.status !== 'computed') return { id: deadline.id, label: deadline.label, note: result?.status === 'uncomputable' ? `Not computed: ${result.reason}` : 'Not computed' };
    let relative: string | undefined;
    if (eventDate) {
      const days = daysBetween(eventDate, result.dueDate);
      relative = days === 0 ? 'same day as the event' : `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ${days < 0 ? 'before' : 'after'} the event`;
    }
    return { id: deadline.id, label: deadline.label, dueDate: result.dueDate, relative, note: deadline.supersededBy ? `Superseded by ${deadline.supersededBy}` : undefined };
  });
  return rows.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
}

export function timelineList(matter: MatterWithDeadlines): HappenedItem[] {
  return [...(matter.timeline ?? [])].sort((a, b) => a.date.localeCompare(b.date)).map(item => ({ date: item.date, text: item.event }));
}

export function defaultChecklist(matter: MatterWithDeadlines, event?: PacketEvent): string[] {
  const items = [
    event ? `Confirm the ${event.date} date, time, and courtroom or forum for: ${event.label}` : 'Confirm the next event on the calendar',
    'Verify every computed deadline against the governing rules',
    ...(matter.documents ?? []).slice(0, 4).map(doc => `Pull and tab: ${doc.title}`),
    `Prepare client ${matter.client?.name ?? ''} for what to expect`.replace('  ', ' '),
    'Bring proposed order and copies for the court and opposing counsel',
  ];
  return items;
}

/** The packet with no model call: structured data only. */
export function deterministicNarrative(matter: MatterWithDeadlines, event?: PacketEvent): Narrative {
  return { happened: timelineList(matter), checklist: defaultChecklist(matter, event), omitted: [] };
}

export type Packet = { matter: MatterWithDeadlines; choice: EventChoice; today: string; narrative: Narrative; live: boolean };

export function glanceLine(matter: MatterWithDeadlines, choice: EventChoice, today: string): string[] {
  const { event, fallback } = choice;
  const lines = [`Forum: ${matter.forum}`];
  if (!event) return [...lines, 'No dated event on file.'];
  if (fallback) lines.push(`No court hearing on file; packet built around ${event.label}`);
  lines.push(`Event: ${event.label}`, `Date: ${event.date} (${daysAwayText(daysBetween(today, event.date))})`);
  return lines;
}

/** Plain text for the clipboard. */
export function packetText(packet: Packet): string {
  const { matter, choice, today, narrative, live } = packet;
  const out: string[] = [`HEARING PACKET — ${matter.title}`, CAUTION_LINE, ''];
  const section = (title: string, lines: string[] | undefined) => {
    if (!lines?.length) return;
    out.push(title.toUpperCase(), ...lines.map(line => `- ${line}`), '');
  };
  section('Hearing at a glance', glanceLine(matter, choice, today));
  section('What has happened', narrative.happened?.map(item => (item.date ? `${item.date}: ${item.text}` : item.text)));
  section('What the court will decide', narrative.issues);
  section('Our position and best arguments', narrative.ourPosition);
  section("Other side's likely arguments, and our responses", narrative.theirArguments?.map(a => `${a.argument} Response: ${a.response}`));
  section('Key documents and excerpts', narrative.excerpts?.map(x => `${x.documentTitle}: ${x.quote ? `"${x.quote}"` : QUOTE_OMITTED}${x.why ? ` (${x.why})` : ''}`));
  section('Deadlines around the hearing', deadlineRows(matter, choice.event?.date).map(r => `${r.dueDate ?? 'no date'} — ${r.label}${r.relative ? ` (${r.relative})` : ''}${r.note ? ` [${r.note}]` : ''}`));
  section('Risks and open questions', narrative.risks);
  section('Prep checklist', narrative.checklist?.map(item => `[ ] ${item}`));
  if (!live) out.push(NEEDS_KEY_LINE);
  return out.join('\n').trim();
}
