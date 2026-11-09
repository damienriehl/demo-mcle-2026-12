import type Anthropic from '@anthropic-ai/sdk';
import type { Rating, Reference } from '../../src/features/prior-art/types';

const squash = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

/** True only when the quote appears literally (modulo whitespace and curly quotes) in the source text. */
export function verifyQuote(quote: string | undefined, source: string): boolean {
  const needle = squash(quote ?? '');
  return needle.length >= 3 && squash(source).includes(needle);
}

const RATINGS = new Set(['Close', 'Partial', 'Distant']);

/** Parses the model's JSON and verifies each quote against the text the server fetched. */
export function checkRatings(raw: string, refs: Reference[]): Rating[] {
  const start = raw.indexOf('['), end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let items: unknown;
  try { items = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(items)) return [];
  const byId = new Map(refs.map(r => [r.id, r]));
  const out: Rating[] = [];
  for (const item of items as Record<string, unknown>[]) {
    const ref = byId.get(String(item?.id ?? ''));
    if (!ref || !RATINGS.has(String(item.rating))) continue;
    const quote = typeof item.quote === 'string' ? item.quote : undefined;
    const quoteVerified = verifyQuote(quote, ref.text);
    out.push({ id: ref.id, rating: item.rating as Rating['rating'], reason: String(item.reason ?? '').slice(0, 400), quote: quoteVerified ? quote : undefined, quoteVerified });
  }
  return out;
}

export async function rateReferences(client: Anthropic, model: string, invention: string, refs: Reference[]): Promise<Rating[]> {
  const listing = refs.map(r => `ID: ${r.id}\nTitle: ${r.title}\nText: ${r.text}`).join('\n\n');
  const message = await client.messages.create({
    model, max_tokens: 3000,
    messages: [{ role: 'user', content: `You help patent counsel triage prior art. Invention under application:\n${invention}\n\nReferences:\n${listing}\n\nFor each reference, rate how closely it relates to the invention as "Close", "Partial", or "Distant". Give a one-sentence reason and a short quote copied exactly, word for word, from that reference's Text. Answer with only a JSON array of {"id","rating","reason","quote"}.` }],
  }, { timeout: 60_000 });
  const text = message.content.map(block => (block.type === 'text' ? block.text : '')).join('');
  return checkRatings(text, refs);
}
