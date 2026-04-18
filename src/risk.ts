import { GraphData } from "./types";

export interface RiskScore {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
}

export function scoreChangeRisk(graph: GraphData, changedFiles: string[]): RiskScore {
  const reasons: string[] = [];

  const changedSet = new Set(changedFiles);
  const importFanout = graph.importEdges.filter((e) => changedSet.has(e.fromFile)).length;
  const downstreamFanIn = graph.importEdges.filter((e) => changedSet.has(e.toFile)).length;
  const changedSymbols = graph.symbols.filter((s) => changedSet.has(s.file)).length;

  let score = 0;
  score += Math.min(30, changedFiles.length * 3);
  score += Math.min(25, importFanout * 1.5);
  score += Math.min(25, downstreamFanIn * 2);
  score += Math.min(20, changedSymbols / 8);

  if (changedFiles.length > 12) reasons.push("Large change set");
  if (downstreamFanIn > 10) reasons.push("High downstream blast radius");
  if (importFanout > 20) reasons.push("High import fan-out");
  if (changedSymbols > 80) reasons.push("High symbol churn");

  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return {
    score: Number(score.toFixed(2)),
    level,
    reasons,
  };
}
