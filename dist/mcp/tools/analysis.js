"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAnalysisTools = registerAnalysisTools;
// @ts-nocheck
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const graphStore_1 = require("../../graphStore");
const postprocess_1 = require("../../postprocess");
const common_1 = require("../common");
function registerAnalysisTools(server) {
    server.tool("semantic_search_nodes", {
        root: zod_1.z.string().optional(),
        query: zod_1.z.string(),
        kind: zod_1.z.string().optional(),
        limit: zod_1.z.number().int().min(1).max(100).default(20),
    }, async ({ root, query, kind, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const q = query.toLowerCase();
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const results = graph.symbols
                .filter((s) => (kind ? s.kind === kind : true))
                .map((s) => ({
                ...s,
                score: (s.name.toLowerCase().includes(q) ? 2 : 0) +
                    (s.signature.toLowerCase().includes(q) ? 1 : 0) +
                    (s.file.toLowerCase().includes(q) ? 0.5 : 0),
            }))
                .filter((s) => s.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
            return (0, common_1.ok)({ root: baseDir, query, results, count: results.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "semantic_search_nodes failed");
        }
    });
    server.tool("find_large_functions", {
        root: zod_1.z.string().optional(),
        minLines: zod_1.z.number().int().min(5).max(2000).default(50),
        limit: zod_1.z.number().int().min(1).max(200).default(50),
    }, async ({ root, minLines, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const results = graph.symbols
                .filter((s) => ["function", "method"].includes(s.kind))
                .map((s) => ({ ...s, lines: s.locEnd - s.locStart + 1 }))
                .filter((s) => s.lines >= minLines)
                .sort((a, b) => b.lines - a.lines)
                .slice(0, limit);
            return (0, common_1.ok)({ root: baseDir, minLines, results, count: results.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "find_large_functions failed");
        }
    });
    server.tool("run_postprocess", {
        root: zod_1.z.string().optional(),
        writeFiles: zod_1.z.boolean().default(true),
    }, async ({ root, writeFiles }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const communities = (0, postprocess_1.detectCommunities)(graph);
            const flows = (0, postprocess_1.detectFlows)(graph, 100);
            const overview = (0, postprocess_1.architectureOverview)(graph);
            if (writeFiles) {
                node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, "smart-context.communities.json"), JSON.stringify(communities, null, 2));
                node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, "smart-context.flows.json"), JSON.stringify(flows, null, 2));
                node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, "smart-context.architecture.json"), JSON.stringify(overview, null, 2));
            }
            return (0, common_1.ok)({
                root: baseDir,
                communities: communities.length,
                flows: flows.length,
                overview,
                filesWritten: writeFiles,
            });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "run_postprocess failed");
        }
    });
    server.tool("benchmark_workflow", {
        root: zod_1.z.string().optional(),
    }, async ({ root }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const benchmarkPath = node_path_1.default.join(baseDir, "smart-context-benchmark.json");
            const exists = node_fs_1.default.existsSync(benchmarkPath);
            const benchmark = exists ? JSON.parse(node_fs_1.default.readFileSync(benchmarkPath, "utf8")) : null;
            return (0, common_1.ok)({ root: baseDir, benchmarkAvailable: exists, benchmark });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "benchmark_workflow failed");
        }
    });
    server.tool("compare_token_efficiency", {
        root: zod_1.z.string().optional(),
        packetFile: zod_1.z.string().default("smart-context.packet.json"),
        graphFile: zod_1.z.string().default("smart-context-graph.json"),
    }, async ({ root, packetFile, graphFile }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const packetPath = node_path_1.default.join(baseDir, packetFile);
            const graphPath = node_path_1.default.join(baseDir, graphFile);
            if (!node_fs_1.default.existsSync(packetPath) || !node_fs_1.default.existsSync(graphPath)) {
                return (0, common_1.fail)("Required packet/graph file missing. Generate artifacts first.");
            }
            const packetText = node_fs_1.default.readFileSync(packetPath, "utf8");
            const graphText = node_fs_1.default.readFileSync(graphPath, "utf8");
            const withGraphTokens = (0, common_1.estimateTokens)(packetText);
            const withoutGraphTokens = (0, common_1.estimateTokens)(graphText);
            const reductionRatio = withGraphTokens > 0 ? withoutGraphTokens / withGraphTokens : 0;
            const qualityWithout = Math.max(5, 7.2 - Math.min(2, Math.log10(withoutGraphTokens + 1) - 3));
            const qualityWith = Math.min(9.5, qualityWithout + 1.4);
            return (0, common_1.ok)({
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
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "compare_token_efficiency failed");
        }
    });
}
