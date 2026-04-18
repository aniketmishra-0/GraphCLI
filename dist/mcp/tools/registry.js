"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRegistryTools = registerRegistryTools;
// @ts-nocheck
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const graphStore_1 = require("../../graphStore");
const common_1 = require("../common");
function registryPath(baseDir) {
    return node_path_1.default.join(baseDir, ".smart-context-registry.json");
}
function readRegistry(baseDir) {
    const rp = registryPath(baseDir);
    if (!node_fs_1.default.existsSync(rp))
        return [];
    return JSON.parse(node_fs_1.default.readFileSync(rp, "utf8"));
}
function writeRegistry(baseDir, items) {
    node_fs_1.default.writeFileSync(registryPath(baseDir), JSON.stringify(items, null, 2), "utf8");
}
function registerRegistryTools(server) {
    server.tool("register_repo", {
        root: zod_1.z.string().optional(),
        name: zod_1.z.string(),
        repoPath: zod_1.z.string(),
    }, async ({ root, name, repoPath }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const items = readRegistry(baseDir);
            const normalizedPath = node_path_1.default.resolve(repoPath);
            if (!items.some((x) => x.name === name)) {
                items.push({ name, path: normalizedPath, createdAt: new Date().toISOString() });
            }
            writeRegistry(baseDir, items);
            return (0, common_1.ok)({ root: baseDir, registered: name, path: normalizedPath, total: items.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "register_repo failed");
        }
    });
    server.tool("list_repos", {
        root: zod_1.z.string().optional(),
    }, async ({ root }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const items = readRegistry(baseDir);
            return (0, common_1.ok)({ root: baseDir, repos: items, count: items.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "list_repos failed");
        }
    });
    server.tool("unregister_repo", {
        root: zod_1.z.string().optional(),
        name: zod_1.z.string(),
    }, async ({ root, name }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const items = readRegistry(baseDir);
            const next = items.filter((x) => x.name !== name);
            writeRegistry(baseDir, next);
            return (0, common_1.ok)({ root: baseDir, removed: name, remaining: next.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "unregister_repo failed");
        }
    });
    server.tool("cross_repo_search", {
        root: zod_1.z.string().optional(),
        query: zod_1.z.string(),
        limit: zod_1.z.number().int().min(1).max(100).default(20),
    }, async ({ root, query, limit }) => {
        try {
            const baseDir = (0, common_1.resolveRoot)(root);
            const items = readRegistry(baseDir);
            const q = query.toLowerCase();
            const results = [];
            for (const repo of items) {
                const store = new graphStore_1.GraphStore(repo.path);
                const graph = store.readGraphData();
                for (const s of graph.symbols) {
                    const score = (s.name.toLowerCase().includes(q) ? 2 : 0) +
                        (s.signature.toLowerCase().includes(q) ? 1 : 0) +
                        (s.file.toLowerCase().includes(q) ? 0.5 : 0);
                    if (score > 0) {
                        results.push({ repo: repo.name, file: s.file, symbol: s.name, score });
                    }
                }
            }
            results.sort((a, b) => b.score - a.score);
            return (0, common_1.ok)({ root: baseDir, query, results: results.slice(0, limit), total: results.length });
        }
        catch (error) {
            return (0, common_1.fail)(error instanceof Error ? error.message : "cross_repo_search failed");
        }
    });
}
