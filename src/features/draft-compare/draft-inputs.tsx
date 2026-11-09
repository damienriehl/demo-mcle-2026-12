import { useEffect, useRef, useState } from 'react';
import type { DocumentType } from '../../../server/drafts/types';
import type { MatterWithDeadlines } from '../../data/schema';
import { compareDrafts, updateCompare, useCompareState } from './compare-state';

type Sample = { id: string; title: string; family: DocumentType['family']; earlierName: string; laterName: string };
function DraftInput({ label, file, disabled, onFile }: { label: string; file?: File; disabled: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div>
    <button type="button" className="dc-drop" aria-label={label} disabled={disabled} onClick={() => input.current?.click()}
      onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (!disabled && file) onFile(file);
      }}><strong>{label}</strong><span>{file?.name ?? 'Drop a file or choose a file'}</span></button>
    <input ref={input} hidden type="file" aria-label={label} accept=".docx,.pdf,.txt,.md,.doc,.rtf,.odt,.html,.htm" disabled={disabled}
      onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); }} />
  </div>;
}
export function DraftInputs({ matter }: { matter: MatterWithDeadlines }) {
  const state = useCompareState(matter.id);
  const [samples, setSamples] = useState<Sample[]>([]);
  const busy = state.stage !== 'idle';
  useEffect(() => {
    let active = true;
    fetch('/api/features/draft-compare/samples').then(async response => {
      if (!response.ok) throw new Error((await response.json()).error);
      const data: { samples: Sample[] } = await response.json();
      if (active) setSamples(data.samples);
    }).catch((error: Error) => { if (active) updateCompare(matter.id, { message: error.message }); });
    return () => { active = false; };
  }, [matter.id]);
  const rank = (sample: Sample) => sample.family === matter.practiceArea ? 0 : ['legislative', 'advisory'].includes(sample.family) ? 2 : 1;
  return <details className="dc-inputs" open={!state.redline || undefined}>
    <summary>Draft inputs{state.redline ? ' · comparison ready' : ''}</summary>
    <div className="dc-upload-grid">
      <DraftInput label="Earlier draft" file={state.earlier} disabled={busy} onFile={earlier => updateCompare(matter.id, { earlier, sample: '' })} />
      <DraftInput label="Later draft" file={state.later} disabled={busy} onFile={later => updateCompare(matter.id, { later, sample: '' })} />
    </div>
    <p>Word, PDF with text, plain text, Markdown, .doc, .rtf, .odt, or HTML.</p>
    <div className="dc-controls"><label>Try a sample pair <select value={state.sample} disabled={busy} onChange={event => updateCompare(matter.id, { sample: event.target.value })}>
      <option value="">Choose a fictional pair</option>
      {[...samples].sort((a, b) => rank(a) - rank(b)).map(sample => <option key={sample.id} value={sample.id}>{sample.title} · {sample.family} · {sample.earlierName} → {sample.laterName}</option>)}
    </select></label>
    <button type="button" className="primary-button" disabled={busy || (!state.sample && !(state.earlier && state.later))} onClick={() => void compareDrafts(matter.id)}>Compare</button></div>
  </details>;
}
