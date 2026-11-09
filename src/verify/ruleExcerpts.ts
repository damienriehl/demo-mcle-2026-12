import type { RuleRecord, RuleSubdivision } from '../../data/rules';

type LabelStyle = 'number' | 'upper' | 'lower' | 'roman';

function labelStyle(label: string, parents: LabelStyle[]): LabelStyle {
  if (/^\(\d+\)$/.test(label)) return 'number';
  if (/^\([A-Z]+\)$/.test(label)) return 'upper';
  if (parents.includes('lower') && parents.includes('number') && /^\([ivx]+\)$/.test(label)) return 'roman';
  return 'lower';
}

function paragraphExcerpt(part: RuleSubdivision, citation: string): RuleSubdivision {
  const remaining = citation.slice(part.label.length);
  const labels = remaining.match(/\([a-zA-Z0-9]+\)/g) ?? [];
  if (!labels.length || labels.join('') !== remaining) return part;

  const lines = part.text.split('\n');
  const styles: LabelStyle[] = part.label.startsWith('(') ? [labelStyle(part.label, [])] : [];
  const chainStyles = [...styles];
  for (const label of labels) chainStyles.push(labelStyle(label, chainStyles));
  let start = part.label.startsWith('(') ? 0 : -1;
  let end = lines.length;
  for (const label of labels) {
    const found = lines.findIndex((line, index) => index > start && index < end && line.startsWith(label));
    if (found < 0) return part;
    styles.push(labelStyle(label, chainStyles));
    start = found;
    for (let index = found + 1; index < end; index++) {
      const nextLabel = lines[index].match(/^\([a-zA-Z0-9]+\)/)?.[0];
      if (nextLabel && styles.includes(labelStyle(nextLabel, chainStyles))) {
        end = index;
        break;
      }
    }
  }
  return { label: citation, text: lines.slice(start, end).join('\n') };
}

/** Empty means the citation has no matching library subdivisions: show the full rule. */
export function getRuleExcerpts(rule: RuleRecord, subdivision?: string): RuleSubdivision[] {
  if (!subdivision) return [];
  const excerpts = new Map<string, RuleSubdivision>();
  const citations = subdivision.split(',').map(label => label.trim());
  for (const citation of citations) {
    const part = rule.subdivisions.filter(part => citation.startsWith(part.label))
      .sort((a, b) => b.label.length - a.label.length)[0];
    if (!part) return [];
    const excerpt = citations.length > 1 ? part : paragraphExcerpt(part, citation);
    excerpts.set(excerpt.label, excerpt);
  }
  return [...excerpts.values()];
}
