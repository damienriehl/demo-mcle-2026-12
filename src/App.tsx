import { useEffect, useRef, useState } from 'react';
import { useMatters } from './data/useMatters';
import { Cockpit } from './views/Cockpit';
import { Radar } from './views/Radar';
import { Portal, portalProjection } from './views/Portal';
import { Ramble, useRamble } from './intake/Ramble';
import { VerifyDrawer } from './verify/VerifyDrawer';
import { FeatureSlot } from './components/FeatureSlot';
import { practiceAreas, type Selection } from './views/shared';
import './features/load';
import './views/workspace.css';

type View = 'Cockpit' | 'Deadline Radar' | 'Client Portal';
type Health = 'checking' | 'connected' | 'unreachable';
export default function App() {
  const matters = useMatters();
  const [view, setView] = useState<View>('Cockpit');
  const [activeId, setActiveId] = useState<string>();
  const activeMatter = matters.find(matter => matter.id === activeId) ?? matters[0];
  const visibleMatters = view === 'Client Portal' ? matters.map(portalProjection) : matters;
  const visibleActive = visibleMatters.find(matter => matter.id === activeMatter?.id);
  const [selection, setSelection] = useState<Selection>();
  const [focusedDeadline, setFocusedDeadline] = useState<string>();
  const [statedOnly, setStatedOnly] = useState(false);
  const [practiceArea, setPracticeArea] = useState('');
  const [appearance, setAppearance] = useState(() => {
    try {
      const saved = localStorage.getItem('matter-cockpit-theme');
      if (saved === 'law-review' || saved === 'mission-control' || saved === 'boutique-firm') return saved;
    } catch { /* Theme switching also works when browser storage is unavailable. */ }
    return 'law-review';
  });
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    try { localStorage.setItem('matter-cockpit-theme', appearance); } catch { /* Keep the live choice. */ }
  }, [appearance]);
  const [health, setHealth] = useState<Health>('checking');
  const [arrivals, setArrivals] = useState<Set<string>>(new Set());
  const previousIds = useRef<Set<string> | undefined>(undefined);
  const intake = useRamble();
  useEffect(() => {
    let cancelled = false;
    fetch('/api/health').then(res => res.ok ? res.json() : Promise.reject()).then((body: { ok?: boolean }) => { if (!cancelled) setHealth(body.ok ? 'connected' : 'unreachable'); }).catch(() => { if (!cancelled) setHealth('unreachable'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!matters.length && !previousIds.current) return;
    const ids = new Set(matters.map(matter => matter.id));
    if (previousIds.current) {
      const added = [...ids].filter(id => !previousIds.current!.has(id));
      if (added.length) setArrivals(previous => new Set([...previous, ...added]));
    }
    previousIds.current = ids;
    if (!activeId || !ids.has(activeId)) setActiveId(matters[0]?.id);
  }, [matters, activeId]);
  const verify = (item: Selection) => { setFocusedDeadline(undefined); setSelection(item); };
  const changeView = (next: View) => { setView(next); setFocusedDeadline(undefined); };
  const props = { matters, activeMatter, onVerify: verify };
  return <div className={`matter-app${statedOnly ? ' stated-only' : ''}`} data-appearance={appearance}>
    <header className="topbar"><div className="brand"><span className="brand-symbol" aria-hidden="true">◈</span><div><h1>Matter Cockpit</h1><p>From the first fact to the next move.</p></div></div>
      <nav aria-label="Workspace views">{(['Cockpit', 'Deadline Radar', 'Client Portal'] as const).map(name => <button key={name} aria-current={view === name ? 'page' : undefined} onClick={() => changeView(name)}>{name}</button>)}</nav>
      <button className="primary-button" onClick={intake.open}>Ramble</button>
      <label className="appearance-control">Theme<select aria-label="Theme" value={appearance} onChange={event => setAppearance(event.target.value)}><option value="law-review">Law Review</option><option value="mission-control">Mission Control</option><option value="boutique-firm">Boutique Firm</option></select></label>
    </header>
    <div className="utility-bar"><label className="source-toggle"><input type="checkbox" checked={statedOnly} onChange={event => setStatedOnly(event.target.checked)} />Show what I said</label><div className="surprise-controls"><select aria-label="Surprise practice area" value={practiceArea} onChange={event => setPracticeArea(event.target.value)}><option value="">Any practice area</option>{practiceAreas.map(area => <option key={area} value={area}>{area[0].toUpperCase() + area.slice(1)}</option>)}</select><button onClick={() => intake.surprise(practiceArea || undefined)} disabled={intake.busy}>Surprise Me</button></div><FeatureSlot slot="toolbar" matters={visibleMatters} activeMatter={visibleActive} /><p data-testid="health-status" role="status">Server: {health === 'checking' ? 'checking…' : health}</p></div>
    <div className={`workspace ${view === 'Deadline Radar' ? 'workspace-wide' : ''}`}>
      <aside className="matter-rail" aria-label="Matter list"><header><h2>Matters</h2><span>{matters.length} live</span></header><div className="matter-list">{visibleMatters.map(matter => <button key={matter.id} className={arrivals.has(matter.id) ? 'matter-arrival' : ''} aria-pressed={activeMatter?.id === matter.id} onClick={() => { setActiveId(matter.id); setFocusedDeadline(undefined); setArrivals(previous => new Set([...previous].filter(id => id !== matter.id))); }}><strong>{matter.title ?? matter.client?.name ?? 'Shared matter'}</strong>{matter.practiceArea && <span className={`practice-mark area-${matter.practiceArea}`}>{matter.practiceArea}</span>}{arrivals.has(matter.id) && <span className="arrival-label">New</span>}</button>)}{!matters.length && <p>No matters yet. Start with Surprise Me.</p>}</div></aside>
      <main>{view === 'Cockpit' ? <Cockpit {...props} focusedDeadline={focusedDeadline} /> : view === 'Deadline Radar' ? <Radar {...props} arrivals={arrivals} /> : <Portal {...props} />}</main>
    </div>
    <p className="synthetic-notice">Synthetic matters only. Intake text goes to the model provider. This workspace is a demonstration.</p>
    <Ramble intake={intake} onVerify={verify} />
    {selection && <VerifyDrawer selection={selection} onClose={() => setSelection(undefined)} onOpenMatter={matters.some(matter => matter.id === selection.matterId) ? () => { setActiveId(selection.matterId); setView('Cockpit'); setFocusedDeadline(selection.deadlineId); setSelection(undefined); intake.close(); } : undefined} />}
  </div>;
}
