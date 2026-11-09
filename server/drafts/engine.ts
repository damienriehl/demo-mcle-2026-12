import { initialize } from 'docxodus/core';

const ENGINE_KEY = Symbol.for('matter-cockpit.draft-engine');
const globals = globalThis as typeof globalThis & { [ENGINE_KEY]?: Promise<void> };

/** Keep the runtime and its in-flight initialization across Vite server reloads. */
export function ensureEngine(): Promise<void> {
  return globals[ENGINE_KEY] ??= initialize();
}
