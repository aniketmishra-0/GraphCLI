#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const commander_1 = require("commander");
const parserAdapter_1 = require("./parserAdapter");
const prune_1 = require("./prune");
const hotpath_1 = require("./hotpath");
const budget_1 = require("./budget");
const context_1 = require("./context");
const promptWrapper_1 = require("./promptWrapper");
const incremental_1 = require("./incremental");
const tokenUsage_1 = require("./tokenUsage");
const CODE_EXT_RE = /\.(ts|tsx|js|jsx|py|java|kt|swift|go|rs|rb|php|cs|cpp|c|h|hpp|scala|lua|dart|r|pl|sol|vue)$/i;
function pickTargetFile(changedFiles, graphFiles, explicitTarget) {
    if (explicitTarget)
        return explicitTarget.replace(/\\/g, "/");
    const graphSet = new Set(graphFiles);
    const changedCandidate = changedFiles.find((f) => CODE_EXT_RE.test(f) && graphSet.has(f));
    if (changedCandidate)
        return changedCandidate;
    const graphCandidate = graphFiles.find((f) => CODE_EXT_RE.test(f));
    if (graphCandidate)
        return graphCandidate;
    throw new Error("No suitable target file found. Provide --target-file explicitly.");
}
const program = new commander_1.Command();
program
    .name("smart-context-one-click")
    .description("Generate low-token two-stage packets + prompt wrapper + share bundle")
    .option("--root <path>", "Project root path", process.cwd())
    .option("--backend <name>", "Parser backend: treesitter|universal|ts-morph|lsp", "treesitter")
    .option("--lsp-index <file>", "Path to LSP semantic index JSON (required for backend=lsp)")
    .option("--provider <name>", "Target AI provider: auto|claude|chatgpt|gpt|codex|copilot|gemini|cursor|windsurf|continue|kiro|deepseek|qwen|mistral|grok|perplexity|other", "auto")
    .option("--compression <mode>", "Compression mode: ultra|minimal|balanced", "ultra")
    .option("--task <text>", "Task description for prompt wrapper", "review this patch")
    .option("--target-file <file>", "Target file to analyze (optional, auto-detected from changed files)")
    .option("--target-symbol <name>", "Target symbol inside target file")
    .option("--upstream-depth <n>", "Upstream traversal depth", "2")
    .option("--downstream-depth <n>", "Downstream traversal depth", "1")
    .option("--top-hot <n>", "Top N hot path files", "8")
    .option("--max-tokens <n>", "Estimated token budget", "2200")
    .option("--hard-cap", "Strictly enforce token budget", true)
    .option("--stage1-out <file>", "Stage-1 packet output path", "smart-context.stage1.packet.json")
    .option("--stage2-out <file>", "Stage-2 packet output path", "smart-context.stage2.packet.json")
    .option("--prompt-out <file>", "Prompt wrapper output path", "smart-context.prompt.md")
    .option("--share-out <file>", "Shareable payload output path", "smart-context.share.json")
    .option("--token-report-out <file>", "Token usage report output path", "smart-context.token-report.json")
    .option("--token-report-html-out <file>", "Token usage HTML dashboard output path", "smart-context.token-report.html")
    .option("--token-dashboard-refresh-sec <n>", "Auto-refresh interval for token dashboard HTML (0 disables)", "0")
    .option("--graph-out <file>", "Graph output path", "smart-context-graph.json")
    .option("--changed-out <file>", "Changed file list output path", "smart-context.changed.json");
