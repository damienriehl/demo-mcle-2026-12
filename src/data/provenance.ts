import type { Matter } from './schema';

/** The provenance entry for a path: an exact key, then an equal-length `*` pattern, then the nearest ancestor. */
export function provenanceAt(provenance: Matter['provenance'], path: string): Matter['provenance'][string] | undefined {
  let field = path;
  while (field) {
    const parts = field.split('.');
    const entry = provenance[field] ?? Object.entries(provenance).find(([pattern]) => {
      const patternParts = pattern.split('.');
      return pattern.includes('*') && patternParts.length === parts.length && patternParts.every((part, index) => part === '*' || part === parts[index]);
    })?.[1];
    if (entry) return entry;
    field = parts.slice(0, -1).join('.');
  }
  return undefined;
}
