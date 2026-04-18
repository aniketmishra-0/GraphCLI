import { execSync } from "node:child_process";
import path from "node:path";
import { HotPathScore } from "./types";

export function computeHotPath(baseDir: string, topN: number): HotPathScore[] {
  try {
    const raw = execSync(
      "git log --date=unix --pretty=format:'__COMMIT__ %cd' --name-only --since='180 days ago'",
      {
        cwd: baseDir,
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).toString("utf8");

    const churnCounter = new Map<string, number>();
    const weightedCounter = new Map<string, number>();
    const nowSec = Math.floor(Date.now() / 1000);
    let commitTs = nowSec;

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("__COMMIT__")) {
        const parts = trimmed.split(" ");
        const ts = Number.parseInt(parts[1] ?? "0", 10);
        if (!Number.isNaN(ts) && ts > 0) {
          commitTs = ts;
        }
        continue;
      }

      const file = trimmed.replace(/\\/g, "/");
      churnCounter.set(file, (churnCounter.get(file) ?? 0) + 1);

      const ageDays = Math.max(0, (nowSec - commitTs) / 86400);
      const halfLifeDays = 60;
      const weight = Math.exp((-Math.log(2) * ageDays) / halfLifeDays);
      weightedCounter.set(file, (weightedCounter.get(file) ?? 0) + weight);
    }

    return [...churnCounter.entries()]
      .map(([file, churn]) => ({
        file: path.normalize(file).replace(/\\/g, "/"),
        churn,
        weightedChurn: weightedCounter.get(file) ?? 0,
      }))
      .sort((a, b) => b.weightedChurn - a.weightedChurn)
      .slice(0, topN);
  } catch {
    return [];
  }
}
