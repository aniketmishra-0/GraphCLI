#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { pruneDependencies } from "./prune";
import { computeHotPath } from "./hotpath";
import {
  generateContextMarkdown,
  generateContextPacket,
  generateContextXml,
  generateTwoStagePackets,
} from "./context";
import { createParserAdapter } from "./parserAdapter";
import { AiProvider, CompressionMode, ParserBackend } from "./types";
import { detectChangedFiles } from "./incremental";
import { GraphStore } from "./graphStore";
import { scoreChangeRisk } from "./risk";
import { resolveBudget } from "./budget";
import { buildSingleStagePromptWrapper, buildTwoStagePromptWrapper } from "./promptWrapper";
import {
  createTokenEfficiencyComparison,
  createTokenUsageSnapshot,
  estimateTokens,
  renderCliTokenDashboard,
  renderTokenUsageDashboard,
  TokenUsageReport,
} from "./tokenUsage";

const program = new Command();

program
  .name("smart-context-map")
  .description("Generate a token-efficient context file for code review across languages")
  .option("--root <path>", "Project root path", process.cwd())
  .option("--target-file <file>", "Target file to analyze")
  .option("--target-symbol <name>", "Target symbol inside target file")
  .option("--upstream-depth <n>", "Upstream traversal depth", "2")
  .option("--downstream-depth <n>", "Downstream traversal depth", "1")
  .option("--top-hot <n>", "Top N hot path files", "10")
  .option("--backend <name>", "Parser backend: treesitter|universal|ts-morph|lsp", "treesitter")
  .option("--lsp-index <file>", "Path to LSP semantic index JSON (required for backend=lsp)")
  .option(
    "--provider <name>",
    "Target AI provider: auto|claude|chatgpt|gpt|codex|copilot|gemini|cursor|windsurf|continue|kiro|deepseek|qwen|mistral|grok|perplexity|other",
    "auto",
  )
  .option("--compression <mode>", "Compression mode: ultra|minimal|balanced", "ultra")
  .option("--max-tokens <n>", "Estimated token budget", "2500")
  .option("--hard-cap", "Strictly enforce token budget", false)
  .option("--two-stage", "Enable two-stage packet retrieval", false)
  .option("--stage1-out <file>", "Stage-1 packet output path", "smart-context.stage1.packet.json")
  .option("--stage2-out <file>", "Stage-2 packet output path", "smart-context.stage2.packet.json")
  .option("--task <text>", "Task description for prompt wrapper", "review changes safely")
  .option("--generate-prompt", "Generate prompt wrapper file", false)
  .option("--prompt-out <file>", "Prompt wrapper output path", "smart-context.prompt.md")
  .option("--token-report-out <file>", "Token usage report output path", "smart-context.token-report.json")
  .option("--token-report-html-out <file>", "Token usage HTML dashboard output path", "smart-context.token-report.html")
  .option("--token-dashboard-refresh-sec <n>", "Auto-refresh interval for token dashboard HTML (0 disables)", "0")
  .option("--watch", "Continuously rebuild context on file changes", false)
  .option("--output-format <fmt>", "Context output format: markdown|xml|packet", "packet")
  .option("--glob <glob>", "Source file glob", "**/*.{ts,tsx,js,jsx}")
  .option("--graph-out <file>", "Graph output path", "smart-context-graph.json")
  .option("--context-out <file>", "Context markdown output path", "smart-context.md");

program.parse(process.argv);

const opts = program.opts<{
  root: string;
  targetFile?: string;
  targetSymbol?: string;
  upstreamDepth: string;
  downstreamDepth: string;
  topHot: string;
  backend: ParserBackend;
  lspIndex?: string;
  provider: AiProvider;
  compression: CompressionMode;
  maxTokens: string;
  hardCap: boolean;
  twoStage: boolean;
  stage1Out: string;
  stage2Out: string;
  task: string;
  generatePrompt: boolean;
  promptOut: string;
  tokenReportOut: string;
  tokenReportHtmlOut: string;
  tokenDashboardRefreshSec: string;
  watch: boolean;
  outputFormat: "markdown" | "xml" | "packet";
  glob: string;
  graphOut: string;
  contextOut: string;
}>();

if (!opts.targetFile) {
  console.error("Missing required argument: --target-file <file>");
  process.exit(1);
}

const baseDir = path.resolve(opts.root);
const targetFile = opts.targetFile.replace(/\\/g, "/");

