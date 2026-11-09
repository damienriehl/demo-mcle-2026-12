import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMessages, notifyWaiting, PREVIEW_REASON } from '../server/notify';
import { createResendAdapter, createTelnyxAdapter, isFictional, toE164, type Adapters } from '../server/notify/adapters';
import { clientView } from '../server/tasks/logic';
import { patchAndNotify } from '../server/tasks/service';
import { createTaskStore } from '../server/tasks/store';
import { DEFAULT_PREFS, type Task } from '../src/features/task-board/types';

const dirs: string[] = [];
const tempStore = () => { const dir = mkdtempSync(join(tmpdir(), 'notify-')); dirs.push(dir); return createTaskStore(dir); };
afterEach(() => { dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

const synthetic = { id: 'm1', client: { name: 'A', contact: 'a@example.invalid' } };
const realish = { id: 'm1', client: { name: 'A', contact: 'a@firm.test' } };
const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', owner: 'client', title: 'Send corrections', detail: '', status: 'waiting', waitingOn: 'client', sharedWithClient: true,
  dueDate: '2026-11-13', source: { kind: 'verify', ref: 'x' }, needsUpload: false, createdAt: '2026-11-09T00:00:00Z', ...over,
});
const spyAdapters = (send = vi.fn(async () => {})) => ({ send, adapters: { email: { configured: () => true, send }, text: { configured: () => true, send } } satisfies Adapters });
const allOn = { email: true, text: true, textConsent: true, phone: '555-0100' };

describe('notifier messages', () => {
  it('names the task, due date, and portal link', () => {
    const [email] = buildMessages(task(), synthetic, DEFAULT_PREFS);
    expect(email).toEqual({ channel: 'email', to: 'a@example.invalid', subject: 'Action needed: Send corrections', body: 'Your lawyer is waiting on: Send corrections. Due Nov 13. Open your portal: /#portal/m1' });
  });
  it('omits the due date when there is none', () => {
    expect(buildMessages(task({ dueDate: undefined }), synthetic, DEFAULT_PREFS)[0].body).toBe('Your lawyer is waiting on: Send corrections. Open your portal: /#portal/m1');
  });
  it('ends every text with STOP', () => {
    const text = buildMessages(task(), synthetic, allOn).find(message => message.channel === 'text');
    expect(text?.to).toBe('555-0100');
    expect(text?.body.endsWith(' Reply STOP to opt out.')).toBe(true);
  });
  it('sends no text without consent and a phone (AE2)', () => {
    expect(buildMessages(task(), synthetic, { ...allOn, textConsent: false }).map(m => m.channel)).toEqual(['email']);
    expect(buildMessages(task(), synthetic, { ...allOn, phone: undefined }).map(m => m.channel)).toEqual(['email']);
    expect(buildMessages(task(), synthetic, { email: false, text: false, textConsent: true, phone: '555-0100' })).toEqual([]);
  });
});

