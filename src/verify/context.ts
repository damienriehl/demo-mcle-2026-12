import type { Matter } from '../data/schema';
import type { Draft } from '../intake/stream';

export type FactContext = { provenance?: Matter['provenance'][string]; reasoning?: string };

export function factContext(matter: Pick<Matter, 'provenance'> & { reasoning?: string }, path: string): FactContext {
  let field = path;
  while (field) {
    const parts = field.split('.');
    const entry = matter.provenance[field] ?? Object.entries(matter.provenance).find(([pattern]) => {
      const patternParts = pattern.split('.');
      return pattern.includes('*') && patternParts.length === parts.length && patternParts.every((part, index) => part === '*' || part === parts[index]);
    })?.[1];
    if (entry) return { provenance: entry, reasoning: matter.reasoning };
    field = parts.slice(0, -1).join('.');
  }
  return { reasoning: matter.reasoning };
}

// Intake selections carry the displayed field label rather than its dot path.
export function intakeFactContext(draft: Draft, label: string): FactContext {
  const roots: Record<string, string> = { title: 'Matter title', practiceArea: 'Practice area', forum: 'Court or forum', client: 'Client', parties: 'Party', timeline: 'Timeline event', documents: 'Document', deadlines: 'Deadline', clientFacing: 'Client update' };
  function findPath(value: unknown, path = ''): string | undefined {
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (key === 'provenance') continue;
        const found = findPath(entry, path ? `${path}.${key}` : key);
        if (found) return found;
      }
      return undefined;
    }
    const display = path.split('.').map((part, index) => index === 0 ? roots[part] ?? part : /^\d+$/.test(part) ? String(Number(part) + 1) : part.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join(' ');
    return display === label ? path : undefined;
  }
  return factContext({ provenance: draft.provenance ?? {}, reasoning: typeof draft.reasoning === 'string' ? draft.reasoning : undefined }, findPath(draft) ?? '');
}
