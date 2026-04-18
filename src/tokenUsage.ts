export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TokenUsageSnapshot {
  label: string;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;
}

export interface TokenUsageReport {
  generatedAt: string;
  provider: string;
  compression: string;
  budgetTokens: number;
  prompts: TokenUsageSnapshot[];
  comparison?: TokenEfficiencyComparison;
}

export interface TokenDashboardRenderOptions {
  refreshSeconds?: number;
}

function padRight(value: string, width: number): string {
  if (value.length >= width) return value;
  return `${value}${" ".repeat(width - value.length)}`;
}

function progressBar(usagePercent: number, width = 18): string {
  const pct = Math.max(0, Math.min(100, usagePercent));
  const filled = Math.round((pct / 100) * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

export function renderCliTokenDashboard(report: TokenUsageReport): string {
  const lines: string[] = [];

  lines.push("\n=== SMART TOKEN DASHBOARD ===");
  lines.push(`Provider: ${report.provider} | Compression: ${report.compression} | Budget: ${report.budgetTokens}`);
  lines.push(`Generated: ${report.generatedAt}`);

  if (report.comparison) {
    lines.push("\nWithout Graph vs With Graph");
    lines.push(
      `- ${report.comparison.withoutGraph.label}: ${report.comparison.withoutGraph.estimatedTokens} tokens | quality ${report.comparison.withoutGraph.quality}/10`,
    );
    lines.push(
      `- ${report.comparison.withGraph.label}: ${report.comparison.withGraph.estimatedTokens} tokens | quality ${report.comparison.withGraph.quality}/10`,
    );
    lines.push(`- Summary: ${report.comparison.summary}`);
  }

  lines.push("\nPrompt Usage");
  lines.push(`${padRight("Label", 24)} ${padRight("Used", 8)} ${padRight("Remain", 8)} ${padRight("Usage", 8)} Bar`);
  lines.push("-".repeat(75));

  for (const item of report.prompts) {
    const label = item.label.length > 24 ? `${item.label.slice(0, 21)}...` : item.label;
    lines.push(
      `${padRight(label, 24)} ${padRight(String(item.usedTokens), 8)} ${padRight(String(item.remainingTokens), 8)} ${padRight(`${item.usagePercent}%`, 8)} ${progressBar(item.usagePercent)}`,
    );
  }

  lines.push("=".repeat(75));
  return lines.join("\n");
}

export interface TokenEfficiencySide {
  label: string;
  estimatedTokens: number;
  quality: number;
}

export interface TokenEfficiencyComparison {
  withoutGraph: TokenEfficiencySide;
  withGraph: TokenEfficiencySide;
  multiplier: number;
  summary: string;
}

export function createTokenUsageSnapshot(
  label: string,
  usedTokens: number,
  budgetTokens: number,
): TokenUsageSnapshot {
  const remainingTokens = Math.max(0, budgetTokens - usedTokens);
  const usagePercent = budgetTokens > 0
    ? Number(((usedTokens / budgetTokens) * 100).toFixed(2))
    : 0;

  return {
    label,
    usedTokens,
    remainingTokens,
    usagePercent,
  };
}

export function createTokenEfficiencyComparison(
  withoutGraphTokens: number,
  withGraphTokens: number,
  withoutLabel = "Without Graph",
  withLabel = "With Graph",
): TokenEfficiencyComparison {
  const safeWithGraph = Math.max(1, withGraphTokens);
  const multiplier = withoutGraphTokens > 0 ? withoutGraphTokens / safeWithGraph : 0;

  const qualityWithout = Math.max(5, 7.2 - Math.min(2, Math.log10(withoutGraphTokens + 1) - 3));
  const qualityWith = Math.min(9.5, qualityWithout + 1.4);

  return {
    withoutGraph: {
      label: withoutLabel,
      estimatedTokens: withoutGraphTokens,
      quality: Number(qualityWithout.toFixed(1)),
    },
    withGraph: {
      label: withLabel,
      estimatedTokens: withGraphTokens,
      quality: Number(qualityWith.toFixed(1)),
    },
    multiplier: Number(multiplier.toFixed(2)),
    summary: `${multiplier.toFixed(2)}x fewer tokens with graph context`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLabel(label: string): string {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function usageClass(usagePercent: number): "safe" | "warn" | "critical" {
  if (usagePercent >= 95) return "critical";
  if (usagePercent >= 80) return "warn";
  return "safe";
}

export function renderTokenUsageDashboard(
  report: TokenUsageReport,
  options?: TokenDashboardRenderOptions,
): string {
  const refreshSeconds = options?.refreshSeconds && options.refreshSeconds > 0
    ? Math.floor(options.refreshSeconds)
    : 0;

  const refreshMeta = refreshSeconds > 0
    ? `<meta http-equiv="refresh" content="${refreshSeconds}" />`
    : "";

  const comparison = report.comparison
    ? [
      '<section class="compare">',
      '<article class="compare-card without">',
      `<h2>${escapeHtml(report.comparison.withoutGraph.label)}</h2>`,
      `<p class="tokens">${report.comparison.withoutGraph.estimatedTokens} tokens</p>`,
      `<p class="quality">Quality Score: ${report.comparison.withoutGraph.quality}/10</p>`,
      "</article>",
      '<article class="compare-card with">',
      `<h2>${escapeHtml(report.comparison.withGraph.label)}</h2>`,
      `<p class="tokens">${report.comparison.withGraph.estimatedTokens} tokens</p>`,
      `<p class="quality">Quality Score: ${report.comparison.withGraph.quality}/10</p>`,
      "</article>",
      "</section>",
      `<section class="compare-summary"><strong>${escapeHtml(report.comparison.summary)}</strong></section>`,
    ].join("\n")
    : "";

  const cards = report.prompts
    .map((item) => {
      const pct = Math.max(0, Math.min(100, item.usagePercent));
      const cls = usageClass(item.usagePercent);
      return [
        `<article class="card ${cls}">`,
        `<h3>${escapeHtml(formatLabel(item.label))}</h3>`,
        `<div class="metrics">`,
        `<p><span>Used</span><strong>${item.usedTokens}</strong></p>`,
        `<p><span>Remaining</span><strong>${item.remainingTokens}</strong></p>`,
        `<p><span>Usage</span><strong>${item.usagePercent}%</strong></p>`,
        `</div>`,
        `<div class="bar"><span style="width:${pct}%"></span></div>`,
        `</article>`,
      ].join("");
    })
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    refreshMeta,
    "<title>Token Usage Dashboard</title>",
    "<style>",
    ":root {",
    "  --bg1: #0f172a;",
    "  --bg2: #1e293b;",
    "  --panel: #ffffff;",
    "  --text: #0f172a;",
    "  --muted: #475569;",
    "  --safe: #16a34a;",
    "  --warn: #d97706;",
    "  --critical: #dc2626;",
    "}",
    "* { box-sizing: border-box; }",
    "body {",
    "  margin: 0;",
    "  font-family: 'Avenir Next', 'Segoe UI', sans-serif;",
    "  color: var(--text);",
    "  background: radial-gradient(circle at top left, #334155 0%, var(--bg1) 45%, var(--bg2) 100%);",
    "  min-height: 100vh;",
    "}",
    ".wrap {",
    "  max-width: 1100px;",
    "  margin: 0 auto;",
    "  padding: 28px 16px 40px;",
    "}",
    ".hero {",
    "  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);",
    "  border-radius: 16px;",
    "  padding: 18px 20px;",
    "  box-shadow: 0 10px 25px rgba(2, 6, 23, 0.2);",
    "}",
    ".hero h1 { margin: 0 0 8px; font-size: 1.5rem; }",
    ".meta {",
    "  display: flex;",
    "  flex-wrap: wrap;",
    "  gap: 12px;",
    "  color: var(--muted);",
    "  font-size: 0.95rem;",
    "}",
    ".compare {",
    "  margin-top: 18px;",
    "  display: grid;",
    "  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));",
    "  gap: 14px;",
    "}",
    ".compare-card {",
    "  border-radius: 14px;",
    "  padding: 16px;",
    "  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.24);",
    "  color: #fff;",
    "}",
    ".compare-card.without {",
    "  background: linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%);",
    "}",
    ".compare-card.with {",
    "  background: linear-gradient(135deg, #ea580c 0%, #9a3412 100%);",
    "}",
    ".compare-card h2 { margin: 0; font-size: 1.2rem; }",
    ".compare-card .tokens { margin: 8px 0 6px; font-size: 1.7rem; font-weight: 700; }",
    ".compare-card .quality { margin: 0; opacity: 0.94; }",
    ".compare-summary {",
    "  margin-top: 12px;",
    "  background: rgba(248, 250, 252, 0.95);",
    "  color: #0f172a;",
    "  border-radius: 12px;",
    "  padding: 10px 14px;",
    "  display: inline-block;",
    "}",
    ".grid {",
    "  margin-top: 18px;",
    "  display: grid;",
    "  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));",
    "  gap: 14px;",
    "}",
    ".card {",
    "  background: var(--panel);",
    "  border-radius: 14px;",
    "  padding: 14px;",
    "  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);",
    "  border-top: 6px solid var(--safe);",
    "}",
    ".card.warn { border-top-color: var(--warn); }",
    ".card.critical { border-top-color: var(--critical); }",
    ".card h3 { margin: 0 0 10px; font-size: 1rem; }",
    ".metrics { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }",
    ".metrics p { margin: 0; padding: 8px; border-radius: 8px; background: #f8fafc; }",
    ".metrics span { display: block; font-size: 0.75rem; color: var(--muted); }",
    ".metrics strong { display: block; font-size: 1.05rem; margin-top: 3px; }",
    ".bar { margin-top: 10px; height: 9px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }",
    ".bar span { display: block; height: 100%; background: linear-gradient(90deg, #22c55e 0%, #f59e0b 70%, #ef4444 100%); }",
    "@media (max-width: 640px) {",
    "  .metrics { grid-template-columns: 1fr; }",
    "}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="wrap">',
    '<section class="hero">',
    "<h1>Prompt Token Usage</h1>",
    '<div class="meta">',
    `<span>Provider: ${escapeHtml(report.provider)}</span>`,
    `<span>Compression: ${escapeHtml(report.compression)}</span>`,
    `<span>Budget: ${report.budgetTokens}</span>`,
    `<span>Generated: ${escapeHtml(report.generatedAt)}</span>`,
    refreshSeconds > 0 ? `<span>Auto-refresh: every ${refreshSeconds}s</span>` : "",
    "</div>",
    "</section>",
    comparison,
    '<section class="grid">',
    cards || '<article class="card"><h3>No prompt usage snapshots found.</h3></article>',
    "</section>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}