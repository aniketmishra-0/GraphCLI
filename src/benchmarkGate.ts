#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

interface BenchmarkReport {
  tokenMetrics?: {
    reductionRatio?: number;
  };
}

function main(): void {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const benchmarkPath = path.join(root, "smart-context-benchmark.json");

  if (!fs.existsSync(benchmarkPath)) {
    console.error("Missing benchmark file:", benchmarkPath);
    console.error("Run benchmark first: npm run benchmark -- .");
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(benchmarkPath, "utf8")) as BenchmarkReport;
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
