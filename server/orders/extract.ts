import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { toStoredMatter } from '../../src/data/schema';
import { modelName, NEEDS_KEY_MESSAGE } from '../ai';
import { consumeTool, modelStream, type ModelStream } from '../intake/client';
import { todayLine } from '../intake/prompts';
import { getMatterStore, type MatterStore } from '../store';
import { applySchedulingOrder } from './apply';
import { orderIds } from './ids';
import { pageTexts, textPages } from './pdf-text';
import { extractionSchema, orderDateSchema, orderSystemPrompt, orderTool, type Extraction, type VerifiedDate } from './prompt';
import { normalize, verifyQuote } from './verify-quote';

const pastedSchema = z.strictObject({ matterId: z.string().min(1), text: z.string().min(1), name: z.string().optional() });
const bundles = new Map<string, Promise<Map<string, Extraction>>>();

function textHash(pages: string[]): string {
  const normalized = pages.map(normalize);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function bundledOrders(directory: string): Promise<Map<string, Extraction>> {
  let cached = bundles.get(directory);
  if (!cached) {
    cached = (async () => {
      const orders = new Map<string, Extraction>();
      for (const name of (await readdir(directory)).filter(name => name.endsWith('.pdf')).sort()) {
        const pages = await pageTexts(new Uint8Array(await readFile(resolve(directory, name))));
        const { dates, court, caption } = JSON.parse(await readFile(resolve(directory, name.replace(/\.pdf$/, '.extraction.json')), 'utf8'));
        orders.set(textHash(pages), extractionSchema.parse({ dates, court, caption }));
      }
      return orders;
    })().catch(error => {
      bundles.delete(directory);
      throw error;
    });
    bundles.set(directory, cached);
  }
  return cached;
}

function slugify(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop()!;
  return base.slice(0, base.length - extname(base).length).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'uploaded-order';
}

type Options = { store?: MatterStore; stream?: ModelStream | null; ordersDirectory?: string };

export function createSchedulingOrderRoutes(options: Options = {}): Hono {
  const app = new Hono();
  app.post('/extract', c => streamSSE(c, async outgoing => {
    const abort = new AbortController();
    const stop = () => abort.abort();
    c.req.raw.signal.addEventListener('abort', stop, { once: true });
    outgoing.onAbort(stop);
    if (c.req.raw.signal.aborted) stop();
    const send = async (event: object) => { if (!abort.signal.aborted) await outgoing.writeSSE({ data: JSON.stringify(event) }); };
    try {
      if (c.req.header('X-Matter-Cockpit-Upload') !== '1') {
        await send({ type: 'error', message: 'Scheduling order uploads require X-Matter-Cockpit-Upload: 1.' });
        return;
      }
      const contentType = c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json' && contentType !== 'multipart/form-data') {
        await send({ type: 'error', message: 'Scheduling orders require application/json or multipart/form-data.' });
        return;
      }
      let pages: string[];
      let matterId: string;
      let orderSlug: string;
      if (contentType === 'application/json') {
        const body = pastedSchema.parse(await c.req.json());
        matterId = body.matterId;
        pages = textPages(body.text);
        orderSlug = `pasted-${createHash('sha256').update(body.text).digest('hex').slice(0, 8)}`;
      } else {
        const body = await c.req.formData();
        matterId = z.string().min(1).parse(body.get('matterId'));
        const file = body.get('file');
        if (!(file instanceof File) || file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) {
          await send({ type: 'error', message: 'Upload a PDF no larger than 10 MB.' });
          return;
        }
        orderSlug = slugify(file.name);
        pages = await pageTexts(new Uint8Array(await file.arrayBuffer()));
      }
      const store = options.store ?? getMatterStore();
      if (!store.get(matterId)) {
        await send({ type: 'error', message: 'Unknown matter.' });
        return;
      }
      await send({ type: 'pages', count: pages.length });
      const accepted: VerifiedDate[] = [];
      const accept = async (value: unknown) => {
        const date = orderDateSchema.parse(value);
        const check = verifyQuote(date, pages);
        const verified: VerifiedDate = { ...date, verified: check.ok, ...(!check.ok ? { reason: check.reason } : {}) };
        accepted.push(verified);
        await send({ type: 'date', ...verified });
      };
      const source = options.stream === undefined ? modelStream() : options.stream;
      let extraction: Extraction;
      if (source) {
        extraction = extractionSchema.parse(await consumeTool(source({
          model: modelName(), max_tokens: 8192, system: orderSystemPrompt,
          tools: [orderTool], tool_choice: { type: 'auto', disable_parallel_tool_use: true },
          output_config: { effort: 'low' },
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          messages: [{ role: 'user', content: `${todayLine()}\n${pages.map((page, index) => `=== Page ${index + 1} ===\n${page}`).join('\n\n')}` }],
        }, abort.signal), accept, orderTool.name, 'dates'));
      } else {
        const orders = await bundledOrders(resolve(options.ordersDirectory ?? 'data/seed/orders'));
        const canned = orders.get(textHash(pages));
        if (!canned) {
          await send({ type: 'needs_key', message: NEEDS_KEY_MESSAGE });
          return;
        }
        extraction = canned;
        for (const date of extraction.dates) {
          await new Promise(resolve => setTimeout(resolve, 150));
          if (abort.signal.aborted) return;
          await accept(date);
        }
      }
      if (abort.signal.aborted) return;
      const current = store.get(matterId);
      if (!current) {
        await send({ type: 'error', message: 'Unknown matter.' });
        return;
      }
      const courtDates = accepted.filter(date => date.verified).length;
      if (!courtDates) {
        await send({ type: 'done', matter: toStoredMatter(current), added: { courtDates: 0, derived: 0 },
          unverified: accepted, message: 'No dates could be verified; the matter was not changed.' });
        return;
      }
      const matter = applySchedulingOrder(toStoredMatter(current), { ...extraction, dates: accepted }, orderSlug);
      store.upsert(matter);
      const derived = matter.deadlines.filter(deadline => deadline.id.startsWith(orderIds(orderSlug).prefix)).length - courtDates;
      await send({ type: 'done', matter, added: { courtDates, derived }, unverified: accepted.filter(date => !date.verified) });
    } catch (error) {
      if (error instanceof Anthropic.APIError) console.error(`scheduling order failed: ${error.constructor.name} ${error.status ?? 'no-status'} ${error.type ?? 'unknown_type'}`);
      else if (!(error instanceof z.ZodError)) console.error(`scheduling order failed: ${error instanceof Error ? error.constructor.name : typeof error}`);
      await send({ type: 'error', message: 'Scheduling order extraction could not finish.' });
    } finally {
      stop();
      c.req.raw.signal.removeEventListener('abort', stop);
    }
  }));
  return app;
}
