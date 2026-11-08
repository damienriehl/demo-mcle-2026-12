import type { BetaMessageStreamParams, BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages';
import { createClient } from '../ai';
import { intakeTool } from './schema';

export type ModelStream = (request: BetaMessageStreamParams, signal: AbortSignal) => AsyncIterable<BetaRawMessageStreamEvent>;

/** The model ended its turn without one complete tool call; the route retries once. */
export class IncompleteToolError extends Error {}

export function modelStream(): ModelStream | null {
  const client = createClient();
  if (!client) return null;
  return async function* (request, signal) {
    const stream = client.beta.messages.stream(request, { signal, maxRetries: 0 });
    try { for await (const event of stream) yield event; }
    finally { stream.abort(); }
  };
}

class FieldScanner {
  private buffer = '';
  private cursor = 0;
  private started = false;
  private ended = false;
  private depth = 0;
  private quoted = false;
  private escaped = false;
  private start = 0;

  append(chunk: string): unknown[] {
    this.buffer += chunk;
    if (!this.started) {
      const prefix = /^\s*\{\s*"fields"\s*:\s*\[/.exec(this.buffer);
      if (!prefix) return [];
      this.cursor = prefix[0].length;
      this.started = true;
    }
    const fields: unknown[] = [];
    while (!this.ended && this.cursor < this.buffer.length) {
      const char = this.buffer[this.cursor];
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.quoted = false;
      } else if (char === '"') this.quoted = true;
      else if (char === '{' || char === '[') {
        if (this.depth === 0) this.start = this.cursor;
        this.depth++;
      } else if (char === ']' && this.depth === 0) this.ended = true;
      else if (char === '}' || char === ']') {
        this.depth--;
        if (this.depth === 0) fields.push(JSON.parse(this.buffer.slice(this.start, this.cursor + 1)));
      }
      this.cursor++;
    }
    return fields;
  }
}

export async function consumeTool(stream: AsyncIterable<BetaRawMessageStreamEvent>, onField: (field: unknown) => Promise<void>): Promise<unknown> {
  let activeIndex: number | undefined;
  let input = '';
  let stopped = false;
  let fieldsRead = 0;
  let stopReason: string | null = null;
  const scanner = new FieldScanner();
  for await (const event of stream) {
    if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
      if (activeIndex !== undefined || event.content_block.name !== intakeTool.name) throw new Error('Expected one structure_matter tool call');
      activeIndex = event.index;
    } else if (event.type === 'content_block_delta' && event.index === activeIndex && event.delta.type === 'input_json_delta') {
      input += event.delta.partial_json;
      for (const field of scanner.append(event.delta.partial_json)) { await onField(field); fieldsRead++; }
    } else if (event.type === 'content_block_stop' && event.index === activeIndex) stopped = true;
    else if (event.type === 'message_delta') stopReason = event.delta.stop_reason;
  }
  if (stopReason === 'max_tokens' || stopReason === 'refusal') throw new IncompleteToolError(`Model stopped with ${stopReason} before a complete tool call.`);
  if (!stopped) throw new IncompleteToolError('Model ended without calling structure_matter.');
  const output: unknown = JSON.parse(input);
  // JSON property order is not semantically significant. A reordered tool still validates.
  if (output && typeof output === 'object' && 'fields' in output && Array.isArray(output.fields)) {
    for (const field of output.fields.slice(fieldsRead)) await onField(field);
  }
  return output;
}
