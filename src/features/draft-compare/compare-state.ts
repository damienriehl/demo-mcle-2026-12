import { useSyncExternalStore } from 'react';
import type { Assessment, CompareEvent, Party, RedlineEvent, TagsEvent } from '../../../server/drafts/types';
import { readSse } from '../../intake/stream';

type CompareState = {
  earlier?: File;
  later?: File;
  sample: string;
  redline?: RedlineEvent;
  tags?: TagsEvent;
  parties: Party[];
  party: string;
  assessments: Assessment[];
  applied: string[];
  events: CompareEvent[];
  stage: 'idle' | 'compare' | 'tagging' | 'parties' | 'advice';
  message: string;
  notice: string;
};
const idle: CompareState = { sample: '', parties: [], party: '', assessments: [], applied: [], events: [], stage: 'idle', message: '', notice: '' };
const comparisons = new Map<string, CompareState>();
const adviceRequests = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const get = (id: string) => comparisons.get(id) ?? idle;
export function updateCompare(id: string, patch: Partial<CompareState>) {
  comparisons.set(id, { ...get(id), ...patch });
  listeners.forEach(listener => listener());
}
export function useCompareState(id: string) {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => get(id));
}
function receive(id: string, event: CompareEvent) {
  const state = get(id);
  const patch: Partial<CompareState> = { events: [...state.events, event] };
  switch (event.type) {
    case 'redline': Object.assign(patch, { redline: event, stage: 'tagging' }); break;
    case 'tags': Object.assign(patch, { tags: event, stage: 'parties' }); break;
    case 'parties': Object.assign(patch, { parties: event.parties, party: event.parties.find(party => party.isMatterClient)?.name ?? '' }); break;
    case 'assessment': patch.assessments = [...state.assessments.filter(item => item.changeId !== event.assessment.changeId), event.assessment]; break;
    case 'needs_key':
    case 'error': Object.assign(patch, { message: event.message, stage: 'idle' }); break;
    case 'done': patch.stage = 'idle'; break;
  }
  updateCompare(id, patch);
}
async function stream(id: string, endpoint: string, options: RequestInit) {
  const response = await fetch(`/api/features/draft-compare/${endpoint}`, options);
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error);
  }
  await readSse<CompareEvent>(response, event => {
    if (!options.signal?.aborted) receive(id, event);
  });
}
export async function compareDrafts(id: string) {
  const state = get(id);
  updateCompare(id, { ...idle, earlier: state.earlier, later: state.later, sample: state.sample, stage: 'compare' });
  const body = new FormData();
  body.set('matterId', id);
  if (state.sample) body.set('sample', state.sample);
  else {
    body.set('earlier', state.earlier!);
    body.set('later', state.later!);
  }
  try {
    await stream(id, 'compare', { method: 'POST', headers: { 'X-Matter-Cockpit-Upload': '1' }, body });
  } catch (error) {
    updateCompare(id, { message: (error as Error).message });
  } finally { updateCompare(id, { stage: 'idle' }); }
}
export function chooseParty(id: string, party: string) {
  if (get(id).party === party) return;
  const state = get(id);
  const hasAdvice = state.assessments.length > 0 || state.stage === 'advice';
  adviceRequests.get(id)?.abort();
  updateCompare(id, { party, assessments: [], applied: [], stage: state.stage === 'advice' ? 'idle' : state.stage, message: '', notice: hasAdvice ? 'Party changed. Previous advice and applied suggestions cleared. Run advice for the selected party.' : '' });
}
export async function runAdvice(id: string) {
  const state = get(id);
  const controller = new AbortController();
  adviceRequests.set(id, controller);
  updateCompare(id, { assessments: [], applied: [], stage: 'advice', message: '', notice: '' });
  try {
    await stream(id, `${encodeURIComponent(state.redline!.comparisonId)}/advise`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId: id, party: state.party }), signal: controller.signal,
    });
  } catch (error) {
    if (!controller.signal.aborted) updateCompare(id, { message: (error as Error).message });
  } finally {
    if (!controller.signal.aborted) updateCompare(id, { stage: 'idle' });
    if (adviceRequests.get(id) === controller) adviceRequests.delete(id);
  }
}
export function toggleApplied(id: string, changeId: string) {
  const applied = get(id).applied;
  updateCompare(id, { applied: applied.includes(changeId) ? applied.filter(value => value !== changeId) : [...applied, changeId] });
}
export async function downloadDraft(id: string, counter: boolean) {
  const state = get(id);
  const base = `/api/features/draft-compare/${encodeURIComponent(state.redline!.comparisonId)}`;
  try {
    const response = await fetch(counter ? `${base}/counter.docx` : `${base}/redline.docx?matterId=${encodeURIComponent(id)}`, counter ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId: id, changeIds: state.applied }),
    } : undefined);
    if (!response.ok) throw new Error((await response.json()).error);
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${id}-${counter ? 'counter-draft' : 'redline'}.docx`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) { updateCompare(id, { message: (error as Error).message }); }
}
