"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommunityTools = registerCommunityTools;
// @ts-nocheck
const zod_1 = require("zod");
const graphStore_1 = require("../../graphStore");
const postprocess_1 = require("../../postprocess");
const common_1 = require("../common");
function registerCommunityTools(server) {
    server.tool("list_communities", {
        root: zod_1.z.string().optional(),
        limit: zod_1.z.number().int().min(1).max(100).default(20),
    }, async ({ root, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const communities = (0, postprocess_1.detectCommunities)(graph).slice(0, limit);
            return (0, common_1.ok)({ root: baseDir, communities, count: communities.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "list_communities failed");
        }
    });
    server.tool("get_community", {
        root: zod_1.z.string().optional(),
        communityId: zod_1.z.string(),
    }, async ({ root, communityId }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const communities = (0, postprocess_1.detectCommunities)(graph);
            const community = communities.find((c) => c.id === communityId);
            if (!community)
                return (0, common_1.fail)(`Community not found: ${communityId}`);
            return (0, common_1.ok)({ root: baseDir, community });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_community failed");
        }
    });
    server.tool("get_architecture_overview", {
        root: zod_1.z.string().optional(),
    }, async ({ root }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const overview = (0, postprocess_1.architectureOverview)(graph);
            return (0, common_1.ok)({ root: baseDir, overview });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_architecture_overview failed");
        }
    });
    server.tool("get_hub_nodes", {
        root: zod_1.z.string().optional(),
        limit: zod_1.z.number().int().min(1).max(50).default(10),
    }, async ({ root, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const hubs = new graphStore_1.GraphStore(baseDir).getHubFiles(limit);
            return (0, common_1.ok)({ root: baseDir, hubs });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_hub_nodes failed");
        }
    });
    server.tool("get_bridge_nodes", {
        root: zod_1.z.string().optional(),
        limit: zod_1.z.number().int().min(1).max(50).default(10),
    }, async ({ root, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const bridges = (0, common_1.computeBridgeNodes)(graph, limit);
            return (0, common_1.ok)({ root: baseDir, bridges });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_bridge_nodes failed");
        }
    });
    server.tool("list_external_dependencies", {
        root: zod_1.z.string().optional(),
        limit: zod_1.z.number().int().min(1).max(200).default(50),
    }, async ({ root, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const deps = new Map();
            for (const e of graph.importEdges) {
                if (e.toFile.startsWith("external:")) {
                    deps.set(e.toFile, (deps.get(e.toFile) ?? 0) + 1);
                }
            }
            const result = [...deps.entries()]
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
            return (0, common_1.ok)({ root: baseDir, dependencies: result, count: result.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "list_external_dependencies failed");
        }
    });
}
