import { useSyncExternalStore, type ComponentType } from 'react';
import type { MatterWithDeadlines } from '../data/schema';

export type FeatureSlot = 'cockpit.tab' | 'cockpit.sidebar' | 'radar.overlay' | 'portal.section' | 'toolbar';
export type FeatureProps = { matters: MatterWithDeadlines[]; activeMatter: MatterWithDeadlines | undefined };
export type Feature = { id: string; title: string; slot: FeatureSlot; component: ComponentType<FeatureProps> };
const registry = new Map<string, Feature>();
const listeners = new Set<() => void>();
let revision = 0;

export function registerFeature(feature: Feature) {
  registry.set(feature.id, feature);
  revision++;
  listeners.forEach(listener => listener());
}
export function featuresFor(slot: FeatureSlot): Feature[] {
  return [...registry.values()].filter(feature => feature.slot === slot);
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useFeatures(slot: FeatureSlot) {
  useSyncExternalStore(subscribe, () => revision, () => revision);
  return featuresFor(slot);
}
