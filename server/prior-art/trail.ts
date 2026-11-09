import type { TrailNode } from '../../src/features/prior-art/types';
import type { PatentApi } from './uspto';

export type TrailOptions = { depth?: number; maxNodes?: number };

/**
 * Breadth-first backward-citation trail. Each patent appears once across all
 * roots (first and shallowest visit wins), cycles stop, depth is capped at 3,
 * and the total node count is capped (default 40).
 */
export async function buildTrails(roots: string[], api: Pick<PatentApi, 'getPatent' | 'getCitations'>, options: TrailOptions = {}) {
  const depth = Math.min(Math.max(options.depth ?? 2, 0), 3);
  const maxNodes = options.maxNodes ?? 40;
  const seen = new Set<string>();
  const trees: TrailNode[] = [];
  const queue: TrailNode[] = [];
  const missing: string[] = [];

  for (const id of roots) {
    if (seen.has(id) || seen.size >= maxNodes) continue;
    seen.add(id);
    const patent = await api.getPatent(id);
    if (!patent) { missing.push(id); continue; }
    const node: TrailNode = { ...patent, depth: 0, children: [] };
    trees.push(node);
    queue.push(node);
  }
  while (queue.length) {
    const node = queue.shift()!;
    if (node.depth >= depth) continue;
    for (const citation of await api.getCitations(node.id)) {
      if (seen.size >= maxNodes) return { trees, count: seen.size - missing.length, truncated: true, missing };
      if (seen.has(citation.id)) continue;
      seen.add(citation.id);
      const patent = await api.getPatent(citation.id);
      const child: TrailNode = patent
        ? { ...patent, depth: node.depth + 1, citedBy: node.id, category: citation.category, children: [] }
        : { id: citation.id, title: '(details unavailable)', text: '', sample: node.sample, depth: node.depth + 1, citedBy: node.id, category: citation.category, children: [] };
      node.children.push(child);
      queue.push(child);
    }
  }
  return { trees, count: seen.size - missing.length, truncated: false, missing };
}