function execute(): void {
  const adapter = createParserAdapter(opts.backend);
  const graph = adapter.index(baseDir, [opts.glob], {
    lspIndexPath: opts.lspIndex,
  });
  const pruned = pruneDependencies(
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

  fs.writeFileSync(path.join(baseDir, opts.graphOut), JSON.stringify(graph, null, 2), "utf8");

  const tokenReport: TokenUsageReport & { outputFormat: "markdown" | "xml" | "packet" } = {
    generatedAt: new Date().toISOString(),
    provider: opts.provider,
    compression: opts.compression,
    budgetTokens: budget.maxTokens,
    outputFormat: opts.outputFormat,
    prompts: [],
  };

  const withoutGraphTokens = estimateTokens(JSON.stringify(graph));
  let withGraphTokensForCompare = 1;

  if (opts.outputFormat === "packet" && opts.twoStage) {
    const twoStage = generateTwoStagePackets(
      graph,
      pruned,
      hotPath,
      budget,
      opts.provider,
      opts.compression,
    );

    fs.writeFileSync(path.join(baseDir, opts.stage1Out), twoStage.stage1, "utf8");
    fs.writeFileSync(path.join(baseDir, opts.stage2Out), twoStage.stage2, "utf8");
    fs.writeFileSync(path.join(baseDir, opts.contextOut), twoStage.stage1, "utf8");

    const stage1Tokens = estimateTokens(twoStage.stage1);
    const stage2Tokens = estimateTokens(twoStage.stage2);
    withGraphTokensForCompare = stage1Tokens;
    tokenReport.prompts.push(createTokenUsageSnapshot("prompt_1_stage1", stage1Tokens, budget.maxTokens));
    tokenReport.prompts.push(createTokenUsageSnapshot("prompt_2_stage2", stage2Tokens, budget.maxTokens));

    if (opts.generatePrompt) {
      const wrapper = buildTwoStagePromptWrapper(
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
      fs.writeFileSync(path.join(baseDir, opts.promptOut), wrapper, "utf8");

      const stage1PromptTokens = stage1Tokens + estimateTokens(wrapper);
      const stage2PromptTokens = stage2Tokens + estimateTokens(wrapper);
      tokenReport.prompts.push(createTokenUsageSnapshot("prompt_1_with_wrapper", stage1PromptTokens, budget.maxTokens));
      tokenReport.prompts.push(createTokenUsageSnapshot("prompt_2_with_wrapper", stage2PromptTokens, budget.maxTokens));
    }
  } else {
    const context = opts.outputFormat === "xml"
      ? generateContextXml(graph, pruned, hotPath, budget)
      : opts.outputFormat === "packet"
        ? generateContextPacket(graph, pruned, hotPath, budget, opts.provider, opts.compression)
        : generateContextMarkdown(graph, pruned, hotPath, budget);

    fs.writeFileSync(path.join(baseDir, opts.contextOut), context, "utf8");

    const contextTokens = estimateTokens(context);
    withGraphTokensForCompare = contextTokens;
    tokenReport.prompts.push(createTokenUsageSnapshot("prompt_1_context", contextTokens, budget.maxTokens));

    if (opts.generatePrompt && opts.outputFormat === "packet") {
      const wrapper = buildSingleStagePromptWrapper(opts.provider, opts.task, opts.contextOut, {
        budgetTokens: budget.maxTokens,
        packetTokens: contextTokens,
      });
      fs.writeFileSync(path.join(baseDir, opts.promptOut), wrapper, "utf8");

      const promptTokens = contextTokens + estimateTokens(wrapper);
      tokenReport.prompts.push(createTokenUsageSnapshot("prompt_1_with_wrapper", promptTokens, budget.maxTokens));
    }
  }

  tokenReport.comparison = createTokenEfficiencyComparison(
    withoutGraphTokens,
    withGraphTokensForCompare,
    "Without Graph (full graph file)",
    opts.twoStage ? "With Graph (stage-1 packet)" : "With Graph (smart context packet)",
  );

  fs.writeFileSync(path.join(baseDir, opts.tokenReportOut), JSON.stringify(tokenReport, null, 2), "utf8");
  fs.writeFileSync(
    path.join(baseDir, opts.tokenReportHtmlOut),
    renderTokenUsageDashboard(tokenReport, {
      refreshSeconds: Number.parseInt(opts.tokenDashboardRefreshSec, 10),
    }),
    "utf8",
  );

  const store = new GraphStore(baseDir);
  store.upsertGraph(graph);

  const changedFiles = detectChangedFiles(baseDir);
  const risk = scoreChangeRisk(graph, changedFiles);

  console.log("Graph generated:", path.join(baseDir, opts.graphOut));
  console.log("Context generated:", path.join(baseDir, opts.contextOut));
  console.log("Included files:", pruned.includedFiles.length);
  console.log("Backend:", opts.backend);
  console.log("Provider:", opts.provider);
  console.log("Compression:", opts.compression);
  console.log("Output format:", opts.outputFormat);
  console.log("Two-stage:", opts.twoStage);
  console.log("Token budget:", budget.maxTokens);
  console.log(renderCliTokenDashboard(tokenReport));
  console.log("Token report:", path.join(baseDir, opts.tokenReportOut));
  console.log("Token dashboard:", path.join(baseDir, opts.tokenReportHtmlOut));
  console.log("Changed files:", changedFiles.length);
  console.log("Risk:", `${risk.level} (${risk.score})`);
  if (risk.reasons.length > 0) {
    console.log("Risk reasons:", risk.reasons.join("; "));
  }
}

execute();

if (opts.watch) {
  console.log("Watch mode enabled.");
  let timer: NodeJS.Timeout | null = null;
  fs.watch(baseDir, { recursive: true }, (_evt, fileName) => {
    const rel = (fileName ?? "").replace(/\\/g, "/");
    if (!rel || rel.startsWith("node_modules/") || rel.startsWith("dist/") || rel.startsWith(".")) {
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        execute();
      } catch (error) {
        console.error("Watch rebuild failed:", error);
      }
    }, 400);
  });
}
