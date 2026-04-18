import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createParserAdapter } from "./parserAdapter";
import { GraphStore } from "./graphStore";
import { pruneDependencies } from "./prune";
import { computeHotPath } from "./hotpath";
import { resolveBudget } from "./budget";
import { generateContextPacket } from "./context";
import { detectCommunities, detectFlows } from "./postprocess";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function runBench(root: string): Record<string, unknown> {
  const t0 = performance.now();
  const adapter = createParserAdapter("treesitter");
  const graph = adapter.index(root, ["**/*"]);
  const t1 = performance.now();

  const store = new GraphStore(root);
  store.upsertGraph(graph);
  const t2 = performance.now();

  const targetFile = graph.files.find((f) => f.endsWith("src/cli.ts")) ?? graph.files[0] ?? "";
  const selection = pruneDependencies(graph, targetFile, 2, 1);
  const hotPath = computeHotPath(root, 8);
  const budget = resolveBudget(2500, true, "auto", "ultra");
  const packet = generateContextPacket(graph, selection, hotPath, budget, "auto", "ultra");
  const t3 = performance.now();

  const communities = detectCommunities(graph);
  const flows = detectFlows(graph, 20);
  const t4 = performance.now();

  const packetTokens = estimateTokens(packet);
  const naiveText = JSON.stringify(graph);
  const naiveTokens = estimateTokens(naiveText);

  return {
    root,
    generatedAt: new Date().toISOString(),
    latencyMs: {
      index: Number((t1 - t0).toFixed(2)),
      persist: Number((t2 - t1).toFixed(2)),
      packet: Number((t3 - t2).toFixed(2)),
      postprocess: Number((t4 - t3).toFixed(2)),
      total: Number((t4 - t0).toFixed(2)),
    },
    tokenMetrics: {
      packetTokens,
      naiveTokens,
      reductionRatio: naiveTokens > 0 ? Number((naiveTokens / packetTokens).toFixed(2)) : null,
      reductionPercent: naiveTokens > 0 ? Number((((naiveTokens - packetTokens) / naiveTokens) * 100).toFixed(2)) : null,
    },
    retrievalQuality: {
      selectedFiles: selection.includedFiles.length,
      totalFiles: graph.files.length,
      selectedRatio: graph.files.length > 0 ? Number((selection.includedFiles.length / graph.files.length).toFixed(3)) : 0,
      communities: communities.length,
      flows: flows.length,
    },
  };
}

function main(): void {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const result = runBench(root);
  const outPath = path.join(root, "smart-context-benchmark.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log("Benchmark written:", outPath);
  console.log(JSON.stringify(result, null, 2));
}

main();
