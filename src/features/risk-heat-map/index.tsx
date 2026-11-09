import { registerFeature, type FeatureProps } from '../registry';
import { countdown } from '../../views/shared';
import { rankHeat, soonWindowDays } from './heat';
import './heat.css';

function RiskHeatMap({ matters }: FeatureProps) {
  const rows = rankHeat(matters);
  return <div className="heat-map">
    <header><h3>Risk Heat Map</h3><p>Hottest first: more deadlines, sooner, in the next {soonWindowDays} days.</p></header>
    <ol className="heat-tiles">{rows.map(({ matter, band, soonCount, nextDays, verifyReasons }) => (
      <li key={matter.id} data-heat-tile data-heat={band} className={`heat-tile heat-${band.toLowerCase()}`}>
        <span className="heat-band">{band}</span>
        <strong className="heat-title">{matter.title}</strong>
        <span>{soonCount} {soonCount === 1 ? 'deadline' : 'deadlines'} in {soonWindowDays} days{nextDays !== undefined && ` · next: ${countdown(nextDays)}`}</span>
        {verifyReasons.map((reason, index) => <span key={index} className="heat-verify">Needs verification: {reason}</span>)}
      </li>
    ))}</ol>
  </div>;
}

registerFeature({ id: 'risk-heat-map', title: 'Risk Heat Map', slot: 'radar.overlay', component: RiskHeatMap });
