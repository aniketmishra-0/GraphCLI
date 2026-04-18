// @ts-nocheck
import { z } from "zod";
import { GraphStore } from "../../graphStore";
import { detectChangedFiles } from "../../incremental";
import { scoreChangeRisk } from "../../risk";
import { pruneDependencies } from "../../prune";
import { computeHotPath } from "../../hotpath";
import { resolveBudget } from "../../budget";
import { generateContextPacket } from "../../context";
import { fail, ok, providerEnum, resolveRoot } from "../common";

export function registerReviewTools(server: any): void {
  server.tool(
    "get_impact_radius",
    {
      root: z.string().optional(),
      changedFiles: z.array(z.string()).optional(),
      maxDepth: z.number().int().min(1).max(8).default(2),
    },
    async ({ root, changedFiles, maxDepth }) => {
      try {
        const baseDir = resolveRoot(root);
        const store = new GraphStore(baseDir);
        const changed = changedFiles && changedFiles.length > 0 ? changedFiles : detectChangedFiles(baseDir);
        const radius = store.getImpactRadius(changed, maxDepth);
        return ok({ root: baseDir, changedFiles: changed, maxDepth, radius });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_impact_radius failed");
      }
    },
  );

  server.tool(
    "detect_changes",
    {
      root: z.string().optional(),
      changedFiles: z.array(z.string()).optional(),
      maxDepth: z.number().int().min(1).max(8).default(2),
    },
    async ({ root, changedFiles, maxDepth }) => {
      try {
        const baseDir = resolveRoot(root);
        const store = new GraphStore(baseDir);
        const graph = store.readGraphData();
        const changed = changedFiles && changedFiles.length > 0 ? changedFiles : detectChangedFiles(baseDir);
        const impact = store.getImpactRadius(changed, maxDepth);
        const risk = scoreChangeRisk(graph, changed);

        return ok({
          root: baseDir,
          changedFiles: changed,
          impactCount: impact.length,
          impact: impact.slice(0, 50),
          risk,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "detect_changes failed");
      }
    },
  );

  server.tool(
    "get_minimal_context",
    {
      root: z.string().optional(),
      task: z.string().default("review changes"),
      changedFiles: z.array(z.string()).optional(),
      maxDepth: z.number().int().min(1).max(6).default(2),
    },
    async ({ root, task, changedFiles, maxDepth }) => {
      try {
        const baseDir = resolveRoot(root);
        const store = new GraphStore(baseDir);
        const stats = store.getStats();
        const hubs = store.getHubFiles(3);
        const changed = changedFiles && changedFiles.length > 0 ? changedFiles : detectChangedFiles(baseDir);
        const radius = store.getImpactRadius(changed, maxDepth).slice(0, 20);

        return ok({
          task,
          root: baseDir,
          summary: `${stats.files} files, ${stats.symbols} symbols`,
          changedFiles: changed,
          topHubs: hubs,
          impactSample: radius,
          nextTools: ["get_impact_radius", "get_review_context", "query_graph", "detect_changes"],
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_minimal_context failed");
      }
    },
  );

  server.tool(
    "get_review_context",
    {
      root: z.string().optional(),
      targetFile: z.string(),
      targetSymbol: z.string().optional(),
      upstreamDepth: z.number().int().min(1).max(5).default(2),
      downstreamDepth: z.number().int().min(1).max(5).default(1),
      provider: providerEnum,
      compression: z.enum(["ultra", "minimal", "balanced"]).default("ultra"),
      maxTokens: z.number().int().min(220).max(12000).default(2000),
      hardCap: z.boolean().default(true),
    },
    async ({
      root,
      targetFile,
      targetSymbol,
      upstreamDepth,
      downstreamDepth,
      provider,
      compression,
      maxTokens,
      hardCap,
    }) => {
      try {
        const baseDir = resolveRoot(root);
        const store = new GraphStore(baseDir);
        const graph = store.readGraphData();
        const selection = pruneDependencies(graph, targetFile, upstreamDepth, downstreamDepth, targetSymbol);
        const hotPath = computeHotPath(baseDir, 8);
        const budget = resolveBudget(maxTokens, hardCap, provider, compression);
        const packet = generateContextPacket(graph, selection, hotPath, budget, provider, compression);

        return ok({
          root: baseDir,
          targetFile,
          includedFiles: selection.includedFiles.length,
          packet,
        });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_review_context failed");
      }
    },
  );
}
