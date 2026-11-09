import type { Matter } from '../data/schema';
import type { Draft } from '../intake/stream';
import { fieldLabel } from '../intake/fieldLabel';
import { provenanceAt } from '../data/provenance';

export type FactContext = { provenance?: Matter['provenance'][string]; reasoning?: string };

export function factContext(matter: Pick<Matter, 'provenance'> & { reasoning?: string }, path: string): FactContext {
  const entry = provenanceAt(matter.provenance, path);
  return entry ? { provenance: entry, reasoning: matter.reasoning } : { reasoning: matter.reasoning };
}

// Intake selections carry the displayed field label rather than its dot path.
export function intakeFactContext(draft: Draft, label: string): FactContext {
  function findPath(value: unknown, path = ''): string | undefined {
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (key === 'provenance') continue;
        const found = findPath(entry, path ? `${path}.${key}` : key);
        if (found) return found;
      }
      return undefined;
    }
    return fieldLabel(path) === label ? path : undefined;
  }
  return factContext({ provenance: draft.provenance ?? {}, reasoning: typeof draft.reasoning === 'string' ? draft.reasoning : undefined }, findPath(draft) ?? '');
}
