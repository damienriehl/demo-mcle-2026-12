import type { ReactNode } from 'react';
import type { Matter } from '../data/schema';

type Source = Matter['provenance'][string]['source'];
const labels: Record<Source, string> = { stated: 'You said', inferred: 'AI inferred', invented: 'AI invented' };
export function sourceFor(provenance: Matter['provenance'], path: string) {
  let field = path;
  while (field) {
    if (provenance[field]) return provenance[field].source;
    const fieldParts = field.split('.');
    const match = Object.entries(provenance).find(([pattern]) => {
      const patternParts = pattern.split('.');
      return pattern.includes('*') && patternParts.length === fieldParts.length && patternParts.every((part, i) => part === '*' || part === fieldParts[i]);
    });
    if (match) return match[1].source;
    field = field.split('.').slice(0, -1).join('.');
  }
  return undefined;
}
export function SourceLabel({ source }: { source?: Source }) {
  return <span className="source-label">{source ? labels[source] : 'Source not recorded'}</span>;
}
export function SourceField({ path, provenance, children, onVerify }: { path: string; provenance: Matter['provenance']; children: ReactNode; onVerify?: () => void }) {
  const source = sourceFor(provenance, path);
  const contents = <><span>{children}</span><SourceLabel source={source} /></>;
  return (source === 'inferred' || source === 'invented') && onVerify
    ? <button className="source-field fact-button" data-source={source} onClick={onVerify}>{contents}</button>
    : <span className="source-field" data-source={source ?? 'unknown'}>{contents}</span>;
}
