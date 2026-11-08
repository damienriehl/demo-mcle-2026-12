import { useFeatures, type FeatureProps, type FeatureSlot as Slot } from '../features/registry';

export function FeatureSlot({ slot, ...props }: FeatureProps & { slot: Slot }) {
  return useFeatures(slot).map(({ id, title, component: Component }) => (
    <section key={id} aria-label={title} className="feature-section"><Component {...props} /></section>
  ));
}
