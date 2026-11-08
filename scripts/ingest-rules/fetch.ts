// Polite, cached downloads for the offline rule ingester. Each download is stored under
// .cache/rules/ with a sidecar recording its URL and retrieval date, so a rerun reproduces
// the same output without touching the network. Delete the cache to re-download.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = join(import.meta.dirname, '..', '..', '.cache', 'rules');
const USER_AGENT = 'matter-cockpit-rules-ingester/0.1 (offline maintenance script for a demo app)';
const DELAY_MS = 1500;

export interface Download {
  body: Buffer;
  url: string;
  retrievedAt: string;
}

let lastRequest = 0;

function cacheName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 200);
}

export async function download(url: string, headers: Record<string, string> = {}): Promise<Download> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, cacheName(url));
  const meta = `${file}.meta.json`;
  if (existsSync(file) && existsSync(meta)) {
    const { retrievedAt } = JSON.parse(readFileSync(meta, 'utf8')) as { retrievedAt: string };
    return { body: readFileSync(file), url, retrievedAt };
  }
  const wait = lastRequest + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  // fetch() negotiates and decodes gzip itself, which the eCFR API requires.
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip', ...headers } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const retrievedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(file, body);
  writeFileSync(meta, JSON.stringify({ url, finalUrl: res.url, retrievedAt }, null, 2));
  return { body, url, retrievedAt };
}

export async function downloadText(url: string, headers?: Record<string, string>) {
  const d = await download(url, headers);
  return { ...d, text: d.body.toString('utf8') };
}

/** Text of a PDF in reading layout, via poppler's pdftotext. */
export async function downloadPdfText(url: string) {
  const d = await download(url);
  const file = join(CACHE_DIR, cacheName(url));
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  return { ...d, text };
}

/** Collapse runs of whitespace and trim. */
export function squash(s: string): string {
  return s.replace(/[\s ]+/g, ' ').trim();
}
