import type { FolioTag } from '../../../server/drafts/types';

export function groupConcepts(tags: FolioTag[]) {
  const concepts = new Map<string, FolioTag[]>();
  for (const tag of tags) {
    const occurrences = concepts.get(tag.iri) ?? [];
    occurrences.push(tag);
    concepts.set(tag.iri, occurrences);
  }
  return [...concepts.values()].map(occurrences => {
    occurrences.sort((a, b) => a.draft.localeCompare(b.draft) || a.start - b.start);
    return { tag: occurrences[0], occurrences };
  }).sort((a, b) => a.tag.branch.localeCompare(b.tag.branch) || a.tag.label.localeCompare(b.tag.label));
}
