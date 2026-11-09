import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { NotifyChannel } from '../../src/features/task-board/types';

export type OutgoingMessage = { channel: NotifyChannel; to: string; subject?: string; body: string };
/** A delivery channel. `configured()` false means the notifier never calls `send` (R5, R6). */
export type Adapter = { configured(): boolean; send(message: OutgoingMessage): Promise<void> };
export type Adapters = Record<NotifyChannel, Adapter>;
type Env = Record<string, string | undefined>;
type Options = { env?: Env; keyFile?: string; fetch?: typeof fetch };

/** The key comes from env, else a file. It is never logged or returned to callers. */
function readKey(env: Env, name: string, keyFile: string): string | undefined {
  const fromEnv = env[name]?.trim();
  if (fromEnv) return fromEnv;
  try { return readFileSync(keyFile, 'utf8').trim() || undefined; } catch { return undefined; }
}

/** Synthetic demo recipients never reach a provider (R9): example.invalid addresses and 555-01xx numbers. */
export function isFictional(to: string): boolean {
  if (to.toLowerCase().endsWith('example.invalid')) return true;
  const digits = to.replace(/\D/g, '');
  return !to.includes('@') && /55501\d\d$/.test(digits);
}

/** US numbers to E.164 (+1XXXXXXXXXX); other +-prefixed numbers pass through. */
export function toE164(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return undefined;
}

async function post(doFetch: typeof fetch, url: string, key: string, body: unknown, provider: string) {
  const response = await doFetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${provider} returned ${response.status}`);
}

/** Email through Resend. Configured only with MATTER_COCKPIT_RESEND_KEY (or its key file) and MATTER_COCKPIT_EMAIL_FROM. */
export function createResendAdapter({ env = process.env, keyFile = join(homedir(), '.config/matter-cockpit/resend-key'), fetch: doFetch = globalThis.fetch }: Options = {}): Adapter {
  const config = () => ({ key: readKey(env, 'MATTER_COCKPIT_RESEND_KEY', keyFile), from: env.MATTER_COCKPIT_EMAIL_FROM?.trim() });
  return {
    configured: () => { const { key, from } = config(); return Boolean(key && from); },
    async send(message) {
      const { key, from } = config();
      if (!key || !from) throw new Error('Email is not configured.');
      if (isFictional(message.to)) throw new Error('Refused: synthetic recipient.');
      await post(doFetch, 'https://api.resend.com/emails', key, { from, to: [message.to], subject: message.subject ?? '', text: message.body }, 'Resend');
    },
  };
}

/** Texts through Telnyx. Configured only with MATTER_COCKPIT_TELNYX_KEY (or its key file) and MATTER_COCKPIT_SMS_FROM. */
export function createTelnyxAdapter({ env = process.env, keyFile = join(homedir(), '.config/matter-cockpit/telnyx-key'), fetch: doFetch = globalThis.fetch }: Options = {}): Adapter {
  const config = () => ({ key: readKey(env, 'MATTER_COCKPIT_TELNYX_KEY', keyFile), from: env.MATTER_COCKPIT_SMS_FROM?.trim() });
  return {
    configured: () => { const { key, from } = config(); return Boolean(key && from); },
    async send(message) {
      const { key, from } = config();
      if (!key || !from) throw new Error('Texting is not configured.');
      if (isFictional(message.to)) throw new Error('Refused: synthetic recipient.');
      const to = toE164(message.to), sender = toE164(from);
      if (!to || !sender) throw new Error('Not a valid phone number.');
      await post(doFetch, 'https://api.telnyx.com/v2/messages', key, { from: sender, to, text: message.body }, 'Telnyx');
    },
  };
}

export const defaultAdapters: Adapters = { email: createResendAdapter(), text: createTelnyxAdapter() };
