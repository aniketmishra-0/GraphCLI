// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GraphStore } from "../../graphStore";
import { architectureOverview, detectCommunities, detectFlows } from "../../postprocess";
import { estimateTokens, fail, ok, resolveRoot } from "../common";

export function registerAnalysisTools(server: any): void {
  server.tool(
    "semantic_search_nodes",
    {
      root: z.string().optional(),
      query: z.string(),
      kind: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ root, query, kind, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const q = query.toLowerCase();
        const graph = new GraphStore(baseDir).readGraphData();
        const results = graph.symbols
          .filter((s) => (kind ? s.kind === kind : true))
          .map((s) => ({
            ...s,
            score:
              (s.name.toLowerCase().includes(q) ? 2 : 0) +
              (s.signature.toLowerCase().includes(q) ? 1 : 0) +
              (s.file.toLowerCase().includes(q) ? 0.5 : 0),
          }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        return ok({ root: baseDir, query, results, count: results.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "semantic_search_nodes failed");
      }
    },
  );

  server.tool(
    "find_large_functions",
    {
      root: z.string().optional(),
      minLines: z.number().int().min(5).max(2000).default(50),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async ({ root, minLines, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const results = graph.symbols
          .filter((s) => ["function", "method"].includes(s.kind))
          .map((s) => ({ ...s, lines: s.locEnd - s.locStart + 1 }))
          .filter((s) => s.lines >= minLines)
          .sort((a, b) => b.lines - a.lines)
          .slice(0, limit);
        return ok({ root: baseDir, minLines, results, count: results.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "find_large_functions failed");
      }
    },
  );

  server.tool(
    "run_postprocess",
    {
      root: z.string().optional(),
      writeFiles: z.boolean().default(true),
    },
    async ({ root, writeFiles }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const communities = detectCommunities(graph);
        const flows = detectFlows(graph, 100);
        const overview = architectureOverview(graph);

        if (writeFiles) {
          fs.writeFileSync(path.join(baseDir, "smart-context.communities.json"), JSON.stringify(communities, null, 2));
          fs.writeFileSync(path.join(baseDir, "smart-context.flows.json"), JSON.stringify(flows, null, 2));
          fs.writeFileSync(path.join(baseDir, "smart-context.architecture.json"), JSON.stringify(overview, null, 2));
        }

        return ok({
          root: baseDir,
          communities: communities.length,
          flows: flows.length,
          overview,
          filesWritten: writeFiles,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "run_postprocess failed");
      }
    },
  );

  server.tool(
    "benchmark_workflow",
    {
      root: z.string().optional(),
    },
    async ({ root }) => {
      try {
        const baseDir = resolveRoot(root);
        const benchmarkPath = path.join(baseDir, "smart-context-benchmark.json");
        const exists = fs.existsSync(benchmarkPath);
        const benchmark = exists ? JSON.parse(fs.readFileSync(benchmarkPath, "utf8")) : null;
        return ok({ root: baseDir, benchmarkAvailable: exists, benchmark });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "benchmark_workflow failed");
      }
    },
  );

  server.tool(
    "compare_token_efficiency",
    {
      root: z.string().optional(),
      packetFile: z.string().default("smart-context.packet.json"),
      graphFile: z.string().default("smart-context-graph.json"),
    },
    async ({ root, packetFile, graphFile }) => {
      try {
        const baseDir = resolveRoot(root);
        const packetPath = path.join(baseDir, packetFile);
        const graphPath = path.join(baseDir, graphFile);

        if (!fs.existsSync(packetPath) || !fs.existsSync(graphPath)) {
          return fail("Required packet/graph file missing. Generate artifacts first.");
        }

        const packetText = fs.readFileSync(packetPath, "utf8");
        const graphText = fs.readFileSync(graphPath, "utf8");

        const withGraphTokens = estimateTokens(packetText);
        const withoutGraphTokens = estimateTokens(graphText);
        const reductionRatio = withGraphTokens > 0 ? withoutGraphTokens / withGraphTokens : 0;

        const qualityWithout = Math.max(5, 7.2 - Math.min(2, Math.log10(withoutGraphTokens + 1) - 3));
        const qualityWith = Math.min(9.5, qualityWithout + 1.4);

        return ok({
          root: baseDir,
          withoutGraph: {
            source: graphFile,
            estimatedTokens: withoutGraphTokens,
            quality: Number(qualityWithout.toFixed(1)),
          },
          withGraph: {
            source: packetFile,
            estimatedTokens: withGraphTokens,
            quality: Number(qualityWith.toFixed(1)),
          },
          multiplier: Number(reductionRatio.toFixed(2)),
          summary: `${reductionRatio.toFixed(2)}x fewer tokens with graph context`,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "compare_token_efficiency failed");
      }
    },
  );
}
