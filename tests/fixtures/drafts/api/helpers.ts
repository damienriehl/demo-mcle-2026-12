import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages';
import { matterSchema } from '../../../../src/data/schema';
import { computeDeadline, deadlineCatalog } from '../../../../src/engine';
import { createDraftCompareRoutes } from '../../../../server/drafts/routes';
import type { ModelStream } from '../../../../server/intake/client';
import { materialize } from '../../../../server/seed-dates';
import { createMatterStore } from '../../../../server/store';

export const fixtures = resolve('tests/fixtures/drafts/api');
export const buyer = 'Fictional Alder Buyer';
export const seller = 'Fictional Birch Seller';
export const meta = JSON.parse(readFileSync(join(fixtures, 'payment/meta.json'), 'utf8'));
export const analysis = (side = 0) => JSON.parse(readFileSync(join(fixtures, `payment/analysis.${side}.json`), 'utf8'));
export function setup(stream: ModelStream | null = null) {
  const directory = mkdtempSync(join(tmpdir(), 'mc-draft-api-'));
  const store = createMatterStore({ filePath: join(directory, 'matters.json'), engine: { computeDeadline, deadlineCatalog } });
  const seed = matterSchema.parse(materialize(JSON.parse(readFileSync('data/seed/matters/dminn-quillfeather.json', 'utf8')), '2026-11-09'));
  store.upsert({ ...seed, client: { ...seed.client, name: buyer.toUpperCase() }, parties: [{ name: seller.toUpperCase(), role: 'client' }] });
  const comparisonsDir = join(directory, 'comparisons');
  return { directory, comparisonsDir, store, matterId: seed.id,
    app: createDraftCompareRoutes({ store, stream, comparisonsDir, samplesDir: fixtures, cannedDir: fixtures }) };
}
export function fake(outputs: unknown[], inspect?: (request: Parameters<ModelStream>[0]) => void) {
  const requests: Parameters<ModelStream>[0][] = [];
  const stream: ModelStream = async function* (request) {
    requests.push(request);
    inspect?.(request);
    const tool = request.tools![0];
    if (!('name' in tool)) throw new Error('Expected named tool.');
    const name = tool.name;
    yield { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'draft', name, input: {} } } as BetaRawMessageStreamEvent;
    const json = JSON.stringify(outputs.shift());
    for (let offset = 0; offset < json.length; offset += 17) {
      yield { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(offset, offset + 17) } };
    }
    yield { type: 'content_block_stop', index: 0 };
  };
  return { stream, requests };
}
export async function events(response: Response) {
  expectSSE(response);
  return (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
}
function expectSSE(response: Response) {
  if (!response.headers.get('Content-Type')?.includes('text/event-stream')) throw new Error('Expected SSE.');
}
export function upload(context: ReturnType<typeof setup>, options: { sample?: boolean; matterId?: string; header?: boolean; later?: string } = {}) {
  const form = new FormData();
  form.set('matterId', options.matterId ?? context.matterId);
  if (options.sample) form.set('sample', 'payment');
  else for (const side of ['earlier', 'later']) {
    form.set(side, new File([side === 'later' && options.later ? options.later : readFileSync(join(fixtures, `payment/${side}.md`))], `${side}.md`));
  }
  return context.app.request('/compare', { method: 'POST', body: form, headers: options.header === false ? {} : { 'X-Matter-Cockpit-Upload': '1' } });
}
export function json(context: ReturnType<typeof setup>, path: string, body: unknown) {
  return context.app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
