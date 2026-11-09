import { useState } from 'react';
import type { FolioTag, TagsEvent } from '../../../server/drafts/types';
import { TagChip } from './advice';

export function TagPanel({ event, onSelect }: { event: TagsEvent; onSelect: (tag: FolioTag) => void }) {
  const [branch, setBranch] = useState('');
  const branches = [...new Set(event.tags.map(tag => tag.branch))].sort();
  return <section role="region" aria-label="FOLIO tags" className="dc-tags">
    <div className="dc-controls"><h3>FOLIO tags · {event.tags.length}</h3><label>Branch <select value={branch} onChange={event => setBranch(event.target.value)}><option value="">All branches</option>{branches.map(name => <option key={name}>{name}</option>)}</select></label></div>
    {event.documentType && <p className="dc-document-type">Document type: {event.documentType.label} · {event.documentType.family}</p>}
    <div className="dc-chips">{event.tags.filter(tag => !branch || tag.branch === branch).map((tag, index) => <TagChip key={index} tag={tag} onSelect={() => onSelect(tag)} />)}</div>
  </section>;
}
