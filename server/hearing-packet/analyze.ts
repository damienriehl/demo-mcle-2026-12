import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { MatterWithDeadlines } from '../../src/data/schema';
import { deadlineRows, type Narrative, type PacketEvent } from '../../src/features/hearing-packet/packet';
import { verifyQuote } from '../prior-art/analyze';

export { verifyQuote };

const text = z.string().trim().min(1).max(1200);
const strings = z.array(z.unknown()).transform(items => items.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim().slice(0, 1200)));
const sections = {
  happened: z.array(z.object({ timelineId: z.string().optional(), text })),
  issues: strings,
  ourPosition: strings,
  theirArguments: z.array(z.object({ argument: text, response: text })),
  excerpts: z.array(z.object({ documentId: z.string(), quote: z.string(), why: z.string().optional() })),
  risks: strings,
  checklist: strings,
};
type SectionName = keyof typeof sections;

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/** Keep valid items, drop malformed ones, omit sections that do not survive; never throw. */
function salvageArray(name: SectionName, value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const whole = sections[name].safeParse(value);
  if (whole.success) return whole.data as unknown[];
  const schema = sections[name] as z.ZodArray<z.ZodTypeAny>;
  const element = 'element' in schema ? schema.element : undefined;
  if (!element) return undefined;
  return value.flatMap(item => { const one = element.safeParse(item); return one.success ? [one.data] : []; });
}

/** Turns the model's raw text into a Narrative: dates from the timeline, quotes verified against document bodies. */
export function repairNarrative(raw: string, matter: MatterWithDeadlines): Narrative {
  const parsed = parseJsonObject(raw);
  const names = Object.keys(sections) as SectionName[];
  if (!parsed) return { omitted: names };
  const narrative: Narrative = { omitted: [] };
  const timeline = new Map((matter.timeline ?? []).map(item => [item.id, item.date]));
  const docs = new Map((matter.documents ?? []).map(doc => [doc.id, doc]));
  for (const name of names) {
    const items = salvageArray(name, parsed[name]);
    if (!items || (Array.isArray(parsed[name]) && (parsed[name] as unknown[]).length > 0 && items.length === 0)) { narrative.omitted.push(name); continue; }
    switch (name) {
      case 'happened':
        narrative.happened = (items as { timelineId?: string; text: string }[])
          .map(item => ({ date: item.timelineId ? timeline.get(item.timelineId) : undefined, text: item.text }))
          .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
        break;
      case 'theirArguments': narrative.theirArguments = items as Narrative['theirArguments']; break;
      case 'excerpts':
        narrative.excerpts = (items as { documentId: string; quote: string; why?: string }[]).flatMap(item => {
          const doc = docs.get(item.documentId);
          if (!doc) return [];
          const verified = verifyQuote(item.quote, doc.body);
          return [{ documentId: doc.id, documentTitle: doc.title, why: (item.why ?? '').slice(0, 400), quote: verified ? item.quote.trim() : undefined, verified }];
        });
        break;
      default: narrative[name] = items as string[];
    }
  }
  return narrative;
}

export function packetPrompt(matter: MatterWithDeadlines, event: PacketEvent | undefined, today: string): string {
  const facts = {
    title: matter.title, forum: matter.forum, practiceArea: matter.practiceArea,
    client: matter.client?.name, parties: matter.parties,
    timeline: matter.timeline, documents: matter.documents.map(doc => ({ id: doc.id, title: doc.title, kind: doc.kind, body: doc.body })),
    deadlines: deadlineRows(matter, event?.date), clientFacing: matter.clientFacing, reasoning: matter.reasoning,
  };
  return `You prepare an internal hearing packet for counsel. Today is ${today}. The packet centers on: ${event ? `${event.label} on ${event.date}` : 'the next event'}.
Matter data (synthetic):
${JSON.stringify(facts, null, 1)}

Write concise, practical content grounded only in this data. Do not invent dates, rule numbers, or facts; say what is unknown in "risks".
Answer with only one JSON object with these keys:
"happened": [{"timelineId": "<timeline id>", "text": "<one sentence>"}] in chronological order,
"issues": ["<question the court will decide, phrased as a question>"],
"ourPosition": ["<our position or best argument>"],
"theirArguments": [{"argument": "<other side's likely argument>", "response": "<our response>"}],
"excerpts": [{"documentId": "<document id>", "quote": "<short passage copied exactly, word for word, from that document's body>", "why": "<why it matters>"}],
"risks": ["<risk or open question>"],
"checklist": ["<short prep task>"]`;
}

export async function buildNarrative(client: Anthropic, model: string, matter: MatterWithDeadlines, event: PacketEvent | undefined, today: string): Promise<Narrative> {
  const message = await client.messages.create({
    model, max_tokens: 3000,
    messages: [{ role: 'user', content: packetPrompt(matter, event, today) }],
  }, { timeout: 90_000 });
  const raw = message.content.map(block => (block.type === 'text' ? block.text : '')).join('');
  return repairNarrative(raw, matter);
}
