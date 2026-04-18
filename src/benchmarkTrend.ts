#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

type BenchmarkPoint = {
  generatedAt: string;
  commit: string;
  branch: string;
  reductionRatio: number;
  reductionPercent: number;
  packetTokens: number;
  naiveTokens: number;
  totalLatencyMs: number;
};

type BenchmarkReport = {
  generatedAt?: string;
  latencyMs?: {
    total?: number;
  };
  tokenMetrics?: {
    packetTokens?: number;
    naiveTokens?: number;
    reductionRatio?: number;
    reductionPercent?: number;
  };
};

function env(name: string, fallback = "local"): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function main(): void {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const benchmarkPath = path.join(root, "smart-context-benchmark.json");
  const historyPath = path.join(root, "smart-context-benchmark-history.json");

  if (!fs.existsSync(benchmarkPath)) {
    console.error("Missing benchmark file:", benchmarkPath);
    console.error("Run benchmark first: npm run benchmark -- .");
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(benchmarkPath, "utf8")) as BenchmarkReport;

  const point: BenchmarkPoint = {
    generatedAt: report.generatedAt ?? new Date().toISOString(),
    commit: env("GITHUB_SHA", "local"),
    branch: env("GITHUB_REF_NAME", env("GITHUB_REF", "local")),
    reductionRatio: report.tokenMetrics?.reductionRatio ?? 0,
    reductionPercent: report.tokenMetrics?.reductionPercent ?? 0,
    packetTokens: report.tokenMetrics?.packetTokens ?? 0,
    naiveTokens: report.tokenMetrics?.naiveTokens ?? 0,
    totalLatencyMs: report.latencyMs?.total ?? 0,
  };

  const history: BenchmarkPoint[] = fs.existsSync(historyPath)
    ? (JSON.parse(fs.readFileSync(historyPath, "utf8")) as BenchmarkPoint[])
    : [];

  history.push(point);

  // Keep recent history compact for repo artifacts.
  const bounded = history.slice(-200);

  fs.writeFileSync(historyPath, JSON.stringify(bounded, null, 2), "utf8");
  console.log("Benchmark trend updated:", historyPath);
  console.log("Current reductionRatio:", point.reductionRatio);
  console.log("History points:", bounded.length);
}

main();
