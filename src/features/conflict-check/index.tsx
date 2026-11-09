import { registerFeature, type FeatureProps } from '../registry';
import { sharedNames } from './conflicts';

function ConflictCheck({ matters, activeMatter }: FeatureProps) {
  if (!activeMatter) return null;
  const shared = sharedNames(activeMatter, matters);
  return <div className="workspace-section">
    <h3>Conflict check</h3>
    {shared.length
      ? <p><strong>Review needed:</strong> {shared.length === 1 ? '1 name also appears in another matter' : `${shared.length} names also appear in other matters`}.</p>
      : <p><strong>Clear:</strong> no person or company on this matter appears in another matter.</p>}
    {shared.map(entry => <article key={entry.name}>
      <h4>{entry.name}</h4>
      <p>Here: {entry.roleHere}</p>
      <ul>{entry.others.map(other => <li key={other.matterId}>{other.title}: {other.role}</li>)}</ul>
    </article>)}
  </div>;
}

registerFeature({ id: 'conflict-check', title: 'Conflict check', slot: 'cockpit.sidebar', component: ConflictCheck });
