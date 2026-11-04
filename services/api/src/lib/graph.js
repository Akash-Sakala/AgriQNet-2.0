// District graph helpers — BFS that also records hop distance so each recipient
// can be placed in a RED (0 hops), ORANGE (1 hop) or YELLOW (2 hops) zone.

export const SeverityConfig = {
  RED: { propagationDepth: 2 },
  ORANGE: { propagationDepth: 1 },
  YELLOW: { propagationDepth: 0 },
};

export const ZONE_BY_HOPS = ['RED', 'ORANGE', 'YELLOW'];

export function buildAdjacencyList(edges) {
  const adj = new Map();
  for (const { districtAId: a, districtBId: b } of edges) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  return adj;
}

/** @returns Map<districtId, hops> */
export function bfsWithDistance(start, edges, maxDepth) {
  const dist = new Map();
  if (!start) return dist;
  const adj = buildAdjacencyList(edges);
  const queue = [start];
  dist.set(start, 0);
  while (queue.length) {
    const node = queue.shift();
    const d = dist.get(node);
    if (d >= maxDepth) continue;
    for (const next of adj.get(node) || []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/** Backwards-compatible Set-returning BFS (used by /api/test/bfs). */
export function bfs(start, edges, maxDepth) {
  return new Set(bfsWithDistance(start, edges, maxDepth).keys());
}
