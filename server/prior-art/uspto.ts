import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Reference } from '../../src/features/prior-art/types';

/**
 * All USPTO access lives here so the endpoint can be swapped.
 * Live source: USPTO Open Data Portal (ODP), header X-API-KEY.
 * PatentsView PatentSearch was paused on 2026-03-20 and is not used.
 * Any 401/403/404, network failure, or missing field means "live data unavailable".
 */
export class UsptoUnavailable extends Error {}

export type Citation = { id: string; category: 'examiner' | 'applicant' | 'unknown' };
export type PatentApi = {
  getPatent(number: string): Promise<Reference | null>;
  getCitations(number: string): Promise<Citation[]>;
  searchPatents(terms: string, beforeDate?: string): Promise<Reference[]>;
};

type Env = Record<string, string | undefined>;
const ODP = 'https://api.uspto.gov/api/v1/patent/applications/search';

export function readUsptoKey(env: Env = process.env): string | null {
  const fromEnv = env.MATTER_COCKPIT_USPTO_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(homedir(), '.config/matter-cockpit/uspto-key'), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

type Bag = { applicationMetaData?: Record<string, unknown> };

function toReference(item: Bag): Reference | null {
  const meta = item.applicationMetaData;
  const number = typeof meta?.patentNumber === 'string' ? meta.patentNumber.replace(/[^\dA-Z]/gi, '') : '';
  const title = typeof meta?.inventionTitle === 'string' ? meta.inventionTitle : '';
  if (!number || !title) return null;
  const date = typeof meta?.grantDate === 'string' ? meta.grantDate.slice(0, 10) : undefined;
  const cpc = Array.isArray(meta?.cpcClassificationBag) ? (meta.cpcClassificationBag as unknown[]).filter(v => typeof v === 'string').slice(0, 3).join(', ') : '';
  return {
    id: number, title, date, sample: false,
    text: [title, cpc && `CPC ${cpc}`].filter(Boolean).join('. '),
    url: `https://patents.google.com/patent/US${number}`,
  };
}

export function createOdpApi(key: string, fetcher: typeof fetch = fetch): PatentApi {
  async function search(body: unknown): Promise<Reference[]> {
    let response: Response;
    try {
      response = await fetcher(ODP, {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new UsptoUnavailable('The USPTO Open Data Portal could not be reached.');
    }
    if (response.status === 404) return [];
    if (!response.ok) throw new UsptoUnavailable(`The USPTO Open Data Portal answered ${response.status}.`);
    const json = await response.json().catch(() => null) as { patentFileWrapperDataBag?: Bag[] } | null;
    if (!json || !Array.isArray(json.patentFileWrapperDataBag)) throw new UsptoUnavailable('The USPTO response had an unexpected shape.');
    return json.patentFileWrapperDataBag.map(toReference).filter((r): r is Reference => !!r);
  }
  return {
    async getPatent(number) {
      const [hit] = await search({ q: `applicationMetaData.patentNumber:${number}`, pagination: { offset: 0, limit: 1 } });
      return hit ?? null;
    },
    async getCitations() {
      // The Enriched Citation API path is unconfirmed; report no live citations rather than guess.
      return [];
    },
    async searchPatents(terms, beforeDate) {
      const words = terms.split(/\s+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/gi, '')).filter(Boolean);
      return search({
        q: `applicationMetaData.inventionTitle:(${words.join(' AND ')})`,
        ...(beforeDate ? { rangeFilters: [{ field: 'applicationMetaData.grantDate', valueFrom: '1900-01-01', valueTo: beforeDate }] } : {}),
        pagination: { offset: 0, limit: 15 },
      });
    },
  };
}
