"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFlowTools = registerFlowTools;
// @ts-nocheck
const zod_1 = require("zod");
const graphStore_1 = require("../../graphStore");
const postprocess_1 = require("../../postprocess");
const incremental_1 = require("../../incremental");
const hotpath_1 = require("../../hotpath");
const common_1 = require("../common");
function registerFlowTools(server) {
    server.tool("list_flows", {
        root: zod_1.z.string().optional(),
        limit: zod_1.z.number().int().min(1).max(100).default(20),
    }, async ({ root, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const flows = (0, postprocess_1.detectFlows)(graph, limit);
            return (0, common_1.ok)({ root: baseDir, flows, count: flows.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "list_flows failed");
        }
    });
    server.tool("get_flow", {
        root: zod_1.z.string().optional(),
        flowId: zod_1.z.string(),
    }, async ({ root, flowId }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const flows = (0, postprocess_1.detectFlows)(graph, 200);
            const flow = flows.find((f) => f.id === flowId);
            if (!flow)
                return (0, common_1.fail)(`Flow not found: ${flowId}`);
            return (0, common_1.ok)({ root: baseDir, flow });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_flow failed");
        }
    });
    server.tool("get_affected_flows", {
        root: zod_1.z.string().optional(),
        changedFiles: zod_1.z.array(zod_1.z.string()).optional(),
    }, async ({ root, changedFiles }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const flows = (0, postprocess_1.detectFlows)(graph, 100);
            const changed = changedFiles && changedFiles.length > 0 ? changedFiles : (0, incremental_1.detectChangedFiles)(baseDir);
            const changedSet = new Set(changed);
            const affected = flows.filter((f) => f.path.some((p) => changedSet.has(p)));
            return (0, common_1.ok)({ root: baseDir, changedFiles: changed, affectedFlows: affected, count: affected.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_affected_flows failed");
        }
    });
    server.tool("get_hot_paths", {
        root: zod_1.z.string().optional(),
        topN: zod_1.z.number().int().min(1).max(100).default(20),
    }, async ({ root, topN }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const hotPaths = (0, hotpath_1.computeHotPath)(baseDir, topN);
            return (0, common_1.ok)({ root: baseDir, hotPaths, count: hotPaths.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_hot_paths failed");
        }
    });
}
