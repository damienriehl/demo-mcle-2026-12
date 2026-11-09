import type { Matter } from '../data/schema';

export type Draft = Record<string, unknown> & { provenance?: Matter['provenance'] };
export type Question = { id: string; question: string; field: string };
export type IntakeEvent =
  | { type: 'field'; path: string; value: unknown; source: Matter['provenance'][string]['source']; evidence?: string }
  | { type: 'followups'; questions: Question[] }
  | { type: 'done'; matter: Matter }
  | { type: 'needs_key'; message: string }
  | { type: 'error'; message: string; partial?: Draft };

// defineProperty, unlike assignment, makes a `__proto__` path segment an own key instead of a prototype write.
function define(target: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

export function applyField(draft: Draft, event: Extract<IntakeEvent, { type: 'field' }>): Draft {
  const next = structuredClone(draft);
  const parts = event.path.split('.');
  let target: Record<string, unknown> = next;
  parts.forEach((part, i) => {
    if (i === parts.length - 1) define(target, part, event.value);
    else {
      if (!Object.hasOwn(target, part) || typeof target[part] !== 'object' || target[part] === null) {
        define(target, part, /^\d+$/.test(parts[i + 1]) ? [] : {});
      }
      target = target[part] as Record<string, unknown>;
    }
  });
  next.provenance = { ...next.provenance, [event.path]: { source: event.source, ...(event.evidence ? { evidence: event.evidence } : {}) } };
  return next;
}

export async function intakeStream(endpoint: string, body: unknown, onEvent: (event: IntakeEvent) => void) {
  const response = await fetch(`/api/intake/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('Could not reach intake. Your facts are kept; use Embellish when intake is available. Surprise Me can use the canned matter pool without a key.');
  }
  await readSse(response, onEvent);
}

export async function readSse<Event>(response: Response, onEvent: (event: Event) => void) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  function line(value: string) {
    if (value.startsWith('data:')) onEvent(JSON.parse(value.slice(5).trim()) as Event);
  }
  try {
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = pending.split('\n');
      pending = lines.pop()!;
      lines.forEach(value => line(value.replace(/\r$/, '')));
      if (chunk.done) { if (pending) line(pending); break; }
    }
  } finally { reader.releaseLock(); }
}