program.parse(process.argv);
const opts = program.opts();
const baseDir = node_path_1.default.resolve(opts.root);
const adapter = (0, parserAdapter_1.createParserAdapter)(opts.backend);
const graph = adapter.index(baseDir, ["**/*"], {
    lspIndexPath: opts.lspIndex,
});
const changedFiles = (0, incremental_1.detectChangedFiles)(baseDir);
const targetFile = pickTargetFile(changedFiles, graph.files, opts.targetFile);
const selection = (0, prune_1.pruneDependencies)(graph, targetFile, Number.parseInt(opts.upstreamDepth, 10), Number.parseInt(opts.downstreamDepth, 10), opts.targetSymbol);
const hotPath = (0, hotpath_1.computeHotPath)(baseDir, Number.parseInt(opts.topHot, 10));
const budget = (0, budget_1.resolveBudget)(Number.parseInt(opts.maxTokens, 10), opts.hardCap, opts.provider, opts.compression);
const packets = (0, context_1.generateTwoStagePackets)(graph, selection, hotPath, budget, opts.provider, opts.compression);
const stage1Tokens = (0, tokenUsage_1.estimateTokens)(packets.stage1);
const stage2Tokens = (0, tokenUsage_1.estimateTokens)(packets.stage2);
const promptWrapper = (0, promptWrapper_1.buildTwoStagePromptWrapper)(opts.provider, opts.task, opts.stage1Out, opts.stage2Out, {
    budgetTokens: budget.maxTokens,
    stage1PacketTokens: stage1Tokens,
    stage2PacketTokens: stage2Tokens,
});
const wrapperTokens = (0, tokenUsage_1.estimateTokens)(promptWrapper);
const withoutGraphTokens = (0, tokenUsage_1.estimateTokens)(JSON.stringify(graph));
const tokenReport = {
    generatedAt: new Date().toISOString(),
    provider: opts.provider,
    compression: opts.compression,
    budgetTokens: budget.maxTokens,
    prompts: [
        (0, tokenUsage_1.createTokenUsageSnapshot)("prompt_1_stage1", stage1Tokens, budget.maxTokens),
        (0, tokenUsage_1.createTokenUsageSnapshot)("prompt_2_stage2", stage2Tokens, budget.maxTokens),
        (0, tokenUsage_1.createTokenUsageSnapshot)("prompt_1_with_wrapper", stage1Tokens + wrapperTokens, budget.maxTokens),
        (0, tokenUsage_1.createTokenUsageSnapshot)("prompt_2_with_wrapper", stage2Tokens + wrapperTokens, budget.maxTokens),
    ],
    comparison: (0, tokenUsage_1.createTokenEfficiencyComparison)(withoutGraphTokens, stage1Tokens, "Without Graph (full graph file)", "With Graph (stage-1 packet)"),
};
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.graphOut), JSON.stringify(graph, null, 2), "utf8");
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.stage1Out), packets.stage1, "utf8");
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.stage2Out), packets.stage2, "utf8");
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.promptOut), promptWrapper, "utf8");
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.changedOut), JSON.stringify({ changedFiles }, null, 2), "utf8");
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.tokenReportOut), JSON.stringify(tokenReport, null, 2), "utf8");
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.tokenReportHtmlOut), (0, tokenUsage_1.renderTokenUsageDashboard)(tokenReport, {
    refreshSeconds: Number.parseInt(opts.tokenDashboardRefreshSec, 10),
}), "utf8");
const sharePayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    provider: opts.provider,
    compression: opts.compression,
    task: opts.task,
    targetFile,
    tokenBudget: budget.maxTokens,
    tokenReport,
    changedFiles,
    promptWrapper,
    stage1Packet: JSON.parse(packets.stage1),
    stage2PacketPath: opts.stage2Out,
    usage: [
        "Send promptWrapper and stage1Packet to the AI first.",
        "If AI replies NEED_STAGE2, share stage2PacketPath content.",
        "Do not share full repository unless both packets are insufficient.",
    ],
};
node_fs_1.default.writeFileSync(node_path_1.default.join(baseDir, opts.shareOut), JSON.stringify(sharePayload, null, 2), "utf8");
console.log("One-click bundle generated.");
console.log("Target file:", targetFile);
console.log("Changed files:", changedFiles.length);
console.log("Budget:", budget.maxTokens);
console.log((0, tokenUsage_1.renderCliTokenDashboard)(tokenReport));
console.log("Stage-1:", node_path_1.default.join(baseDir, opts.stage1Out));
console.log("Stage-2:", node_path_1.default.join(baseDir, opts.stage2Out));
console.log("Prompt:", node_path_1.default.join(baseDir, opts.promptOut));
console.log("Token report:", node_path_1.default.join(baseDir, opts.tokenReportOut));
console.log("Token dashboard:", node_path_1.default.join(baseDir, opts.tokenReportHtmlOut));
console.log("Share payload:", node_path_1.default.join(baseDir, opts.shareOut));
