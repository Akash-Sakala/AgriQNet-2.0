
import type { Edge } from '../types';

const buildAdjacencyList = (edges: Edge[]): Map<string, string[]> => {
  const adjList = new Map<string, string[]>();
  edges.forEach(({ districtAId, districtBId }) => {
    if (!adjList.has(districtAId)) adjList.set(districtAId, []);
    if (!adjList.has(districtBId)) adjList.set(districtBId, []);
    adjList.get(districtAId)!.push(districtBId);
    adjList.get(districtBId)!.push(districtAId);
  });
  return adjList;
};

const bfs = (startNode: string, edges: Edge[], maxDepth: number): Set<string> => {
  if (!startNode) return new Set();

  const adjList = buildAdjacencyList(edges);
  const queue: [string, number][] = [[startNode, 0]];
  const visited = new Set<string>([startNode]);

  while (queue.length > 0) {
    const [currentNode, depth] = queue.shift()!;
    
    if (depth >= maxDepth) continue;

    const neighbors = adjList.get(currentNode) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, depth + 1]);
      }
    }
  }

  return visited;
};

export const graphService = {
  bfs,
};
