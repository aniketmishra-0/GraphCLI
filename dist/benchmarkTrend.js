#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function env(name, fallback = "local") {
    const value = process.env[name];
    return value && value.trim().length > 0 ? value : fallback;
}
function main() {
    const root = node_path_1.default.resolve(process.argv[2] ?? process.cwd());
    const benchmarkPath = node_path_1.default.join(root, "smart-context-benchmark.json");
    const historyPath = node_path_1.default.join(root, "smart-context-benchmark-history.json");
    if (!node_fs_1.default.existsSync(benchmarkPath)) {
        console.error("Missing benchmark file:", benchmarkPath);
        console.error("Run benchmark first: npm run benchmark -- .");
        process.exit(1);
    }
    const report = JSON.parse(node_fs_1.default.readFileSync(benchmarkPath, "utf8"));
    const point = {
        generatedAt: report.generatedAt ?? new Date().toISOString(),
        commit: env("GITHUB_SHA", "local"),
        branch: env("GITHUB_REF_NAME", env("GITHUB_REF", "local")),
        reductionRatio: report.tokenMetrics?.reductionRatio ?? 0,
        reductionPercent: report.tokenMetrics?.reductionPercent ?? 0,
        packetTokens: report.tokenMetrics?.packetTokens ?? 0,
        naiveTokens: report.tokenMetrics?.naiveTokens ?? 0,
        totalLatencyMs: report.latencyMs?.total ?? 0,
    };
    const history = node_fs_1.default.existsSync(historyPath)
        ? JSON.parse(node_fs_1.default.readFileSync(historyPath, "utf8"))
        : [];
    history.push(point);
    // Keep recent history compact for repo artifacts.
    const bounded = history.slice(-200);
    node_fs_1.default.writeFileSync(historyPath, JSON.stringify(bounded, null, 2), "utf8");
    console.log("Benchmark trend updated:", historyPath);
    console.log("Current reductionRatio:", point.reductionRatio);
    console.log("History points:", bounded.length);
}
main();
