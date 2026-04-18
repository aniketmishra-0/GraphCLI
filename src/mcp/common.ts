// @ts-nocheck
import path from "node:path";
import { z } from "zod";

export function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: true, data }, null, 2) }],
  };
}

export function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }, null, 2) }],
  };
}

export function resolveRoot(root?: string): string {
  return path.resolve(root ?? process.cwd());
}

export const providerEnum = z
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

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function computeBridgeNodes(
  graph: { importEdges: Array<{ fromFile: string; toFile: string }> },
  limit: number,
) {
  const through = new Map<string, number>();
  for (const e of graph.importEdges) {
    through.set(e.fromFile, (through.get(e.fromFile) ?? 0) + 1);
    through.set(e.toFile, (through.get(e.toFile) ?? 0) + 1);
  }
  return [...through.entries()]
    .map(([file, score]) => ({ file, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
