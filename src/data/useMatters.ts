import { useSyncExternalStore } from 'react';
import type { MatterWithDeadlines } from './schema';

let snapshot: MatterWithDeadlines[] = [];
const empty: MatterWithDeadlines[] = [];
const listeners = new Set<() => void>();
let events: EventSource | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!events) {
    events = new EventSource('/api/events');
    events.onmessage = (event) => {
      snapshot = JSON.parse(event.data) as MatterWithDeadlines[];
      for (const notify of listeners) notify();
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { events?.close(); events = undefined; }
  };
}

/** All browser views share one live snapshot and one SSE connection. */
export function useMatters(): MatterWithDeadlines[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => empty);
}
