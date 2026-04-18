// @ts-nocheck
import { z } from "zod";
import { GraphStore } from "../../graphStore";
import { architectureOverview, detectCommunities } from "../../postprocess";
import { computeBridgeNodes, fail, ok, resolveRoot } from "../common";

export function registerCommunityTools(server: any): void {
  server.tool(
    "list_communities",
    {
      root: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ root, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const communities = detectCommunities(graph).slice(0, limit);
        return ok({ root: baseDir, communities, count: communities.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "list_communities failed");
      }
    },
  );

  server.tool(
    "get_community",
    {
      root: z.string().optional(),
      communityId: z.string(),
    },
    async ({ root, communityId }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const communities = detectCommunities(graph);
        const community = communities.find((c) => c.id === communityId);
        if (!community) return fail(`Community not found: ${communityId}`);
        return ok({ root: baseDir, community });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_community failed");
      }
    },
  );

  server.tool(
    "get_architecture_overview",
    {
      root: z.string().optional(),
    },
    async ({ root }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const overview = architectureOverview(graph);
        return ok({ root: baseDir, overview });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_architecture_overview failed");
      }
    },
  );

  server.tool(
    "get_hub_nodes",
    {
      root: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async ({ root, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const hubs = new GraphStore(baseDir).getHubFiles(limit);
        return ok({ root: baseDir, hubs });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_hub_nodes failed");
      }
    },
  );

  server.tool(
    "get_bridge_nodes",
    {
      root: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(10),
    },
    async ({ root, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const bridges = computeBridgeNodes(graph, limit);
        return ok({ root: baseDir, bridges });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "get_bridge_nodes failed");
      }
    },
  );

  server.tool(
    "list_external_dependencies",
    {
      root: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    async ({ root, limit }) => {
      try {
        const baseDir = resolveRoot(root);
        const graph = new GraphStore(baseDir).readGraphData();
        const deps = new Map<string, number>();
        for (const e of graph.importEdges) {
          if (e.toFile.startsWith("external:")) {
            deps.set(e.toFile, (deps.get(e.toFile) ?? 0) + 1);
          }
        }
        const result = [...deps.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
        return ok({ root: baseDir, dependencies: result, count: result.length });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "list_external_dependencies failed");
      }
    },
  );
}
