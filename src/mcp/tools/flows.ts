// @ts-nocheck
import { z } from "zod";
import { GraphStore } from "../../graphStore";
import { detectFlows } from "../../postprocess";
import { detectChangedFiles } from "../../incremental";
import { computeHotPath } from "../../hotpath";
import { fail, ok, resolveRoot } from "../common";

export function registerFlowTools(server: any): void {
  server.tool(
    "list_flows",
    {
      root: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ root, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const flows = detectFlows(graph, limit);
        return ok({ root: baseDir, flows, count: flows.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "list_flows failed");
      }
    },
  );

  server.tool(
    "get_flow",
    {
      root: z.string().optional(),
      flowId: z.string(),
    },
    async ({ root, flowId }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const flows = detectFlows(graph, 200);
        const flow = flows.find((f) => f.id === flowId);
        if (!flow) return fail(`Flow not found: ${flowId}`);
        return ok({ root: baseDir, flow });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_flow failed");
      }
    },
  );

  server.tool(
    "get_affected_flows",
    {
      root: z.string().optional(),
      changedFiles: z.array(z.string()).optional(),
    },
    async ({ root, changedFiles }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const flows = detectFlows(graph, 100);
        const changed = changedFiles && changedFiles.length > 0 ? changedFiles : detectChangedFiles(baseDir);
        const changedSet = new Set(changed);
        const affected = flows.filter((f) => f.path.some((p) => changedSet.has(p)));
        return ok({ root: baseDir, changedFiles: changed, affectedFlows: affected, count: affected.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_affected_flows failed");
      }
    },
  );

  server.tool(
    "get_hot_paths",
    {
      root: z.string().optional(),
      topN: z.number().int().min(1).max(100).default(20),
    },
    async ({ root, topN }) => {
      try {
        const baseDir = resolveRoot(root);
        const hotPaths = computeHotPath(baseDir, topN);
        return ok({ root: baseDir, hotPaths, count: hotPaths.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_hot_paths failed");
      }
    },
  );
}
