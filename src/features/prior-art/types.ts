export type PriorArtSource = 'live' | 'sample';

export type Reference = {
  id: string;
  title: string;
  date?: string;
  /** Text the analysis may quote: an abstract, or the live title and metadata. */
  text: string;
  sample: boolean;
  /** Public page, only for numbers returned by a live USPTO call. */
  url?: string;
};

export type TrailNode = Reference & {
  depth: number;
  citedBy?: string;
  category?: 'examiner' | 'applicant' | 'unknown';
  children: TrailNode[];
};

export type Rating = {
  id: string;
  rating: 'Close' | 'Partial' | 'Distant';
  reason: string;
  quote?: string;
  quoteVerified: boolean;
};

export type RunResult = {
  runId: string;
  source: PriorArtSource;
  sourceLine: string;
  notices: string[];
  queries: string[];
  candidates: Reference[];
  trails: TrailNode[];
  trailNodeCount: number;
  numbers: string[];
};
