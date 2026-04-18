import { GraphData } from "./types";

export interface CommunityInfo {
  id: string;
  files: string[];
  edgeCount: number;
}

export interface FlowInfo {
  id: string;
  name: string;
  startFile: string;
  depth: number;
  path: string[];
  criticality: number;
}

function buildUndirected(graph: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const f of graph.files) adj.set(f, new Set());

  for (const e of graph.importEdges) {
    if (!adj.has(e.fromFile)) adj.set(e.fromFile, new Set());
    if (!adj.has(e.toFile)) adj.set(e.toFile, new Set());
    adj.get(e.fromFile)!.add(e.toFile);
    adj.get(e.toFile)!.add(e.fromFile);
  }

  return adj;
}

export function detectCommunities(graph: GraphData): CommunityInfo[] {
  const adj = buildUndirected(graph);
  const visited = new Set<string>();
  const communities: CommunityInfo[] = [];
  let id = 1;

  for (const node of adj.keys()) {
    if (visited.has(node)) continue;

    const queue = [node];
    const members: string[] = [];
    visited.add(node);

    while (queue.length > 0) {
      const current = queue.shift()!;
      members.push(current);
      const neighbors = adj.get(current) ?? new Set<string>();
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    let edgeCount = 0;
    const memberSet = new Set(members);
    for (const e of graph.importEdges) {
      if (memberSet.has(e.fromFile) && memberSet.has(e.toFile)) {
        edgeCount += 1;
      }
    }

    communities.push({
      id: `community-${id}`,
      files: members.sort(),
      edgeCount,
    });
    id += 1;
  }

  return communities.sort((a, b) => b.files.length - a.files.length);
}

export function detectFlows(graph: GraphData, limit = 20): FlowInfo[] {
  const outMap = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const f of graph.files) {
    outMap.set(f, []);
    inDegree.set(f, 0);
  }

  for (const e of graph.importEdges) {
    if (!outMap.has(e.fromFile)) outMap.set(e.fromFile, []);
    outMap.get(e.fromFile)!.push(e.toFile);
    inDegree.set(e.toFile, (inDegree.get(e.toFile) ?? 0) + 1);
  }

  const starts = [...outMap.keys()]
    .filter((f) => (inDegree.get(f) ?? 0) === 0)
    .slice(0, Math.max(limit, 10));

  const flows: FlowInfo[] = [];
  let id = 1;

  for (const s of starts) {
    const queue: Array<{ file: string; depth: number; path: string[] }> = [{ file: s, depth: 0, path: [s] }];
    const seen = new Set<string>([s]);
    let bestPath = [s];
    let bestDepth = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth > bestDepth) {
        bestDepth = current.depth;
        bestPath = current.path;
      }

      if (current.depth >= 6) continue;
      for (const n of outMap.get(current.file) ?? []) {
        if (seen.has(`${current.file}->${n}`)) continue;
        seen.add(`${current.file}->${n}`);
        queue.push({ file: n, depth: current.depth + 1, path: [...current.path, n] });
      }
    }

    const criticality = bestPath.length + (outMap.get(s)?.length ?? 0);
    flows.push({
      id: `flow-${id}`,
      name: `Flow from ${s}`,
      startFile: s,
      depth: bestDepth,
      path: bestPath,
      criticality,
    });
    id += 1;
  }

  return flows.sort((a, b) => b.criticality - a.criticality).slice(0, limit);
}

export function architectureOverview(graph: GraphData): {
  communities: number;
  topCommunities: Array<{ id: string; files: number; edgeCount: number }>;
  topFlows: Array<{ id: string; criticality: number; depth: number; startFile: string }>;
} {
  const communities = detectCommunities(graph);
  const flows = detectFlows(graph, 10);

  return {
    communities: communities.length,
    topCommunities: communities.slice(0, 6).map((c) => ({ id: c.id, files: c.files.length, edgeCount: c.edgeCount })),
    topFlows: flows.slice(0, 6).map((f) => ({
      id: f.id,
      criticality: f.criticality,
      depth: f.depth,
      startFile: f.startFile,
    })),
  };
}
