"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerEnum = void 0;
exports.ok = ok;
exports.fail = fail;
exports.resolveRoot = resolveRoot;
exports.estimateTokens = estimateTokens;
exports.computeBridgeNodes = computeBridgeNodes;
// @ts-nocheck
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
function ok(data) {
    return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, data }, null, 2) }],
    };
}
function fail(message) {
    return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: message }, null, 2) }],
    };
}
function resolveRoot(root) {
    return node_path_1.default.resolve(root ?? process.cwd());
}
exports.providerEnum = zod_1.z
    .enum([
    "auto",
    "claude",
    "chatgpt",
    "gpt",
    "codex",
    "copilot",
    "gemini",
    "cursor",
    "windsurf",
    "continue",
    "kiro",
    "deepseek",
    "qwen",
    "mistral",
    "grok",
    "perplexity",
    "other",
])
    .default("auto");
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function computeBridgeNodes(graph, limit) {
    const through = new Map();
    for (const e of graph.importEdges) {
        through.set(e.fromFile, (through.get(e.fromFile) ?? 0) + 1);
        through.set(e.toFile, (through.get(e.toFile) ?? 0) + 1);
    }
    return [...through.entries()]
        .map(([file, score]) => ({ file, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
