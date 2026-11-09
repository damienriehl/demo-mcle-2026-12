import { initialize } from 'docxodus/core';
import { expect, it, vi } from 'vitest';
import { ensureEngine } from '../server/drafts/engine';

vi.mock('docxodus/core', () => ({ initialize: vi.fn() }));

it('retries initialization after a shared initializer rejection', async () => {
  vi.mocked(initialize).mockRejectedValueOnce(new Error('WASM unavailable')).mockResolvedValueOnce(undefined);
  const first = ensureEngine();
  expect(ensureEngine()).toBe(first);
  await expect(first).rejects.toThrow('WASM unavailable');
  const retry = ensureEngine();
  expect(retry).not.toBe(first);
  expect(ensureEngine()).toBe(retry);
  await expect(retry).resolves.toBeUndefined();
  expect(initialize).toHaveBeenCalledTimes(2);
});
