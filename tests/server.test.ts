import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, hasKey, modelName, needsKeyResponse, readKey } from '../server/ai';
import { createApp, mountFeatures } from '../server/index';

const missingKeyFile = join(mkdtempSync(join(tmpdir(), 'mc-nokey-')), 'api-key');

describe('API app', () => {
  it('answers the health check', async () => {
    const res = await createApp({}).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('mounts each feature file under /api/features/<slug>', async () => {
    const feature = new Hono().get('/ping', (c) => c.json({ pong: true }));
    const app = createApp({ './features/conflict-check.ts': { default: feature } });
    const res = await app.request('/api/features/conflict-check/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });

  it('skips a feature file that does not default-export a Hono app', () => {
    const app = new Hono();
    const mounted = mountFeatures(app, {
      './features/broken.ts': { default: { not: 'an app' } },
      './features/good.ts': { default: new Hono() },
    });
    expect(mounted).toEqual(['good']);
  });
});

describe('AI helper', () => {
  it('reports needs_key when no key file exists and the env var is unset, ignoring ANTHROPIC_API_KEY', async () => {
    const env = { MATTER_COCKPIT_API_KEY_FILE: missingKeyFile, ANTHROPIC_API_KEY: 'sk-should-be-ignored' };
    expect(readKey(env)).toBeNull();
    expect(hasKey(env)).toBe(false);
    const res = needsKeyResponse();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('needs_key');
    expect(typeof body.message).toBe('string');
  });

  it('reads the key from the file named by MATTER_COCKPIT_API_KEY_FILE', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mc-key-')), 'api-key');
    writeFileSync(file, 'test-key-from-file\n', { mode: 0o600 });
    expect(readKey({ MATTER_COCKPIT_API_KEY_FILE: file })).toBe('test-key-from-file');
  });

  it('reads the key from MATTER_COCKPIT_API_KEY', () => {
    const env = { MATTER_COCKPIT_API_KEY: 'test-key-from-env', MATTER_COCKPIT_API_KEY_FILE: missingKeyFile };
    expect(hasKey(env)).toBe(true);
  });

  it('defaults the model and lets MATTER_COCKPIT_MODEL override it', () => {
    expect(modelName({})).toBe(DEFAULT_MODEL);
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5-5');
    expect(modelName({ MATTER_COCKPIT_MODEL: 'claude-haiku-test' })).toBe('claude-haiku-test');
  });
});