describe('notifyWaiting', () => {
  it('previews example.invalid recipients and never invokes an adapter, even when configured (R9, AE1)', async () => {
    const store = tempStore();
    const { send, adapters } = spyAdapters();
    const entries = await notifyWaiting({ matter: synthetic, task: task(), store, adapters });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'email', result: 'previewed', reason: PREVIEW_REASON });
    expect(send).not.toHaveBeenCalled();
    expect(store.read('m1').outbox).toHaveLength(1);
  });
  it('previews when no adapter is configured', async () => {
    const store = tempStore();
    const send = vi.fn(async () => {});
    const off = { email: { configured: () => false, send }, text: { configured: () => false, send } };
    const [entry] = await notifyWaiting({ matter: realish, task: task(), store, adapters: off });
    expect(entry.result).toBe('previewed');
    expect(send).not.toHaveBeenCalled();
  });
  it('dedupes the same task within 60 seconds (R7)', async () => {
    const store = tempStore();
    const at = new Date('2026-11-09T12:00:00Z');
    await notifyWaiting({ matter: synthetic, task: task(), store, now: () => at });
    expect(await notifyWaiting({ matter: synthetic, task: task(), store, now: () => new Date(at.getTime() + 59_000) })).toEqual([]);
    expect(await notifyWaiting({ matter: synthetic, task: task(), store, now: () => new Date(at.getTime() + 61_000) })).toHaveLength(1);
    expect(store.read('m1').outbox).toHaveLength(2);
  });
  it('skips tasks the client cannot see', async () => {
    expect(await notifyWaiting({ matter: synthetic, task: task({ owner: 'lawyer', sharedWithClient: false }), store: tempStore() })).toEqual([]);
  });
  it('records a failed delivery and the PATCH still succeeds (R8)', async () => {
    const store = tempStore();
    store.write('m1', { tasks: [task({ status: 'todo', waitingOn: undefined })], proposals: [] });
    const { adapters } = spyAdapters(vi.fn(async () => { throw new Error('Provider down'); }));
    const result = await patchAndNotify({ matter: realish, taskId: 't1', patch: { status: 'waiting', waitingOn: 'client' }, view: 'lawyer', tasks: store, adapters });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.board.tasks[0]).toMatchObject({ status: 'waiting', waitingOn: 'client' });
    expect(result.board.outbox?.[0]).toMatchObject({ result: 'failed', reason: 'Provider down' });
  });
  it('previews a 555-01xx text even when texting is configured', async () => {
    const store = tempStore();
    store.write('m1', { tasks: [], proposals: [], prefs: allOn });
    const { send, adapters } = spyAdapters();
    const entries = await notifyWaiting({ matter: synthetic, task: task(), store, adapters });
    expect(entries.map(entry => [entry.channel, entry.result])).toEqual([['email', 'previewed'], ['text', 'previewed']]);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('client view', () => {
  it('carries the client preferences and never the outbox', () => {
    const view = clientView({ tasks: [task()], proposals: [], prefs: allOn, outbox: [{ id: 'o', taskId: 't1', channel: 'email', to: 'a@example.invalid', body: 'b', at: 'now', result: 'previewed' }] });
    expect(view).not.toHaveProperty('outbox');
    expect(view.prefs).toEqual(allOn);
    expect(JSON.stringify(view)).not.toContain('a@example.invalid');
  });
});

describe('provider adapters (fetch mocked; nothing touches the network)', () => {
  const none = '/nonexistent/matter-cockpit-key';
  const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
  it('Resend posts the documented request shape', async () => {
    const fetchMock = ok();
    const adapter = createResendAdapter({ env: { MATTER_COCKPIT_RESEND_KEY: 'k-test', MATTER_COCKPIT_EMAIL_FROM: 'office@firm.test' }, keyFile: none, fetch: fetchMock });
    expect(adapter.configured()).toBe(true);
    await adapter.send({ channel: 'email', to: 'a@firm.test', subject: 'Action needed: X', body: 'Body' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer k-test', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ from: 'office@firm.test', to: ['a@firm.test'], subject: 'Action needed: X', text: 'Body' });
  });
  it('Telnyx posts E.164 numbers', async () => {
    const fetchMock = ok();
    const adapter = createTelnyxAdapter({ env: { MATTER_COCKPIT_TELNYX_KEY: 'k-test', MATTER_COCKPIT_SMS_FROM: '612-555-1000' }, keyFile: none, fetch: fetchMock });
    await adapter.send({ channel: 'text', to: '(612) 555-1234', body: 'Hi. Reply STOP to opt out.' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telnyx.com/v2/messages');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer k-test', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ from: '+16125551000', to: '+16125551234', text: 'Hi. Reply STOP to opt out.' });
  });
  it('a non-2xx response records failed with the status', async () => {
    const store = tempStore();
    store.write('m1', { tasks: [], proposals: [], prefs: { ...allOn, phone: '612-555-1234' } });
    const bad = vi.fn(async () => new Response('no', { status: 422 }));
    const adapters = {
      email: createResendAdapter({ env: { MATTER_COCKPIT_RESEND_KEY: 'k', MATTER_COCKPIT_EMAIL_FROM: 'o@firm.test' }, keyFile: none, fetch: bad }),
      text: createTelnyxAdapter({ env: { MATTER_COCKPIT_TELNYX_KEY: 'k', MATTER_COCKPIT_SMS_FROM: '+16125551000' }, keyFile: none, fetch: bad }),
    };
    const entries = await notifyWaiting({ matter: realish, task: task(), store, adapters });
    expect(entries.map(entry => [entry.result, entry.reason])).toEqual([['failed', 'Resend returned 422'], ['failed', 'Telnyx returned 422']]);
  });
  it('with nothing configured, both stay previewed and fetch never runs', async () => {
    const store = tempStore();
    store.write('m1', { tasks: [], proposals: [], prefs: { ...allOn, phone: '612-555-1234' } });
    const fetchMock = ok();
    const adapters = { email: createResendAdapter({ env: {}, keyFile: none, fetch: fetchMock }), text: createTelnyxAdapter({ env: {}, keyFile: none, fetch: fetchMock }) };
    const entries = await notifyWaiting({ matter: realish, task: task(), store, adapters });
    expect(entries.map(entry => entry.result)).toEqual(['previewed', 'previewed']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a key without a sender is not configured, and synthetic recipients are refused', async () => {
    const fetchMock = ok();
    expect(createResendAdapter({ env: { MATTER_COCKPIT_RESEND_KEY: 'k' }, keyFile: none, fetch: fetchMock }).configured()).toBe(false);
    const telnyx = createTelnyxAdapter({ env: { MATTER_COCKPIT_TELNYX_KEY: 'k', MATTER_COCKPIT_SMS_FROM: '+16125551000' }, keyFile: none, fetch: fetchMock });
    await expect(telnyx.send({ channel: 'text', to: '555-0100', body: 'x' })).rejects.toThrow('synthetic');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isFictional('612-555-0142')).toBe(true);
    expect(toE164('612-555-1234')).toBe('+16125551234');
  });
});
