import { useState } from 'react';
import type { FolioTag, TagsEvent } from '../../../server/drafts/types';
import { TagChip } from './advice';
import { groupConcepts } from './folio-concepts';

export function TagPanel({ event, selectedTag, onSelect }: { event: TagsEvent; selectedTag?: FolioTag; onSelect: (tag: FolioTag) => void }) {
  const [branch, setBranch] = useState('');
  const branches = [...new Set(event.tags.map(tag => tag.branch))].sort();
  const concepts = groupConcepts(event.tags);
  const occurrences = concepts.find(({ tag }) => tag.iri === selectedTag?.iri)?.occurrences ?? [];
  const current = occurrences.indexOf(selectedTag!);
  return <section role="region" aria-label="FOLIO tags" className="dc-tags">
    <div className="dc-controls"><h3>FOLIO tags · {concepts.length} concepts</h3><label>Branch <select value={branch} onChange={event => setBranch(event.target.value)}><option value="">All branches</option>{branches.map(name => <option key={name}>{name}</option>)}</select></label></div>
    {event.documentType && <p className="dc-document-type">Document type: {event.documentType.label} · {event.documentType.family}</p>}
    <div className="dc-chips">{concepts.filter(({ tag }) => !branch || tag.branch === branch).map(({ tag, occurrences }) => <TagChip key={tag.iri} tag={tag} counts={{ earlier: occurrences.filter(tag => tag.draft === 'earlier').length, later: occurrences.filter(tag => tag.draft === 'later').length }} onSelect={() => onSelect(tag)} />)}</div>
    {current >= 0 && <div className="dc-controls">
      <p role="status">{selectedTag!.label} · {selectedTag!.draft} · occurrence {current + 1} of {occurrences.length}</p>
      <button type="button" disabled={current === 0} onClick={() => onSelect(occurrences[current - 1])}>Previous</button>
      <button type="button" disabled={current === occurrences.length - 1} onClick={() => onSelect(occurrences[current + 1])}>Next</button>
    </div>}
  </section>;
}
