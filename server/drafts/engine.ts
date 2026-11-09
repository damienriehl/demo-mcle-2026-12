import { initialize, type DocxSession } from 'docxodus/core';

const ENGINE_KEY = Symbol.for('matter-cockpit.draft-engine');
const globals = globalThis as typeof globalThis & { [ENGINE_KEY]?: Promise<void> };

/** Keep the runtime and its in-flight initialization across Vite server reloads. */
export function ensureEngine(): Promise<void> {
  return globals[ENGINE_KEY] ??= initialize();
}

export function paragraphsOf(session: DocxSession) {
  const anchors = Object.entries(session.project().anchorIndex)
    .filter(([, anchor]) => ['p', 'h', 'li'].includes(anchor.kind));
  const infos = session.getAnchorInfos(anchors.map(([id]) => id));
  return anchors.map(([id, anchor]) => ({ id, scope: anchor.scope, text: infos[id]?.visibleText ?? '' }));
}
