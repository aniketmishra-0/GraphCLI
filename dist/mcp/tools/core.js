"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCoreTools = registerCoreTools;
// @ts-nocheck
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const parserAdapter_1 = require("../../parserAdapter");
const graphStore_1 = require("../../graphStore");
const common_1 = require("../common");
function registerCoreTools(server) {
    server.tool("build_or_update_graph", {
        root: zod_1.z.string().optional(),
        backend: zod_1.z.enum(["treesitter", "universal", "ts-morph", "lsp"]).default("treesitter"),
        lspIndex: zod_1.z.string().optional(),
    }, async ({ root, backend, lspIndex }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const adapter = (0, parserAdapter_1.createParserAdapter)(backend);
            const graph = adapter.index(baseDir, ["**/*"], { lspIndexPath: lspIndex });
            const store = new graphStore_1.GraphStore(baseDir);
            store.upsertGraph(graph);
            return (0, common_1.ok)({
                root: baseDir,
                backend,
                files: graph.files.length,
                symbols: graph.symbols.length,
                importEdges: graph.importEdges.length,
                callEdges: graph.callEdges.length,
                generatedAt: graph.generatedAt,
            });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "build_or_update_graph failed");
        }
    });
    server.tool("list_graph_stats", {
        root: zod_1.z.string().optional(),
        topHubs: zod_1.z.number().int().min(1).max(20).default(5),
    }, async ({ root, topHubs }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const store = new graphStore_1.GraphStore(baseDir);
            const stats = store.getStats();
            const hubs = store.getHubFiles(topHubs);
            return (0, common_1.ok)({ root: baseDir, stats, hubs });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "list_graph_stats failed");
        }
    });
    server.tool("list_files", {
        root: zod_1.z.string().optional(),
        limit: zod_1.z.number().int().min(1).max(500).default(200),
    }, async ({ root, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            return (0, common_1.ok)({ root: baseDir, files: graph.files.slice(0, limit), total: graph.files.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "list_files failed");
        }
    });
    server.tool("get_file_symbols", {
        root: zod_1.z.string().optional(),
        file: zod_1.z.string(),
    }, async ({ root, file }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const symbols = graph.symbols.filter((s) => s.file === file);
            return (0, common_1.ok)({ root: baseDir, file, symbols, count: symbols.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "get_file_symbols failed");
        }
    });
    server.tool("query_graph", {
        root: zod_1.z.string().optional(),
        file: zod_1.z.string(),
        query: zod_1.z.enum(["imports_of", "dependents_of"]),
    }, async ({ root, file, query }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const store = new graphStore_1.GraphStore(baseDir);
            const result = query === "imports_of" ? store.getImportsOf(file) : store.getDependentsOf(file);
            return (0, common_1.ok)({ root: baseDir, file, query, result });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "query_graph failed");
        }
    });
    server.tool("export_graph", {
        root: zod_1.z.string().optional(),
        outFile: zod_1.z.string().default("smart-context-export.graph.json"),
    }, async ({ root, outFile }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const graph = new graphStore_1.GraphStore(baseDir).readGraphData();
            const outPath = node_path_1.default.join(baseDir, outFile);
            node_fs_1.default.writeFileSync(outPath, JSON.stringify(graph, null, 2));
            return (0, common_1.ok)({ root: baseDir, outFile: outPath, files: graph.files.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "export_graph failed");
        }
    });
    server.tool("import_graph", {
        root: zod_1.z.string().optional(),
        graphFile: zod_1.z.string().default("smart-context-graph.json"),
    }, async ({ root, graphFile }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const filePath = node_path_1.default.join(baseDir, graphFile);
            if (!node_fs_1.default.existsSync(filePath))
                return (0, common_1.fail)(`Graph file not found: ${filePath}`);
            const graph = JSON.parse(node_fs_1.default.readFileSync(filePath, "utf8"));
            const store = new graphStore_1.GraphStore(baseDir);
            store.upsertGraph(graph);
            return (0, common_1.ok)({ root: baseDir, imported: filePath, files: graph.files?.length ?? 0 });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "import_graph failed");
        }
    });
}
