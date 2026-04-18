#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function main() {
    const root = node_path_1.default.resolve(process.argv[2] ?? process.cwd());
    const benchmarkPath = node_path_1.default.join(root, "smart-context-benchmark.json");
    if (!node_fs_1.default.existsSync(benchmarkPath)) {
        console.error("Missing benchmark file:", benchmarkPath);
        console.error("Run benchmark first: npm run benchmark -- .");
        process.exit(1);
    }
    const report = JSON.parse(node_fs_1.default.readFileSync(benchmarkPath, "utf8"));
    const reductionRatio = report.tokenMetrics?.reductionRatio ?? 0;
    if (reductionRatio < 10) {
        console.error("10x token-efficiency gate failed.");
        console.error("Expected reductionRatio >= 10, got:", reductionRatio);
        process.exit(1);
    }
    console.log("10x token-efficiency gate passed.");
    console.log("reductionRatio:", reductionRatio);
}
main();
