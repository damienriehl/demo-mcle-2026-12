import { useSyncExternalStore } from 'react';

export type Arrival = { type: 'date'; kind: string; event: string; date: string; page: number; quote: string; verified: boolean; reason?: string };
type UploadState = { running: boolean; arrivals: Arrival[]; message: string; awaitingSnapshot?: string };
const idle: UploadState = { running: false, arrivals: [], message: '' };
const uploads = new Map<string, UploadState>();
const listeners = new Set<() => void>();

export function updateUpload(matterId: string, patch: Partial<UploadState>) {
  uploads.set(matterId, { ...(uploads.get(matterId) ?? idle), ...patch });
  listeners.forEach(listener => listener());
}

export function appendArrival(matterId: string, arrival: Arrival) {
  updateUpload(matterId, { arrivals: [...(uploads.get(matterId) ?? idle).arrivals, arrival] });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useUploadState(matterId: string) {
  return useSyncExternalStore(subscribe, () => uploads.get(matterId) ?? idle);
}
