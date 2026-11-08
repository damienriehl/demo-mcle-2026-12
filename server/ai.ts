import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Shared helper for every server route that calls Claude.
 *
 * The key comes from MATTER_COCKPIT_API_KEY, or from the file named by
 * MATTER_COCKPIT_API_KEY_FILE (default ~/.config/matter-cockpit/api-key).
 * It never reads ANTHROPIC_API_KEY: that variable belongs to Claude Code's own
 * environment, and the app key must stay out of it.
 */

type Env = Record<string, string | undefined>;

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_KEY_FILE = '~/.config/matter-cockpit/api-key';

export function keyFilePath(env: Env = process.env): string {
  const raw = env.MATTER_COCKPIT_API_KEY_FILE?.trim() || DEFAULT_KEY_FILE;
  return raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw;
}

export function readKey(env: Env = process.env): string | null {
  const fromEnv = env.MATTER_COCKPIT_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(keyFilePath(env), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function hasKey(env: Env = process.env): boolean {
  return readKey(env) !== null;
}

export function modelName(env: Env = process.env): string {
  return env.MATTER_COCKPIT_MODEL?.trim() || DEFAULT_MODEL;
}

/** A Claude client with the app key applied, or null when no key is configured. */
export function createClient(env: Env = process.env): Anthropic | null {
  const apiKey = readKey(env);
  return apiKey ? new Anthropic({ apiKey }) : null;
}

/** The standard answer when a route needs the model and no key is configured. */
export function needsKeyResponse(): Response {
  return Response.json(
    {
      error: 'needs_key',
      message:
        'No Claude API key found. Put it in ~/.config/matter-cockpit/api-key, or set MATTER_COCKPIT_API_KEY in .env.local, then try again.',
    },
    { status: 503 },
  );
}
