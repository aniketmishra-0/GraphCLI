import { GraphData, PrunedContextSelection } from "./types";

interface TraversalResult {
  files: Set<string>;
  reasonMap: Map<string, string[]>;
}

function addReason(reasonMap: Map<string, string[]>, file: string, reason: string): void {
  if (!reasonMap.has(file)) {
    reasonMap.set(file, []);
  }
  reasonMap.get(file)!.push(reason);
}

function buildAdjacency(graph: GraphData): {
  upstream: Map<string, Set<string>>;
  downstream: Map<string, Set<string>>;
} {
  const upstream = new Map<string, Set<string>>();
  const downstream = new Map<string, Set<string>>();

  for (const edge of graph.importEdges) {
    if (!upstream.has(edge.fromFile)) upstream.set(edge.fromFile, new Set());
    if (!downstream.has(edge.toFile)) downstream.set(edge.toFile, new Set());

    upstream.get(edge.fromFile)!.add(edge.toFile);
    downstream.get(edge.toFile)!.add(edge.fromFile);
  }

  return { upstream, downstream };
}

function bfs(
  startFile: string,
  adjacency: Map<string, Set<string>>,
  maxDepth: number,
  reasonPrefix: string,
): TraversalResult {
  const visited = new Set<string>([startFile]);
  const files = new Set<string>([startFile]);
  const reasonMap = new Map<string, string[]>();

  const queue: Array<{ file: string; depth: number }> = [{ file: startFile, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const neighbors = adjacency.get(current.file) ?? new Set<string>();
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        files.add(n);
        addReason(reasonMap, n, `${reasonPrefix}:${current.file}`);
        queue.push({ file: n, depth: current.depth + 1 });
      }
    }
  }

  return { files, reasonMap };
}

export function pruneDependencies(
  graph: GraphData,
  targetFile: string,
  upstreamDepth: number,
  downstreamDepth: number,
  targetSymbol?: string,
): PrunedContextSelection {
  const { upstream, downstream } = buildAdjacency(graph);

  const up = bfs(targetFile, upstream, upstreamDepth, "upstream_import");
  const down = bfs(targetFile, downstream, downstreamDepth, "downstream_usage");

  const included = new Set<string>([...up.files, ...down.files]);

  const reasonMap = new Map<string, string[]>();
  for (const [file, reasons] of up.reasonMap.entries()) {
    reasonMap.set(file, [...(reasonMap.get(file) ?? []), ...reasons]);
  }
  for (const [file, reasons] of down.reasonMap.entries()) {
    reasonMap.set(file, [...(reasonMap.get(file) ?? []), ...reasons]);
  }

  addReason(reasonMap, targetFile, "target");

  // Downstream files are often high fan-out. Include only public contracts by default.
  const interfaceOnlyFiles = new Set<string>();
  for (const f of down.files) {
    if (f !== targetFile) {
      interfaceOnlyFiles.add(f);
    }
  }

  const prioritizedSymbolsByFile: Record<string, string[]> = {};

  if (targetSymbol) {
    const matchedTargetSymbols = graph.symbols.filter(
      (s) => s.file === targetFile && s.name.toLowerCase().includes(targetSymbol.toLowerCase()),
    );

    if (matchedTargetSymbols.length > 0) {
      prioritizedSymbolsByFile[targetFile] = matchedTargetSymbols.map((s) => s.name);

      const calleeNames = new Set<string>();
      for (const edge of graph.callEdges) {
        if (matchedTargetSymbols.some((t) => t.id === edge.callerSymbolId)) {
          calleeNames.add(edge.calleeName);
        }
      }

      for (const file of included) {
        const symbolsInFile = graph.symbols.filter((s) => s.file === file);
        const prioritized = symbolsInFile
          .filter((s) => calleeNames.has(s.name) || calleeNames.has(s.name.split(".").pop() ?? ""))
          .map((s) => s.name);

        if (prioritized.length > 0) {
          prioritizedSymbolsByFile[file] = [...new Set(prioritized)];
        }
      }
    }
  }

  return {
    targetFile,
    includedFiles: [...included],
    interfaceOnlyFiles: [...interfaceOnlyFiles],
    reasonByFile: Object.fromEntries(reasonMap.entries()),
    prioritizedSymbolsByFile,
  };
}
