#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { createParserAdapter } from "./parserAdapter";
import { ParserBackend, AiProvider, CompressionMode } from "./types";
import { pruneDependencies } from "./prune";
import { computeHotPath } from "./hotpath";
import { resolveBudget } from "./budget";
import { generateTwoStagePackets } from "./context";
import { buildTwoStagePromptWrapper } from "./promptWrapper";
import { detectChangedFiles } from "./incremental";
import {
  createTokenEfficiencyComparison,
  createTokenUsageSnapshot,
  estimateTokens,
  renderCliTokenDashboard,
  renderTokenUsageDashboard,
  TokenUsageReport,
} from "./tokenUsage";

const CODE_EXT_RE = /\.(ts|tsx|js|jsx|py|java|kt|swift|go|rs|rb|php|cs|cpp|c|h|hpp|scala|lua|dart|r|pl|sol|vue)$/i;

function pickTargetFile(
  changedFiles: string[],
  graphFiles: string[],
  explicitTarget?: string,
): string {
  if (explicitTarget) return explicitTarget.replace(/\\/g, "/");

  const graphSet = new Set(graphFiles);
  const changedCandidate = changedFiles.find((f) => CODE_EXT_RE.test(f) && graphSet.has(f));
  if (changedCandidate) return changedCandidate;

  const graphCandidate = graphFiles.find((f) => CODE_EXT_RE.test(f));
  if (graphCandidate) return graphCandidate;

  throw new Error("No suitable target file found. Provide --target-file explicitly.");
}

const program = new Command();

program
  .name("smart-context-one-click")
  .description("Generate low-token two-stage packets + prompt wrapper + share bundle")
  .option("--root <path>", "Project root path", process.cwd())
  .option("--backend <name>", "Parser backend: treesitter|universal|ts-morph|lsp", "treesitter")
  .option("--lsp-index <file>", "Path to LSP semantic index JSON (required for backend=lsp)")
  .option(
    "--provider <name>",
    "Target AI provider: auto|claude|chatgpt|gpt|codex|copilot|gemini|cursor|windsurf|continue|kiro|deepseek|qwen|mistral|grok|perplexity|other",
    "auto",
  )
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

const opts = program.opts<{
  root: string;
  backend: ParserBackend;
  lspIndex?: string;
  provider: AiProvider;
  compression: CompressionMode;
  task: string;
  targetFile?: string;
  targetSymbol?: string;
  upstreamDepth: string;
  downstreamDepth: string;
  topHot: string;
  maxTokens: string;
  hardCap: boolean;
  stage1Out: string;
  stage2Out: string;
  promptOut: string;
  shareOut: string;
  tokenReportOut: string;
  tokenReportHtmlOut: string;
  tokenDashboardRefreshSec: string;
  graphOut: string;
  changedOut: string;
}>();

const baseDir = path.resolve(opts.root);

const adapter = createParserAdapter(opts.backend);
const graph = adapter.index(baseDir, ["**/*"], {
  lspIndexPath: opts.lspIndex,
});

const changedFiles = detectChangedFiles(baseDir);
const targetFile = pickTargetFile(changedFiles, graph.files, opts.targetFile);

const selection = pruneDependencies(
  graph,
  targetFile,
  Number.parseInt(opts.upstreamDepth, 10),
  Number.parseInt(opts.downstreamDepth, 10),
  opts.targetSymbol,
);

const hotPath = computeHotPath(baseDir, Number.parseInt(opts.topHot, 10));
const budget = resolveBudget(
  Number.parseInt(opts.maxTokens, 10),
  opts.hardCap,
  opts.provider,
  opts.compression,
);

const packets = generateTwoStagePackets(
  graph,
  selection,
  hotPath,
  budget,
  opts.provider,
  opts.compression,
);

const stage1Tokens = estimateTokens(packets.stage1);
const stage2Tokens = estimateTokens(packets.stage2);

const promptWrapper = buildTwoStagePromptWrapper(
  opts.provider,
  opts.task,
  opts.stage1Out,
  opts.stage2Out,
  {
    budgetTokens: budget.maxTokens,
    stage1PacketTokens: stage1Tokens,
    stage2PacketTokens: stage2Tokens,
  },
);

const wrapperTokens = estimateTokens(promptWrapper);
const withoutGraphTokens = estimateTokens(JSON.stringify(graph));
const tokenReport: TokenUsageReport = {
  generatedAt: new Date().toISOString(),
  provider: opts.provider,
  compression: opts.compression,
  budgetTokens: budget.maxTokens,
  prompts: [
    createTokenUsageSnapshot("prompt_1_stage1", stage1Tokens, budget.maxTokens),
    createTokenUsageSnapshot("prompt_2_stage2", stage2Tokens, budget.maxTokens),
    createTokenUsageSnapshot("prompt_1_with_wrapper", stage1Tokens + wrapperTokens, budget.maxTokens),
    createTokenUsageSnapshot("prompt_2_with_wrapper", stage2Tokens + wrapperTokens, budget.maxTokens),
  ],
  comparison: createTokenEfficiencyComparison(
    withoutGraphTokens,
    stage1Tokens,
    "Without Graph (full graph file)",
    "With Graph (stage-1 packet)",
  ),
};

fs.writeFileSync(path.join(baseDir, opts.graphOut), JSON.stringify(graph, null, 2), "utf8");
fs.writeFileSync(path.join(baseDir, opts.stage1Out), packets.stage1, "utf8");
fs.writeFileSync(path.join(baseDir, opts.stage2Out), packets.stage2, "utf8");
fs.writeFileSync(path.join(baseDir, opts.promptOut), promptWrapper, "utf8");
fs.writeFileSync(path.join(baseDir, opts.changedOut), JSON.stringify({ changedFiles }, null, 2), "utf8");
fs.writeFileSync(path.join(baseDir, opts.tokenReportOut), JSON.stringify(tokenReport, null, 2), "utf8");
fs.writeFileSync(
  path.join(baseDir, opts.tokenReportHtmlOut),
  renderTokenUsageDashboard(tokenReport, {
    refreshSeconds: Number.parseInt(opts.tokenDashboardRefreshSec, 10),
  }),
  "utf8",
);

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

fs.writeFileSync(path.join(baseDir, opts.shareOut), JSON.stringify(sharePayload, null, 2), "utf8");

console.log("One-click bundle generated.");
console.log("Target file:", targetFile);
console.log("Changed files:", changedFiles.length);
console.log("Budget:", budget.maxTokens);
console.log(renderCliTokenDashboard(tokenReport));
console.log("Stage-1:", path.join(baseDir, opts.stage1Out));
console.log("Stage-2:", path.join(baseDir, opts.stage2Out));
console.log("Prompt:", path.join(baseDir, opts.promptOut));
console.log("Token report:", path.join(baseDir, opts.tokenReportOut));
console.log("Token dashboard:", path.join(baseDir, opts.tokenReportHtmlOut));
console.log("Share payload:", path.join(baseDir, opts.shareOut));
