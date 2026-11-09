import { useCallback, useEffect, useState } from 'react';
import { registerFeature, type FeatureProps } from '../registry';
import { inventionSummary } from './invention';
import type { Rating, Reference, RunResult, TrailNode } from './types';
import './prior-art.css';

type Run = RunResult & { invention: string };
type Analysis = { state: 'idle' | 'loading' | 'done' | 'unavailable'; message?: string; ratings: Map<string, Rating> };

function RatingNote({ rating }: { rating?: Rating }) {
  if (!rating) return null;
  return (
    <div className="prior-art-rating" data-rating={rating.rating}>
      <strong>Relation: {rating.rating}</strong> <span>{rating.reason}</span>
      {rating.quote ? <blockquote>“{rating.quote}”</blockquote> : <p className="prior-art-unverified">Quote not verified — omitted.</p>}
    </div>
  );
}

function RefLabel({ item }: { item: Reference }) {
  const year = item.date?.slice(0, 4);
  return (
    <span className="prior-art-ref">
      {item.url ? <a href={item.url} target="_blank" rel="noreferrer">US {item.id}</a> : <b>{item.id}</b>}
      {' '}<span>{item.title}</span>{year ? <span className="prior-art-year"> ({year})</span> : null}
    </span>
  );
}

function Tree({ nodes, ratings }: { nodes: TrailNode[]; ratings: Map<string, Rating> }) {
  if (!nodes.length) return null;
  return (
    <ul className="prior-art-tree">
      {nodes.map(node => (
        <li key={node.id} data-trail-node={node.id}>
          <RefLabel item={node} />
          {node.category && node.category !== 'unknown' ? <span className="prior-art-chip">cited by {node.category}</span> : null}
          {ratings.get(node.id) ? <span className="prior-art-chip">{ratings.get(node.id)!.rating}</span> : null}
          <Tree nodes={node.children} ratings={ratings} />
        </li>
      ))}
    </ul>
  );
}

function PriorArt({ activeMatter }: FeatureProps) {
  const [numbers, setNumbers] = useState('');
  const [depth, setDepth] = useState(2);
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis>({ state: 'idle', ratings: new Map() });
  const matterId = activeMatter?.practiceArea === 'patent' ? activeMatter.id : undefined;

  const search = useCallback(async (typed: string, levels: number) => {
    if (!matterId) return;
    setLoading(true); setError(undefined); setAnalysis({ state: 'idle', ratings: new Map() });
    try {
      const response = await fetch('/api/features/prior-art/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matterId, numbers: typed, depth: levels }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.message ?? 'The prior-art search could not finish.');
      setRun(json as Run);
      setAnalysis({ state: 'loading', ratings: new Map() });
      const rated = await fetch('/api/features/prior-art/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: json.runId }),
      });
      const result = await rated.json().catch(() => ({}));
      if (!rated.ok) {
        const message = result.error === 'needs_key'
          ? 'Relevance ratings need a Claude API key. The listing below has no analysis.'
          : result.message ?? 'The relevance analysis did not finish. The listing below is still complete.';
        setAnalysis({ state: 'unavailable', message, ratings: new Map() });
      } else {
        setAnalysis({ state: 'done', ratings: new Map((result.ratings as Rating[]).map(r => [r.id, r])) });
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message !== 'Failed to fetch' ? caught.message : 'The prior-art service is not responding. Check that the app server is running, then try again.');
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => { setRun(undefined); if (matterId) void search('', 2); }, [matterId, search]);

  if (!activeMatter || activeMatter.practiceArea !== 'patent') {
    return <section className="prior-art"><p>Prior art applies to patent matters.</p></section>;
  }
  const ratings = analysis.ratings;
  return (
    <section className="prior-art" aria-label="Prior art">
      <div className="prior-art-invention">
        <h3>Invention</h3>
        <p>{run?.invention ?? inventionSummary(activeMatter)}</p>
      </div>
      <form className="prior-art-form" onSubmit={event => { event.preventDefault(); void search(numbers, depth); }}>
        <label>US patent numbers to trace
          <input value={numbers} onChange={event => setNumbers(event.target.value)} placeholder="e.g. 10,000,000; US9876543B2" />
        </label>
        <label>Citation depth
          <select value={depth} onChange={event => setDepth(Number(event.target.value))}>
            {[1, 2, 3].map(level => <option key={level} value={level}>{level} {level === 1 ? 'level' : 'levels'}</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search prior art'}</button>
      </form>
      <p className="prior-art-caution"><strong>Caution:</strong> a starting point for counsel's review, not a patentability opinion.</p>
      {loading && !run ? <p role="status">Searching USPTO records…</p> : null}
      {error ? <p role="alert" className="prior-art-error">{error}</p> : null}
      {run ? (
        <>
          <p className="prior-art-source" data-source={run.source}><strong>{run.source === 'live' ? run.sourceLine : `${run.sourceLine}. Illustrative sample — not real USPTO data.`}</strong></p>
          {run.notices.map(notice => <p key={notice} className="prior-art-notice">{notice}</p>)}
          {analysis.state === 'loading' ? <p role="status">Rating each reference against the invention…</p> : null}
          {analysis.message ? <p role="status" className="prior-art-notice">{analysis.message}</p> : null}
          <div className="prior-art-columns">
            <div>
              <h3>Candidate prior art ({run.candidates.length})</h3>
              <p className="prior-art-meta">Searched: {run.queries.join('; ')}</p>
              {run.candidates.length ? (
                <ol className="prior-art-list">
                  {run.candidates.map(item => (
                    <li key={item.id} data-candidate={item.id}>
                      <RefLabel item={item} />
                      <p>{item.text}</p>
                      <RatingNote rating={ratings.get(item.id)} />
                    </li>
                  ))}
                </ol>
              ) : <p>No matching references found.</p>}
            </div>
            <div>
              <h3>Citation trail ({run.trailNodeCount} references)</h3>
              <p className="prior-art-meta">{run.numbers.length ? `Tracing ${run.numbers.join(', ')}` : 'Tracing the top candidates'} backward.</p>
              {run.trails.length ? <Tree nodes={run.trails} ratings={ratings} /> : <p>No citation trail available.</p>}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

registerFeature({ id: 'prior-art', title: 'Prior art', slot: 'cockpit.tab', component: PriorArt });
