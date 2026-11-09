import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Matter } from '../../src/data/schema';
import { modelName, NEEDS_KEY_MESSAGE } from '../ai';
import { getMatterStore, type MatterStore } from '../store';
import { cannedMatter } from './canned';
import { consumeTool, IncompleteToolError, modelStream, type ModelStream } from './client';
import { systemPrompt, todayLine } from './prompts';
import { applyField, intakeTool, leaves, outputSchema, readDraft, validateMatter, type Draft } from './schema';

export type { ModelStream } from './client';
export type { Draft } from './schema';

const bodies = {
  ramble: z.strictObject({ text: z.string().min(1), draft: z.unknown().optional() }),
  answer: z.strictObject({ draft: z.unknown(), answers: z.array(z.strictObject({ questionId: z.string().min(1), answer: z.string() })) }),
  embellish: z.strictObject({ draft: z.unknown() }),
  surprise: z.strictObject({ practiceArea: z.string().optional() }),
};
type Options = { store?: MatterStore; stream?: ModelStream | null; cannedDirectory?: string };

export function createIntakeRoutes(options: Options = {}): Hono {
  const app = new Hono();
  for (const mode of ['ramble', 'answer', 'embellish', 'surprise'] as const) {
    app.post(`/${mode}`, (c) => streamSSE(c, async (outgoing) => {
      const abort = new AbortController();
      const stop = () => abort.abort();
      c.req.raw.signal.addEventListener('abort', stop, { once: true });
      outgoing.onAbort(stop);
      if (c.req.raw.signal.aborted) stop();
      const send = async (event: object) => { if (!abort.signal.aborted) await outgoing.writeSSE({ data: JSON.stringify(event) }); };
      let draft: Draft = { provenance: {} };
      try {
        if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          await send({ type: 'error', message: 'Intake requires application/json.' });
          return;
        }
        const body = bodies[mode].parse(await c.req.json());
        const initial = readDraft('draft' in body ? body.draft : undefined);
        draft = initial.draft;
        if (initial.errors.length) throw new Error(initial.errors.join('; '));
        const source = options.stream === undefined ? modelStream() : options.stream;
        if (!source && mode !== 'surprise') {
          await send({ type: 'needs_key', message: NEEDS_KEY_MESSAGE });
          return;
        }
        const store = options.store ?? getMatterStore();
        const accept = async (field: unknown) => {
          const result = applyField(draft, field, mode === 'embellish');
          for (const accepted of result.fields) await send({ type: 'field', ...accepted });
          return result.errors;
        };
        const save = async (matter: Matter) => {
          matter.id = randomUUID();
          draft.id = matter.id;
          draft.provenance.id = matter.provenance.id = { source: 'invented' };
          await send({ type: 'field', path: 'id', value: matter.id, source: 'invented' });
          store.upsert(matter);
          await send({ type: 'done', matter });
        };
        if (!source) {
          const matter = cannedMatter(options.cannedDirectory ?? resolve('data/seed/canned'), 'practiceArea' in body ? body.practiceArea : undefined);
          for (const leaf of leaves(matter)) {
            const errors = await accept({ ...leaf, source: 'invented' });
            if (errors.length) throw new Error(errors.join('; '));
          }
          await save(validateMatter(draft));
          return;
        }
        let correction = '';
        for (let attempt = 0; attempt < 2; attempt++) {
          const errors: string[] = [];
          let output: unknown;
          try {
            output = await consumeTool(source({
              model: modelName(), max_tokens: 8192, system: systemPrompt(),
              tools: [intakeTool], tool_choice: { type: 'auto', disable_parallel_tool_use: true },
              output_config: { effort: 'low' },
              betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
              messages: [{ role: 'user', content: `${todayLine()}\n${JSON.stringify({ mode, ...body, draft, ...(correction ? { correction } : {}) })}` }],
            }, abort.signal), async (field) => { errors.push(...await accept(field)); });
          } catch (error) {
            if (error instanceof SyntaxError) errors.push('Tool input was not complete valid JSON.');
            else if (error instanceof IncompleteToolError) errors.push(`${error.message} Call ${intakeTool.name} exactly once.`);
            else throw error;
          }
          const parsed = outputSchema.safeParse(output);
          if (!parsed.success) errors.push(parsed.error.message);
          if (!errors.length && parsed.success) {
            const questions = parsed.data.followups.slice(0, 3).map((question) => ({ ...question, id: question.field }));
            if (questions.length && (mode === 'ramble' || mode === 'answer')) {
              await send({ type: 'followups', questions });
              return;
            }
            let matter: Matter | undefined;
            try {
              if (questions.length) throw new Error('Complete this matter without followups.');
              const candidate = validateMatter(draft);
              if ('practiceArea' in body && body.practiceArea && candidate.practiceArea !== body.practiceArea) {
                throw new Error(`practiceArea: must match the requested ${body.practiceArea}`);
              }
              matter = candidate;
            } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid matter'); }
            if (matter) { await save(matter); return; }
          }
          correction = `Repair these validation errors; keep valid draft fields. ${errors.join('; ')}`;
        }
        await send({ type: 'error', message: 'Intake could not validate a complete result after one retry. Use Embellish to fill or repair the remaining fields.', partial: draft });
      } catch (error) {
        // Log only the error class, status, and API error type: never the body, headers, or key.
        if (error instanceof Anthropic.APIError) console.error(`intake failed: ${error.constructor.name} ${error.status ?? 'no-status'} ${error.type ?? 'unknown_type'}`);
        else if (!(error instanceof z.ZodError)) console.error(`intake failed: ${error instanceof Error ? error.constructor.name : typeof error}`);
        // Do not send SDK error text: provider errors may include request details.
        const message = error instanceof z.ZodError ? `Invalid intake request: ${error.message}`
          : 'Intake could not finish. Valid fields were kept; use Embellish to complete the draft.';
        await send({ type: 'error', message, partial: draft });
      } finally {
        stop();
        c.req.raw.signal.removeEventListener('abort', stop);
      }
    }));
  }
  return app;
}
