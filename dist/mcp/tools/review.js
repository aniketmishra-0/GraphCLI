"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReviewTools = registerReviewTools;
// @ts-nocheck
const zod_1 = require("zod");
const graphStore_1 = require("../../graphStore");
const incremental_1 = require("../../incremental");
const risk_1 = require("../../risk");
const prune_1 = require("../../prune");
const hotpath_1 = require("../../hotpath");
const budget_1 = require("../../budget");
const context_1 = require("../../context");
const common_1 = require("../common");
function registerReviewTools(server) {
    server.tool("get_impact_radius", {
        root: zod_1.z.string().optional(),
        changedFiles: zod_1.z.array(zod_1.z.string()).optional(),
        maxDepth: zod_1.z.number().int().min(1).max(8).default(2),
    }, async ({ root, changedFiles, maxDepth }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const store = new graphStore_1.GraphStore(baseDir);
            const changed = changedFiles && changedFiles.length > 0 ? changedFiles : (0, incremental_1.detectChangedFiles)(baseDir);
            const radius = store.getImpactRadius(changed, maxDepth);
            return (0, common_1.ok)({ root: baseDir, changedFiles: changed, maxDepth, radius });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_impact_radius failed");
        }
    });
    server.tool("detect_changes", {
        root: zod_1.z.string().optional(),
        changedFiles: zod_1.z.array(zod_1.z.string()).optional(),
        maxDepth: zod_1.z.number().int().min(1).max(8).default(2),
    }, async ({ root, changedFiles, maxDepth }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const store = new graphStore_1.GraphStore(baseDir);
            const graph = store.readGraphData();
            const changed = changedFiles && changedFiles.length > 0 ? changedFiles : (0, incremental_1.detectChangedFiles)(baseDir);
            const impact = store.getImpactRadius(changed, maxDepth);
            const risk = (0, risk_1.scoreChangeRisk)(graph, changed);
            return (0, common_1.ok)({
                root: baseDir,
                changedFiles: changed,
                impactCount: impact.length,
                impact: impact.slice(0, 50),
                risk,
            });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "detect_changes failed");
        }
    });
    server.tool("get_minimal_context", {
        root: zod_1.z.string().optional(),
        task: zod_1.z.string().default("review changes"),
        changedFiles: zod_1.z.array(zod_1.z.string()).optional(),
        maxDepth: zod_1.z.number().int().min(1).max(6).default(2),
    }, async ({ root, task, changedFiles, maxDepth }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const store = new graphStore_1.GraphStore(baseDir);
            const stats = store.getStats();
            const hubs = store.getHubFiles(3);
            const changed = changedFiles && changedFiles.length > 0 ? changedFiles : (0, incremental_1.detectChangedFiles)(baseDir);
            const radius = store.getImpactRadius(changed, maxDepth).slice(0, 20);
            return (0, common_1.ok)({
                task,
                root: baseDir,
                summary: `${stats.files} files, ${stats.symbols} symbols`,
                changedFiles: changed,
                topHubs: hubs,
                impactSample: radius,
                nextTools: ["get_impact_radius", "get_review_context", "query_graph", "detect_changes"],
            });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_minimal_context failed");
        }
    });
    server.tool("get_review_context", {
        root: zod_1.z.string().optional(),
        targetFile: zod_1.z.string(),
        targetSymbol: zod_1.z.string().optional(),
        upstreamDepth: zod_1.z.number().int().min(1).max(5).default(2),
        downstreamDepth: zod_1.z.number().int().min(1).max(5).default(1),
        provider: common_1.providerEnum,
        compression: zod_1.z.enum(["ultra", "minimal", "balanced"]).default("ultra"),
        maxTokens: zod_1.z.number().int().min(220).max(12000).default(2000),
        hardCap: zod_1.z.boolean().default(true),
    }, async ({ root, targetFile, targetSymbol, upstreamDepth, downstreamDepth, provider, compression, maxTokens, hardCap, }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const store = new graphStore_1.GraphStore(baseDir);
            const graph = store.readGraphData();
            const selection = (0, prune_1.pruneDependencies)(graph, targetFile, upstreamDepth, downstreamDepth, targetSymbol);
            const hotPath = (0, hotpath_1.computeHotPath)(baseDir, 8);
            const budget = (0, budget_1.resolveBudget)(maxTokens, hardCap, provider, compression);
            const packet = (0, context_1.generateContextPacket)(graph, selection, hotPath, budget, provider, compression);
            return (0, common_1.ok)({
                root: baseDir,
                targetFile,
                includedFiles: selection.includedFiles.length,
                packet,
            });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_review_context failed");
        }
    });
}
