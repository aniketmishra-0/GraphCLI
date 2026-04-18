"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_perf_hooks_1 = require("node:perf_hooks");
const parserAdapter_1 = require("./parserAdapter");
const graphStore_1 = require("./graphStore");
const prune_1 = require("./prune");
const hotpath_1 = require("./hotpath");
const budget_1 = require("./budget");
const context_1 = require("./context");
const postprocess_1 = require("./postprocess");
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function runBench(root) {
    const t0 = node_perf_hooks_1.performance.now();
    const adapter = (0, parserAdapter_1.createParserAdapter)("treesitter");
    const graph = adapter.index(root, ["**/*"]);
    const t1 = node_perf_hooks_1.performance.now();
    const store = new graphStore_1.GraphStore(root);
    store.upsertGraph(graph);
    const t2 = node_perf_hooks_1.performance.now();
    const targetFile = graph.files.find((f) => f.endsWith("src/cli.ts")) ?? graph.files[0] ?? "";
    const selection = (0, prune_1.pruneDependencies)(graph, targetFile, 2, 1);
    const hotPath = (0, hotpath_1.computeHotPath)(root, 8);
    const budget = (0, budget_1.resolveBudget)(2500, true, "auto", "ultra");
    const packet = (0, context_1.generateContextPacket)(graph, selection, hotPath, budget, "auto", "ultra");
    const t3 = node_perf_hooks_1.performance.now();
    const communities = (0, postprocess_1.detectCommunities)(graph);
    const flows = (0, postprocess_1.detectFlows)(graph, 20);
    const t4 = node_perf_hooks_1.performance.now();
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
function main() {
    const root = node_path_1.default.resolve(process.argv[2] ?? process.cwd());
    const result = runBench(root);
    const outPath = node_path_1.default.join(root, "smart-context-benchmark.json");
    node_fs_1.default.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
    console.log("Benchmark written:", outPath);
    console.log(JSON.stringify(result, null, 2));
}
main();
